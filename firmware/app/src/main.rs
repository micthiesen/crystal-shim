//! Uncommissioned local runtime; saved calibration/configuration are required to run.
#![no_std]
#![no_main]

use core::fmt::Write as _;
use embassy_time::{with_timeout, Duration, Timer};
use embedded_io_async::Write;
use esp_backtrace as _;
use esp_hal::{interrupt::Priority, timer::timg::MwdtStage};
use esp_rtos::embassy::InterruptExecutor;
use static_cell::StaticCell;

mod board;
mod control;
mod flash_gate;
mod partition;
mod sensor;
mod snapshot;
mod storage;

esp_bootloader_esp_idf::esp_app_desc!();

static CONTROL: StaticCell<InterruptExecutor<1>> = StaticCell::new();
static SENSOR: StaticCell<InterruptExecutor<2>> = StaticCell::new();
static STORAGE_BUFFER: StaticCell<[u8; storage::SCRATCH_BYTES]> = StaticCell::new();

#[esp_rtos::main]
async fn main(_spawner: embassy_executor::Spawner) {
    let mut board = board::Board::new(esp_hal::init(esp_hal::Config::default()));
    let reset = esp_hal::rtc_cntl::reset_reason(esp_hal::system::Cpu::ProCpu);
    esp_rtos::start(board.timers.timer0, board.interrupts.software_interrupt0);
    let control = CONTROL
        .init(InterruptExecutor::new(board.interrupts.software_interrupt1))
        .start(Priority::Priority3);
    let sensor = SENSOR
        .init(InterruptExecutor::new(board.interrupts.software_interrupt2))
        .start(Priority::Priority2);
    board.watchdog.set_timeout(
        MwdtStage::Stage0,
        esp_hal::time::Duration::from_millis(1500),
    );
    board.watchdog.enable();
    let sensor_fault = board.sensor_fault.peripheral_input();
    control.spawn(
        control::run(
            board.relay,
            board.maintenance,
            board.psu_good,
            sensor_fault,
            board.watchdog,
        )
        .unwrap(),
    );
    control.spawn(sensor::fault_monitor(board.sensor_fault).unwrap());
    // Start the output owner before storage: every flash access needs its off ACK.
    let storage_buffer = STORAGE_BUFFER.init([0; storage::SCRATCH_BYTES]);
    let mut store = storage::Store::open(board.flash, storage_buffer);
    let boot = store
        .as_mut()
        .map_err(|error| *error)
        .and_then(|store| store.load_boot(storage_buffer));
    let calibration = boot
        .as_ref()
        .ok()
        .and_then(|boot| boot.configuration.as_ref())
        .and_then(|config| config.calibration());
    if let Ok(boot) = &boot {
        if let Some(config) = &boot.configuration {
            snapshot::publish_boot(snapshot::BootConfiguration {
                supervisor: config.supervisor_config(),
                maintenance: boot.retained.is_none_or(|loaded| loaded.state.maintenance),
            });
        }
    }
    sensor.spawn(sensor::run(board.sensor, calibration).unwrap());
    let boot_status = match &boot {
        Ok(boot) if boot.configuration.is_some() => "SAVED_CONFIGURATION",
        Ok(_) => "UNCOMMISSIONED",
        Err(_) => "STORAGE_RECOVERY_REQUIRED",
    };
    loop {
        // One thread-mode USB writer. No printing from interrupt tasks or critical sections.
        let sensor = snapshot::sensor();
        let mut line = heapless::String::<768>::new();
        let _ = writeln!(
            line,
            "{} storage_error={:?} reset={:?} ms={} frames={} failures={} raw={:?} reading={:?} calibration_error={:?} driver_error={:?}",
            boot_status,
            boot.as_ref().err(),
            reset,
            snapshot::now().0,
            sensor.frames,
            sensor.failures,
            sensor.frame,
            sensor.reading,
            sensor.calibration_error,
            sensor.driver_error
        );
        let _ = with_timeout(
            Duration::from_millis(100),
            board.usb.write_all(line.as_bytes()),
        )
        .await;
        board.led.toggle();
        Timer::after(Duration::from_secs(1)).await;
    }
}
