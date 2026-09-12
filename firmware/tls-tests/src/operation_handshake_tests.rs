//! Loopback TLS coverage for the production operation lease.
//!
//! These tests deliberately use the checked-in synthetic chain and an OpenSSL
//! loopback server.  The client configuration is still built by the production
//! `pushover_config` helper, so the callback exercised by MbedTLS is the real
//! `OperationLease` callback rather than a test policy.

extern crate std;

use super::*;
use mbedtls_rs::{
    io::{self, Read, Write},
    *,
};
use std::{
    boxed::Box,
    ffi::CStr,
    format,
    future::Future,
    net::{TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        Arc,
    },
    task::{Context, Poll, Wake, Waker},
    time::{Duration, Instant},
};

use crystal_shim_core::utc_bounds::{ClockRateBound, UtcBounds};

const ROOT: &[u8] = include_bytes!("../fixtures/synthetic/root.der");
const HOST: &CStr = c"interval-proof.invalid";

const VALID_UTC_MS: u64 = 1_893_542_400_000; // 2030-01-02T00:00:00Z
const LEAF_EXPIRY_START_MS: u64 = 2_104_599_360_000; // 2036-09-09T18:56:00Z

struct OsRng;

impl rand_core::TryRng for OsRng {
    type Error = core::convert::Infallible;

    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        std::io::Read::read_exact(&mut std::fs::File::open("/dev/urandom").unwrap(), dst).unwrap();
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

struct Server(Child, u16);

impl Server {
    fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);

        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/synthetic");
        let child = Command::new("openssl")
            .args(["s_server", "-accept", &format!("127.0.0.1:{port}"), "-cert"])
            .arg(base.join("leaf.pem"))
            .arg("-key")
            .arg(base.join("leaf.TEST_ONLY.key.pem"))
            .arg("-cert_chain")
            .arg(base.join("inter.pem"))
            .args([
                "-tls1_2",
                "-www",
                "-quiet",
                "-cipher",
                "DEFAULT:@SECLEVEL=2",
            ])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        Self(child, port)
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

struct Socket {
    tcp: TcpStream,
    writes: Arc<AtomicU32>,
    reads: Arc<AtomicU32>,
    hold_reads: Arc<AtomicBool>,
}

impl Socket {
    fn open(port: u16) -> Self {
        let start = Instant::now();
        let tcp = loop {
            match TcpStream::connect(("127.0.0.1", port)) {
                Ok(stream) => break stream,
                Err(error) => {
                    assert!(start.elapsed() < Duration::from_secs(2), "{error}");
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        };
        tcp.set_nonblocking(true).unwrap();
        Self {
            tcp,
            writes: Arc::new(AtomicU32::new(0)),
            reads: Arc::new(AtomicU32::new(0)),
            hold_reads: Arc::new(AtomicBool::new(false)),
        }
    }
}

impl io::ErrorType for Socket {
    type Error = io::ErrorKind;
}

impl Read for Socket {
    async fn read(&mut self, buffer: &mut [u8]) -> Result<usize, Self::Error> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        std::future::poll_fn(|cx| {
            if self.hold_reads.load(Ordering::SeqCst) {
                cx.waker().wake_by_ref();
                return Poll::Pending;
            }
            match std::io::Read::read(&mut self.tcp, buffer) {
                Ok(length) => Poll::Ready(Ok(length)),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    cx.waker().wake_by_ref();
                    Poll::Pending
                }
                Err(_) => Poll::Ready(Err(io::ErrorKind::Other)),
            }
        })
        .await
    }
}

impl Write for Socket {
    async fn write(&mut self, buffer: &[u8]) -> Result<usize, Self::Error> {
        self.writes.fetch_add(1, Ordering::SeqCst);
        std::future::poll_fn(|cx| match std::io::Write::write(&mut self.tcp, buffer) {
            Ok(length) => Poll::Ready(Ok(length)),
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Err(_) => Poll::Ready(Err(io::ErrorKind::Other)),
        })
        .await
    }

    async fn flush(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}

struct WakeThread(std::thread::Thread);

impl Wake for WakeThread {
    fn wake(self: Arc<Self>) {
        self.0.unpark();
    }

    fn wake_by_ref(self: &Arc<Self>) {
        self.0.unpark();
    }
}

fn block_on<F: Future>(future: F) -> F::Output {
    let waker = Waker::from(Arc::new(WakeThread(std::thread::current())));
    let mut context = Context::from_waker(&waker);
    let mut future = Box::pin(future);
    let start = Instant::now();
    loop {
        match future.as_mut().poll(&mut context) {
            Poll::Ready(value) => return value,
            Poll::Pending => {
                assert!(start.elapsed() < Duration::from_secs(5));
                std::thread::park_timeout(Duration::from_millis(1));
            }
        }
    }
}

fn exact_sample(unix_ms: u64) -> UtcObservation {
    UtcObservation::new(unix_ms, Millis(0)).unwrap()
}

fn uncertain_sample(unix_ms: u64) -> UtcObservation {
    let bounds = UtcBounds::new(unix_ms, unix_ms + 10_000).unwrap();
    UtcObservation::bounded(bounds, Millis(0), ClockRateBound::new(100, 0).unwrap()).unwrap()
}

fn production_config<'a>(lease: &'a OperationLease) -> ClientSessionConfig<'a> {
    let mut config = pushover_config(lease).unwrap();
    // Keep the production trust policy and verifier, replacing only the checked
    // in Pushover root/name with this test server's synthetic chain.
    config.ca_chain = Some(Certificate::new_no_copy(ROOT).unwrap());
    config.server_name = Some(HOST);
    config
}

fn certificate_date(
    year: i32,
    month: i32,
    day: i32,
    hour: i32,
    minute: i32,
    second: i32,
) -> CertificateTime {
    CertificateTime {
        year,
        month,
        day,
        hour,
        minute,
        second,
    }
}

#[test]
fn operation_lease_accepts_uncertain_clock_and_real_full_chain() {
    let _guard = clock_test();
    set_trusted_observation(uncertain_sample(VALID_UTC_MS));
    assert!(!has_trusted_utc());
    assert!(has_trusted_bounds());

    let lease = OperationLease::begin().unwrap();
    assert_eq!(lease.started_at_ms(), 0);
    assert_eq!(lease.deadline_ms(), OPERATION_MS);
    let server = Server::start();
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let config = SessionConfig::Client(production_config(&lease));
    let mut session = Session::new(tls.reference(), Socket::open(server.1), &config).unwrap();
    block_on(session.connect()).unwrap();
    assert_eq!(session.tls_verification_details(), 0);
    block_on(session.close()).unwrap();
}

#[test]
fn operation_lease_rejects_certificate_expiring_inside_original_horizon() {
    let _guard = clock_test();
    set_trusted_observation(exact_sample(LEAF_EXPIRY_START_MS));
    let lease = OperationLease::begin().unwrap();
    assert_eq!(lease.deadline_ms(), OPERATION_MS);

    let server = Server::start();
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let config = SessionConfig::Client(production_config(&lease));
    let mut session = Session::new(tls.reference(), Socket::open(server.1), &config).unwrap();
    let result = block_on(session.connect());
    assert!(result.is_err());
    assert_ne!(
        session.tls_verification_details() & sys::MBEDTLS_X509_BADCERT_OTHER,
        0
    );
}

#[test]
fn operation_lease_checks_each_selected_certificate_depth() {
    let _guard = clock_test();
    set_trusted_observation(exact_sample(VALID_UTC_MS));
    let lease = OperationLease::begin().unwrap();
    let valid_not_after = certificate_date(2036, 9, 9, 18, 56, 14);

    for depth in [0, 1, 2] {
        assert!(CertificateVerifier::check(
            &lease,
            CertificateValidity {
                not_before: certificate_date(2029, 12, 1, 0, 0, 0),
                not_after: valid_not_after,
                depth,
            }
        )
        .is_ok());
        assert!(CertificateVerifier::check(
            &lease,
            CertificateValidity {
                not_before: certificate_date(2030, 1, 2, 0, 0, 1),
                not_after: valid_not_after,
                depth,
            }
        )
        .is_err());
        assert!(CertificateVerifier::check(
            &lease,
            CertificateValidity {
                not_before: certificate_date(2029, 12, 1, 0, 0, 0),
                not_after: certificate_date(2030, 1, 2, 0, 0, 19),
                depth,
            }
        )
        .is_err());
    }
}

#[test]
fn operation_lease_rejects_authority_change_while_handshake_is_pending() {
    let _guard = clock_test();
    set_trusted_observation(exact_sample(VALID_UTC_MS));
    let lease = OperationLease::begin().unwrap();
    let server = Server::start();
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let config = SessionConfig::Client(production_config(&lease));
    let socket = Socket::open(server.1);
    let hold_reads = socket.hold_reads.clone();
    hold_reads.store(true, Ordering::SeqCst);
    let mut session = Session::new(tls.reference(), socket, &config).unwrap();
    let mut future = Box::pin(session.connect());
    let waker = Waker::noop();
    let mut context = Context::from_waker(waker);
    assert!(future.as_mut().poll(&mut context).is_pending());

    // Reaccepting the same observation still mints a new authority generation.
    set_trusted_observation(exact_sample(VALID_UTC_MS));
    assert!(matches!(
        lease.check(),
        Err(ProviderError::OperationRevoked)
    ));
    assert!(hooked_utc().is_none());
    // This raw-session case proves callback rejection after authority changes.
    // The app worker tests separately prove guard cancellation before more I/O.
    hold_reads.store(false, Ordering::SeqCst);
    assert!(block_on(future.as_mut()).is_err());
    drop(future);
    drop(session);
}

#[test]
fn operation_lease_is_invalid_at_its_exact_deadline() {
    let _guard = clock_test();
    set_trusted_observation(exact_sample(VALID_UTC_MS));
    let lease = OperationLease::begin().unwrap();
    tick(OPERATION_MS as i64);
    assert!(matches!(
        lease.check(),
        Err(ProviderError::OperationRevoked)
    ));
    assert!(hooked_utc().is_none());
}
