//! Priority3 local output owner, runtime transactions and flash exclusion.
use crate::snapshot::{self, STATUS};
use crystal_shim_core::runtime::{Observation, Runtime};
use crystal_shim_core::{Fault, HardwarePermit, Reading, RelayCommand};
use embassy_time::{Duration, Ticker};
use esp_hal::{
    gpio::{interconnect::InputSignal, Input, Level, Output},
    peripherals::TIMG1,
    timer::timg::Wdt,
};

#[embassy_executor::task]
pub async fn run(
    mut relay: Output<'static>,
    maintenance: Input<'static>,
    psu_good: Input<'static>,
    sensor_fault: InputSignal<'static>,
    mut watchdog: Wdt<TIMG1<'static>>,
) {
    let mut runtime: Option<Runtime> = None;
    let mut boot_maintenance_requested = false;
    let mut tick = Ticker::every(Duration::from_millis(20));
    loop {
        let now = snapshot::now();
        if runtime.is_none() && maintenance.is_low() {
            boot_maintenance_requested = true;
        }
        if runtime.is_none() {
            if let Some(config) = snapshot::boot_configuration() {
                runtime = Runtime::new(config.configuration, config.retained, now).ok();
            }
        }
        let (flash_inhibited, flash_ticket) = crate::flash_gate::observation();
        let sample = snapshot::sensor();
        let reading = if sample.power_fault_latched {
            Reading::Invalid(Fault::Bus)
        } else if sample
            .transaction_deadline
            .is_some_and(|deadline| now >= deadline)
        {
            // HAL cancellation may spend 50 ms clearing the bus at Priority2.
            Reading::Invalid(Fault::Bus)
        } else {
            sample.reading
        };
        let step = runtime.as_mut().map(|runtime| {
            let (force_off, request) = crate::runtime::take();
            let step = runtime.step(
                Observation {
                    now,
                    sensor_revision: sample.configuration_revision,
                    reading,
                    force_off,
                    maintenance_pressed: maintenance.is_low() || boot_maintenance_requested,
                    hardware: if !flash_inhibited
                        && psu_good.is_high()
                        && sensor_fault.level() == Level::High
                    {
                        HardwarePermit::Allowed
                    } else {
                        HardwarePermit::ForcedOff
                    },
                },
                request,
                crate::runtime::take_completion(),
            );
            boot_maintenance_requested = false;
            snapshot::publish_configuration(runtime.configuration());
            crate::runtime::publish_write(runtime.store_request());
            step
        });
        let status = step.and_then(|step| step.status);
        let relay_on = !flash_inhibited
            && status.is_some_and(|status| status.control.relay == RelayCommand::On);
        if relay_on {
            relay.set_high();
        } else {
            relay.set_low();
        }
        critical_section::with(|cs| STATUS.borrow(cs).set(status));
        snapshot::publish_administration(crystal_shim_matter::provision_transfer::Readiness {
            configured: runtime
                .as_ref()
                .is_some_and(|runtime| runtime.configuration().is_some()),
            durable_maintenance: runtime.as_ref().is_some_and(Runtime::durable_maintenance),
            relay_off: !relay_on,
            observed_at_ms: now.0,
        });
        if let Some(step) = step {
            for reply in [step.command_reply, step.completed_reply]
                .into_iter()
                .flatten()
            {
                crate::runtime::complete(reply);
            }
        }
        watchdog.feed(); // Only after a complete output iteration, never from another task.
        if let Some(ticket) = flash_ticket {
            crate::flash_gate::acknowledge_off(ticket);
        }
        tick.next().await;
    }
}
