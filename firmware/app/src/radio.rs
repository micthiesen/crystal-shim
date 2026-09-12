//! One fallible Wi-Fi/BLE owner and one IP stack, including real TCP pools.

use bt_hci::controller::ExternalController;
use embassy_futures::select::{select, Either};
use embassy_net::{Stack, StackResources};
use esp_hal::peripherals::{BT, WIFI};
use esp_radio::ble::controller::BleConnector;
use esp_radio::wifi::{ControllerConfig, Interface, PowerSaveMode, WifiController};
use rs_matter_embassy::ble::{TroubleBtpGattContext, TroubleBtpGattPeripheral};
use rs_matter_embassy::enet::{
    create_enet_stack, Dns, EnetNetif, Tcp, TcpBuffers, Udp, UdpBuffers,
};
use rs_matter_embassy::matter::crypto::{Crypto, RngCore};
use rs_matter_embassy::matter::dm::clusters::gen_diag::InterfaceTypeEnum;
use rs_matter_embassy::matter::dm::{DataModel, Endpoint};
use rs_matter_embassy::matter::persist::KvBlobStoreAccess;
use rs_matter_embassy::matter::transport::network::mdns::builtin::BuiltinMdns;
use rs_matter_embassy::matter::transport::network::{MAX_RX_PACKET_SIZE, MAX_TX_PACKET_SIZE};
use rs_matter_embassy::stack::nal::{NetStack, NoopNet};
use rs_matter_embassy::stack::wireless::{PreexistingWireless, WifiMatterStack};
use rs_matter_embassy::stack::UserTask;
use rs_matter_embassy::wifi::esp::EspWifiController;

pub const TCP_SOCKETS: usize = 2;
pub const UDP_SOCKETS: usize = 3; // Matter, mDNS, one user socket, e.g. time acquisition
pub const IP_SOCKETS: usize = 2 + TCP_SOCKETS + UDP_SOCKETS; // DHCP and DNS reserve two
pub const BTP_HCI_SLOTS: usize = 20; // SDK uses this private constant; project declares its own
pub type UdpPool = UdpBuffers<UDP_SOCKETS, MAX_TX_PACKET_SIZE, MAX_RX_PACKET_SIZE, 4>;
pub type TcpPool = TcpBuffers<TCP_SOCKETS, 2048, 2048>;
pub type IpResources = StackResources<IP_SOCKETS>;
pub type Matter = WifiMatterStack<'static, 20_000, ()>;
pub const ROOT: Endpoint<'static> = crystal_shim_matter::time_source::ROOT;

#[derive(Copy, Clone)]
pub struct ProjectNetStack<'a> {
    tcp: Tcp<'a>,
    udp: Udp<'a>,
    dns: Dns<'a>,
}

impl<'a> ProjectNetStack<'a> {
    pub fn new(stack: Stack<'a>, tcp: &'a TcpPool, udp: &'a UdpPool) -> Self {
        Self {
            tcp: Tcp::new(stack, tcp),
            udp: Udp::new(stack, udp),
            dns: Dns::new(stack),
        }
    }
}

impl NetStack for ProjectNetStack<'_> {
    type UdpBind<'a>
        = Udp<'a>
    where
        Self: 'a;
    type UdpConnect<'a>
        = NoopNet
    where
        Self: 'a;
    type TcpBind<'a>
        = Tcp<'a>
    where
        Self: 'a;
    type TcpConnect<'a>
        = Tcp<'a>
    where
        Self: 'a;
    type Dns<'a>
        = Dns<'a>
    where
        Self: 'a;
    fn udp_bind(&self) -> Option<Self::UdpBind<'_>> {
        Some(self.udp)
    }
    fn udp_connect(&self) -> Option<Self::UdpConnect<'_>> {
        None
    }
    fn tcp_bind(&self) -> Option<Self::TcpBind<'_>> {
        Some(self.tcp)
    }
    fn tcp_connect(&self) -> Option<Self::TcpConnect<'_>> {
        Some(self.tcp)
    }
    fn dns(&self) -> Option<Self::Dns<'_>> {
        Some(self.dns)
    }
}

#[derive(Debug)]
pub enum RunError {
    Ble,
    Wifi,
    StationAlreadyTaken,
    Matter,
}

// Supply static storage from the owner, so these values never require a large stack copy.
// The function borrows them; it does not create another IP stack.
#[allow(clippy::too_many_arguments)]
pub async fn run<'d, C, H, K, U, R>(
    wifi: WIFI<'d>,
    bt: BT<'d>,
    matter: &Matter,
    crypto: C,
    handler: H,
    kv: K,
    user: U,
    mut rand: R,
    resources: &mut IpResources,
    tcp: &TcpPool,
    udp: &UdpPool,
    mdns: &mut BuiltinMdns,
    ble_context: &TroubleBtpGattContext,
) -> Result<(), RunError>
where
    C: Crypto,
    H: DataModel,
    K: KvBlobStoreAccess,
    U: UserTask,
    R: RngCore + Copy,
{
    // Match SDK ordering, but propagate its explicit Result errors.
    let ble = BleConnector::new(bt, Default::default()).map_err(|_| RunError::Ble)?;
    let ble = ExternalController::<_, BTP_HCI_SLOTS>::new(ble);
    let mut wifi =
        WifiController::new(wifi, ControllerConfig::default()).map_err(|_| RunError::Wifi)?;
    wifi.set_power_saving(PowerSaveMode::None)
        .map_err(|_| RunError::Wifi)?;
    let driver = Interface::try_station().ok_or(RunError::StationAlreadyTaken)?;
    let wifi = EspWifiController::new(wifi);

    let (stack, mut runner) = create_enet_stack(driver, rand.next_u64(), resources);
    let net = ProjectNetStack::new(stack, tcp, udp);
    let netif = EnetNetif::new(stack, InterfaceTypeEnum::WiFi);
    let gatt = TroubleBtpGattPeripheral::new(ble, Some(rand), ble_context);

    let wireless = PreexistingWireless::new(net, netif, wifi, mdns, gatt);
    match select(
        matter.run_coex(wireless, crypto, handler, kv, user),
        runner.run(),
    )
    .await
    {
        Either::First(result) => result.map_err(|_| RunError::Matter),
        Either::Second(never) => match never {},
    }
}

// Pool const initialization guarantees no initial pool-sized stack temporary.
// IpResources may contain types that are !Send; StaticCell has no T: Send bound.
pub static TCP_POOL_STORAGE: static_cell::ConstStaticCell<TcpPool> =
    static_cell::ConstStaticCell::new(TcpPool::new());
pub static UDP_POOL_STORAGE: static_cell::ConstStaticCell<UdpPool> =
    static_cell::ConstStaticCell::new(UdpPool::new());
pub static IP_STORAGE: static_cell::StaticCell<IpResources> = static_cell::StaticCell::new();
pub static MATTER_STORAGE: static_cell::StaticCell<Matter> = static_cell::StaticCell::new();
pub static BLE_STORAGE: static_cell::StaticCell<TroubleBtpGattContext> =
    static_cell::StaticCell::new();
pub static MDNS_STORAGE: static_cell::StaticCell<BuiltinMdns> = static_cell::StaticCell::new();
