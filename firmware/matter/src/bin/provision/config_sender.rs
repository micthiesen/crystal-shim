//! One physical-USB CONFIG. Ordinary CONFIG has no idempotent readback receipt.
use super::{configuration, files::Bytes, sender::Stream};
use crystal_shim_core::runtime::Error;
use crystal_shim_matter::provision_transfer::clear_input;
use std::io::Write;

const WRITE_MS: u64 = 1_000;
const TOTAL_MS: u64 = 10_000;
const LINE_BYTES: usize = 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Failure {
    Invalid,
    NotSent,
    Busy,
    NotReady,
    Rejected(Error),
    Uncertain,
}
impl Failure {
    pub fn message(self) -> &'static str {
        match self {
            Self::Invalid => "invalid first configuration or request ID; no CONFIG sent",
            Self::NotSent => "request deadline unavailable; no CONFIG sent",
            Self::Busy => "device is busy; first configuration was not accepted; no retry performed",
            Self::NotReady => "device storage/control is not ready; first configuration was not accepted",
            Self::Rejected(Error::Revision) => "device rejected revision 1; this does not verify an earlier installation; no overwrite or retry performed",
            Self::Rejected(_) => "device rejected first configuration; no durable installation confirmed; maintenance may remain active",
            Self::Uncertain => "configuration outcome is uncertain; storage may have changed; do not infer rollback or repeat automatically; no exit or reboot requested",
        }
    }
}

fn current(io: &impl Stream, last: &mut u64, deadline: u64) -> Result<(), Failure> {
    let now = io.now_ms();
    if now < *last || now >= deadline {
        return Err(Failure::Uncertain);
    }
    *last = now;
    Ok(())
}

/// The caller validates these bytes before opening its exclusive trusted USB
/// stream. A fresh random nonzero ID correlates replies; it is not authentication.
pub fn send(io: &mut impl Stream, bytes: &[u8], id: u32) -> Result<(), Failure> {
    if id == 0 || configuration::validate(bytes).is_err() {
        return Err(Failure::Invalid);
    }
    let mut command = Bytes(Vec::with_capacity(bytes.len() * 2 + 32));
    write!(command.0, "{id} CONFIG ").unwrap();
    for byte in bytes {
        write!(command.0, "{byte:02x}").unwrap();
    }
    command.0.push(b'\n');
    let mut last = io.now_ms();
    let deadline = last.checked_add(TOTAL_MS).ok_or(Failure::NotSent)?;
    let write_deadline = last.checked_add(WRITE_MS).ok_or(Failure::NotSent)?;
    // Once a write is attempted, even a reported I/O failure can mean the full
    // newline reached the device. Never append cleanup bytes or resend.
    io.write(&command.0, write_deadline)
        .map_err(|_| Failure::Uncertain)?;
    current(io, &mut last, write_deadline)?;
    drop(command);
    let mut line = Bytes(Vec::with_capacity(LINE_BYTES));
    let mut overflow = false;
    let mut overflow_matching = false;
    let mut accepted = false;
    loop {
        current(io, &mut last, deadline)?;
        let byte = io.read(deadline).map_err(|_| Failure::Uncertain)?;
        current(io, &mut last, deadline)?;
        let byte = byte.ok_or(Failure::Uncertain)?;
        if byte != b'\n' {
            if !overflow && line.0.len() < LINE_BYTES {
                line.0.push(byte);
            } else {
                if !overflow {
                    // Keep attribution when bounded storage cannot retain the
                    // full payload. A later valid reply cannot erase this error.
                    overflow_matching = response(&line.0, id).is_some();
                }
                clear_input(&mut line.0);
                line.0.clear();
                overflow = true;
            }
            continue;
        }
        let response = if overflow {
            overflow_matching.then_some(Response::Failed(Failure::Uncertain))
        } else {
            response(&line.0, id)
        };
        clear_input(&mut line.0);
        line.0.clear();
        overflow = false;
        overflow_matching = false;
        match response {
            None => (),
            Some(Response::Accepted) => accepted = true,
            Some(Response::Complete) => return Ok(()),
            Some(Response::Failed(Failure::Busy | Failure::NotReady)) if accepted => {
                return Err(Failure::Uncertain)
            }
            Some(Response::Failed(error)) => return Err(error),
        }
    }
}

enum Response {
    Accepted,
    Complete,
    Failed(Failure),
}
fn response(bytes: &[u8], id: u32) -> Option<Response> {
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    if bytes.starts_with(b"PARSE_ERROR ") {
        return Some(Response::Failed(Failure::Uncertain));
    }
    // Attribute the ASCII envelope before inspecting the possibly invalid UTF-8
    // payload. Otherwise a malformed matching reply becomes unrelated noise.
    let mut fields = bytes.splitn(3, |byte| *byte == b' ');
    let kind = fields.next()?;
    if !matches!(kind, b"ACCEPTED" | b"BUSY" | b"NOT_READY" | b"REPLY") {
        return None;
    }
    let number = fields.next()?;
    if number != id.to_string().as_bytes() {
        return None;
    }
    let payload = fields.next();
    Some(match (kind, payload) {
        (b"ACCEPTED", None) => Response::Accepted,
        (b"BUSY", None) => Response::Failed(Failure::Busy),
        (b"NOT_READY", None) => Response::Failed(Failure::NotReady),
        (b"REPLY", Some(b"Ok(Durable)")) => Response::Complete,
        (b"REPLY", Some(payload)) => {
            let errors = [
                Error::Busy,
                Error::Unconfigured,
                Error::Revision,
                Error::RecoveryRequired,
                Error::Superseded,
                Error::InvalidTime,
                Error::Rejected,
            ];
            let error = errors
                .into_iter()
                .find(|error| payload == format!("Err({error:?})").as_bytes());
            // Storage/exhaustion can follow the first durable write. Unknown
            // and Applied responses are never a durable configuration receipt.
            Response::Failed(error.map_or(Failure::Uncertain, Failure::Rejected))
        }
        _ => Response::Failed(Failure::Uncertain),
    })
}

#[cfg(test)]
#[path = "config_sender_tests.rs"]
mod tests;
