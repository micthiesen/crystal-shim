//! RAM-only water events and one sequential verified-HTTPS worker in thread mode.
use core::{
    cell::{Cell, RefCell},
    future::Future,
    net::{Ipv4Addr, SocketAddr},
};
use critical_section::Mutex;
use crystal_shim_core::{
    configuration::ValidatedDeviceConfig, utc::ClockAuthority, Millis, State, SupervisorStatus,
};
use crystal_shim_matter::sdk::dm::{clusters::gen_diag::NetifDiag, networks::NetChangeNotif};
use crystal_shim_pushover::{
    guard::{self, Guard, GuardError},
    http::{self, Buffers},
    policy::{Diagnostics, Observation, Outcome, Queue, Token, Work},
};
use crystal_shim_tls::OperationLease;
use edge_nal::{AddrType, Dns, TcpConnect};
use embassy_futures::select::{select, Either};
use embassy_time::Timer;
use rs_matter_embassy::stack::nal::NetStack;

static QUEUE: Mutex<RefCell<Queue>> = Mutex::new(RefCell::new(Queue::new()));
pub static BUFFERS: static_cell::ConstStaticCell<Buffers> =
    static_cell::ConstStaticCell::new(Buffers::new());
fn queue<R>(f: impl FnOnce(&mut Queue) -> R) -> R {
    critical_section::with(|cs| f(&mut QUEUE.borrow(cs).borrow_mut()))
}
pub fn diagnostics() -> Diagnostics {
    queue(|queue| queue.diagnostics())
}

/// Called exactly once after the local owner writes the relay output. Captures
/// the fresh one-tick transition rather than polling a replaceable status snapshot.
pub fn capture(
    now: Millis,
    configuration: Option<ValidatedDeviceConfig>,
    authority: Option<ClockAuthority>,
    status: Option<SupervisorStatus>,
    relay_on: bool,
    configuration_pending: bool,
) {
    queue(|queue| {
        queue.observe(Observation {
            now_ms: now.0,
            revision: configuration.as_ref().map(ValidatedDeviceConfig::revision),
            credentials: configuration
                .as_ref()
                .and_then(|config| config.pushover().copied()),
            transition: status.and_then(|status| status.water_transition),
            relay_on,
            state: status.map_or(State::Boot, |status| status.control.state),
            utc_bounds: authority.and_then(|authority| authority.observation.bounds_at(now)),
        });
        if configuration_pending {
            queue.pause_for_configuration();
        }
    });
}

fn address(netif: &impl NetifDiag) -> Option<Ipv4Addr> {
    let mut address = None;
    netif
        .netifs(&mut |info| {
            if info.operational {
                address = info.ipv4_addrs.first().copied();
            }
            Ok(())
        })
        .ok()?;
    address
}

struct Active {
    token: Token,
    may_have_sent: Cell<bool>,
    armed: bool,
}
impl Active {
    fn finish(mut self, outcome: Outcome) {
        queue(|queue| queue.finish(crate::snapshot::now().0, self.token, outcome));
        self.armed = false;
    }
}
impl Drop for Active {
    fn drop(&mut self) {
        if self.armed {
            // A canceled UserTask drops its socket first and retires only this
            // token. Queued events never acquire a new lifetime on reconnect.
            queue(|queue| {
                queue.finish(
                    crate::snapshot::now().0,
                    self.token,
                    Outcome::Transient {
                        uncertain: self.may_have_sent.get(),
                    },
                )
            });
        }
    }
}

struct Check<'a, N> {
    lease: &'a OperationLease,
    active: &'a Active,
    netif: &'a N,
    address: Ipv4Addr,
}
impl<N: NetifDiag> Guard for Check<'_, N> {
    fn now_ms(&self) -> u64 {
        crate::snapshot::now().0
    }
    fn valid(&self) -> bool {
        self.lease.check().is_ok()
            && address(self.netif) == Some(self.address)
            && queue(|queue| queue.is_current(self.active.token, self.now_ms()))
    }
    async fn wait(&self) {
        Timer::after_millis(guard::WAKE_MS).await;
    }
}

async fn phase<H: Guard, F: Future>(
    check: &H,
    work: &Work,
    cap_ms: u64,
    future: F,
) -> Result<F::Output, GuardError> {
    let deadline = check
        .now_ms()
        .checked_add(cap_ms)
        .ok_or(GuardError::InvalidDeadline)?
        .min(work.attempt.deadline_ms);
    guard::within(check, work.attempt.started_at_ms, deadline, future).await
}

async fn send<S: NetStack, N: NetifDiag>(
    stack: &S,
    tls: &mbedtls_rs::Tls<'_>,
    check: &Check<'_, N>,
    work: &Work,
    buffers: &mut Buffers,
) -> Outcome {
    let (Some(dns), Some(tcp)) = (stack.dns(), stack.tcp_connect()) else {
        return Outcome::Transient { uncertain: false };
    };
    let Ok(Ok(ip)) = phase(
        check,
        work,
        5_000,
        dns.get_host_by_name("api.pushover.net", AddrType::IPv4),
    )
    .await
    else {
        return Outcome::Transient { uncertain: false };
    };
    let Ok(connector) = crystal_shim_tls::pushover_connector(tls.reference(), tcp, check.lease)
    else {
        return Outcome::Transient { uncertain: false };
    };
    let Ok(Ok(mut socket)) = phase(
        check,
        work,
        5_000,
        connector.connect(SocketAddr::new(ip, crystal_shim_tls::PUSHOVER_PORT)),
    )
    .await
    else {
        return Outcome::Transient { uncertain: false };
    };
    // TlsConnector only creates a session. Its explicit handshake must complete
    // before HTTP constructs any credential-bearing request bytes.
    if !matches!(
        phase(check, work, 10_000, socket.session_mut().connect()).await,
        Ok(Ok(()))
    ) {
        return Outcome::Transient { uncertain: false };
    }
    if !check.valid() {
        return Outcome::Cancelled { uncertain: false };
    }
    check.active.may_have_sent.set(true);
    let outcome = http::exchange(&mut socket, work, check, buffers).await;
    // Socket is local to this operation: every return/cancellation destroys the
    // whole session. No split, session save, reconnect or TLS reuse is performed.
    match outcome {
        Outcome::Cancelled { uncertain } => Outcome::Transient { uncertain },
        other => other,
    }
}

#[cfg(all(test, not(target_os = "none")))]
#[path = "../../tls-tests/src/pushover_app_tests.rs"]
mod tests;

pub async fn run<S: NetStack, N: NetifDiag + NetChangeNotif>(
    stack: &S,
    netif: &N,
    tls: Option<&mbedtls_rs::Tls<'_>>,
    buffers: &mut Buffers,
) {
    loop {
        let usable = tls
            .zip(address(netif))
            .filter(|_| crystal_shim_tls::has_trusted_bounds());
        if let Some((tls, address)) = usable {
            if let Ok(lease) = OperationLease::begin() {
                if let Some(work) = queue(|queue| queue.claim(crate::snapshot::now().0)) {
                    let active = Active {
                        token: work.attempt.token,
                        may_have_sent: Cell::new(false),
                        armed: true,
                    };
                    let check = Check {
                        lease: &lease,
                        active: &active,
                        netif,
                        address,
                    };
                    let outcome = match select(
                        send(stack, tls, &check, &work, buffers),
                        netif.wait_changed(),
                    )
                    .await
                    {
                        Either::First(outcome) => outcome,
                        Either::Second(()) => Outcome::Transient {
                            uncertain: active.may_have_sent.get(),
                        },
                    };
                    active.finish(outcome);
                }
            }
        }
        Timer::after_millis(100).await;
    }
}
