//! Uncommissioned local runtime; saved calibration/configuration are required to run.
#![no_std]
#![no_main]

use core::fmt::Write as _;
use embassy_time::{with_timeout, Duration};
use embedded_io_async::{Read, Write};
use esp_backtrace as _;
use esp_hal::{interrupt::Priority, timer::timg::MwdtStage};
use esp_rtos::embassy::InterruptExecutor;
use static_cell::StaticCell;

mod board;
mod control;
mod flash_gate;
mod partition;
mod runtime;
mod sensor;
mod snapshot;
mod storage;

esp_bootloader_esp_idf::esp_app_desc!();

static CONTROL: StaticCell<InterruptExecutor<1>> = StaticCell::new();
static SENSOR: StaticCell<InterruptExecutor<2>> = StaticCell::new();
static STORAGE_BUFFER: StaticCell<[u8; storage::SCRATCH_BYTES]> = StaticCell::new();
static CONSOLE: StaticCell<crystal_shim_core::runtime_ingress::Receiver> = StaticCell::new();

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
    let receiver = CONSOLE.init(crystal_shim_core::runtime_ingress::Receiver::new());
    let mut last_ticket = 0;
    let mut storage_error = boot.as_ref().err().copied();
    let mut reported_at = None;
    loop {
        // Applied-Off replies follow the GPIO write and precede this USB
        // producer's next storage call. They never wait for suppression durability.
        if let Some(reply) = runtime::take_reply() {
            let mut line = heapless::String::<128>::new();
            let _ = writeln!(line, "REPLY {} {:?}", reply.id, reply.result);
            let _ = with_timeout(
                Duration::from_millis(100),
                board.usb.write_all(line.as_bytes()),
            )
            .await;
        }
        if let Some(write) = runtime::write_request().filter(|write| write.ticket != last_ticket) {
            // Sole thread-mode storage owner. Store.apply retains the existing
            // relay-off gate and bounded read/program/erase checkpoints.
            last_ticket = write.ticket;
            let result = store
                .as_mut()
                .map_err(|error| *error)
                .and_then(|store| store.apply(write.record, storage_buffer));
            storage_error = result.err();
            runtime::store_completed(crystal_shim_core::runtime::StoreCompletion {
                ticket: write.ticket,
                succeeded: result.is_ok(),
            });
            let mut line = heapless::String::<128>::new();
            let _ = writeln!(line, "STORAGE {} {:?}", write.ticket, result);
            let _ = with_timeout(
                Duration::from_millis(100),
                board.usb.write_all(line.as_bytes()),
            )
            .await;
        }
        let mut input = [0u8; 64];
        if let Ok(Ok(count)) =
            with_timeout(Duration::from_millis(20), board.usb.read(&mut input)).await
        {
            for byte in &input[..count] {
                if let Some(request) = receiver.push(snapshot::now().0, *byte) {
                    let mut line = heapless::String::<128>::new();
                    match request {
                        Ok(request) if snapshot::boot_configuration().is_some() => {
                            let accepted = runtime::submit(request);
                            let _ = writeln!(
                                line,
                                "{} {}",
                                if accepted { "ACCEPTED" } else { "BUSY" },
                                request.id
                            );
                        }
                        Ok(request) => {
                            let _ = writeln!(line, "NOT_READY {}", request.id);
                        }
                        Err(error) => {
                            let _ = writeln!(line, "PARSE_ERROR {:?}", error);
                        }
                    }
                    // Neither configuration bytes nor received lines are echoed.
                    let _ = with_timeout(
                        Duration::from_millis(100),
                        board.usb.write_all(line.as_bytes()),
                    )
                    .await;
                }
            }
        }
        input.fill(0);
        let now = snapshot::now().0;
        if reported_at.is_some_and(|at| now >= at && now - at < 1_000) {
            continue;
        }
        reported_at = Some(now);
        // One thread-mode USB writer. No printing from interrupt tasks or critical sections.
        let sensor = snapshot::sensor();
        let mut line = heapless::String::<768>::new();
        let formatted = writeln!(
            line,
            "boot={} revision={} storage_error={:?} last_stored={:?} reset={:?} ms={} frames={} failures={} raw={:?} reading={:?} calibration_error={:?} driver_error={:?} control={:?}",
            boot_status,
            snapshot::configuration().revision,
            storage_error,
            runtime::last_stored(),
            reset,
            snapshot::now().0,
            sensor.frames,
            sensor.failures,
            sensor.frame,
            sensor.reading,
            sensor.calibration_error,
            sensor.driver_error,
            critical_section::with(|cs| snapshot::STATUS.borrow(cs).get())
        );
        if formatted.is_err() {
            // Never put an unterminated truncated diagnostic in front of a reply.
            line.clear();
            let status = critical_section::with(|cs| snapshot::STATUS.borrow(cs).get());
            let _ = writeln!(
                line,
                "STATUS revision={} ms={} relay={:?} state={:?} diagnostic=TRUNCATED",
                snapshot::configuration().revision,
                now,
                status.map(|status| status.control.relay),
                status.map(|status| status.control.state)
            );
        }
        let _ = with_timeout(
            Duration::from_millis(100),
            board.usb.write_all(line.as_bytes()),
        )
        .await;
        board.led.toggle();
    }
}
