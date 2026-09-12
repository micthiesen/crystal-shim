// Offline loopback TLS only. This binary has its own global MbedTLS hooks.
use mbedtls_rs::sys::hook::{
    timer::{hook_timer, MbedtlsTimer},
    wall_clock::{hook_wall_clock, MbedtlsWallClock},
};
use mbedtls_rs::{
    io::{self, Read, Write},
    *,
};
use std::{
    ffi::CStr,
    future::Future,
    net::{TcpListener, TcpStream},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicU32, Ordering},
        Arc, Mutex,
    },
    task::{Context, Poll, Wake, Waker},
    time::{Duration, Instant},
};
const ROOT: &[u8] = include_bytes!("../fixtures/synthetic/root.der");
const HOST: &CStr = c"interval-proof.invalid";
// This binary has exactly one test: no parallel changes to MbedTLS global hooks.
struct Clock(AtomicU32);
impl MbedtlsWallClock for Clock {
    fn instant(&self) -> Option<sys::tm> {
        Some(sys::tm {
            tm_year: self.0.load(Ordering::SeqCst) as i32 - 1900,
            tm_mon: 0,
            tm_mday: 2,
            ..sys::tm::default()
        })
    }
}
impl MbedtlsTimer for Clock {
    fn now(&self) -> i64 {
        100
    }
}
static CLOCK: Clock = Clock(AtomicU32::new(2030));
struct OsRng;
impl rand_core::TryRng for OsRng {
    type Error = core::convert::Infallible;
    fn try_fill_bytes(&mut self, dst: &mut [u8]) -> Result<(), Self::Error> {
        std::io::Read::read_exact(&mut std::fs::File::open("/dev/urandom").unwrap(), dst).unwrap();
        Ok(())
    }
    fn try_next_u32(&mut self) -> Result<u32, Self::Error> {
        let mut b = [0; 4];
        self.try_fill_bytes(&mut b)?;
        Ok(u32::from_ne_bytes(b))
    }
    fn try_next_u64(&mut self) -> Result<u64, Self::Error> {
        let mut b = [0; 8];
        self.try_fill_bytes(&mut b)?;
        Ok(u64::from_ne_bytes(b))
    }
}
impl rand_core::TryCryptoRng for OsRng {}
fn date(year: i32) -> CertificateTime {
    CertificateTime {
        year,
        month: 1,
        day: 2,
        hour: 0,
        minute: 0,
        second: 0,
    }
}
struct Policy {
    lo: CertificateTime,
    hi: CertificateTime,
    deny_depth: Option<u32>,
    generation: AtomicU32,
    visits: Mutex<Vec<CertificateValidity>>,
}
impl Policy {
    fn new() -> Self {
        Self {
            lo: date(2030),
            hi: date(2030),
            deny_depth: None,
            generation: AtomicU32::new(1),
            visits: Mutex::new(Vec::with_capacity(3)),
        }
    }
}
impl CertificateVerifier for Policy {
    fn check(&self, c: CertificateValidity) -> Result<(), CertificateRejected> {
        self.visits.lock().unwrap().push(c);
        if self.generation.load(Ordering::SeqCst) != 1
            || self.deny_depth == Some(c.depth)
            || c.not_before > self.lo
            || c.not_after < self.hi
        {
            Err(CertificateRejected)
        } else {
            Ok(())
        }
    }
}
struct Server(Child, u16);
impl Server {
    fn start(protocol: &str) -> Self {
        Self::with_leaf(protocol, "leaf.pem", "leaf.TEST_ONLY.key.pem")
    }
    fn with_leaf(protocol: &str, certificate: &str, key: &str) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures/synthetic");
        let child = Command::new("openssl")
            .args(["s_server", "-accept", &format!("127.0.0.1:{port}"), "-cert"])
            .arg(base.join(certificate))
            .arg("-key")
            .arg(base.join(key))
            .arg("-cert_chain")
            .arg(base.join("inter.pem"))
            .args([
                protocol,
                "-www",
                "-quiet",
                "-cipher",
                if certificate == "weak-rsa1024.pem" {
                    "DEFAULT:@SECLEVEL=0"
                } else {
                    "DEFAULT:@SECLEVEL=2"
                },
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
    hold_writes: bool,
}
impl Socket {
    fn open(port: u16) -> Self {
        let start = Instant::now();
        let tcp = loop {
            match TcpStream::connect(("127.0.0.1", port)) {
                Ok(s) => break s,
                Err(e) => {
                    assert!(start.elapsed() < Duration::from_secs(2), "{e}");
                    std::thread::sleep(Duration::from_millis(10));
                }
            }
        };
        tcp.set_nonblocking(true).unwrap();
        Self {
            tcp,
            writes: Arc::new(AtomicU32::new(0)),
            reads: Arc::new(AtomicU32::new(0)),
            hold_writes: false,
        }
    }
}
impl io::ErrorType for Socket {
    type Error = io::ErrorKind;
}
impl Read for Socket {
    async fn read(&mut self, b: &mut [u8]) -> Result<usize, Self::Error> {
        self.reads.fetch_add(1, Ordering::SeqCst);
        std::future::poll_fn(|cx| match std::io::Read::read(&mut self.tcp, b) {
            Ok(n) => Poll::Ready(Ok(n)),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                cx.waker().wake_by_ref();
                Poll::Pending
            }
            Err(_) => Poll::Ready(Err(io::ErrorKind::Other)),
        })
        .await
    }
}
impl Write for Socket {
    async fn write(&mut self, b: &[u8]) -> Result<usize, Self::Error> {
        self.writes.fetch_add(1, Ordering::SeqCst);
        std::future::poll_fn(|cx| {
            if self.hold_writes {
                cx.waker().wake_by_ref();
                return Poll::Pending;
            }
            match std::io::Write::write(&mut self.tcp, b) {
                Ok(n) => Poll::Ready(Ok(n)),
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    cx.waker().wake_by_ref();
                    Poll::Pending
                }
                Err(_) => Poll::Ready(Err(io::ErrorKind::Other)),
            }
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
    let mut cx = Context::from_waker(&waker);
    let mut future = Box::pin(future);
    let start = Instant::now();
    loop {
        match future.as_mut().poll(&mut cx) {
            Poll::Ready(x) => return x,
            Poll::Pending => {
                assert!(start.elapsed() < Duration::from_secs(5));
                std::thread::park_timeout(Duration::from_millis(1));
            }
        }
    }
}
fn config<'a>(policy: Option<&'a Policy>, host: &'a CStr) -> ClientSessionConfig<'a> {
    ClientSessionConfig {
        ca_chain: Some(Certificate::new_no_copy(ROOT).unwrap()),
        server_name: Some(host),
        certificate_restriction: policy.map(CertificateRestriction::new),
        ..ClientSessionConfig::new()
    }
}
fn rejected(result: Result<(), SessionError>, flags: u32, expected: u32) {
    assert!(result.is_err());
    assert_eq!(flags & expected, expected);
}
#[test]
fn actual_async_and_blocking_handshake_restriction_matrix() {
    unsafe {
        hook_timer(Some(&CLOCK));
        hook_wall_clock(Some(&CLOCK));
    }
    let tls = Tls::new(Box::leak(Box::new(OsRng))).unwrap();
    let server = Server::start("-tls1_2");
    // Existing None policy remains usable, and yields a genuine SavedSession.
    let saved = {
        let conf = SessionConfig::Client(config(None, HOST));
        let mut session = Session::new(tls.reference(), Socket::open(server.1), &conf).unwrap();
        block_on(session.connect()).unwrap();
        assert_eq!(session.tls_verification_details(), 0);
        let saved = session.save().unwrap();
        block_on(session.close()).unwrap();
        saved
    };
    for mode in 0..9 {
        let mut policy = Policy::new();
        let host = if mode == 4 || mode == 5 {
            c"wrong.invalid"
        } else {
            HOST
        };
        match mode {
            1..=3 => policy.deny_depth = Some(mode - 1),
            5 => policy.deny_depth = Some(2),
            6 => policy.lo = date(2000),
            7 => policy.hi = date(2090),
            8 => policy.generation.store(2, Ordering::SeqCst),
            _ => {}
        }
        let conf = SessionConfig::Client(config(Some(&policy), host));
        let mut session =
            Box::new(Session::new(tls.reference(), Socket::open(server.1), &conf).unwrap());
        drop(conf);
        let result = block_on(session.connect());
        let flags = session.tls_verification_details();
        if mode == 0 {
            result.unwrap();
            assert_eq!(flags, 0);
            assert!(session.save().is_err());
            block_on(session.write_all(b"GET / HTTP/1.0\r\n\r\n")).unwrap();
            let mut response = [0; 256];
            assert!(block_on(session.read(&mut response)).unwrap() > 0);
            block_on(session.close()).unwrap();
        } else {
            let expected = if mode == 4 {
                sys::MBEDTLS_X509_BADCERT_CN_MISMATCH
            } else if mode == 5 {
                sys::MBEDTLS_X509_BADCERT_CN_MISMATCH | sys::MBEDTLS_X509_BADCERT_OTHER
            } else {
                sys::MBEDTLS_X509_BADCERT_OTHER
            };
            rejected(result, flags, expected);
        }
        let visits = policy.visits.lock().unwrap();
        assert_eq!(
            visits.iter().map(|v| v.depth).collect::<Vec<_>>(),
            [2, 1, 0]
        );
        assert!(visits
            .iter()
            .all(|v| v.not_before < date(2030) && v.not_after > date(2030)));
    }
    let policy = Policy::new();
    let mut conf = config(Some(&policy), HOST);
    conf.auth_mode = AuthMode::Optional;
    assert!(Session::new(
        tls.reference(),
        Socket::open(server.1),
        &SessionConfig::Client(conf)
    )
    .is_err());
    let conf = SessionConfig::Client(config(Some(&policy), HOST));
    let socket = Socket::open(server.1);
    let writes = socket.writes.clone();
    let reads = socket.reads.clone();
    let mut session = Session::new(tls.reference(), socket, &conf).unwrap();
    assert!(block_on(session.connect_with_session(&saved)).is_err());
    assert_eq!(writes.load(Ordering::SeqCst), 0);
    assert_eq!(reads.load(Ordering::SeqCst), 0);
    assert!(policy.visits.lock().unwrap().is_empty());
    drop(session);
    // Cancellation must destroy the session. Exercise a real Pending handshake and drop.
    let mut socket = Socket::open(server.1);
    socket.hold_writes = true;
    let mut session = Session::new(tls.reference(), socket, &conf).unwrap();
    let mut future = Box::pin(session.connect());
    let waker = Waker::noop();
    let mut cx = Context::from_waker(waker);
    assert!(future.as_mut().poll(&mut cx).is_pending());
    drop(future);
    drop(session);
    // A fresh socket/session remains usable after cancellation.
    let mut fresh = Session::new(tls.reference(), Socket::open(server.1), &conf).unwrap();
    block_on(fresh.connect()).unwrap();
    block_on(fresh.close()).unwrap();
    drop(fresh);
    let server13 = Server::start("-tls1_3");
    let policy13 = Policy::new();
    let config13 = SessionConfig::Client(config(Some(&policy13), HOST));
    let mut tls13 = Session::new(tls.reference(), Socket::open(server13.1), &config13).unwrap();
    block_on(tls13.connect()).unwrap();
    assert_eq!(tls13.tls_verification_details(), 0);
    assert!(tls13.save().is_err());
    assert_eq!(
        policy13
            .visits
            .lock()
            .unwrap()
            .iter()
            .map(|v| v.depth)
            .collect::<Vec<_>>(),
        [2, 1, 0]
    );
    drop(tls13);
    blocking_matrix(tls.reference(), server.1, server13.1);
    baseline_matrix(tls.reference(), server.1);
    println!("Async and blocking: valid TLS 1.2/1.3 and root/intermediate/leaf restriction rejection; required authentication and pre-I/O resumption guards. Baseline exact flags preserved with accepting/rejecting callback: hostname, trust, expired, future, bad signature and weak RSA key. Async cancellation remains covered.");
}

// Real blocking embedded-io adapter, with OS deadlines so a regression cannot hang CI.
struct BlockingSocket(Socket);
impl BlockingSocket {
    fn open(port: u16) -> Self {
        let socket = Socket::open(port);
        socket.tcp.set_nonblocking(false).unwrap();
        socket
            .tcp
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        socket
            .tcp
            .set_write_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        Self(socket)
    }
}
impl blocking::io::ErrorType for BlockingSocket {
    type Error = blocking::io::ErrorKind;
}
impl blocking::io::Read for BlockingSocket {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, Self::Error> {
        self.0.reads.fetch_add(1, Ordering::SeqCst);
        std::io::Read::read(&mut self.0.tcp, buf).map_err(|_| io::ErrorKind::Other)
    }
}
impl blocking::io::Write for BlockingSocket {
    fn write(&mut self, buf: &[u8]) -> Result<usize, Self::Error> {
        self.0.writes.fetch_add(1, Ordering::SeqCst);
        std::io::Write::write(&mut self.0.tcp, buf).map_err(|_| io::ErrorKind::Other)
    }
    fn flush(&mut self) -> Result<(), Self::Error> {
        std::io::Write::flush(&mut self.0.tcp).map_err(|_| io::ErrorKind::Other)
    }
}

fn depths(policy: &Policy) -> Vec<u32> {
    policy
        .visits
        .lock()
        .unwrap()
        .iter()
        .map(|v| v.depth)
        .collect()
}

fn blocking_matrix(tls: TlsReference<'_>, port: u16, port13: u16) {
    let saved = {
        let conf = SessionConfig::Client(config(None, HOST));
        let mut session = blocking::Session::new(tls, BlockingSocket::open(port), &conf).unwrap();
        session.connect().unwrap();
        assert_eq!(session.tls_verification_details(), 0);
        let saved = session.save().unwrap();
        session.close().unwrap();
        saved
    };
    for port in [port, port13] {
        for deny_depth in [None, Some(0), Some(1), Some(2)] {
            let mut policy = Policy::new();
            policy.deny_depth = deny_depth;
            let conf = SessionConfig::Client(config(Some(&policy), HOST));
            // Move the constructed session and drop its temporary configuration.
            let mut session =
                Box::new(blocking::Session::new(tls, BlockingSocket::open(port), &conf).unwrap());
            drop(conf);
            let result = session.connect();
            if deny_depth.is_none() {
                result.unwrap();
                assert_eq!(session.tls_verification_details(), 0);
                assert!(session.save().is_err());
                blocking::io::Write::write_all(&mut *session, b"GET / HTTP/1.0\r\n\r\n").unwrap();
                assert!(session.read(&mut [0; 256]).unwrap() > 0);
                session.close().unwrap();
            } else {
                rejected(
                    result,
                    session.tls_verification_details(),
                    sys::MBEDTLS_X509_BADCERT_OTHER,
                );
            }
            assert_eq!(depths(&policy), [2, 1, 0]);
        }
    }
    for auth_mode in [AuthMode::None, AuthMode::Optional, AuthMode::Unset] {
        let policy = Policy::new();
        let mut conf = config(Some(&policy), HOST);
        conf.auth_mode = auth_mode;
        let conf = SessionConfig::Client(conf);
        let socket = BlockingSocket::open(port);
        let reads = socket.0.reads.clone();
        let writes = socket.0.writes.clone();
        assert!(blocking::Session::new(tls, socket, &conf).is_err());
        assert_eq!(reads.load(Ordering::SeqCst), 0);
        assert_eq!(writes.load(Ordering::SeqCst), 0);
        assert!(depths(&policy).is_empty());
        let socket = Socket::open(port);
        let reads = socket.reads.clone();
        let writes = socket.writes.clone();
        assert!(Session::new(tls, socket, &conf).is_err());
        assert_eq!(reads.load(Ordering::SeqCst), 0);
        assert_eq!(writes.load(Ordering::SeqCst), 0);
        assert!(depths(&policy).is_empty());
    }
    let policy = Policy::new();
    let conf = SessionConfig::Client(config(Some(&policy), HOST));
    let socket = BlockingSocket::open(port);
    let writes = socket.0.writes.clone();
    let reads = socket.0.reads.clone();
    let mut session = blocking::Session::new(tls, socket, &conf).unwrap();
    assert!(session.connect_with_session(&saved).is_err());
    assert_eq!(writes.load(Ordering::SeqCst), 0);
    assert_eq!(reads.load(Ordering::SeqCst), 0);
    assert!(depths(&policy).is_empty());
    // A rejected resume has not installed any session state that bypasses verification.
    session.connect().unwrap();
    assert_eq!(depths(&policy), [2, 1, 0]);
    assert!(session.save().is_err());
    session.close().unwrap();
}

fn failure_flags(
    tls: TlsReference<'_>,
    port: u16,
    conf: &SessionConfig<'_>,
    blocking: bool,
) -> u32 {
    if blocking {
        let mut session = blocking::Session::new(tls, BlockingSocket::open(port), conf).unwrap();
        assert!(session.connect().is_err());
        session.tls_verification_details()
    } else {
        let mut session = Session::new(tls, Socket::open(port), conf).unwrap();
        assert!(block_on(session.connect()).is_err());
        session.tls_verification_details()
    }
}

fn baseline_matrix(tls: TlsReference<'_>, valid_port: u16) {
    let bad_signature = Server::with_leaf(
        "-tls1_2",
        "leaf-bad-signature.pem",
        "leaf.TEST_ONLY.key.pem",
    );
    let weak_key = Server::with_leaf(
        "-tls1_2",
        "weak-rsa1024.pem",
        "weak-rsa1024.TEST_ONLY.key.pem",
    );
    // Unknown trust and corrupt signature both map to NOT_TRUSTED in this MbedTLS
    // profile. BAD_KEY exercises the default algorithm profile's RSA minimum, not
    // a claim to cover every disabled digest/curve or every verification flag.
    for (name, port, year, expected) in [
        (
            "hostname",
            valid_port,
            2030,
            sys::MBEDTLS_X509_BADCERT_CN_MISMATCH,
        ),
        (
            "trust",
            valid_port,
            2030,
            sys::MBEDTLS_X509_BADCERT_NOT_TRUSTED,
        ),
        (
            "expired",
            valid_port,
            2090,
            sys::MBEDTLS_X509_BADCERT_EXPIRED,
        ),
        ("future", valid_port, 2000, sys::MBEDTLS_X509_BADCERT_FUTURE),
        (
            "signature",
            bad_signature.1,
            2030,
            sys::MBEDTLS_X509_BADCERT_NOT_TRUSTED,
        ),
        (
            "rsa1024",
            weak_key.1,
            2030,
            sys::MBEDTLS_X509_BADCERT_BAD_KEY,
        ),
    ] {
        CLOCK.0.store(year, Ordering::SeqCst);
        for blocking in [false, true] {
            let mut original_flags = None;
            for callback in [None, Some(false), Some(true)] {
                let mut policy = Policy::new();
                if callback == Some(true) {
                    policy.deny_depth = Some(0);
                }
                let host = if name == "hostname" {
                    c"wrong.invalid"
                } else {
                    HOST
                };
                let mut conf = config(callback.map(|_| &policy), host);
                if name == "trust" {
                    conf.ca_chain = Some(
                        Certificate::new_no_copy(include_bytes!(
                            "../fixtures/synthetic/unrelated-root.der"
                        ))
                        .unwrap(),
                    );
                }
                let flags = failure_flags(tls, port, &SessionConfig::Client(conf), blocking);
                assert_eq!(
                    flags & expected,
                    expected,
                    "{name}, blocking={blocking}, callback={callback:?}, flags={flags:#x}"
                );
                if let Some(reject) = callback {
                    assert!(
                        !depths(&policy).is_empty(),
                        "{name} must actually invoke the restriction"
                    );
                    assert_eq!(
                        flags,
                        original_flags.unwrap()
                            | if reject {
                                sys::MBEDTLS_X509_BADCERT_OTHER
                            } else {
                                0
                            },
                        "{name}, blocking={blocking}, callback={callback:?}"
                    );
                } else {
                    assert_eq!(flags & sys::MBEDTLS_X509_BADCERT_OTHER, 0);
                    original_flags = Some(flags);
                }
                println!(
                    "baseline={name} blocking={blocking} callback={callback:?} flags={flags:#010x}"
                );
            }
        }
    }
    CLOCK.0.store(2030, Ordering::SeqCst);
}
