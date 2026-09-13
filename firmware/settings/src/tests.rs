use super::*;
use core::{
    cell::{Cell, RefCell},
    future::Future,
    task::{Context, Poll},
};
use crystal_shim_core::{
    configuration::{PushoverCredentials, RawDeviceConfig},
    runtime::{Observation, Request, Runtime, StoreCompletion},
    runtime_ingress::{Ingress, Source},
    HardwarePermit, Level, Millis, Reading, RelayCommand, RetainedState, State, Timing,
};
use embedded_io_async::{ErrorType, Read, Write};
use std::{format, pin::pin, string::String, task::Waker, vec::Vec};

const AUTH: &str = "1111111111111111111111111111111111111111111111111111111111111111";
fn config() -> ValidatedDeviceConfig {
    ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(
            1,
            200,
            800,
            500,
            Timing {
                low_confirmation_ms: 100,
                recovery_ms: 100,
                minimum_off_ms: 100,
            },
            900,
            [0x11; 32],
        )
        .timezone_rule("UTC0")
        .unwrap()
        .pushover(Some(
            PushoverCredentials::new(
                "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
                None,
            )
            .unwrap(),
        ))
        .build(),
    )
    .unwrap()
}
struct Model {
    now: Cell<u64>,
    last_tick: Cell<u64>,
    ingress: RefCell<Ingress>,
    runtime: RefCell<Runtime>,
    published: Cell<Option<ValidatedDeviceConfig>>,
    status: Cell<Status>,
    completion: Cell<Option<StoreCompletion>>,
    last_write: Cell<u64>,
    writes: Cell<usize>,
    fail_write: Cell<Option<usize>>,
    hold: Cell<bool>,
    commands: Cell<usize>,
    cancelled: Cell<usize>,
    physical: Cell<bool>,
}
impl Model {
    fn new() -> Self {
        let c = config();
        Self {
            now: Cell::new(0),
            last_tick: Cell::new(0),
            ingress: RefCell::new(Ingress::new()),
            runtime: RefCell::new(
                Runtime::new(Some(c), Some(RetainedState::new(1).unwrap()), Millis(0)).unwrap(),
            ),
            published: Cell::new(Some(c)),
            status: Cell::new(Status::EMPTY),
            completion: Cell::new(None),
            last_write: Cell::new(0),
            writes: Cell::new(0),
            fail_write: Cell::new(None),
            hold: Cell::new(false),
            commands: Cell::new(0),
            cancelled: Cell::new(0),
            physical: Cell::new(false),
        }
    }
    fn tick(&self) {
        if self.now.get().saturating_sub(self.last_tick.get()) < 20 {
            return;
        }
        self.last_tick.set(self.now.get());
        let (force_off, request) = self.ingress.borrow_mut().take();
        let mut runtime = self.runtime.borrow_mut();
        let step = runtime.step(
            Observation {
                now: Millis(self.now.get()),
                sensor_revision: self.published.get().map_or(0, |c| c.revision()),
                reading: Reading::Valid {
                    level: Level::new(900).unwrap(),
                    observed_at: Millis(self.now.get()),
                },
                hardware: HardwarePermit::Allowed,
                maintenance_pressed: self.physical.get(),
                force_off,
                clock_update: Default::default(),
            },
            request,
            self.completion.take(),
        );
        self.published.set(runtime.configuration());
        let status = step.status;
        self.status.set(Status {
            relay_on: status.is_some_and(|s| s.control.relay == RelayCommand::On),
            durable_maintenance: runtime.durable_maintenance(),
            storage_failed: runtime.storage_failed(),
            clock_available: runtime.clock_observation().is_some(),
            state: status.map_or(State::Boot, |s| s.control.state),
        });
        if let Some(write) = runtime.store_request() {
            if write.ticket != self.last_write.get() && !self.hold.get() {
                self.last_write.set(write.ticket);
                self.writes.set(self.writes.get() + 1);
                self.completion.set(Some(StoreCompletion {
                    ticket: write.ticket,
                    succeeded: self.fail_write.get() != Some(self.writes.get()),
                }));
            }
        }
        // Match the production order: publish state / apply GPIO before replies.
        for reply in [step.command_reply, step.completed_reply]
            .into_iter()
            .flatten()
        {
            self.ingress.borrow_mut().complete(reply);
        }
    }
    fn reconfigure_token(&self, byte: u8) {
        let next = form::rotate(self.published.get().unwrap(), &Bearer::new([byte; 32])).unwrap();
        self.published.set(Some(next));
    }
}
impl Backend for Model {
    fn now_ms(&self) -> u64 {
        self.now.get()
    }
    fn view(&self, b: &Bearer) -> Result<Snapshot, Error> {
        Ok(Snapshot {
            configuration: authorize(self.published.get(), b, None)?,
            status: self.status.get(),
        })
    }
    fn begin(&self, b: &Bearer, revision: u32, command: RuntimeCommand) -> Result<Token, Error> {
        let token = admit(
            &mut self.ingress.borrow_mut(),
            self.published.get(),
            b,
            revision,
            command,
        )?;
        self.commands.set(self.commands.get() + 1);
        Ok(token)
    }
    fn reply(&self, t: Token) -> Option<Reply> {
        self.tick();
        self.ingress.borrow_mut().take_reply_for(t)
    }
    fn cancel(&self, t: Token) {
        self.cancelled.set(self.cancelled.get() + 1);
        self.ingress.borrow_mut().cancel(t);
    }
    async fn wait(&self) {
        let mut pending = true;
        core::future::poll_fn(|cx| {
            if pending {
                pending = false;
                cx.waker().wake_by_ref();
                Poll::Pending
            } else {
                Poll::Ready(())
            }
        })
        .await;
    }
}
fn run<T>(model: &Model, f: impl Future<Output = T>) -> T {
    let mut cx = Context::from_waker(Waker::noop());
    let mut f = pin!(f);
    for _ in 0..30_000 {
        if let Poll::Ready(result) = f.as_mut().poll(&mut cx) {
            return result;
        }
        model.now.set(model.now.get() + 1);
    }
    panic!("bounded test stalled");
}
struct Io<'a> {
    model: &'a Model,
    input: Vec<u8>,
    read: usize,
    output: Vec<u8>,
    fragment: usize,
    pending: bool,
    stall_read: bool,
    stall_write: bool,
    per_read_ms: u64,
    rotate_at: Option<usize>,
}
impl<'a> Io<'a> {
    fn new(model: &'a Model, input: Vec<u8>) -> Self {
        Self {
            model,
            input,
            read: 0,
            output: Vec::new(),
            fragment: 13,
            pending: false,
            stall_read: false,
            stall_write: false,
            per_read_ms: 0,
            rotate_at: None,
        }
    }
    fn output(&self) -> String {
        String::from_utf8(self.output.clone()).unwrap()
    }
}
impl ErrorType for Io<'_> {
    type Error = core::convert::Infallible;
}
impl Read for Io<'_> {
    async fn read(&mut self, b: &mut [u8]) -> Result<usize, Self::Error> {
        if self.stall_read {
            core::future::pending::<()>().await;
        }
        if self.pending {
            self.model.wait().await;
        }
        if self.rotate_at.is_some_and(|at| self.read >= at) {
            self.rotate_at = None;
            self.model.reconfigure_token(0x22);
        }
        self.model.now.set(self.model.now.get() + self.per_read_ms);
        let n = b.len().min(self.fragment).min(self.input.len() - self.read);
        b[..n].copy_from_slice(&self.input[self.read..self.read + n]);
        self.read += n;
        Ok(n)
    }
}
impl Write for Io<'_> {
    async fn write(&mut self, b: &[u8]) -> Result<usize, Self::Error> {
        if self.stall_write {
            core::future::pending::<()>().await;
        }
        self.output.extend_from_slice(b);
        Ok(b.len())
    }
    async fn flush(&mut self) -> Result<(), Self::Error> {
        Ok(())
    }
}
fn get(path: &str, token: Option<&str>) -> Vec<u8> {
    format!(
        "GET {path} HTTP/1.1\r\nHost: 192.0.2.1\r\n{}\r\n",
        token.map_or(String::new(), |v| format!("Authorization: Bearer {v}\r\n"))
    )
    .into_bytes()
}
fn post(path: &str, body: &str) -> Vec<u8> {
    format!("POST {path} HTTP/1.1\r\nHost: 192.0.2.1\r\nOrigin: http://192.0.2.1\r\nAuthorization: Bearer {AUTH}\r\nContent-Type: application/x-www-form-urlencoded\r\nContent-Length: {}\r\n\r\n{body}",body.len()).into_bytes()
}
fn save_body() -> &'static str {
    "revision=1&stop_level=200&restart_level=800&duration_seconds=600&low_confirmation_ms=100&recovery_ms=100&minimum_off_ms=100&max_sample_age_ms=500&timezone=UTC0&entry_count=1&entry0_id=4&entry0_days=127&entry0_start_second=1000&pushover_action=keep"
}
fn serve_one(model: &Model, io: &mut Io<'_>) -> Result<(), Error> {
    let mut buffers = Buffers::new();
    let result = run(model, serve(io, model, "192.0.2.1", &mut buffers));
    assert!(buffers.wiped());
    result
}

#[test]
fn api_reads_require_auth_and_are_redacted() {
    for route in ["/api/config", "/api/status"] {
        let m = Model::new();
        let mut io = Io::new(&m, get(route, None));
        assert_eq!(serve_one(&m, &mut io), Err(Error::Unauthorized));
        assert!(!io.output().contains("revision"));
        let mut io = Io::new(&m, get(route, Some(AUTH)));
        serve_one(&m, &mut io).unwrap();
        let text = io.output();
        assert!(text.starts_with("HTTP/1.1 200"));
        assert!(text.contains("\"revision\":1"));
        for secret in [
            AUTH,
            "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        ] {
            assert!(!text.contains(secret));
        }
    }
}
#[test]
fn static_page_is_public_self_contained_and_never_interpolates_a_token() {
    let m = Model::new();
    for path in ["/", "/app.js", "/style.css"] {
        let mut io = Io::new(&m, get(path, None));
        serve_one(&m, &mut io).unwrap();
        assert!(io.output().starts_with("HTTP/1.1 200"));
        assert!(!io.output().contains(AUTH));
        assert!(io.output().contains("frame-ancestors 'none'"));
    }
}
#[test]
fn invalid_and_duplicate_framing_never_reaches_connection_or_admission() {
    for header in [
        "Content-Length: nope",
        "Content-Length: 18446744073709551616",
        "Content-Length: +1",
        "Content-Length: -1",
        "Content-Length: 1\r\nContent-Length: 0",
        "content-length: 0\r\nContent-Length: 0",
        "Transfer-Encoding: chunked\r\nContent-Length: 0",
        "Content-Length: 0\r\nTransfer-Encoding: chunked",
        "Content-Encoding: gzip",
        "Expect: 100-continue",
        "Upgrade: websocket",
    ] {
        let m = Model::new();
        let mut io=Io::new(&m,format!("GET /api/config HTTP/1.1\r\nHost: 192.0.2.1\r\nAuthorization: Bearer {AUTH}\r\n{header}\r\n\r\n").into_bytes());
        io.pending = true;
        assert!(serve_one(&m, &mut io).is_err(), "{header}");
        assert_eq!(m.commands.get(), 0);
    }
}
#[test]
fn pre_admission_errors_are_known_json_without_body_drain() {
    let valid = String::from_utf8(post("/api/off", "revision=1")).unwrap();
    for (request, error) in [
        (
            valid.replace("Content-Length: 10", "Content-Length: nope"),
            Error::BadRequest,
        ),
        (
            valid.replace(
                "Content-Length: 10",
                "Content-Length: 10\r\nContent-Length: 10",
            ),
            Error::BadRequest,
        ),
        (
            valid.replace("Origin: http://192.0.2.1\r\n", ""),
            Error::Forbidden,
        ),
        (
            valid.replace("Origin: http://192.0.2.1", "Origin: null"),
            Error::Forbidden,
        ),
        (
            valid.replace("Host: 192.0.2.1", "not a header"),
            Error::BadRequest,
        ),
        (
            valid.replace(&format!("Authorization: Bearer {AUTH}\r\n"), ""),
            Error::Unauthorized,
        ),
    ] {
        let header_end = request.find("\r\n\r\n").unwrap() + 4;
        for fragment in [1, 7, 2048] {
            let m = Model::new();
            let mut input = request.as_bytes().to_vec();
            input.extend_from_slice(&post("/api/exit", "revision=1"));
            let mut io = Io::new(&m, input);
            io.fragment = fragment;
            io.pending = true;
            assert_eq!(serve_one(&m, &mut io), Err(error));
            let response = io.output();
            let (headers, body) = response.split_once("\r\n\r\n").unwrap();
            assert!(headers.starts_with(&format!("HTTP/1.1 {} ", error.code())));
            assert!(headers.contains("Content-Type: application/json"));
            assert_eq!(
                body,
                format!(
                    "{{\"error\":\"{}\",\"unknown_outcome\":false}}",
                    error.label()
                )
            );
            assert!(headers.contains(&format!("Content-Length: {}\r\n", body.len())));
            assert_eq!(m.commands.get(), 0);
            assert_eq!(m.writes.get(), 0);
            assert!(
                io.read <= header_end,
                "rejected request body or next request was consumed"
            );
            assert!(!response.contains(AUTH));
        }
    }
}

#[test]
fn malformed_direct_constructor_regression_is_real() {
    let result = std::panic::catch_unwind(|| {
        let m = Model::new();
        let mut io = Io::new(
            &m,
            b"GET / HTTP/1.1\r\nContent-Length: invalid\r\n\r\n".to_vec(),
        );
        let mut headers = [0; 2048];
        let _ = run(
            &m,
            edge_http::io::server::Connection::<_, 24>::new(&mut headers, &mut io),
        );
    });
    assert!(result.is_err());
}
#[test]
fn security_header_duplicates_cross_origin_and_url_tokens_rejected() {
    for extra in [
        "Host: attacker.invalid",
        "Authorization: Bearer bad",
        "Origin: http://attacker.invalid",
        "Sec-Fetch-Site: cross-site",
    ] {
        let m = Model::new();
        let mut bytes = post("/api/off", "revision=1");
        let at = bytes.windows(4).position(|w| w == b"\r\n\r\n").unwrap();
        bytes.splice(at..at, format!("\r\n{extra}").bytes());
        let mut io = Io::new(&m, bytes);
        assert!(serve_one(&m, &mut io).is_err());
        assert_eq!(m.commands.get(), 0);
    }
    for path in [
        "/api/off?token=x",
        "http://192.0.2.1/api/off",
        "/api/config#token",
    ] {
        let m = Model::new();
        let mut io = Io::new(&m, get(path, Some(AUTH)));
        assert!(serve_one(&m, &mut io).is_err());
    }
}
#[test]
fn raw_non_utf8_auth_is_not_silently_ignored() {
    let m = Model::new();
    let mut bytes = get("/api/config", Some(AUTH));
    let at = bytes.windows(7).position(|b| b == b"Bearer ").unwrap() + 7;
    bytes[at] = 0xff;
    let mut io = Io::new(&m, bytes);
    assert!(serve_one(&m, &mut io).is_err());
    assert_eq!(m.commands.get(), 0);
}
#[test]
fn partial_reads_replay_body_exactly_and_leave_pipeline_unread() {
    let m = Model::new();
    let first = post("/api/off", "revision=1");
    let mut input = first.clone();
    input.extend_from_slice(&post("/api/exit", "revision=1"));
    let mut io = Io::new(&m, input);
    io.pending = true;
    io.fragment = 1;
    serve_one(&m, &mut io).unwrap();
    assert_eq!(io.read, first.len());
    assert_eq!(m.commands.get(), 1);
    assert!(io.output().contains("\"outcome\":\"applied\""));
}
#[test]
fn header_count_capacity_body_limit_and_incomplete_body_are_bounded() {
    let m = Model::new();
    let mut overflow = b"GET / HTTP/1.1\r\nHost: 192.0.2.1\r\n".to_vec();
    for _ in 0..24 {
        overflow.extend_from_slice(b"X: a\r\n");
    }
    overflow.extend_from_slice(b"\r\n");
    let mut huge = b"GET / HTTP/1.1\r\nX: ".to_vec();
    huge.extend_from_slice(&[b'a'; 2048]);
    huge.extend_from_slice(b"\r\n\r\n");
    let mut incomplete = post("/api/off", "revision=1");
    incomplete.pop();
    for bytes in [
        overflow,
        huge,
        incomplete,
        post("/api/config", &"x".repeat(2049)),
    ] {
        let mut io = Io::new(&m, bytes);
        assert!(serve_one(&m, &mut io).is_err());
        assert_eq!(m.commands.get(), 0);
    }
}
#[test]
fn save_waits_for_both_writes_and_preserves_private_fields() {
    let m = Model::new();
    let mut io = Io::new(&m, post("/api/config", save_body()));
    serve_one(&m, &mut io).unwrap();
    assert!(io
        .output()
        .contains("\"outcome\":\"durable\",\"revision\":2"));
    assert_eq!(m.writes.get(), 2);
    let c = m.published.get().unwrap();
    assert_eq!(c.revision(), 2);
    assert_eq!(c.settings_auth_token().as_bytes(), &[0x11; 32]);
    assert!(c.pushover().is_some());
    assert!(m.status.get().durable_maintenance);
    assert!(!m.status.get().relay_on);
}
#[test]
fn storage_failure_never_claims_durable_or_publishes_candidate() {
    for fail in [1, 2] {
        let m = Model::new();
        m.fail_write.set(Some(fail));
        let mut io = Io::new(&m, post("/api/config", save_body()));
        serve_one(&m, &mut io).unwrap();
        assert!(io.output().starts_with("HTTP/1.1 503"));
        assert!(!io.output().contains("\"outcome\":\"durable\""));
        assert_eq!(m.published.get().unwrap().revision(), 1);
        assert!(!m.status.get().relay_on);
    }
}
#[test]
fn timeout_is_unknown_and_dispatched_work_still_has_its_owner() {
    let m = Model::new();
    m.hold.set(true);
    let mut io = Io::new(&m, post("/api/config", save_body()));
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().contains("\"unknown_outcome\":true"));
    assert_eq!(m.commands.get(), 1);
    assert_eq!(m.cancelled.get(), 1);
    assert_eq!(
        m.begin(&Bearer::new([0x11; 32]), 1, RuntimeCommand::ExitMaintenance),
        Err(Error::Busy)
    );
    m.hold.set(false);
    for _ in 0..4 {
        m.now.set(m.now.get() + 20);
        m.tick();
    }
    assert_eq!(m.published.get().unwrap().revision(), 2);
    assert!(m
        .ingress
        .borrow_mut()
        .submit_from(
            Source::Usb,
            Request {
                id: 4,
                command: RuntimeCommand::ExitMaintenance
            }
        )
        .is_some());
}
#[test]
fn revision_and_token_are_rechecked_after_body_await() {
    let m = Model::new();
    let bytes = post("/api/config", save_body());
    let body_at = bytes.windows(4).position(|w| w == b"\r\n\r\n").unwrap() + 4;
    let mut io = Io::new(&m, bytes);
    io.rotate_at = Some(body_at);
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().starts_with("HTTP/1.1 401"));
    assert_eq!(m.commands.get(), 0);
}
#[test]
fn token_a_b_a_does_not_reauthorize_an_old_revision() {
    let m = Model::new();
    m.reconfigure_token(0x22);
    m.reconfigure_token(0x11);
    assert_eq!(
        m.begin(&Bearer::new([0x11; 32]), 1, RuntimeCommand::ExitMaintenance),
        Err(Error::Conflict)
    );
    assert!(m.view(&Bearer::new([0x11; 32])).is_ok());
}
#[test]
fn provisioning_reservation_covers_settings_usb_and_preserves_off() {
    let m = Model::new();
    m.ingress.borrow_mut().reserve_provisioning(true);
    assert_eq!(
        m.begin(&Bearer::new([0x11; 32]), 1, RuntimeCommand::ExitMaintenance),
        Err(Error::Reserved)
    );
    assert!(m
        .ingress
        .borrow_mut()
        .submit_from(
            Source::Usb,
            Request {
                id: 1,
                command: RuntimeCommand::ExitMaintenance
            }
        )
        .is_none());
    let owner = m
        .ingress
        .borrow_mut()
        .submit_from(
            Source::Provisioning,
            Request {
                id: 1,
                command: RuntimeCommand::EnterMaintenance,
            },
        )
        .unwrap();
    let off = m
        .begin(&Bearer::new([0x11; 32]), 1, RuntimeCommand::Off)
        .unwrap();
    let (forced, request) = m.ingress.borrow_mut().take();
    assert!(forced);
    let request = request.unwrap();
    assert!(matches!(request.command, RuntimeCommand::Off));
    m.ingress.borrow_mut().complete(Reply {
        id: request.id,
        result: Ok(crystal_shim_core::runtime::Acknowledgement::Applied),
    });
    assert!(m.ingress.borrow_mut().take_reply_for(owner).is_none());
    assert_eq!(
        m.ingress.borrow_mut().take_reply_for(off).unwrap().result,
        Ok(crystal_shim_core::runtime::Acknowledgement::Applied)
    );
    let (forced, request) = m.ingress.borrow_mut().take();
    assert!(!forced);
    assert!(matches!(
        request.unwrap().command,
        RuntimeCommand::EnterMaintenance
    ));
    m.ingress.borrow_mut().cancel(owner);
}
#[test]
fn queued_cancellation_and_stale_reply_cannot_acknowledge_next_settings_request() {
    let m = Model::new();
    let first = m
        .begin(
            &Bearer::new([0x11; 32]),
            1,
            RuntimeCommand::EnterMaintenance,
        )
        .unwrap();
    m.cancel(first);
    let next = m
        .begin(&Bearer::new([0x11; 32]), 1, RuntimeCommand::ExitMaintenance)
        .unwrap();
    assert_ne!(first, next);
    assert_eq!(m.reply(first), None);
    assert_eq!(m.reply(next), None);
    m.now.set(20);
    let _ = m.reply(next);
    assert_eq!(m.cancelled.get(), 1);
}
#[test]
fn cancelled_http_future_wipes_buffers_and_keeps_dispatched_commit() {
    let m = Model::new();
    m.hold.set(true);
    let mut io = Io::new(&m, post("/api/config", save_body()));
    let mut buffers = Buffers::new();
    let mut cx = Context::from_waker(Waker::noop());
    {
        let mut future = pin!(serve(&mut io, &m, "192.0.2.1", &mut buffers));
        assert!(future.as_mut().poll(&mut cx).is_pending());
        m.now.set(20);
        assert!(future.as_mut().poll(&mut cx).is_pending());
    }
    assert!(buffers.wiped());
    assert_eq!(m.cancelled.get(), 1);
    m.hold.set(false);
    for _ in 0..4 {
        m.now.set(m.now.get() + 20);
        m.tick();
    }
    assert_eq!(m.published.get().unwrap().revision(), 2);
}
#[test]
fn stalled_read_write_and_slow_header_never_extend_deadline() {
    for (read, write) in [(true, false), (false, true)] {
        let m = Model::new();
        let mut io = Io::new(&m, get("/", None));
        io.stall_read = read;
        io.stall_write = write;
        assert!(serve_one(&m, &mut io).is_err());
        assert!(m.now.get() <= 10_000);
        assert_eq!(m.commands.get(), 0);
    }
    let m = Model::new();
    let mut bytes = b"GET / HTTP/1.1\r\nHost: 192.0.2.1\r\nX: ".to_vec();
    bytes.resize(1996, b'a');
    bytes.extend_from_slice(b"\r\n\r\n");
    let mut io = Io::new(&m, bytes);
    io.per_read_ms = 1;
    assert_eq!(serve_one(&m, &mut io), Err(Error::Timeout));
    assert_eq!(m.commands.get(), 0);
}
#[test]
fn checked_deadlines_reject_boundary_backwards_and_overflow() {
    for limit in [http::HEADER_MS, http::TOTAL_MS] {
        assert!(!http::expired(99 + limit, 100, limit));
        assert!(http::expired(100 + limit, 100, limit));
        assert!(http::expired(99, 100, limit));
        assert!(http::expired(0, u64::MAX, limit));
    }
}
#[test]
fn form_rejects_duplicate_unknown_bad_percent_and_out_of_range_values() {
    for body in [
        format!("{}&revision=1", save_body()),
        format!("{}&unknown=x", save_body()),
        save_body().replace("UTC0", "%zz"),
        save_body().replace("entry_count=1", "entry_count=17"),
        save_body().replace("duration_seconds=600", "duration_seconds=86401"),
        save_body().replace("restart_level=800", "restart_level=100"),
        save_body().replace("entry0_id=4", "entry0_id=0"),
    ] {
        let m = Model::new();
        let mut io = Io::new(&m, post("/api/config", &body));
        serve_one(&m, &mut io).unwrap();
        assert!(io.output().starts_with("HTTP/1.1 400"));
        assert_eq!(m.commands.get(), 0);
    }
}
#[test]
fn explicit_pushover_clear_and_replace_do_not_require_echoing_secrets() {
    for mode in [
        "clear",
        "replace&pushover_application_token=CCCCCCCCCCCCCCCCCCCCCCCCCCCCCC&pushover_user_key=DDDDDDDDDDDDDDDDDDDDDDDDDDDDDD&pushover_device=",
    ] {
        let m = Model::new();
        let mut io = Io::new(
            &m,
            post(
                "/api/config",
                &save_body().replace("pushover_action=keep", &format!("pushover_action={mode}")),
            ),
        );
        serve_one(&m, &mut io).unwrap();
        assert!(io.output().starts_with("HTTP/1.1 200"));
        assert!(!io.output().contains("CCCCCCCC"));
        assert_eq!(
            m.published.get().unwrap().pushover().is_some(),
            mode != "clear"
        );
    }
}
#[test]
fn token_rotation_revalidates_next_revision_preserves_settings_and_rejects_bad_input() {
    let original = config();
    let rotated = form::rotate(original, &Bearer::new([0x22; 32])).unwrap();
    assert_eq!(rotated.revision(), 2);
    assert_eq!(rotated.thresholds(), original.thresholds());
    assert_eq!(rotated.timing(), original.timing());
    assert!(rotated.pushover().is_some());
    assert!(form::rotate(original, &Bearer::new([0; 32])).is_err());
    assert!(form::rotate(original, &Bearer::new([0x11; 32])).is_err());
    for hex in [b"bad".as_slice(), &[b'g'; 64]] {
        assert!(Bearer::decode(hex).is_err());
    }
}
#[test]
fn only_explicit_exit_can_leave_saved_maintenance_and_physical_button_wins() {
    let m = Model::new();
    let mut io = Io::new(&m, post("/api/config", save_body()));
    serve_one(&m, &mut io).unwrap();
    assert!(m.status.get().durable_maintenance);
    m.physical.set(true);
    let mut io = Io::new(&m, post("/api/exit", "revision=2"));
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().starts_with("HTTP/1.1 503"));
    assert!(!m.status.get().relay_on);
    m.physical.set(false);
    let mut io = Io::new(&m, post("/api/exit", "revision=2"));
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().contains("\"outcome\":\"durable\""));
}

#[test]
fn ready_first_completion_at_the_original_deadline_cannot_win() {
    for limit in [http::HEADER_MS, http::TOTAL_MS] {
        let model = Model::new();
        model.now.set(100);
        let result = run(
            &model,
            http::within(&model, 100, limit, async {
                model.now.set(100 + limit);
                Ok(())
            }),
        );
        assert_eq!(result, Err(Error::Timeout));
        assert_eq!(model.commands.get(), 0);
    }
}

#[test]
fn full_allowed_browser_header_count_accepts_but_one_more_rejects() {
    for extra in [22, 23] {
        let model = Model::new();
        let mut input = get("/api/config", Some(AUTH));
        input.truncate(input.len() - 2);
        for _ in 0..extra {
            input.extend_from_slice(b"X-Browser: safe\r\n");
        }
        input.extend_from_slice(b"\r\n");
        let mut io = Io::new(&model, input);
        let result = serve_one(&model, &mut io);
        assert_eq!(result.is_ok(), extra == 22);
    }
}

#[test]
fn settings_admission_cannot_be_used_to_rotate_a_token_over_http() {
    let model = Model::new();
    let rotated = form::rotate(config(), &Bearer::new([0x22; 32])).unwrap();
    assert_eq!(
        model.begin(
            &Bearer::new([0x11; 32]),
            1,
            RuntimeCommand::SaveConfiguration(rotated)
        ),
        Err(Error::Forbidden)
    );
    assert!(model
        .ingress
        .borrow_mut()
        .submit_from(
            Source::Usb,
            Request {
                id: 7,
                command: RuntimeCommand::SaveConfiguration(rotated)
            }
        )
        .is_some());
}

#[test]
fn cancelling_before_control_dispatch_removes_only_that_request() {
    let model = Model::new();
    let mut io = Io::new(&model, post("/api/config", save_body()));
    let mut buffers = Buffers::new();
    let mut cx = Context::from_waker(Waker::noop());
    {
        let mut request = pin!(serve(&mut io, &model, "192.0.2.1", &mut buffers));
        assert!(request.as_mut().poll(&mut cx).is_pending());
    }
    assert!(buffers.wiped());
    assert_eq!(model.cancelled.get(), 1);
    assert_eq!(model.writes.get(), 0);
    assert!(model
        .ingress
        .borrow_mut()
        .submit_from(
            Source::Usb,
            Request {
                id: 42,
                command: RuntimeCommand::ExitMaintenance
            }
        )
        .is_some());
}

#[test]
fn response_timings_and_full_width_freshness_are_durable_and_return_decimal_strings() {
    let m = Model::new();
    let body = save_body()
        .replace(
            "low_confirmation_ms=100",
            "low_confirmation_ms=9007199254740993",
        )
        .replace("recovery_ms=100", "recovery_ms=10001")
        .replace("minimum_off_ms=100", "minimum_off_ms=30001")
        .replace(
            "max_sample_age_ms=500",
            "max_sample_age_ms=18446744073709551615",
        );
    let mut io = Io::new(&m, post("/api/config", &body));
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().starts_with("HTTP/1.1 200"));
    assert!(io.output().contains("durable"));
    assert!(m.status.get().durable_maintenance);
    let saved = m.published.get().unwrap();
    assert_eq!(
        saved.timing(),
        Timing {
            low_confirmation_ms: 9_007_199_254_740_993,
            recovery_ms: 10_001,
            minimum_off_ms: 30_001
        }
    );
    assert_eq!(saved.max_sample_age_ms(), u64::MAX);
    let snapshot = Snapshot {
        configuration: saved,
        status: m.status.get(),
    };
    let mut bytes = [0; http::BODY_BYTES];
    let len = snapshot.config_json(&mut bytes).unwrap();
    let json = core::str::from_utf8(&bytes[..len]).unwrap();
    assert!(json.contains("\"low_confirmation_ms\":\"9007199254740993\""));
    assert!(json.contains("\"max_sample_age_ms\":\"18446744073709551615\""));
    assert!(json.contains("\"minimum_sample_age_ms\":\"1\""));
}

#[test]
fn malformed_or_missing_response_timing_never_reaches_admission() {
    for (key, original) in [
        ("low_confirmation_ms", "100"),
        ("recovery_ms", "100"),
        ("minimum_off_ms", "100"),
        ("max_sample_age_ms", "500"),
    ] {
        for value in ["", "0", "-1", "%2B1", "1.5", "1e3", "18446744073709551616"] {
            let m = Model::new();
            let body = save_body().replace(&format!("{key}={original}"), &format!("{key}={value}"));
            let mut io = Io::new(&m, post("/api/config", &body));
            serve_one(&m, &mut io).unwrap();
            assert!(io.output().starts_with("HTTP/1.1 400"), "{key}={value}");
            assert_eq!(m.commands.get(), 0);
            assert_eq!(m.writes.get(), 0);
        }
        let m = Model::new();
        let body = save_body().replace(&format!("&{key}={original}"), "");
        let mut io = Io::new(&m, post("/api/config", &body));
        serve_one(&m, &mut io).unwrap();
        assert!(io.output().starts_with("HTTP/1.1 400"));
        assert_eq!(m.commands.get(), 0);
    }
}

#[test]
fn freshness_edit_preserves_measured_calibration_and_its_frame_duration_floor() {
    use crystal_shim_core::calibration::{
        CalibrationData, ChannelLimits, Channels, CountsRange, LevelDomain, MinimumRatioSpan,
        ReferenceSign,
    };
    // Synthetic arithmetic fixture, not a tank calibration.
    let limits = ChannelLimits {
        envelope: CountsRange {
            min: -5_000,
            max: 5_000,
        },
        max_slew_counts_per_second: 70_000,
    };
    let data = CalibrationData {
        level_empty_counts: 1_000,
        wet_reference_empty_counts: 300,
        low_endpoint: Channels {
            level: 1_200,
            wet_reference: 700,
        },
        high_endpoint: Channels {
            level: 2_500,
            wet_reference: 900,
        },
        channels: Channels {
            level: limits,
            wet_reference: limits,
        },
        reference_sign: ReferenceSign::Positive,
        minimum_reference_span_counts: 100,
        minimum_endpoint_ratio_span: MinimumRatioSpan {
            numerator: 1,
            denominator: 10,
        },
        supported_level: LevelDomain {
            min: Level::new(100).unwrap(),
            max: Level::new(900).unwrap(),
        },
        max_frame_age_ms: 500,
        max_frame_duration_ms: 100,
        max_level_slew_per_second: 8_000,
    };
    let base = ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(1, 200, 800, 500, config().timing(), 900, [0x11; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .calibration(Some(data))
            .build(),
    )
    .unwrap();
    for age in [100, 600, u64::MAX] {
        let mut body = save_body()
            .replace("max_sample_age_ms=500", &format!("max_sample_age_ms={age}"))
            .into_bytes();
        let saved = form::edit(base, &mut form::Form::parse(&mut body).unwrap()).unwrap();
        let mut expected = data;
        expected.max_frame_age_ms = age;
        assert_eq!(*saved.calibration().unwrap().data(), expected);
        assert_eq!(saved.max_sample_age_ms(), age);
        let mut bytes = [0; http::BODY_BYTES];
        let len = Snapshot {
            configuration: saved,
            status: Status::EMPTY,
        }
        .config_json(&mut bytes)
        .unwrap();
        assert!(core::str::from_utf8(&bytes[..len])
            .unwrap()
            .contains("\"minimum_sample_age_ms\":\"100\""));
    }
    let mut body = save_body()
        .replace("max_sample_age_ms=500", "max_sample_age_ms=99")
        .into_bytes();
    assert!(matches!(
        form::edit(base, &mut form::Form::parse(&mut body).unwrap()),
        Err(Error::BadRequest)
    ));
}

#[test]
fn all_sixteen_entries_timings_and_replacement_credentials_fit_bounded_request_and_view() {
    let m = Model::new();
    let timezone = format!("%3C{}%3E0", "%2B".repeat(125));
    let mut body = format!(
        "revision=1&stop_level=999&restart_level=1000&duration_seconds=86400&low_confirmation_ms={0}&recovery_ms={0}&minimum_off_ms={0}&max_sample_age_ms={0}&timezone={timezone}&entry_count=16",
        u64::MAX
    );
    for i in 0..16 {
        body.push_str(&format!(
            "&entry{i}_id={}&entry{i}_days=127&entry{i}_start_second=86399",
            4080 + i
        ));
    }
    body.push_str(&format!("&pushover_action=replace&pushover_application_token={}&pushover_user_key={}&pushover_device={}", "C".repeat(30), "D".repeat(30), "a".repeat(25)));
    assert_eq!(body.split('&').count(), 62);
    assert!(body.len() <= http::BODY_BYTES);
    let mut io = Io::new(&m, post("/api/config", &body));
    serve_one(&m, &mut io).unwrap();
    assert!(io.output().starts_with("HTTP/1.1 200"), "{}", io.output());
    let config = m.published.get().unwrap();
    assert_eq!(config.schedule().entries().len(), 16);
    assert_eq!(config.timezone_rule().len(), 128);
    assert_eq!(config.timing().low_confirmation_ms, u64::MAX);
    assert!(config.pushover().is_some());
    let mut bytes = [0; http::BODY_BYTES];
    let len = Snapshot {
        configuration: config,
        status: m.status.get(),
    }
    .config_json(&mut bytes)
    .unwrap();
    assert!(len <= http::BODY_BYTES);
    assert!(!core::str::from_utf8(&bytes[..len])
        .unwrap()
        .contains(&"C".repeat(30)));
}
