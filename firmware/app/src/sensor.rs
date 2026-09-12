//! Sensor acquisition and cable recovery below the output task's priority.
use crate::{
    board::{Board, SensorHardware},
    snapshot,
};
use crystal_shim_core::calibration::{CalibrationStage, Channels, RawFrame};
use crystal_shim_core::{Fault, Millis, Reading};
use crystal_shim_drivers::fdc1004::Fdc1004;
use embassy_time::{with_timeout, Delay, Duration, Timer};
use embedded_hal_async::i2c::{ErrorType, I2c, Operation};
use esp_hal::{
    gpio::{Input, Level},
    i2c::master,
    Async,
};

/// Interrupt-backed FAULT observation runs at control priority. Polling alone can
/// miss a deglitched fault that clears between 20 ms output iterations.
#[embassy_executor::task]
pub async fn fault_monitor(mut fault: Input<'static>) {
    if fault.is_low() {
        latch_power_fault();
    }
    loop {
        fault.wait_for_falling_edge().await;
        latch_power_fault();
    }
}
fn latch_power_fault() {
    snapshot::update_sensor(|s| {
        s.power_fault_epoch = s.power_fault_epoch.saturating_add(1);
        s.power_fault_latched = true;
        s.reading = Reading::Invalid(Fault::Bus);
    });
}

struct TimedBus(master::I2c<'static, Async>);
impl ErrorType for TimedBus {
    type Error = master::Error;
}
impl I2c for TimedBus {
    async fn transaction(
        &mut self,
        address: u8,
        operations: &mut [Operation<'_>],
    ) -> Result<(), Self::Error> {
        let deadline = Millis(snapshot::now().0.saturating_add(5));
        snapshot::update_sensor(|s| s.transaction_deadline = Some(deadline));
        let result = with_timeout(
            Duration::from_millis(5),
            I2c::transaction(&mut self.0, address, operations),
        )
        .await
        .unwrap_or(Err(master::Error::Timeout));
        let expired = snapshot::now() >= deadline;
        snapshot::update_sensor(|s| {
            if result.is_err() || expired {
                s.reading = Reading::Invalid(Fault::Bus);
            }
            s.transaction_deadline = None;
        });
        if expired {
            Err(master::Error::Timeout)
        } else {
            result
        }
    }
}

#[embassy_executor::task]
pub async fn run(hardware: SensorHardware) {
    let SensorHardware {
        i2c,
        sda,
        scl,
        mut power,
        mut bus_enable,
        fault,
    } = hardware;
    // Bind the async interrupt driver in the executor that owns it. Async drivers
    // intentionally cannot be sent from the thread-mode executor.
    let mut driver = Fdc1004::new(TimedBus(i2c.into_async()));
    let mut delay = Delay;
    let mut attempts = [None; 3];
    let mut calibration = None;
    let mut configuration_revision = 0;
    let mut sequence = 0u64;
    loop {
        snapshot::update_sensor(|s| s.reading = Reading::Invalid(Fault::Bus));
        bus_enable.set_low();
        power.set_low();
        Timer::after(Duration::from_secs(2)).await;
        let now = snapshot::now().0;
        for attempt in &mut attempts {
            if attempt.is_some_and(|at| now >= at && now - at >= 60_000) {
                *attempt = None;
            }
        }
        let Some(slot) = attempts.iter_mut().find(|at| at.is_none()) else {
            Timer::after(Duration::from_secs(1)).await;
            continue;
        };
        *slot = Some(now);
        let mut bus = driver.into_inner();
        // HAL cancellation has completed bus release; reset while cable is isolated.
        if bus.0.apply_config(&Board::i2c_config()).is_err() {
            return;
        }
        driver = Fdc1004::new(bus);
        power.set_high();
        // LT3042 SET network needs about 136 ms for 99.9% settling.
        Timer::after(Duration::from_millis(200)).await;
        // Charging can assert the current-limit flag during this invalid-input
        // interval. Observe the epoch after settling, before checking the pins:
        // a persistent fault or any later edge still rejects the fresh frame.
        // Do not clear the latch until a complete initialized frame is accepted.
        let recovery_epoch = snapshot::sensor().power_fault_epoch;
        if fault.level() != Level::High || sda.level() != Level::High || scl.level() != Level::High
        {
            record_failure(None);
            continue;
        }
        bus_enable.set_high();
        Timer::after(Duration::from_millis(1)).await;
        if sda.level() != Level::High || scl.level() != Level::High {
            record_failure(None);
            continue;
        }
        if let Err(error) = driver.initialize(&mut delay, || snapshot::now().0).await {
            record_failure(Some(error));
            continue;
        }
        loop {
            let configuration = snapshot::configuration();
            if configuration.revision != configuration_revision {
                configuration_revision = configuration.revision;
                calibration = configuration
                    .calibration
                    .map(|value| CalibrationStage::new(value, snapshot::now()));
            }
            if fault.level() != Level::High
                || snapshot::sensor().power_fault_epoch != recovery_epoch
            {
                record_failure(None);
                break;
            }
            match driver.acquire(&mut delay, || snapshot::now().0).await {
                Ok(frame) => {
                    sequence = sequence.saturating_add(1);
                    let mut candidate = calibration.clone();
                    let calibrated = candidate.as_mut().map(|stage| {
                        stage.process(
                            snapshot::now(),
                            RawFrame {
                                channels: Channels {
                                    level: frame.level.counts(),
                                    wet_reference: frame.wet_reference.counts(),
                                    dry_reference: frame.dry_reference.counts(),
                                },
                                sequence,
                                started_at: Millis(frame.started_ms),
                                completed_at: Millis(frame.completed_ms),
                            },
                        )
                    });
                    snapshot::update_sensor(|s| {
                        s.frame = Some(frame);
                        s.frames = sequence;
                        s.configuration_revision = configuration_revision;
                        // A fault during the frame or calibration cannot be overwritten
                        // by its completion. Epoch saturation fails closed too.
                        let recovered = s.power_fault_epoch == recovery_epoch
                            && recovery_epoch != u64::MAX
                            && fault.level() == Level::High;
                        if recovered {
                            calibration = candidate;
                            s.power_fault_latched = false;
                        }
                        s.reading = if recovered {
                            calibrated.map_or(Reading::Invalid(Fault::Uncalibrated), |value| {
                                value.reading
                            })
                        } else {
                            Reading::Invalid(Fault::Bus)
                        };
                        s.calibration_error = calibrated.and_then(|value| value.error);
                        s.driver_error = None;
                    });
                }
                Err(error) => {
                    record_failure(Some(error));
                    break;
                }
            }
            Timer::after(Duration::from_millis(50)).await;
        }
    }
}
fn record_failure(error: Option<crystal_shim_drivers::fdc1004::Error<master::Error>>) {
    snapshot::update_sensor(|s| {
        s.reading = Reading::Invalid(Fault::Bus);
        s.failures = s.failures.saturating_add(1);
        s.driver_error = error;
        s.calibration_error = None;
    });
}
