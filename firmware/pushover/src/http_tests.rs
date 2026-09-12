use super::*;
use crate::policy::{Observation, Queue};
use core::{
    future::{poll_fn, Future},
    pin::pin,
    task::{Context, Poll},
};
use crystal_shim_core::{State, WaterTransition};
use std::{format, string::String, task::Waker, vec::Vec};
struct Host {
    now: Cell<u64>,
    valid: Cell<bool>,
    cancel_at: Option<u64>,
}
impl Host {
    fn new() -> Self {
        Self {
            now: Cell::new(0),
            valid: Cell::new(true),
            cancel_at: None,
        }
    }
}
impl Guard for Host {
    fn now_ms(&self) -> u64 {
        self.now.get()
    }
    fn valid(&self) -> bool {
        self.valid.get() && self.cancel_at.is_none_or(|at| self.now.get() < at)
    }
    async fn wait(&self) {
        let mut yielded = false;
        poll_fn(|cx| {
            if yielded {
                Poll::Ready(())
            } else {
                yielded = true;
                self.now.set(self.now.get() + 20);
                cx.waker().wake_by_ref();
                Poll::Pending
            }
        })
        .await
    }
}
fn run<F: Future>(f: F) -> F::Output {
    let mut f = pin!(f);
    let mut cx = Context::from_waker(Waker::noop());
    for _ in 0..3000 {
        if let Poll::Ready(value) = f.as_mut().poll(&mut cx) {
            return value;
        }
    }
    panic!("unbounded test future")
}
struct Io {
    reply: Vec<u8>,
    at: usize,
    written: Vec<u8>,
    fragment: usize,
    pending: bool,
    fail_write: bool,
}
impl Io {
    fn new(reply: impl AsRef<[u8]>) -> Self {
        Self {
            reply: reply.as_ref().to_vec(),
            at: 0,
            written: Vec::new(),
            fragment: 3,
            pending: false,
            fail_write: false,
        }
    }
}
impl ErrorType for Io {
    type Error = embedded_io_async::ErrorKind;
}
impl Read for Io {
    async fn read(&mut self, b: &mut [u8]) -> Result<usize, Self::Error> {
        if self.pending {
            core::future::pending::<()>().await;
        }
        let n = b.len().min(self.fragment).min(self.reply.len() - self.at);
        b[..n].copy_from_slice(&self.reply[self.at..self.at + n]);
        self.at += n;
        Ok(n)
    }
}
impl Write for Io {
    async fn write(&mut self, b: &[u8]) -> Result<usize, Self::Error> {
        let n = b.len().min(self.fragment);
        self.written.extend_from_slice(&b[..n]);
        if self.fail_write {
            return Err(embedded_io_async::ErrorKind::Other);
        }
        Ok(n)
    }
    async fn flush(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}
fn work() -> Work {
    let mut q = Queue::new();
    q.observe(Observation {
        now_ms: 0,
        revision: Some(1),
        credentials: Some(
            PushoverCredentials::new(
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
                Some("tank"),
            )
            .unwrap(),
        ),
        transition: Some(WaterTransition {
            from: WaterState::High,
            to: WaterState::Low,
        }),
        relay_on: false,
        state: State::Low,
        utc_bounds: None,
    });
    q.claim(0).unwrap()
}
fn response(code: u16, body: &str) -> String {
    format!("HTTP/1.1 {code} Result\r\nContent-Length: {}\r\nContent-Type: application/json\r\n\r\n{body}",body.len())
}
fn exchange_reply(reply: impl AsRef<[u8]>) -> Outcome {
    let mut io = Io::new(reply);
    let mut b = Buffers::new();
    let result = run(exchange(&mut io, &work(), &Host::new(), &mut b));
    assert!(b.wiped());
    result
}
#[test]
fn sends_one_exact_normal_priority_form_and_accepts_complete_fragmented_json() {
    for fragment in [1, 3, 512] {
        let mut io = Io::new(response(200, r#"{"request":"fake","status":1}"#));
        io.fragment = fragment;
        let mut buffers = Buffers::new();
        assert_eq!(
            run(exchange(&mut io, &work(), &Host::new(), &mut buffers)),
            Outcome::ApiAccepted
        );
        assert!(buffers.wiped());
        let written = String::from_utf8(io.written).unwrap();
        assert_eq!(written.matches("POST ").count(), 1);
        let (headers, body) = written.split_once("\r\n\r\n").unwrap();
        assert!(headers.starts_with("POST /1/messages.json HTTP/1.1\r\n"));
        assert!(headers.contains(&format!("User-Agent: {USER_AGENT}")));
        assert!(headers.contains(&format!("Content-Length: {}", body.len())));
        assert_eq!(body,"token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&user=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB&device=tank&priority=0&message=Crystal%20Shim%3A%20water%20level%20is%20low%0AEvent%20%231%20at%20device%20uptime%200%20ms%3B%20age%200%20ms%20at%20attempt%20start%3B%20relay%20off%3B%20state%20Low%20at%20event.");
    }
}
#[test]
fn json_success_is_typed_unique_complete_and_bounded() {
    for body in [
        r#"{"status":1,"status":1}"#,
        r#"{"status":0,"status":1}"#,
        r#"{"status":1,"\u0073tatus":1}"#,
        r#"{"status":"1"}"#,
        r#"{"status":1.0}"#,
        r#"{"status":true}"#,
        r#"{"request":"status:1"}"#,
        r#"{"nested":{"status":1}}"#,
        r#"{"status":1}{}"#,
        r#"{"status":1} garbage"#,
        r#"[{"status":1}]"#,
        r#"{"status":9223372036854775808}"#,
        r#"{"status":1,"a":"\ud800"}"#,
    ] {
        assert_eq!(
            exchange_reply(response(200, body)),
            Outcome::ProtocolFailure { uncertain: true },
            "{body}"
        );
    }
    for status in [0, 2, -1] {
        assert_eq!(
            exchange_reply(response(200, &format!("{{\"status\":{status}}}"))),
            Outcome::Suspend(Suspension::Api(status))
        );
    }
    assert_eq!(
        exchange_reply(response(
            200,
            " \n{\"status\":1,\"ignored\":[{},\"{}[]\"]}\t"
        )),
        Outcome::ApiAccepted
    );
    let nested = format!(
        "{{\"status\":1,\"ignored\":{}0{}}}",
        "[".repeat(8),
        "]".repeat(8)
    );
    assert_eq!(
        exchange_reply(response(200, &nested)),
        Outcome::ProtocolFailure { uncertain: true }
    );
}
#[test]
fn framing_preflight_rejects_panics_ambiguity_compression_and_overflow() {
    for headers in [
        "Content-Length: x",
        "Content-Length: -1",
        "Content-Length: +12",
        "Content-Length: 18446744073709551616",
        "Content-Length: 12\r\nContent-Length: 12",
        "Content-Length: 12\r\nTransfer-Encoding: chunked",
        "Transfer-Encoding: gzip",
        "Transfer-Encoding: chunked\r\nTransfer-Encoding: chunked",
        "Content-Encoding: gzip",
        "Content-Length: 2049",
    ] {
        assert_eq!(
            exchange_reply(format!(
                "HTTP/1.1 200 OK\r\n{headers}\r\n\r\n{{\"status\":1}}"
            )),
            Outcome::ProtocolFailure { uncertain: true },
            "{headers}"
        );
    }
    assert_eq!(
        exchange_reply(format!(
            "HTTP/1.1 200 OK\r\nX-Large: {}\r\n\r\n",
            "x".repeat(HEADER_BYTES)
        )),
        Outcome::ProtocolFailure { uncertain: true }
    );
    let headers = (0..25)
        .map(|n| format!("X-{n}: value\r\n"))
        .collect::<String>();
    assert_eq!(
        exchange_reply(format!("HTTP/1.1 200 OK\r\n{headers}\r\n{{\"status\":1}}")),
        Outcome::ProtocolFailure { uncertain: true }
    );
    assert_eq!(
        exchange_reply(format!(
            "HTTP/1.1 200 OK\r\n\r\n{}",
            "x".repeat(BODY_BYTES + 1)
        )),
        Outcome::ProtocolFailure { uncertain: true }
    );
}
#[test]
fn chunking_requires_explicit_termination_and_cannot_exceed_raw_or_decoded_limits() {
    let prefix = "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n";
    assert_eq!(
        exchange_reply(format!(
            "{prefix}5\r\n{{\"sta\r\n7\r\ntus\":1}}\r\n0\r\n\r\n"
        )),
        Outcome::ApiAccepted
    );
    for chunks in [
        "c\r\n{\"status\":1}\r\n",
        "c\r\n{\"status\":1}\r\n0\r\n",
        "c\r\n{\"status\":1}\r\n0\r\nX: trailer\r\n\r\n",
        "c;ext=1\r\n{\"status\":1}\r\n0\r\n\r\n",
        "g\r\n",
        "fffffffffffffffff\r\n",
        "801\r\n",
    ] {
        assert_ne!(
            exchange_reply(format!("{prefix}{chunks}")),
            Outcome::ApiAccepted,
            "{chunks}"
        );
    }
    let chunks = "1\r\nx\r\n".repeat(BODY_BYTES);
    assert_eq!(
        exchange_reply(format!("{prefix}{chunks}0\r\n\r\n")),
        Outcome::ProtocolFailure { uncertain: true }
    );
}
#[test]
fn response_categories_never_follow_redirects_or_retry_api_rejections() {
    for code in [400, 401, 403, 429, 499] {
        assert_eq!(
            exchange_reply(response(code, "bad")),
            Outcome::Suspend(Suspension::Http(code))
        );
    }
    for code in [100, 201, 204, 301, 302, 307, 308] {
        assert_eq!(
            exchange_reply(response(code, r#"{"status":1}"#)),
            Outcome::ProtocolFailure { uncertain: true }
        );
    }
    for body in [r#"{"status":1}"#, "temporary"] {
        assert_eq!(
            exchange_reply(response(500, body)),
            Outcome::Transient { uncertain: true }
        );
    }
    assert_eq!(
        exchange_reply(response(503, r#"{"status":0}"#)),
        Outcome::Suspend(Suspension::Api(0))
    );
}
#[test]
fn pending_io_partial_writes_and_external_cancellation_are_bounded_and_wipe() {
    let mut io = Io::new("");
    io.pending = true;
    let host = Host::new();
    let mut b = Buffers::new();
    assert_eq!(
        run(exchange(&mut io, &work(), &host, &mut b)),
        Outcome::Transient { uncertain: true }
    );
    assert!(host.now.get() <= IO_MS + 20);
    assert!(b.wiped());
    let mut io = Io::new("");
    io.fail_write = true;
    assert_eq!(
        run(exchange(&mut io, &work(), &Host::new(), &mut b)),
        Outcome::Transient { uncertain: true }
    );
    assert_eq!(io.written.len(), 3);
    assert!(b.wiped());
    let mut io = Io::new("");
    io.pending = true;
    let host = Host {
        cancel_at: Some(40),
        ..Host::new()
    };
    assert_eq!(
        run(exchange(&mut io, &work(), &host, &mut b)),
        Outcome::Cancelled { uncertain: true }
    );
    assert!(b.wiped());
    let host = Host::new();
    host.valid.set(false);
    let mut io = Io::new("");
    assert_eq!(
        run(exchange(&mut io, &work(), &host, &mut b)),
        Outcome::Cancelled { uncertain: false }
    );
    assert!(io.written.is_empty());
    assert!(b.wiped());
    let host = Host::new();
    let w = work();
    let mut io = Io::new("");
    io.pending = true;
    {
        let mut f = std::boxed::Box::pin(exchange(&mut io, &w, &host, &mut b));
        assert!(f
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending());
    }
    assert!(b.wiped());
}
#[test]
fn guard_rechecks_ready_results_rollback_and_cancellation_before_repoll() {
    let h = Host::new();
    assert_eq!(
        run(guard::within(&h, 0, 20, async {
            h.now.set(20);
            7
        })),
        Err(GuardError::Timeout)
    );
    let h = Host::new();
    h.now.set(10);
    assert_eq!(
        run(guard::within(&h, 10, 30, async {
            h.now.set(9);
            7
        })),
        Err(GuardError::ClockRollback)
    );
    let h = Host::new();
    assert_eq!(
        run(guard::within(&h, 0, 20, async {
            h.valid.set(false);
            7
        })),
        Err(GuardError::Cancelled)
    );
    let h = Host::new();
    assert_eq!(
        run(guard::within(&h, 0, guard::ATTEMPT_MS + 1, async { 7 })),
        Err(GuardError::InvalidDeadline)
    );
    let h = Host::new();
    let polls = Cell::new(0);
    let future = poll_fn(|_| {
        polls.set(polls.get() + 1);
        h.valid.set(false);
        Poll::<()>::Pending
    });
    assert_eq!(
        run(guard::within(&h, 0, 20, future)),
        Err(GuardError::Cancelled)
    );
    assert_eq!(polls.get(), 1);
    let h = Host::new();
    assert_eq!(
        run(guard::within(&h, 0, 100, core::future::pending::<()>())),
        Err(GuardError::Timeout)
    );
    assert_eq!(h.now.get(), 100);
}

#[test]
fn recovery_message_preserves_capture_utc_and_actual_override_state() {
    let mut work = work();
    work.attempt.event.transition = WaterTransition {
        from: WaterState::Low,
        to: WaterState::High,
    };
    work.attempt.event.relay_on = true;
    work.attempt.event.state = State::Running;
    work.attempt.event.utc_bounds =
        crystal_shim_core::utc_bounds::UtcBounds::new(1700000000000, 1700000000010);
    let mut buffers = Buffers::new();
    let mut io = Io::new(response(200, r#"{"status":1}"#));
    assert_eq!(
        run(exchange(&mut io, &work, &Host::new(), &mut buffers)),
        Outcome::ApiAccepted
    );
    let written = String::from_utf8(io.written).unwrap();
    assert!(written.contains("water%20level%20is%20high%20again"));
    assert!(written.contains("UTC%20Unix%20ms%201700000000000..1700000000010"));
    assert!(written.contains("relay%20on%3B%20state%20Running%20at%20event."));
    assert!(buffers.wiped());
}
#[test]
fn slow_progress_cannot_extend_the_original_twenty_second_attempt() {
    struct Drip<'a> {
        io: Io,
        now: &'a Cell<u64>,
    }
    impl ErrorType for Drip<'_> {
        type Error = embedded_io_async::ErrorKind;
    }
    impl Read for Drip<'_> {
        async fn read(&mut self, bytes: &mut [u8]) -> Result<usize, Self::Error> {
            self.now.set(self.now.get() + 1000);
            self.io.read(bytes).await
        }
    }
    impl Write for Drip<'_> {
        async fn write(&mut self, bytes: &[u8]) -> Result<usize, Self::Error> {
            self.io.write(bytes).await
        }
        async fn flush(&mut self) -> Result<(), Self::Error> {
            Ok(())
        }
    }
    let host = Host::new();
    let mut io = Drip {
        io: Io::new(response(200, r#"{"status":1}"#)),
        now: &host.now,
    };
    let mut buffers = Buffers::new();
    assert_eq!(
        run(exchange(&mut io, &work(), &host, &mut buffers)),
        Outcome::Transient { uncertain: true }
    );
    assert_eq!(host.now.get(), guard::ATTEMPT_MS);
    assert!(io.io.at < io.io.reply.len());
    assert!(buffers.wiped());
}
