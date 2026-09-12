//! One request on one socket, with fixed original deadlines and exact header replay.
use crate::{form::Form, view::Json, Backend, Bearer, Error};
use core::{fmt::Write as _, future::Future};
use crystal_shim_core::runtime::{Acknowledgement, RuntimeCommand};
use crystal_shim_core::runtime_ingress::Token;
use edge_http::{io::server::Connection, Method, RequestHeaders};
use embassy_futures::select::{select, Either};
use embedded_io_async::{ErrorType, Read, Write};
use zeroize::Zeroize;

pub const HEADER_BYTES: usize = 2048;
pub const BODY_BYTES: usize = 2048;
pub const MAX_HEADERS: usize = 24;
pub const TOTAL_MS: u64 = 10_000;
pub const HEADER_MS: u64 = 2_000;
pub const BODY_MS: u64 = 2_000;
pub const IO_MS: u64 = 500;
const REPLY_RESERVE_MS: u64 = 1_000;

pub struct Buffers {
    raw: [u8; HEADER_BYTES],
    parsed: [u8; HEADER_BYTES],
    body: [u8; BODY_BYTES],
    response: [u8; 2048],
}
impl Default for Buffers {
    fn default() -> Self {
        Self::new()
    }
}
impl Buffers {
    pub const fn new() -> Self {
        Self {
            raw: [0; HEADER_BYTES],
            parsed: [0; HEADER_BYTES],
            body: [0; BODY_BYTES],
            response: [0; 2048],
        }
    }
    fn wipe(&mut self) {
        self.raw.zeroize();
        self.parsed.zeroize();
        self.body.zeroize();
        self.response.zeroize();
    }
    #[cfg(test)]
    pub(crate) fn wiped(&self) -> bool {
        self.raw
            .iter()
            .chain(self.parsed.iter())
            .chain(self.body.iter())
            .chain(self.response.iter())
            .all(|b| *b == 0)
    }
}
struct Wipe<'a>(&'a mut Buffers);
impl Drop for Wipe<'_> {
    fn drop(&mut self) {
        self.0.wipe();
    }
}

pub fn expired(now: u64, start: u64, limit: u64) -> bool {
    now.checked_sub(start).is_none_or(|age| age >= limit)
}
pub(crate) async fn within<H: Backend, F: Future<Output = Result<T, Error>>, T>(
    host: &H,
    start: u64,
    limit: u64,
    future: F,
) -> Result<T, Error> {
    if expired(host.now_ms(), start, limit) {
        return Err(Error::Timeout);
    }
    let deadline = async {
        loop {
            if expired(host.now_ms(), start, limit) {
                return;
            }
            host.wait().await;
        }
    };
    let result = match select(future, deadline).await {
        Either::First(result) => result,
        Either::Second(()) => Err(Error::Timeout),
    };
    // Work-first polling may finish after the timer was already ready.
    if expired(host.now_ms(), start, limit) {
        return Err(Error::Timeout);
    }
    result
}
struct Timed<'a, T, H> {
    io: T,
    host: &'a H,
}
impl<T: ErrorType, H> ErrorType for Timed<'_, T, H> {
    type Error = Error;
}
impl<T: Read, H: Backend> Read for Timed<'_, T, H> {
    async fn read(&mut self, b: &mut [u8]) -> Result<usize, Error> {
        within(self.host, self.host.now_ms(), IO_MS, async {
            self.io.read(b).await.map_err(|_| Error::Io)
        })
        .await
    }
}
impl<T: Write, H: Backend> Write for Timed<'_, T, H> {
    async fn write(&mut self, b: &[u8]) -> Result<usize, Error> {
        within(self.host, self.host.now_ms(), IO_MS, async {
            self.io.write(b).await.map_err(|_| Error::Io)
        })
        .await
    }
    async fn flush(&mut self) -> Result<(), Error> {
        within(self.host, self.host.now_ms(), IO_MS, async {
            self.io.flush().await.map_err(|_| Error::Io)
        })
        .await
    }
}

/// Own the sole continuation of the stream. Prefix bytes are immutable and are
/// replayed exactly once; the preflight parser never consumed any body bytes.
struct Replay<'a, T> {
    prefix: &'a [u8],
    at: usize,
    io: T,
}
impl<T: ErrorType> ErrorType for Replay<'_, T> {
    type Error = T::Error;
}
impl<T: Read> Read for Replay<'_, T> {
    async fn read(&mut self, out: &mut [u8]) -> Result<usize, Self::Error> {
        if self.at < self.prefix.len() {
            let n = out.len().min(self.prefix.len() - self.at);
            out[..n].copy_from_slice(&self.prefix[self.at..self.at + n]);
            self.at += n;
            Ok(n)
        } else {
            self.io.read(out).await
        }
    }
}
impl<T: Write> Write for Replay<'_, T> {
    async fn write(&mut self, b: &[u8]) -> Result<usize, Self::Error> {
        self.io.write(b).await
    }
    async fn flush(&mut self) -> Result<(), Self::Error> {
        self.io.flush().await
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Route {
    Index,
    Script,
    Style,
    Config,
    Status,
    Save,
    Maintenance,
    Exit,
    Off,
}
impl Route {
    fn public(self) -> bool {
        matches!(self, Self::Index | Self::Script | Self::Style)
    }
    fn mutation(self) -> bool {
        matches!(
            self,
            Self::Save | Self::Maintenance | Self::Exit | Self::Off
        )
    }
}
struct Request {
    route: Route,
    length: usize,
    bearer: Option<Bearer>,
}
fn host_matches(value: &[u8], host: &str) -> bool {
    value == host.as_bytes() || value.strip_suffix(b":80") == Some(host.as_bytes())
}
fn origin_matches(value: &[u8], host: &str) -> bool {
    value
        .strip_prefix(b"http://")
        .is_some_and(|authority| host_matches(authority, host))
}
fn policy(headers: &RequestHeaders<'_, MAX_HEADERS>, host: &str) -> Result<Request, Error> {
    let route = match (headers.method, headers.path) {
        (Method::Get, "/") => Route::Index,
        (Method::Get, "/app.js") => Route::Script,
        (Method::Get, "/style.css") => Route::Style,
        (Method::Get, "/api/config") => Route::Config,
        (Method::Get, "/api/status") => Route::Status,
        (Method::Post, "/api/config") => Route::Save,
        (Method::Post, "/api/maintenance") => Route::Maintenance,
        (Method::Post, "/api/exit") => Route::Exit,
        (Method::Post, "/api/off") => Route::Off,
        _ => return Err(Error::BadRequest),
    };
    let mut length = None;
    let mut authority = None;
    let mut auth = None;
    let mut origin = None;
    let mut content_type = None;
    let mut site = None;
    for (name, bytes) in headers.headers.iter_raw() {
        if ["Transfer-Encoding", "Content-Encoding", "Upgrade", "Expect"]
            .iter()
            .any(|n| name.eq_ignore_ascii_case(n))
        {
            return Err(Error::BadRequest);
        }
        if name.eq_ignore_ascii_case("Connection") {
            let value = core::str::from_utf8(bytes).map_err(|_| Error::BadRequest)?;
            if !value.split(',').all(|part| {
                part.trim().eq_ignore_ascii_case("close")
                    || part.trim().eq_ignore_ascii_case("keep-alive")
            }) {
                return Err(Error::BadRequest);
            }
        }
        let slot = if name.eq_ignore_ascii_case("Host") {
            Some(&mut authority)
        } else if name.eq_ignore_ascii_case("Authorization") {
            Some(&mut auth)
        } else if name.eq_ignore_ascii_case("Origin") {
            Some(&mut origin)
        } else if name.eq_ignore_ascii_case("Content-Type") {
            Some(&mut content_type)
        } else if name.eq_ignore_ascii_case("Sec-Fetch-Site") {
            Some(&mut site)
        } else {
            None
        };
        if let Some(slot) = slot {
            if slot.replace(bytes).is_some() {
                return Err(Error::BadRequest);
            }
            if core::str::from_utf8(bytes).is_err() {
                return Err(Error::BadRequest);
            }
        }
        if name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() {
                return Err(Error::BadRequest);
            }
            let n = crate::form::number(bytes)? as usize;
            if n > BODY_BYTES {
                return Err(Error::TooLarge);
            }
            length = Some(n);
        }
    }
    if !authority.is_some_and(|h| host_matches(h, host)) {
        return Err(Error::Forbidden);
    }
    if site.is_some_and(|v| v == b"cross-site") {
        return Err(Error::Forbidden);
    }
    if origin.is_some_and(|v| !origin_matches(v, host)) {
        return Err(Error::Forbidden);
    }
    if route.mutation() {
        if origin.is_none() {
            return Err(Error::Forbidden);
        }
        if content_type != Some(b"application/x-www-form-urlencoded".as_slice())
            || length.is_none_or(|n| n == 0)
        {
            return Err(Error::BadRequest);
        }
    } else if length.is_some_and(|n| n != 0) {
        return Err(Error::BadRequest);
    }
    let bearer = if route.public() {
        None
    } else {
        Some(Bearer::decode(
            auth.and_then(|a| a.strip_prefix(b"Bearer "))
                .ok_or(Error::Unauthorized)?,
        )?)
    };
    Ok(Request {
        route,
        length: length.unwrap_or(0),
        bearer,
    })
}
fn http_error(e: edge_http::io::Error<Error>) -> Error {
    match e {
        edge_http::io::Error::Io(e) => e,
        _ => Error::BadRequest,
    }
}

/// The caller supplies the current local IPv4 authority and drops the socket
/// afterwards. An error or cancellation may leave a dispatched write committed.
pub async fn serve<H: Backend, T: Read + Write>(
    io: T,
    host: &H,
    authority: &str,
    buffers: &mut Buffers,
) -> Result<(), Error> {
    let guard = Wipe(buffers);
    let started = host.now_ms();
    within(
        host,
        started,
        TOTAL_MS,
        serve_inner(Timed { io, host }, host, authority, started, guard.0),
    )
    .await
}
async fn serve_inner<H: Backend, T: Read<Error = Error> + Write<Error = Error>>(
    mut io: T,
    host: &H,
    authority: &str,
    started: u64,
    buffers: &mut Buffers,
) -> Result<(), Error> {
    let preflight = async {
        let mut headers = RequestHeaders::<MAX_HEADERS>::new();
        let (unused, prefetched) = headers
            .receive(&mut buffers.raw, &mut io, true)
            .await
            .map_err(http_error)?;
        if prefetched != 0 {
            return Err(Error::BadRequest);
        }
        let consumed = HEADER_BYTES - unused.len();
        let request = policy(&headers, authority)?;
        if let Some(bearer) = &request.bearer {
            host.view(bearer)?;
        }
        Ok((consumed, request))
    };
    let (consumed, request) = match within(host, started, HEADER_MS, preflight).await {
        Ok(value) => value,
        Err(error) => {
            raw_error(&mut io, error, &mut buffers.response).await?;
            return Err(error);
        }
    };
    let replay = Replay {
        prefix: &buffers.raw[..consumed],
        at: 0,
        io: &mut io,
    };
    let mut connection = Connection::<_, MAX_HEADERS>::new(&mut buffers.parsed, replay)
        .await
        .map_err(http_error)?;
    within(host, host.now_ms(), BODY_MS, async {
        connection
            .read_exact(&mut buffers.body[..request.length])
            .await
            .map_err(|_| Error::BadRequest)
    })
    .await?;
    if expired(host.now_ms(), started, TOTAL_MS - REPLY_RESERVE_MS) {
        return Err(Error::Timeout);
    }
    let output = handle(
        host,
        &request,
        &mut buffers.body[..request.length],
        &mut buffers.response,
        started,
    )
    .await;
    let (code, kind, body) = match output {
        Ok(Output::Bytes(kind, body)) => (200, kind, body),
        Ok(Output::Length(n)) => (200, "application/json", &buffers.response[..n]),
        Err(error) => {
            let len = error_body(error, &mut buffers.response)?;
            (error.code(), "application/json", &buffers.response[..len])
        }
    };
    let mut length = heapless::String::<20>::new();
    write!(length, "{}", body.len()).map_err(|_| Error::TooLarge)?;
    connection.initiate_response(code,None,&[
        ("Content-Length",&length),("Content-Type",kind),("Connection","close"),("Cache-Control","no-store"),
        ("X-Content-Type-Options","nosniff"),("Referrer-Policy","no-referrer"),
        ("Content-Security-Policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
    ]).await.map_err(http_error)?;
    connection.write_all(body).await.map_err(http_error)?;
    connection.complete().await.map_err(http_error)?;
    Ok(())
}
enum Output {
    Bytes(&'static str, &'static [u8]),
    Length(usize),
}
async fn handle<H: Backend>(
    host: &H,
    request: &Request,
    body: &mut [u8],
    response: &mut [u8],
    started: u64,
) -> Result<Output, Error> {
    match request.route {
        Route::Index => {
            return Ok(Output::Bytes(
                "text/html; charset=utf-8",
                include_bytes!("../ui/index.html"),
            ))
        }
        Route::Script => {
            return Ok(Output::Bytes(
                "text/javascript; charset=utf-8",
                include_bytes!("../ui/app.js"),
            ))
        }
        Route::Style => {
            return Ok(Output::Bytes(
                "text/css; charset=utf-8",
                include_bytes!("../ui/style.css"),
            ))
        }
        _ => {}
    }
    let bearer = request.bearer.as_ref().ok_or(Error::Unauthorized)?;
    let snapshot = host.view(bearer)?;
    if request.route == Route::Config {
        return snapshot.config_json(response).map(Output::Length);
    }
    if request.route == Route::Status {
        return snapshot.status_json(response).map(Output::Length);
    }
    let mut form = Form::parse(body)?;
    let revision = snapshot.configuration.revision();
    let (command, committed_revision) = if request.route == Route::Save {
        let config = crate::form::edit(snapshot.configuration, &mut form)?;
        (RuntimeCommand::SaveConfiguration(config), config.revision())
    } else {
        if form.number("revision")? != revision {
            return Err(Error::Conflict);
        }
        form.finish()?;
        (
            match request.route {
                Route::Maintenance => RuntimeCommand::EnterMaintenance,
                Route::Exit => RuntimeCommand::ExitMaintenance,
                Route::Off => RuntimeCommand::Off,
                _ => return Err(Error::BadRequest),
            },
            revision,
        )
    };
    if expired(host.now_ms(), started, TOTAL_MS - REPLY_RESERVE_MS) {
        return Err(Error::Timeout);
    }
    let token = host.begin(bearer, revision, command)?;
    let _claim = Claim { host, token };
    let expected = if request.route == Route::Off {
        Acknowledgement::Applied
    } else {
        Acknowledgement::Durable
    };
    loop {
        if expired(host.now_ms(), started, TOTAL_MS - REPLY_RESERVE_MS) {
            return Err(Error::OutcomeUnknown);
        }
        if let Some(reply) = host.reply(token) {
            if reply.result != Ok(expected) {
                return Err(Error::Control);
            }
            let mut out = Json::new(response);
            write!(
                out,
                "{{\"outcome\":\"{}\",\"revision\":{committed_revision}}}",
                if expected == Acknowledgement::Applied {
                    "applied"
                } else {
                    "durable"
                }
            )
            .map_err(|_| Error::TooLarge)?;
            return Ok(Output::Length(out.len()));
        }
        host.wait().await;
    }
}
struct Claim<'a, H: Backend> {
    host: &'a H,
    token: Token,
}
impl<H: Backend> Drop for Claim<'_, H> {
    fn drop(&mut self) {
        self.host.cancel(self.token);
    }
}
fn error_body(error: Error, bytes: &mut [u8]) -> Result<usize, Error> {
    let mut out = Json::new(bytes);
    write!(
        out,
        "{{\"error\":\"{}\",\"unknown_outcome\":{}}}",
        error.label(),
        error == Error::OutcomeUnknown
    )
    .map_err(|_| Error::TooLarge)?;
    Ok(out.len())
}
async fn raw_error<T: Write<Error = Error>>(
    io: &mut T,
    error: Error,
    response: &mut [u8],
) -> Result<(), Error> {
    // No command has been admitted. Use the normal known-outcome JSON shape,
    // without entering Connection's body-draining response path for bad framing.
    let length = error_body(error, response)?;
    let mut line = heapless::String::<256>::new();
    write!(line,"HTTP/1.1 {} Error\r\nContent-Length: {length}\r\nContent-Type: application/json\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n",error.code()).map_err(|_|Error::TooLarge)?;
    io.write_all(line.as_bytes()).await?;
    io.write_all(&response[..length]).await?;
    io.flush().await
}
