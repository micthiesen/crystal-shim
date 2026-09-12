//! The production worker, with owned network fakes and the existing TLS clock lock.
extern crate std;

use super::*;
use crate::tests::{clock_test, tick};
use core::{future::poll_fn, net::IpAddr, pin::Pin, task::Poll};
use crystal_shim_core::{
    configuration::{PushoverCredentials, RawDeviceConfig},
    Timing, WaterState, WaterTransition,
};
use crystal_shim_matter::sdk::{
    dm::clusters::gen_diag::{InterfaceTypeEnum, NetifInfo},
    error::Error as MatterError,
    utils::sync::DynBase,
};
use edge_nal::{Close, NoopNet, Readable, TcpShutdown, TcpSplit};
use mbedtls_rs::{io::*, Tls};
use std::{boxed::Box, rc::Rc, sync::MutexGuard, task::Context, task::Waker, vec::Vec};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum Stage {
    Dns,
    Tcp,
    Tls,
}

#[derive(Debug)]
struct DropObservation {
    stage: Stage,
    queue_active: bool,
    lease_busy: bool,
}

struct Network {
    pause: Stage,
    reached: Cell<Option<Stage>>,
    changed: Cell<bool>,
    polls: Cell<usize>,
    writes: Cell<usize>,
    drops: RefCell<Vec<DropObservation>>,
}

impl Network {
    fn new(pause: Stage) -> Rc<Self> {
        Rc::new(Self {
            pause,
            reached: Cell::new(None),
            changed: Cell::new(false),
            polls: Cell::new(0),
            writes: Cell::new(0),
            drops: RefCell::new(Vec::new()),
        })
    }

    async fn pending(&self) {
        poll_fn(|_| {
            self.polls.set(self.polls.get() + 1);
            Poll::<()>::Pending
        })
        .await;
    }

    fn dropped(&self, stage: Stage) {
        self.drops.borrow_mut().push(DropObservation {
            stage,
            queue_active: diagnostics().active,
            lease_busy: matches!(
                OperationLease::begin(),
                Err(crate::ProviderError::OperationBusy)
            ),
        });
    }
}

struct PendingResource<'a>(&'a Network, Stage);
impl Drop for PendingResource<'_> {
    fn drop(&mut self) {
        self.0.dropped(self.1);
    }
}

struct Stack(Rc<Network>);
impl NetStack for Stack {
    type UdpBind<'a> = NoopNet;
    type UdpConnect<'a> = NoopNet;
    type TcpBind<'a> = NoopNet;
    type TcpConnect<'a> = &'a Self;
    type Dns<'a> = &'a Self;
    fn udp_bind(&self) -> Option<Self::UdpBind<'_>> {
        None
    }
    fn udp_connect(&self) -> Option<Self::UdpConnect<'_>> {
        None
    }
    fn tcp_bind(&self) -> Option<Self::TcpBind<'_>> {
        None
    }
    fn tcp_connect(&self) -> Option<Self::TcpConnect<'_>> {
        Some(self)
    }
    fn dns(&self) -> Option<Self::Dns<'_>> {
        Some(self)
    }
}

impl Dns for Stack {
    type Error = ErrorKind;
    async fn get_host_by_name(&self, host: &str, family: AddrType) -> Result<IpAddr, ErrorKind> {
        assert_eq!(host, "api.pushover.net");
        assert_eq!(family, AddrType::IPv4);
        self.0.reached.set(Some(Stage::Dns));
        if self.0.pause == Stage::Dns {
            let _resource = PendingResource(&self.0, Stage::Dns);
            self.0.pending().await;
        }
        Ok(Ipv4Addr::LOCALHOST.into())
    }
    async fn get_host_by_address(&self, _: IpAddr, _: &mut [u8]) -> Result<usize, ErrorKind> {
        panic!("reverse lookup is outside the sender contract")
    }
}

impl TcpConnect for Stack {
    type Error = ErrorKind;
    type Socket<'a> = Socket;
    async fn connect(&self, remote: SocketAddr) -> Result<Socket, ErrorKind> {
        assert_eq!(remote, SocketAddr::from((Ipv4Addr::LOCALHOST, 443)));
        self.0.reached.set(Some(Stage::Tcp));
        if self.0.pause == Stage::Tcp {
            let _resource = PendingResource(&self.0, Stage::Tcp);
            self.0.pending().await;
        }
        Ok(Socket {
            read: ReadHalf(self.0.clone()),
            write: WriteHalf(self.0.clone()),
        })
    }
}

struct Socket {
    read: ReadHalf,
    write: WriteHalf,
}
struct ReadHalf(Rc<Network>);
struct WriteHalf(Rc<Network>);
impl Drop for Socket {
    fn drop(&mut self) {
        self.read.0.dropped(Stage::Tls);
    }
}
impl ErrorType for Socket {
    type Error = ErrorKind;
}
impl ErrorType for ReadHalf {
    type Error = ErrorKind;
}
impl ErrorType for WriteHalf {
    type Error = ErrorKind;
}
impl Read for ReadHalf {
    async fn read(&mut self, _: &mut [u8]) -> Result<usize, ErrorKind> {
        self.0.reached.set(Some(Stage::Tls));
        self.0.pending().await;
        unreachable!()
    }
}
impl Write for WriteHalf {
    async fn write(&mut self, bytes: &[u8]) -> Result<usize, ErrorKind> {
        // This peer never answers ClientHello. HTTP application records must
        // not be sent before the real handshake has verified a peer.
        assert_eq!(bytes.first(), Some(&22), "expected TLS handshake record");
        self.0.writes.set(self.0.writes.get() + 1);
        Ok(bytes.len())
    }
    async fn flush(&mut self) -> Result<(), ErrorKind> {
        Ok(())
    }
}
impl Read for Socket {
    async fn read(&mut self, bytes: &mut [u8]) -> Result<usize, ErrorKind> {
        self.read.read(bytes).await
    }
}
impl Write for Socket {
    async fn write(&mut self, bytes: &[u8]) -> Result<usize, ErrorKind> {
        self.write.write(bytes).await
    }
    async fn flush(&mut self) -> Result<(), ErrorKind> {
        self.write.flush().await
    }
}
impl Readable for ReadHalf {
    async fn readable(&mut self) -> Result<(), ErrorKind> {
        Ok(())
    }
}
impl Readable for Socket {
    async fn readable(&mut self) -> Result<(), ErrorKind> {
        self.read.readable().await
    }
}
impl TcpSplit for Socket {
    type Read<'a> = &'a mut ReadHalf;
    type Write<'a> = &'a mut WriteHalf;
    fn split(&mut self) -> (Self::Read<'_>, Self::Write<'_>) {
        (&mut self.read, &mut self.write)
    }
}
impl TcpShutdown for Socket {
    async fn close(&mut self, _: Close) -> Result<(), ErrorKind> {
        Ok(())
    }
    async fn abort(&mut self) -> Result<(), ErrorKind> {
        Ok(())
    }
}

struct Netif(Rc<Network>);
impl DynBase for Netif {}
impl NetifDiag for Netif {
    fn netifs(
        &self,
        f: &mut dyn FnMut(&NetifInfo) -> Result<(), MatterError>,
    ) -> Result<(), MatterError> {
        f(&NetifInfo {
            name: "owned-fake",
            operational: true,
            offprem_svc_reachable_ipv4: None,
            offprem_svc_reachable_ipv6: None,
            hw_addr: &[0; 8],
            ipv4_addrs: &[Ipv4Addr::LOCALHOST],
            ipv6_addrs: &[],
            netif_type: InterfaceTypeEnum::WiFi,
            netif_index: 1,
        })
    }
}
impl NetChangeNotif for Netif {
    async fn wait_changed(&self) {
        poll_fn(|_| {
            if self.0.changed.replace(false) {
                Poll::Ready(())
            } else {
                Poll::Pending
            }
        })
        .await;
    }
}

struct OsRng;
impl rand_core::TryRng for OsRng {
    type Error = core::convert::Infallible;
    fn try_fill_bytes(&mut self, bytes: &mut [u8]) -> Result<(), Self::Error> {
        std::io::Read::read_exact(&mut std::fs::File::open("/dev/urandom").unwrap(), bytes)
            .unwrap();
        Ok(())
    }
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        let mut bytes = [0; 4];
        self.try_fill_bytes(&mut bytes)?;
        Ok(u32::from_ne_bytes(bytes))
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        let mut bytes = [0; 8];
        self.try_fill_bytes(&mut bytes)?;
        Ok(u64::from_ne_bytes(bytes))
    }
}
impl rand_core::TryCryptoRng for OsRng {}

fn configuration() -> ValidatedDeviceConfig {
    let credentials = PushoverCredentials::new(
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        None,
    )
    .unwrap();
    ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(1, 200, 800, 500, Timing::PROVISIONAL, 900, [0x5a; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .pushover(Some(credentials))
            .build(),
    )
    .unwrap()
}

fn setup() -> MutexGuard<'static, ()> {
    let guard = clock_test();
    let _ = &super::BUFFERS;
    embassy_time::MockDriver::get().reset();
    queue(|queue| *queue = Queue::new());
    crate::set_trusted_utc(crate::tests::date(2030, 1, 2, 0, 0, 0));
    let config = configuration();
    let credentials = *config.pushover().unwrap();
    // Use the actual control-side capture seam, including final GPIO state.
    capture(Millis(0), Some(config), None, None, false, false);
    queue(|queue| {
        queue.observe(Observation {
            now_ms: 0,
            revision: Some(1),
            credentials: Some(credentials),
            transition: Some(WaterTransition {
                from: WaterState::High,
                to: WaterState::Low,
            }),
            relay_on: false,
            state: State::Low,
            utc_bounds: None,
        });
    });
    guard
}

fn poll_pending(future: Pin<&mut impl Future>) {
    assert!(future
        .poll(&mut Context::from_waker(Waker::noop()))
        .is_pending());
}

fn assert_cleaned(network: &Network, paused: Stage) {
    assert_eq!(network.drops.borrow().len(), 1);
    let drops = network.drops.borrow();
    assert_eq!(drops[0].stage, paused);
    assert!(
        drops[0].queue_active,
        "I/O must drop before Active retires its token"
    );
    assert!(
        drops[0].lease_busy,
        "I/O must drop before the TLS lease is released"
    );
    drop(drops);
    assert!(!diagnostics().active);
    assert_eq!(diagnostics().pending, 1);
    assert_eq!(diagnostics().stats.api_accepted, 0);
    assert_eq!(diagnostics().stats.uncertain, 0);
    assert!(
        OperationLease::begin().is_ok(),
        "scope must be reusable after cancellation"
    );
    tick(5_000);
    let retried = queue(|queue| queue.claim(5_000)).unwrap();
    assert_eq!(retried.attempt.number, 2);
    assert_eq!(retried.attempt.event.id, 1);
    assert_eq!(retried.attempt.event.captured_at_ms, 0);
    assert_eq!(
        retried.attempt.event.expires_at_ms,
        crystal_shim_pushover::policy::EVENT_TTL_MS
    );
    queue(|queue| {
        queue.finish(
            5_000,
            retried.attempt.token,
            Outcome::Cancelled { uncertain: false },
        );
    });
}

#[test]
fn dropping_actual_worker_cancels_dns_tcp_and_tls_before_releasing_queue_and_lease() {
    for stage in [Stage::Dns, Stage::Tcp, Stage::Tls] {
        let _guard = setup();
        let network = Network::new(stage);
        let stack = Stack(network.clone());
        let netif = Netif(network.clone());
        let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
        let mut buffers = Buffers::new();
        let mut worker = Box::pin(run(&stack, &netif, Some(&tls), &mut buffers));
        poll_pending(worker.as_mut());
        assert_eq!(network.reached.get(), Some(stage));
        assert!(diagnostics().active);
        if stage == Stage::Tls {
            assert!(network.writes.get() > 0);
        }
        drop(worker);
        assert_cleaned(&network, stage);
    }
}

#[test]
fn network_change_cancels_actual_worker_before_next_retry_without_resetting_event_age() {
    for stage in [Stage::Dns, Stage::Tcp, Stage::Tls] {
        let _guard = setup();
        let network = Network::new(stage);
        let stack = Stack(network.clone());
        let netif = Netif(network.clone());
        let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
        let mut buffers = Buffers::new();
        let mut worker = Box::pin(run(&stack, &netif, Some(&tls), &mut buffers));
        poll_pending(worker.as_mut());
        network.changed.set(true);
        poll_pending(worker.as_mut());
        assert_cleaned(&network, stage);
        drop(worker);
        assert_eq!(network.drops.borrow().len(), 1);
    }
}

#[test]
fn clock_revocation_cancels_pending_io_before_it_is_polled_again() {
    let _guard = setup();
    let network = Network::new(Stage::Tls);
    let stack = Stack(network.clone());
    let netif = Netif(network.clone());
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let mut buffers = Buffers::new();
    let mut worker = Box::pin(run(&stack, &netif, Some(&tls), &mut buffers));
    poll_pending(worker.as_mut());
    let polls = network.polls.get();
    let writes = network.writes.get();
    crate::publish_clock(None, Some(0));
    poll_pending(worker.as_mut());
    assert_eq!(network.polls.get(), polls);
    assert_eq!(network.writes.get(), writes);
    assert_eq!(network.drops.borrow().len(), 1);
    assert!(network.drops.borrow()[0].queue_active);
    assert!(network.drops.borrow()[0].lease_busy);
    assert!(!diagnostics().active);
    assert_eq!(diagnostics().pending, 1);
    drop(worker);
    crate::set_trusted_utc(crate::tests::date(2030, 1, 2, 0, 0, 0));
    assert!(OperationLease::begin().is_ok());
}

#[test]
fn accepted_configuration_capture_stops_pending_tls_and_cannot_retry_old_work() {
    let _guard = setup();
    let network = Network::new(Stage::Tls);
    let stack = Stack(network.clone());
    let netif = Netif(network.clone());
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let mut buffers = Buffers::new();
    let mut worker = Box::pin(run(&stack, &netif, Some(&tls), &mut buffers));
    poll_pending(worker.as_mut());
    assert_eq!(network.reached.get(), Some(Stage::Tls));
    let polls = network.polls.get();
    let writes = network.writes.get();
    // Control has accepted a save while its final durable result is still pending.
    capture(Millis(0), Some(configuration()), None, None, false, true);
    poll_pending(worker.as_mut());
    assert_eq!(network.polls.get(), polls);
    assert_eq!(network.writes.get(), writes);
    assert_eq!(network.drops.borrow().len(), 1);
    assert!(network.drops.borrow()[0].lease_busy);
    assert!(!diagnostics().active);
    assert_eq!(diagnostics().pending, 0);
    assert_eq!(diagnostics().stats.api_accepted, 0);
    assert_eq!(diagnostics().stats.retried, 0);
    assert!(OperationLease::begin().is_ok());
    // Even completion/failure with the original committed revision cannot
    // restore old credentials or work when the ordinary retry time arrives.
    tick(5_000);
    embassy_time::MockDriver::get().advance(embassy_time::Duration::from_millis(5_000));
    capture(
        Millis(5_000),
        Some(configuration()),
        None,
        None,
        false,
        false,
    );
    poll_pending(worker.as_mut());
    assert_eq!(network.polls.get(), polls);
    assert_eq!(network.writes.get(), writes);
    assert_eq!(diagnostics().pending, 0);
    assert!(!diagnostics().active);
    assert_eq!(diagnostics().stats.api_accepted, 0);
    assert_eq!(diagnostics().stats.retried, 0);
    drop(worker);
    assert_eq!(network.drops.borrow().len(), 1);
}
