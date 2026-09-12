//! Uncommissioned local runtime; saved calibration/configuration are required to run.
#![no_std]
#![no_main]

extern crate alloc;
use crystal_shim_matter::sdk::utils::{cell::RefCell, sync::blocking::Mutex};
use esp_backtrace as _;
use esp_hal::{interrupt::Priority, timer::timg::MwdtStage};
use esp_rtos::embassy::InterruptExecutor;
use static_cell::StaticCell;

mod board;
mod clock;
mod control;
mod flash_gate;
mod matter;
mod partition;
mod radio;
mod runtime;
mod sensor;
mod service;
mod snapshot;
mod storage;

esp_bootloader_esp_idf::esp_app_desc!();

static CONTROL: StaticCell<InterruptExecutor<1>> = StaticCell::new();
static SENSOR: StaticCell<InterruptExecutor<2>> = StaticCell::new();
static STORAGE_BUFFER: StaticCell<Mutex<RefCell<[u8; storage::SCRATCH_BYTES]>>> = StaticCell::new();

#[esp_rtos::main]
async fn main(_spawner: embassy_executor::Spawner) {
    esp_alloc::heap_allocator!(size: 100 * 1024);
    // SAFETY: the only installation, before TLS construction on this executor.
    unsafe {
        crystal_shim_tls::install_certificate_clock();
    }
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
    let shared_buffer = STORAGE_BUFFER.init(Mutex::new(RefCell::new([0; storage::SCRATCH_BYTES])));
    let storage_buffer = shared_buffer.get_mut().get_mut();
    let mut store = storage::Store::open(board.flash, storage_buffer);
    let boot = store
        .as_mut()
        .map_err(|error| *error)
        .and_then(|store| store.load_boot(storage_buffer));
    if let Ok(boot) = &boot {
        snapshot::publish_boot(snapshot::BootConfiguration {
            configuration: boot.configuration,
            retained: boot.retained.map(|loaded| loaded.state),
        });
    }
    sensor.spawn(sensor::run(board.sensor).unwrap());
    let boot_status = match &boot {
        Ok(boot) if boot.configuration.is_some() => "SAVED_CONFIGURATION",
        Ok(_) => "UNCOMMISSIONED",
        Err(_) => "STORAGE_RECOVERY_REQUIRED",
    };
    let access = core::cell::Cell::new(service::Access::Preparing);
    let network = core::cell::Cell::new(matter::Status::Preparing);
    let identify_until = core::cell::Cell::new(None);
    crystal_shim_matter::service::alongside(
        service::run(
            board.usb,
            board.led,
            boot_status,
            boot.as_ref().err().copied(),
            reset,
            &access,
            &network,
            &identify_until,
        ),
        matter::run(
            board.rng,
            board.adc1,
            board.wifi,
            board.bt,
            store,
            shared_buffer,
            &access,
            &network,
            &identify_until,
        ),
    )
    .await;
}
