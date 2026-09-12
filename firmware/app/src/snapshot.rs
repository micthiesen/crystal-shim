//! Copied observations; no I/O or await while interrupts are masked.
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::calibration::CalibrationError;
use crystal_shim_core::{Fault, Millis, Reading, SupervisorStatus};
use crystal_shim_drivers::fdc1004::Frame;

#[derive(Clone, Copy, Debug)]
pub struct SensorSnapshot {
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
