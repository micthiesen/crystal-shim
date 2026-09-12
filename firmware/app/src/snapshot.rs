//! Copied observations; no I/O or await while interrupts are masked.
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::calibration::{Calibration, CalibrationError};
use crystal_shim_core::configuration::ValidatedDeviceConfig;
use crystal_shim_core::{Fault, Millis, Reading, RetainedState, SupervisorStatus};
use crystal_shim_drivers::fdc1004::Frame;

#[derive(Clone, Copy, Debug)]
pub struct SensorSnapshot {
    pub configuration_revision: u32,
    pub frame: Option<Frame>,
    pub reading: Reading,
    pub frames: u64,
    pub failures: u32,
    pub transaction_deadline: Option<Millis>,
    pub calibration_error: Option<CalibrationError>,
    pub driver_error: Option<crystal_shim_drivers::fdc1004::Error<esp_hal::i2c::master::Error>>,
    pub power_fault_epoch: u64,
    pub power_fault_latched: bool,
}
static SENSOR: Mutex<Cell<SensorSnapshot>> = Mutex::new(Cell::new(SensorSnapshot {
    configuration_revision: 0,
    frame: None,
    reading: Reading::Invalid(Fault::Uncalibrated),
    frames: 0,
    failures: 0,
    transaction_deadline: None,
    calibration_error: None,
    driver_error: None,
    power_fault_epoch: 0,
    power_fault_latched: false,
}));
pub static STATUS: Mutex<Cell<Option<SupervisorStatus>>> = Mutex::new(Cell::new(None));
#[derive(Clone, Copy)]
pub struct BootConfiguration {
    pub configuration: Option<ValidatedDeviceConfig>,
    pub retained: Option<RetainedState>,
}
static BOOT: Mutex<Cell<Option<BootConfiguration>>> = Mutex::new(Cell::new(None));
#[derive(Clone, Copy)]
pub struct SensorConfiguration {
    pub revision: u32,
    pub calibration: Option<Calibration>,
}
static CONFIGURATION: Mutex<Cell<SensorConfiguration>> =
    Mutex::new(Cell::new(SensorConfiguration {
        revision: 0,
        calibration: None,
    }));
pub fn publish_configuration(configuration: Option<ValidatedDeviceConfig>) {
    critical_section::with(|cs| {
        let next = configuration.map_or(
            SensorConfiguration {
                revision: 0,
                calibration: None,
            },
            |config| SensorConfiguration {
                revision: config.revision(),
                calibration: config.calibration(),
            },
        );
        if CONFIGURATION.borrow(cs).get().revision != next.revision {
            // Revision publication immediately invalidates the previous reading.
            let mut sample = SENSOR.borrow(cs).get();
            sample.reading = Reading::Invalid(Fault::Uncalibrated);
            SENSOR.borrow(cs).set(sample);
            CONFIGURATION.borrow(cs).set(next);
        }
    });
}
pub fn configuration() -> SensorConfiguration {
    critical_section::with(|cs| CONFIGURATION.borrow(cs).get())
}
/// Startup-only publication, after settings and any retained repair are durable.
pub fn publish_boot(config: BootConfiguration) {
    critical_section::with(|cs| {
        assert!(
            BOOT.borrow(cs).get().is_none(),
            "boot settings may be published only once"
        );
        BOOT.borrow(cs).set(Some(config));
    });
}
pub fn boot_configuration() -> Option<BootConfiguration> {
    critical_section::with(|cs| BOOT.borrow(cs).get())
}
pub fn sensor() -> SensorSnapshot {
    critical_section::with(|cs| SENSOR.borrow(cs).get())
}
pub fn update_sensor(f: impl FnOnce(&mut SensorSnapshot)) {
    critical_section::with(|cs| {
        let mut value = SENSOR.borrow(cs).get();
        f(&mut value);
        SENSOR.borrow(cs).set(value);
    });
}
pub fn now() -> Millis {
    Millis(embassy_time::Instant::now().as_millis())
}
