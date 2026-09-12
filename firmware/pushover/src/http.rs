//! One POST on an externally verified stream. No DNS, TLS, reconnection or redirect.
use crate::{
    guard::{self, Guard, GuardError},
    policy::{Outcome, Suspension, Work},
};
use core::{
    cell::Cell,
    fmt::{self, Write as _},
};
use crystal_shim_core::{configuration::PushoverCredentials, WaterState};
use edge_http::{Method, RequestHeaders, ResponseHeaders};
use embedded_io_async::{ErrorType, Read, Write};
use serde::{
    de::{MapAccess, SeqAccess, Visitor},
    Deserialize, Deserializer,
};
use zeroize::Zeroize;

pub const HOST: &str = "api.pushover.net";
pub const PATH: &str = "/1/messages.json";
pub const USER_AGENT: &str = "OpenAI File Downloader, XaiImageApiFetch/1.0";
pub const HEADER_BYTES: usize = 2048;
pub const MAX_HEADERS: usize = 24;
pub const BODY_BYTES: usize = 2048;
pub const RAW_BYTES: usize = 8192;
pub const IO_MS: u64 = 2000;
const REQUEST_BYTES: usize = 1536;

pub struct Buffers {
    request: [u8; REQUEST_BYTES],
    message: [u8; 384],
    headers: [u8; HEADER_BYTES],
    body: [u8; BODY_BYTES],
}
impl Default for Buffers {
    fn default() -> Self {
        Self::new()
    }
}
impl Buffers {
    pub const fn new() -> Self {
        Self {
            request: [0; REQUEST_BYTES],
            message: [0; 384],
            headers: [0; HEADER_BYTES],
            body: [0; BODY_BYTES],
        }
    }
    fn wipe(&mut self) {
        self.request.zeroize();
        self.message.zeroize();
        self.headers.zeroize();
        self.body.zeroize();
    }
    #[cfg(test)]
    fn wiped(&self) -> bool {
        self.request
            .iter()
            .chain(&self.message)
            .chain(&self.headers)
            .chain(&self.body)
            .all(|v| *v == 0)
    }
}
struct Wipe<'a>(&'a mut Buffers);
impl Drop for Wipe<'_> {
    fn drop(&mut self) {
        self.0.wipe();
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Guard(GuardError),
    Transport,
    Protocol,
}
impl core::fmt::Display for Error {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str("Pushover exchange failed")
    }
}
impl core::error::Error for Error {}
impl embedded_io_async::Error for Error {
    fn kind(&self) -> embedded_io_async::ErrorKind {
        embedded_io_async::ErrorKind::Other
    }
}
impl From<GuardError> for Error {
    fn from(value: GuardError) -> Self {
        Self::Guard(value)
    }
}

struct Text<'a> {
    bytes: &'a mut [u8],
    len: usize,
}
impl fmt::Write for Text<'_> {
    fn write_str(&mut self, value: &str) -> fmt::Result {
        let end = self.len.checked_add(value.len()).ok_or(fmt::Error)?;
        let dest = self.bytes.get_mut(self.len..end).ok_or(fmt::Error)?;
        dest.copy_from_slice(value.as_bytes());
        self.len = end;
        Ok(())
    }
}
fn form(text: &mut Text<'_>, name: &str, value: &str) -> Result<(), Error> {
    if text.len != 0 {
        text.write_str("&").map_err(|_| Error::Protocol)?;
    }
    write!(text, "{name}=").map_err(|_| Error::Protocol)?;
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            write!(text, "{}", char::from(byte)).map_err(|_| Error::Protocol)?;
        } else {
            write!(text, "%{byte:02X}").map_err(|_| Error::Protocol)?;
        }
    }
    Ok(())
}
fn encode(
    work: &Work,
    credentials: &PushoverCredentials,
    message: &mut [u8],
    request: &mut [u8],
) -> Result<usize, Error> {
    let event = work.attempt.event;
    let mut text = Text {
        bytes: message,
        len: 0,
    };
    text.write_str(match event.transition.to {
        WaterState::Low => "Crystal Shim: water level is low",
        WaterState::High => "Crystal Shim: water level is high again",
    })
    .map_err(|_| Error::Protocol)?;
    write!(
        text,
        "\nEvent #{} at device uptime {} ms",
        event.id, event.captured_at_ms
    )
    .map_err(|_| Error::Protocol)?;
    if let Some(utc) = event.utc_bounds {
        write!(
            text,
            "; UTC Unix ms {}..{}",
            utc.earliest_ms(),
            utc.latest_ms()
        )
        .map_err(|_| Error::Protocol)?;
    } else {
        let age = work
            .attempt
            .started_at_ms
            .checked_sub(event.captured_at_ms)
            .ok_or(Error::Protocol)?;
        write!(text, "; age {age} ms at attempt start").map_err(|_| Error::Protocol)?;
    }
    write!(
        text,
        "; relay {}; state {:?} at event.",
        if event.relay_on { "on" } else { "off" },
        event.state
    )
    .map_err(|_| Error::Protocol)?;
    let message = core::str::from_utf8(&text.bytes[..text.len]).map_err(|_| Error::Protocol)?;
    let mut body = Text {
        bytes: request,
        len: 0,
    };
    form(&mut body, "token", credentials.application_token())?;
    form(&mut body, "user", credentials.user_key())?;
    if let Some(device) = credentials.device() {
        form(&mut body, "device", device)?;
    }
    form(&mut body, "priority", "0")?;
    form(&mut body, "message", message)?;
    Ok(body.len)
}
struct Checked<'a, T, H> {
    io: &'a mut T,
    host: &'a H,
    deadline: u64,
    raw_left: usize,
    sent: &'a Cell<bool>,
}
impl<T: ErrorType, H> ErrorType for Checked<'_, T, H> {
    type Error = Error;
}
impl<T: Read, H: Guard> Read for Checked<'_, T, H> {
    async fn read(&mut self, buf: &mut [u8]) -> Result<usize, Error> {
        if buf.is_empty() {
            return Ok(0);
        }
        if self.raw_left == 0 {
            return Err(Error::Protocol);
        }
        let limit = buf.len().min(self.raw_left);
        let start = self.host.now_ms();
        let end = start
            .checked_add(IO_MS)
            .ok_or(Error::Protocol)?
            .min(self.deadline);
        let count = guard::within(self.host, start, end, self.io.read(&mut buf[..limit]))
            .await?
            .map_err(|_| Error::Transport)?;
        self.raw_left = self.raw_left.checked_sub(count).ok_or(Error::Protocol)?;
        Ok(count)
    }
}
impl<T: Write, H: Guard> Write for Checked<'_, T, H> {
    async fn write(&mut self, buf: &[u8]) -> Result<usize, Error> {
        let start = self.host.now_ms();
        let end = start
            .checked_add(IO_MS)
            .ok_or(Error::Protocol)?
            .min(self.deadline);
        self.sent.set(true); // A failed write may still have reached the peer.
        guard::within(self.host, start, end, self.io.write(buf))
            .await?
            .map_err(|_| Error::Transport)
    }
    async fn flush(&mut self) -> Result<(), Error> {
        let start = self.host.now_ms();
        let end = start
            .checked_add(IO_MS)
            .ok_or(Error::Protocol)?
            .min(self.deadline);
        guard::within(self.host, start, end, self.io.flush())
            .await?
            .map_err(|_| Error::Transport)
    }
}
fn edge_error(error: edge_http::io::Error<Error>) -> Error {
    match error {
        edge_http::io::Error::Io(e) => e,
        _ => Error::Protocol,
    }
}
#[derive(Clone, Copy)]
enum Framing {
    Length(usize),
    Chunked,
    Close,
}
/// Never call edge-http's resolve/content_len helpers on unvalidated peer fields:
/// the pinned parser unwraps malformed lengths and chooses duplicate framing.
fn framing(headers: &ResponseHeaders<'_, MAX_HEADERS>) -> Result<Framing, Error> {
    let mut length = None;
    let mut transfer = false;
    let mut encoding = false;
    for (name, raw) in headers.headers.iter_raw() {
        let value = core::str::from_utf8(raw).map_err(|_| Error::Protocol)?;
        if name.eq_ignore_ascii_case("Content-Length") {
            if length.is_some() || value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
                return Err(Error::Protocol);
            }
            let number = value.parse::<usize>().map_err(|_| Error::Protocol)?;
            if number > BODY_BYTES {
                return Err(Error::Protocol);
            }
            length = Some(number);
        } else if name.eq_ignore_ascii_case("Transfer-Encoding") {
            if transfer || !value.eq_ignore_ascii_case("chunked") || !headers.http11 {
                return Err(Error::Protocol);
            }
            transfer = true;
        } else if name.eq_ignore_ascii_case("Content-Encoding") {
            if encoding || !value.eq_ignore_ascii_case("identity") {
                return Err(Error::Protocol);
            }
            encoding = true;
        }
    }
    if transfer && length.is_some() {
        return Err(Error::Protocol);
    }
    Ok(if transfer {
        Framing::Chunked
    } else if let Some(length) = length {
        Framing::Length(length)
    } else {
        Framing::Close
    })
}
struct Input<'a, T> {
    prefix: &'a [u8],
    at: usize,
    io: T,
}
impl<T: ErrorType> ErrorType for Input<'_, T> {
    type Error = T::Error;
}
impl<T: Read> Read for Input<'_, T> {
    async fn read(&mut self, buf: &mut [u8]) -> Result<usize, T::Error> {
        if self.at < self.prefix.len() {
            let n = buf.len().min(self.prefix.len() - self.at);
            buf[..n].copy_from_slice(&self.prefix[self.at..self.at + n]);
            self.at += n;
            Ok(n)
        } else {
            self.io.read(buf).await
        }
    }
}
async fn exact(input: &mut impl Read<Error = Error>, buf: &mut [u8]) -> Result<(), Error> {
    let mut used = 0;
    while used < buf.len() {
        let n = input.read(&mut buf[used..]).await?;
        if n == 0 {
            return Err(Error::Transport);
        }
        used += n;
    }
    Ok(())
}
async fn crlf(input: &mut impl Read<Error = Error>) -> Result<(), Error> {
    let mut bytes = [0; 2];
    exact(input, &mut bytes).await?;
    if bytes != *b"\r\n" {
        Err(Error::Protocol)
    } else {
        Ok(())
    }
}
async fn decoded(
    input: &mut impl Read<Error = Error>,
    kind: Framing,
    body: &mut [u8; BODY_BYTES],
) -> Result<usize, Error> {
    match kind {
        Framing::Length(length) => {
            exact(input, &mut body[..length]).await?;
            Ok(length)
        }
        Framing::Close => {
            let mut used = 0;
            loop {
                let mut excess = [0];
                let next = if used == body.len() {
                    &mut excess[..]
                } else {
                    &mut body[used..]
                };
                let n = input.read(next).await?;
                if n == 0 {
                    return Ok(used);
                }
                if used == body.len() {
                    return Err(Error::Protocol);
                }
                used += n;
            }
        }
        Framing::Chunked => {
            let mut used = 0;
            loop {
                let mut size = 0usize;
                let mut digits = 0;
                loop {
                    let mut byte = [0];
                    exact(input, &mut byte).await?;
                    if byte[0] == b'\r' {
                        let mut lf = [0];
                        exact(input, &mut lf).await?;
                        if lf[0] != b'\n' || digits == 0 {
                            return Err(Error::Protocol);
                        }
                        break;
                    }
                    let digit = match byte[0] {
                        b'0'..=b'9' => byte[0] - b'0',
                        b'a'..=b'f' => byte[0] - b'a' + 10,
                        b'A'..=b'F' => byte[0] - b'A' + 10,
                        _ => return Err(Error::Protocol),
                    };
                    digits += 1;
                    if digits > 16 {
                        return Err(Error::Protocol);
                    }
                    size = size
                        .checked_mul(16)
                        .and_then(|v| v.checked_add(usize::from(digit)))
                        .ok_or(Error::Protocol)?;
                }
                if size == 0 {
                    // This API needs neither extensions nor trailers. Require the
                    // explicit zero chunk and empty trailer, never EOF-as-success.
                    crlf(input).await?;
                    return Ok(used);
                }
                let end = used
                    .checked_add(size)
                    .filter(|n| *n <= BODY_BYTES)
                    .ok_or(Error::Protocol)?;
                exact(input, &mut body[used..end]).await?;
                used = end;
                crlf(input).await?;
            }
        }
    }
}
// Serde's IgnoredAny deliberately skips decoding unknown strings. Validate
// those too, without constructing a JSON tree or retaining unknown fields.
struct ValidJson;
impl<'de> Deserialize<'de> for ValidJson {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Validate;
        impl<'de> Visitor<'de> for Validate {
            type Value = ValidJson;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("valid JSON")
            }
            fn visit_unit<E>(self) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_bool<E>(self, _: bool) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_i64<E>(self, _: i64) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_u64<E>(self, _: u64) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_f64<E>(self, _: f64) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_str<E>(self, _: &str) -> Result<ValidJson, E> {
                Ok(ValidJson)
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<ValidJson, A::Error> {
                while sequence.next_element::<ValidJson>()?.is_some() {}
                Ok(ValidJson)
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<ValidJson, A::Error> {
                while map.next_entry::<ValidJson, ValidJson>()?.is_some() {}
                Ok(ValidJson)
            }
        }
        deserializer.deserialize_any(Validate)
    }
}
fn json_status(bytes: &[u8]) -> Result<i64, Error> {
    // Bound parser scratch/stack before serde validates the actual JSON grammar.
    let mut depth = 0usize;
    let mut string = false;
    let mut escaped = false;
    for byte in bytes {
        if string {
            if escaped {
                escaped = false;
            } else if *byte == b'\\' {
                escaped = true;
            } else if *byte == b'"' {
                string = false;
            }
        } else {
            match byte {
                b'"' => string = true,
                b'[' | b'{' => {
                    depth += 1;
                    if depth > 8 {
                        return Err(Error::Protocol);
                    }
                }
                b']' | b'}' => {
                    depth = depth.checked_sub(1).ok_or(Error::Protocol)?;
                }
                _ => {}
            }
        }
    }
    if string || depth != 0 {
        return Err(Error::Protocol);
    }
    serde_json::from_slice::<ValidJson>(bytes).map_err(|_| Error::Protocol)?;
    #[derive(Deserialize)]
    struct Response {
        status: i64,
    }
    serde_json::from_slice::<Response>(bytes)
        .map(|r| r.status)
        .map_err(|_| Error::Protocol)
}
async fn execute<T: Read + Write, H: Guard>(
    io: &mut T,
    work: &Work,
    host: &H,
    buffers: &mut Buffers,
    sent: &Cell<bool>,
) -> Result<Outcome, Error> {
    let length = encode(
        work,
        &work.credentials,
        &mut buffers.message,
        &mut buffers.request,
    )?;
    let mut length_buffer = [0; 20];
    let mut length_text = Text {
        bytes: &mut length_buffer,
        len: 0,
    };
    write!(length_text, "{length}").map_err(|_| Error::Protocol)?;
    let mut request = RequestHeaders::<8>::new();
    request.method = Method::Post;
    request.path = PATH;
    request
        .headers
        .set("Host", HOST)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set(
            "Content-Length",
            core::str::from_utf8(&length_text.bytes[..length_text.len])
                .map_err(|_| Error::Protocol)?,
        )
        .set("Connection", "close")
        .set("Accept", "application/json")
        .set("Accept-Encoding", "identity")
        .set("User-Agent", USER_AGENT);
    let mut checked = Checked {
        io,
        host,
        deadline: work.attempt.deadline_ms,
        raw_left: RAW_BYTES,
        sent,
    };
    request
        .send(false, &mut checked)
        .await
        .map_err(edge_error)?;
    checked.write_all(&buffers.request[..length]).await?;
    checked.flush().await?;
    let mut response = ResponseHeaders::<MAX_HEADERS>::new();
    let (prefix, used) = response
        .receive(&mut buffers.headers, &mut checked, true)
        .await
        .map_err(edge_error)?;
    if (400..500).contains(&response.code) {
        return Ok(Outcome::Suspend(Suspension::Http(response.code)));
    }
    if response.code != 200 && !(500..600).contains(&response.code) {
        return Err(Error::Protocol);
    }
    let kind = framing(&response)?;
    let mut input = Input {
        prefix: &prefix[..used],
        at: 0,
        io: &mut checked,
    };
    let length = decoded(&mut input, kind, &mut buffers.body).await?;
    match json_status(&buffers.body[..length]) {
        Ok(status) if status != 1 => Ok(Outcome::Suspend(Suspension::Api(status))),
        Ok(1) if response.code == 200 => Ok(Outcome::ApiAccepted),
        _ if (500..600).contains(&response.code) => Ok(Outcome::Transient { uncertain: true }),
        _ => Err(Error::Protocol),
    }
}
/// Call only after the caller has completed and verified the TLS handshake.
/// The caller owns and must drop the stream after this single exchange. All
/// request/response buffers are wiped on return or future cancellation.
pub async fn exchange<T: Read + Write, H: Guard>(
    io: &mut T,
    work: &Work,
    host: &H,
    buffers: &mut Buffers,
) -> Outcome {
    let wipe = Wipe(buffers);
    let sent = Cell::new(false);
    match guard::within(
        host,
        work.attempt.started_at_ms,
        work.attempt.deadline_ms,
        execute(io, work, host, wipe.0, &sent),
    )
    .await
    {
        Ok(Ok(outcome)) => outcome,
        Ok(Err(Error::Protocol)) => Outcome::ProtocolFailure {
            uncertain: sent.get(),
        },
        Ok(Err(Error::Guard(GuardError::Cancelled))) | Err(GuardError::Cancelled) => {
            Outcome::Cancelled {
                uncertain: sent.get(),
            }
        }
        _ => Outcome::Transient {
            uncertain: sent.get(),
        },
    }
}

#[cfg(test)]
#[path = "http_tests.rs"]
mod tests;
