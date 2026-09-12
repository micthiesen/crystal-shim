//! Private controlled-load endpoint and fallible production commissioning assembly.
use crystal_shim_core::runtime::{Reply, Request};
use crystal_shim_core::runtime_ingress::{Source, Token};
use crystal_shim_core::RelayCommand;
use crystal_shim_matter::on_off::{BridgeError, Control, OnOff};
use crystal_shim_matter::sdk::dm::Dataver;

pub struct LocalControl;
impl Control for LocalControl {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        if crate::snapshot::boot_configuration().is_none() {
            return Err(BridgeError::NotReady);
        }
        crate::runtime::submit(source, request).ok_or(BridgeError::Busy)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        crate::runtime::reply(token)
    }
    fn cancel(&self, token: Token) {
        crate::runtime::cancel(token);
    }
    fn reported_on(&self) -> bool {
        critical_section::with(|cs| crate::snapshot::STATUS.borrow(cs).get())
            .is_some_and(|status| status.control.relay == RelayCommand::On)
    }
    fn now_ms(&self) -> u64 {
        crate::snapshot::now().0
    }
    async fn wait(&self) {
        embassy_time::Timer::after_millis(20).await;
    }
}

use crate::{
    radio,
    service::{Access, RecordStore},
    storage,
};
use alloc::boxed::Box;
use core::cell::Cell;
use crystal_shim_matter::provisioning::{self, Provisioning};
use crystal_shim_matter::sdk::{
    crypto::{default_crypto, Crypto},
    dm::clusters::dev_att::DeviceAttestation,
    dm::clusters::{
        basic_info::BasicInfoConfig,
        decl::on_off::ClusterAsyncHandler as _,
        desc::{self, ClusterHandler as _},
        groups::{self, ClusterHandler as _},
        identify::{self, IdentifyAction, IdentifyHooks, IdentifyTypeEnum},
    },
    dm::{Async, EmptyHandler, EpClMatcher, Node},
    persist::SharedKvBlobStore,
    utils::{cell::RefCell, init::InitMaybeUninit, sync::blocking::Mutex},
    BasicCommData,
};
use esp_hal::{
    peripherals::{ADC1, BT, RNG, WIFI},
    rng::{Trng, TrngSource},
};
use rs_matter_embassy::stack::rand::reseeding_csprng;
use static_cell::StaticCell;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Status {
    Preparing,
    ProvisioningRequired,
    ProvisioningInvalid,
    StorageUnavailable,
    EntropyUnavailable,
    StartupFailed,
    WaitingForNetwork,
    OnlineClockRequired,
    OnlineTlsReady,
    OnlineTlsUnavailable,
    RadioStopped,
}

const NODE: Node<'static> = Node {
    endpoints: &[radio::ROOT, crystal_shim_matter::profile::ENDPOINT],
};
static PROVISION_BYTES: StaticCell<[u8; storage::SCRATCH_BYTES]> = StaticCell::new();
static PROVISION: StaticCell<Provisioning<'static>> = StaticCell::new();
static INFO: StaticCell<BasicInfoConfig<'static>> = StaticCell::new();

struct Identify<'a>(&'a Cell<Option<u64>>);
impl IdentifyHooks for Identify<'_> {
    fn identify_type(&self) -> IdentifyTypeEnum {
        IdentifyTypeEnum::VisibleIndicator
    }
    fn identify(&self, action: IdentifyAction) {
        let duration = match action {
            IdentifyAction::Time(seconds) => Some(u64::from(seconds) * 1_000),
            IdentifyAction::Cancel => None,
            // TriggerEffect is optional and absent from required-only metadata.
            IdentifyAction::Effect(_, _) => None,
        };
        self.0
            .set(duration.and_then(|duration| crate::snapshot::now().0.checked_add(duration)));
    }
}

fn local_store(
    store: storage::Store,
    buffer: &'static Mutex<RefCell<[u8; storage::SCRATCH_BYTES]>>,
    access: &Cell<Access>,
) {
    let kv = Box::leak(Box::new(SharedKvBlobStore::new(store, buffer)));
    access.set(Access::Ready(kv));
}

#[allow(clippy::too_many_arguments)]
pub async fn run(
    rng: RNG<'static>,
    adc1: ADC1<'static>,
    wifi: WIFI<'static>,
    bt: BT<'static>,
    store: Result<storage::Store, storage::Error>,
    buffer: &'static Mutex<RefCell<[u8; storage::SCRATCH_BYTES]>>,
    access: &Cell<Access>,
    status: &Cell<Status>,
    identify_until: &Cell<Option<u64>>,
) {
    let mut store = match store {
        Ok(store) => store,
        Err(error) => {
            access.set(Access::Failed(error));
            status.set(Status::StorageUnavailable);
            return;
        }
    };
    let bytes = PROVISION_BYTES.init([0; storage::SCRATCH_BYTES]);
    let provision = match store.load(provisioning::STORAGE_KEY, bytes) {
        Ok(Some(bytes)) => Provisioning::decode(bytes).map_err(|_| Status::ProvisioningInvalid),
        Ok(None) => Err(Status::ProvisioningRequired),
        Err(_) => Err(Status::StorageUnavailable),
    };
    let provision = match provision {
        Ok(provision) => PROVISION.init(provision),
        Err(error) => {
            local_store(store, buffer, access);
            status.set(error);
            return;
        }
    };
    // A single entropy source owns RNG+ADC1 for the rest of this boot. Two seeded
    // streams separate Matter and TLS; no cached time or public example key.
    let _entropy = Box::leak(Box::new(TrngSource::new(rng, adc1)));
    let seeded = Trng::try_new()
        .ok()
        .and_then(|trng| reseeding_csprng(trng, 1_000).ok());
    let Some(seeded) = seeded else {
        local_store(store, buffer, access);
        status.set(Status::EntropyUnavailable);
        return;
    };
    let crypto = default_crypto(seeded, provision.dac_priv_key());
    let Ok(mut random) = crypto.weak_rand() else {
        local_store(store, buffer, access);
        status.set(Status::EntropyUnavailable);
        return;
    };
    let info = INFO.init(BasicInfoConfig {
        vid: provision.vendor_id,
        pid: provision.product_id,
        hw_ver: provision.hardware_version,
        hw_ver_str: provision.hardware_version_string,
        vendor_name: provision.vendor_name,
        serial_no: provision.serial_number,
        unique_id: provision.unique_id,
        product_name: "Crystal Shim",
        product_label: "Bounded water interlock",
        device_name: "Crystal Shim",
        device_type: Some(crystal_shim_matter::profile::DEVICE.dtype),
        sw_ver: 1,
        sw_ver_str: env!("CARGO_PKG_VERSION"),
        // This IP stack has outgoing TCP for TLS; the Matter IM still uses UDP.
        tcp_supported: false,
        ..BasicInfoConfig::new()
    });
    let stack = radio::MATTER_STORAGE
        .uninit()
        .init_with(radio::Matter::init(
            info,
            BasicCommData {
                discriminator: provision.discriminator,
                password: provision.passcode.to_le_bytes().into(),
            },
            provision,
        ));
    let startup = stack.startup(&crypto, &mut store).await;
    // The exact SDK access owns our sole Store. Leaking only this small owner
    // preserves local storage when network startup/run returns or is cancelled.
    let stack: &'static radio::Matter = stack;
    let kv = Box::leak(Box::new(stack.matter().kv(store)));
    let local: &'static dyn RecordStore = kv;
    access.set(Access::Ready(local));
    if startup.is_err() {
        status.set(Status::StartupFailed);
        return;
    }
    let on_off = OnOff::new(LocalControl, Dataver::new_rand(&mut random));
    let descriptor = desc::DescHandler::new(Dataver::new_rand(&mut random));
    let identify = identify::IdentifyHandler::new_with(
        Dataver::new_rand(&mut random),
        Identify(identify_until),
    );
    let groups = groups::GroupsHandler::new(Dataver::new_rand(&mut random));
    let endpoint = Some(crystal_shim_matter::on_off::ENDPOINT);
    let handler = EmptyHandler
        .chain(
            EpClMatcher::new(endpoint, Some(OnOff::<LocalControl>::CLUSTER.id)),
            crystal_shim_matter::sdk::dm::clusters::decl::on_off::HandlerAsyncAdaptor(&on_off),
        )
        .chain(
            EpClMatcher::new(endpoint, Some(desc::DescHandler::CLUSTER.id)),
            Async(descriptor.adapt()),
        )
        .chain(
            EpClMatcher::new(endpoint, Some(identify::CLUSTER.id)),
            Async(identify),
        )
        .chain(
            EpClMatcher::new(endpoint, Some(groups::GroupsHandler::CLUSTER.id)),
            Async(groups.adapt()),
        );
    let resources = radio::IP_STORAGE.init(embassy_net::StackResources::new());
    let tcp = radio::TCP_POOL_STORAGE.take();
    let udp = radio::UDP_POOL_STORAGE.take();
    let mdns = radio::MDNS_STORAGE.uninit().init_with(
        rs_matter_embassy::matter::transport::network::mdns::builtin::BuiltinMdns::init(),
    );
    let ble = radio::BLE_STORAGE
        .uninit()
        .init_with(rs_matter_embassy::ble::TroubleBtpGattContext::init());
    let tls = tls_engine();
    status.set(Status::WaitingForNetwork);
    let _result = radio::run(
        wifi,
        bt,
        stack,
        &crypto,
        (NODE, handler),
        &*kv,
        Application {
            status,
            tls,
            matter: stack.matter(),
            crypto: &crypto,
            settings_buffers: crate::settings::BUFFERS.take(),
            pushover_buffers: crate::pushover::BUFFERS.take(),
        },
        random,
        resources,
        tcp,
        udp,
        mdns,
        ble,
    )
    .await;
    identify_until.set(None);
    status.set(Status::RadioStopped);
}

/// Convert the SDK's cryptographic CSPRNG into MbedTLS's rand_core 0.10 API.
struct TlsRng<R>(R);
impl<R: rand_core::RngCore> rand_core10::TryRng for TlsRng<R> {
    type Error = core::convert::Infallible;
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        Ok(self.0.next_u32())
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        Ok(self.0.next_u64())
    }
    fn try_fill_bytes(&mut self, bytes: &mut [u8]) -> Result<(), Self::Error> {
        self.0.fill_bytes(bytes);
        Ok(())
    }
}
impl<R: rand_core::RngCore + rand_core::CryptoRng> rand_core10::TryCryptoRng for TlsRng<R> {}
fn tls_engine() -> Option<mbedtls_rs::Tls<'static>> {
    let seeded = reseeding_csprng(Trng::try_new().ok()?, 1_000).ok()?;
    mbedtls_rs::Tls::new(Box::leak(Box::new(TlsRng(seeded)))).ok()
}

struct Application<'a, C> {
    status: &'a Cell<Status>,
    tls: Option<mbedtls_rs::Tls<'static>>,
    matter: &'a crystal_shim_matter::sdk::Matter<'a>,
    crypto: &'a C,
    settings_buffers: &'static mut crystal_shim_settings::Buffers,
    pushover_buffers: &'static mut crystal_shim_pushover::http::Buffers,
}
impl<C: Crypto> rs_matter_embassy::stack::UserTask for Application<'_, C> {
    async fn run<S, N>(
        &mut self,
        stack: S,
        netif: N,
    ) -> Result<(), crystal_shim_matter::sdk::error::Error>
    where
        S: rs_matter_embassy::stack::nal::NetStack,
        N: crystal_shim_matter::sdk::dm::clusters::gen_diag::NetifDiag
            + crystal_shim_matter::sdk::dm::networks::NetChangeNotif,
    {
        // The SDK starts UserTask before IP is up. CASE retries are bounded and
        // independent of local control; TLS readiness opens no HTTPS socket.
        let readiness = async {
            loop {
                let mut online = false;
                netif.netifs(&mut |info| {
                    online |= info.operational && !info.ipv4_addrs.is_empty();
                    Ok(())
                })?;
                let status = if !online {
                    Status::WaitingForNetwork
                } else if self.tls.is_some() && stack.tcp_connect().is_some() {
                    match crystal_shim_tls::pushover_ready() {
                        Ok(_) => Status::OnlineTlsReady,
                        Err(crystal_shim_tls::ProviderError::ClockUnavailable) => {
                            Status::OnlineClockRequired
                        }
                        Err(_) => Status::OnlineTlsUnavailable,
                    }
                } else {
                    Status::OnlineTlsUnavailable
                };
                self.status.set(status);
                embassy_time::Timer::after_secs(1).await;
            }
        };
        match embassy_futures::select::select(
            readiness,
            embassy_futures::join::join(
                crate::clock::run(self.matter, self.crypto),
                embassy_futures::join::join(
                    crate::settings::run(&stack, &netif, self.settings_buffers),
                    crate::pushover::run(&stack, &netif, self.tls.as_ref(), self.pushover_buffers),
                ),
            ),
        )
        .await
        {
            embassy_futures::select::Either::First(result) => result,
            embassy_futures::select::Either::Second(((), ((), ()))) => Ok(()),
        }
    }
}
