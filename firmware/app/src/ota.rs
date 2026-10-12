//! Over-the-air updates through esp-lan-ota's Matter cluster.
//!
//! Every flash access is a gated, region-restricted `OtaFlash` operation, so the
//! relay is commanded off and acknowledged before each chunk, exactly as for NVS.
//! Resets for a staged update or a rollback never energize the relay: boot starts
//! off and the retained policy suppresses a run that was active. They wait briefly
//! for in-flight configuration/retained writes so an update does not end in
//! revision-mismatch maintenance recovery.
use crate::{flash_gate::Permit, matter::Status, ota_flash::OtaFlash, service::Access, snapshot};
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::update::{self, Confirmation, Health, SensorStability};
use crystal_shim_core::Reading;
use crystal_shim_matter::sdk::{
    dm::{
        Dataver, Handler, InvokeContext, InvokeReply, MatchContext, NonBlockingHandler,
        ReadContext, ReadReply,
    },
    error::{Error, ErrorCode},
};
use embassy_time::{Duration, Timer};
use esp_bootloader_esp_idf::partitions::read_partition_table;
use esp_lan_ota::matter::{announce_enrollment, Enrollment, OtaCluster, OtaService};
use esp_lan_ota::{Chip, Identity, Name, Ota, Rollback};
use esp_storage::FlashStorage;
use static_cell::StaticCell;

pub type Service = OtaService<OtaFlash>;
static SERVICE: StaticCell<Service> = StaticCell::new();

#[derive(Clone, Copy, Debug)]
pub enum StartError {
    Gate,
    /// Not booted from an `ota_0`/`ota_1` slot of a valid OTA partition table.
    Layout,
    Identity,
    Flash,
}

/// Reads the layout and boot records under one relay-off permit. Call after the
/// output owner runs and before boot settings are published.
pub fn start(table_buffer: &mut [u8]) -> Result<&'static Service, StartError> {
    // SAFETY: a second handle to the same flash. esp-storage serializes ROM calls
    // in a critical section; both clients are synchronous thread-mode callers that
    // touch flash only while holding the single gate permit, and this one can
    // program only otadata and the slot that is not running.
    let mut flash = FlashStorage::new(unsafe { esp_hal::peripherals::FLASH::steal() });
    let (booted, regions) = {
        let _permit = Permit::acquire().map_err(|_| StartError::Gate)?;
        // MMU lookup of the running image. The upstream typed iterator is safe on
        // this table, which has no custom entries (see partitions.csv).
        let booted = read_partition_table(&mut flash, table_buffer)
            .and_then(|table| table.booted_partition())
            .ok()
            .flatten()
            .map(|partition| partition.offset())
            .ok_or(StartError::Layout)?;
        let regions = crate::partition::ota_regions(&mut flash, table_buffer, booted)
            .map_err(|_| StartError::Layout)?;
        (booted, regions)
    };
    let identity = Identity {
        chip: Chip::Esp32c6,
        project: Name::new(crate::ESP_APP_DESC.project_name()).ok_or(StartError::Identity)?,
        version: Name::new(crate::ESP_APP_DESC.version()).ok_or(StartError::Identity)?,
    };
    let flash = OtaFlash::new(flash, [regions.otadata, regions.spare]);
    let ota = Ota::start(flash, booted, identity).map_err(|error| match error {
        esp_lan_ota::StartError::Flash(_) => StartError::Flash,
        esp_lan_ota::StartError::Layout(_) | esp_lan_ota::StartError::NotOtaSlot => {
            StartError::Layout
        }
    })?;
    Ok(SERVICE.init(OtaService::new(ota)))
}

/// The cluster on the load endpoint. Without a started service it reports itself
/// unavailable instead of failing the rest of the endpoint.
pub struct Cluster(Option<OtaCluster<'static, OtaFlash>>);
impl Cluster {
    pub fn new(service: Option<&'static Service>, dataver: Dataver) -> Self {
        Self(service.map(|service| OtaCluster::new(service, dataver)))
    }
}
impl Handler for Cluster {
    fn read(&self, ctx: impl ReadContext, reply: impl ReadReply) -> Result<(), Error> {
        match &self.0 {
            Some(cluster) => cluster.read(ctx, reply),
            None => Err(ErrorCode::Busy.into()),
        }
    }
    fn invoke(&self, ctx: impl InvokeContext, reply: impl InvokeReply) -> Result<(), Error> {
        match &self.0 {
            Some(cluster) => cluster.invoke(ctx, reply),
            None => Err(ErrorCode::Busy.into()),
        }
    }
    fn bump_dataver(&self, ctx: impl MatchContext) {
        if let Some(cluster) = &self.0 {
            cluster.bump_dataver(ctx);
        }
    }
}
impl NonBlockingHandler for Cluster {}

/// The window `matter::run` opened after loading fabrics, awaiting its announcer.
static OPENED: Mutex<Cell<Option<Enrollment>>> = Mutex::new(Cell::new(None));
/// One enrollment line for the USB service, the sole console writer, to print.
static LINE: Mutex<Cell<Option<Enrollment>>> = Mutex::new(Cell::new(None));

/// Records the window opened on a boot that follows a USB flash.
pub fn opened(enrollment: Enrollment) {
    critical_section::with(|cs| OPENED.borrow(cs).set(Some(enrollment)));
}
pub fn take_line() -> Option<Enrollment> {
    critical_section::with(|cs| LINE.borrow(cs).take())
}

/// Confirms a trial image after real health evidence, rolls it back after the
/// bound, admits uploads only while the output is idle, announces enrollment, and
/// resets into a staged update. Runs for the life of the boot.
pub async fn supervise(
    service: &'static Service,
    access: &Cell<Access>,
    network: &Cell<Status>,
    boot_loaded: bool,
) {
    let booted_at = snapshot::now().0;
    let rollback_supported = service.boot_info().rollback == Rollback::Supported;
    let trial = async {
        let mut sensor = SensorStability::default();
        while service.is_unconfirmed() {
            let now = snapshot::now().0;
            let sample = snapshot::sensor();
            let valid_at = match sample.reading {
                Reading::Valid { observed_at, .. } => Some(observed_at.0),
                Reading::Invalid(_) => None,
            };
            let health = Health {
                storage_ready: boot_loaded && matches!(access.get(), Access::Ready(_)),
                control_observed_at_ms: snapshot::control_observed_at(),
                network_operational: matches!(
                    network.get(),
                    Status::OnlineClockRequired
                        | Status::OnlineTlsReady
                        | Status::OnlineTlsUnavailable
                ),
                sensor_valid_since_ms: sensor.observe(now, valid_at, sample.failures),
            };
            match update::confirmation(now, booted_at, health, rollback_supported) {
                // A failed otadata write leaves the image unconfirmed; retry. The
                // bootloader still rolls it back if the unit resets first.
                Confirmation::Confirm if service.confirm().is_ok() => {}
                Confirmation::Confirm | Confirmation::Wait => {
                    Timer::after(Duration::from_millis(250)).await
                }
                Confirmation::RollBack => reset().await,
            }
        }
    };
    let admission = async {
        loop {
            let status = critical_section::with(|cs| snapshot::STATUS.borrow(cs).get());
            service.set_accepting(update::accepts_upload(status, snapshot::storage_idle()));
            Timer::after(Duration::from_millis(250)).await;
        }
    };
    let enrollment = async {
        let enrollment = loop {
            if let Some(enrollment) = critical_section::with(|cs| OPENED.borrow(cs).take()) {
                break enrollment;
            }
            Timer::after(Duration::from_secs(1)).await;
        };
        // Prints every five seconds for the window's 15 minutes, then ends the
        // enrollment period so later boots open no window.
        announce_enrollment(service, enrollment, |line| {
            critical_section::with(|cs| LINE.borrow(cs).set(Some(*line)))
        })
        .await;
    };
    let staged = async {
        service.wait_reboot().await;
        reset().await
    };
    embassy_futures::join::join4(trial, admission, enrollment, staged).await;
}

/// Resets with the output commanded low and acknowledged: the reset holds a
/// flash-gate permit, so control has written the relay GPIO low (and fed the
/// watchdog) for this exact ticket and cannot raise it before the reset.
async fn reset() {
    let requested = snapshot::now().0;
    while !update::reset_ready(snapshot::now().0, requested, snapshot::storage_idle()) {
        Timer::after(Duration::from_millis(100)).await;
    }
    loop {
        if let Ok(_off) = Permit::acquire() {
            esp_hal::system::software_reset();
        }
        Timer::after(Duration::from_millis(10)).await;
    }
}
