//! Sole USB writer and local storage producer, independent of radio lifetime.
use crate::{runtime, snapshot, storage};
use core::{cell::Cell, fmt::Write as _};
use crystal_shim_core::{runtime::Record, runtime_ingress::Source};
use crystal_shim_matter::{on_off::Control as _, sdk::persist::KvBlobStoreAccess};
use crystal_shim_matter::{
    provision_transfer::{self, LocalCommand, Progress, Response, Transfer},
    storage::ProvisionStore,
};
use embassy_time::{with_timeout, Duration};
use embedded_io_async::{Read, Write};
use esp_hal::{gpio::Output, usb::usb_serial_jtag::UsbSerialJtag, Async};
use static_cell::StaticCell;

static CONSOLE: StaticCell<crystal_shim_core::runtime_ingress::Receiver> = StaticCell::new();
static PROVISION_TRANSFER: StaticCell<Transfer> = StaticCell::new();

pub trait RecordStore: ProvisionStore {
    fn apply(&self, record: Record) -> Result<(), storage::Error>;
}
impl<K: KvBlobStoreAccess> RecordStore for K {
    fn apply(&self, record: Record) -> Result<(), storage::Error> {
        crystal_shim_matter::storage::apply(self, record).map_err(|_| storage::Error::Flash)
    }
}
#[derive(Clone, Copy)]
pub enum Access {
    Preparing,
    Ready(&'static dyn RecordStore),
    Failed(storage::Error),
}
#[allow(clippy::too_many_arguments)]
pub async fn run(
    mut usb: UsbSerialJtag<'static, Async>,
    mut led: Output<'static>,
    boot_status: &'static str,
    initial_storage_error: Option<storage::Error>,
    reset: Option<esp_hal::rtc_cntl::SocResetReason>,
    access: &Cell<Access>,
    network: &Cell<crate::matter::Status>,
    identify_until: &Cell<Option<u64>>,
) {
    let receiver = CONSOLE.init(crystal_shim_core::runtime_ingress::Receiver::new());
    let transfer = PROVISION_TRANSFER.init(Transfer::new());
    let mut last_ticket = 0;
    let mut storage_error = initial_storage_error;
    let mut reported_at = None;
    let mut last_led = None;
    loop {
        receiver.expire(snapshot::now().0);
        // Applied-Off replies follow the GPIO write and precede this USB
        // producer's next storage call. They never wait for suppression durability.
        if let Some(reply) = runtime::take_reply() {
            let mut line = heapless::String::<128>::new();
            let _ = writeln!(line, "REPLY {} {:?}", reply.id, reply.result);
            let _ = with_timeout(Duration::from_millis(100), usb.write_all(line.as_bytes())).await;
        }
        if let Some(response) = transfer.poll(
            snapshot::now().0,
            &crate::matter::LocalControl,
            snapshot::administration(),
        ) {
            provision_reply(&mut usb, response).await;
        }
        if let Some(write) = runtime::write_request().filter(|write| write.ticket != last_ticket) {
            // Preparation publishes exactly one access owner. Until then the
            // request stays pending; USB replies and parsing continue below.
            let result = match access.get() {
                Access::Preparing => None,
                Access::Ready(store) => Some(store.apply(write.record)),
                Access::Failed(error) => Some(Err(error)),
            };
            if let Some(result) = result {
                last_ticket = write.ticket;
                storage_error = result.err();
                runtime::store_completed(crystal_shim_core::runtime::StoreCompletion {
                    ticket: write.ticket,
                    succeeded: result.is_ok(),
                });
                let mut line = heapless::String::<128>::new();
                let _ = writeln!(line, "STORAGE {} {:?}", write.ticket, result);
                let _ =
                    with_timeout(Duration::from_millis(100), usb.write_all(line.as_bytes())).await;
            }
        }
        let mut input = [0u8; 64];
        if let Ok(Ok(count)) = with_timeout(Duration::from_millis(20), usb.read(&mut input)).await {
            for byte in &mut input[..count] {
                let value = *byte;
                provision_transfer::clear_input(core::slice::from_mut(byte));
                if let Some(request) =
                    receiver.push_with(snapshot::now().0, value, provision_transfer::parse_line)
                {
                    let mut line = heapless::String::<128>::new();
                    match request {
                        Ok(LocalCommand::Provision(request)) => {
                            let store = match access.get() {
                                Access::Ready(store) => Some(store as &dyn ProvisionStore),
                                _ => None,
                            };
                            let response = transfer.handle(
                                request,
                                snapshot::now().0,
                                &crate::matter::LocalControl,
                                snapshot::administration(),
                                store,
                            );
                            provision_reply(&mut usb, response).await;
                            continue;
                        }
                        Ok(LocalCommand::Runtime(request))
                            if snapshot::boot_configuration().is_some() =>
                        {
                            let accepted = transfer.allows_runtime(request.command)
                                && crate::matter::LocalControl
                                    .begin(Source::Usb, request)
                                    .is_ok();
                            let _ = writeln!(
                                line,
                                "{} {}",
                                if accepted { "ACCEPTED" } else { "BUSY" },
                                request.id
                            );
                        }
                        Ok(LocalCommand::Runtime(request)) => {
                            let _ = writeln!(line, "NOT_READY {}", request.id);
                        }
                        Err(error) => {
                            let _ = writeln!(line, "PARSE_ERROR {:?}", error);
                        }
                    }
                    // Neither configuration bytes nor received lines are echoed.
                    let _ =
                        with_timeout(Duration::from_millis(100), usb.write_all(line.as_bytes()))
                            .await;
                }
            }
        }
        provision_transfer::clear_input(&mut input);
        let now = snapshot::now().0;
        // Identify drives only this LED. It never touches relay/control state.
        let period = if identify_until.get().is_some_and(|until| now < until) {
            150
        } else {
            1_000
        };
        if last_led.is_none_or(|at| now.saturating_sub(at) >= period) {
            last_led = Some(now);
            led.toggle();
        }

        if reported_at.is_some_and(|at| now >= at && now - at < 1_000) {
            continue;
        }
        reported_at = Some(now);
        // One thread-mode USB writer. No printing from interrupt tasks or critical sections.
        let sensor = snapshot::sensor();
        let mut line = heapless::String::<768>::new();
        let formatted = writeln!(
            line,
            "boot={} network={:?} revision={} storage_error={:?} last_stored={:?} reset={:?} ms={} frames={} failures={} raw={:?} reading={:?} calibration_error={:?} driver_error={:?} control={:?}",
            boot_status,
            network.get(),
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
                "STATUS network={:?} revision={} ms={} relay={:?} state={:?} diagnostic=TRUNCATED",
                network.get(),
                snapshot::configuration().revision,
                now,
                status.map(|status| status.control.relay),
                status.map(|status| status.control.state)
            );
        }
        let _ = with_timeout(Duration::from_millis(100), usb.write_all(line.as_bytes())).await;
    }
}

async fn provision_reply(usb: &mut UsbSerialJtag<'static, Async>, response: Response) {
    let mut line = heapless::String::<192>::new();
    if writeln!(line, "{response}").is_ok() {
        let _ = with_timeout(Duration::from_millis(100), usb.write_all(line.as_bytes())).await;
    }
    if response.result == Ok(Progress::Rebooting) {
        // Only a separate explicit reboot request, with a fresh durable
        // maintenance + GPIO-low acknowledgement, produces this effect.
        esp_hal::system::software_reset();
    }
}
