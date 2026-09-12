//! Bounded command ingress. Off has a reserved flag even when the request slot is full.
use crate::configuration::{ValidatedDeviceConfig, CONFIGURATION_BLOB_MAX_LEN};
use crate::runtime::{Reply, Request, RuntimeCommand};
use crate::UtcSeconds;

#[derive(Clone, Copy)]
// This is the single statically allocated request slot, not a growable queue.
#[allow(clippy::large_enum_variant)]
enum Slot {
    Empty,
    Queued(Request),
    InFlight(u32),
    Replied(Reply),
}

#[derive(Clone, Copy)]
pub struct Ingress {
    slot: Slot,
    off: bool,
}

impl Default for Ingress {
    fn default() -> Self {
        Self::new()
    }
}

impl Ingress {
    pub const fn new() -> Self {
        Self {
            slot: Slot::Empty,
            off: false,
        }
    }

    /// False means Busy. Off still revokes output, including any queued On.
    pub fn submit(&mut self, request: Request) -> bool {
        if matches!(request.command, RuntimeCommand::Off) {
            self.off = true;
        }
        if !matches!(self.slot, Slot::Empty) {
            return false;
        }
        self.slot = Slot::Queued(request);
        true
    }

    pub fn take(&mut self) -> (bool, Option<Request>) {
        let off = core::mem::take(&mut self.off);
        let request = match self.slot {
            Slot::Queued(request) => {
                self.slot = Slot::InFlight(request.id);
                Some(request)
            }
            _ => None,
        };
        (off, request)
    }

    pub fn complete(&mut self, reply: Reply) {
        if matches!(self.slot, Slot::InFlight(id) if id == reply.id) {
            self.slot = Slot::Replied(reply);
        }
    }

    pub fn take_reply(&mut self) -> Option<Reply> {
        let Slot::Replied(reply) = self.slot else {
            return None;
        };
        self.slot = Slot::Empty;
        Some(reply)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ParseError {
    Syntax,
    Configuration,
    TooLong,
    Timeout,
}

pub struct Receiver {
    line: [u8; CONFIGURATION_BLOB_MAX_LEN * 2 + 32],
    scratch: [u8; CONFIGURATION_BLOB_MAX_LEN],
    len: usize,
    started_at: Option<u64>,
    discarded: Option<ParseError>,
}

impl Default for Receiver {
    fn default() -> Self {
        Self::new()
    }
}

impl Receiver {
    pub const fn new() -> Self {
        Self {
            line: [0; CONFIGURATION_BLOB_MAX_LEN * 2 + 32],
            scratch: [0; CONFIGURATION_BLOB_MAX_LEN],
            len: 0,
            started_at: None,
            discarded: None,
        }
    }

    /// Five seconds for the whole line, not five seconds renewed per byte.
    /// Overflow/timeout drains through newline so a suffix cannot become a command.
    pub fn push(&mut self, now_ms: u64, byte: u8) -> Option<Result<Request, ParseError>> {
        if self
            .started_at
            .is_some_and(|at| now_ms < at || now_ms - at >= 5_000)
        {
            self.discarded = Some(ParseError::Timeout);
        }
        if byte == b'\n' {
            let result = if let Some(error) = self.discarded {
                Err(error)
            } else {
                parse_line(&self.line[..self.len], &mut self.scratch)
            };
            self.line.fill(0);
            self.scratch.fill(0);
            self.len = 0;
            self.started_at = None;
            self.discarded = None;
            return Some(result);
        }
        self.started_at.get_or_insert(now_ms);
        if self.discarded.is_none() {
            if self.len == self.line.len() {
                self.discarded = Some(ParseError::TooLong);
            } else {
                self.line[self.len] = byte;
                self.len += 1;
            }
        }
        None
    }
}

/// Physical USB administration only. Network callers must authenticate separately.
/// `id COMMAND [argument]`; configuration is the canonical CSCF blob in hex.
pub fn parse_line(
    line: &[u8],
    scratch: &mut [u8; CONFIGURATION_BLOB_MAX_LEN],
) -> Result<Request, ParseError> {
    if line.len() > CONFIGURATION_BLOB_MAX_LEN * 2 + 32 {
        return Err(ParseError::TooLong);
    }
    let line = core::str::from_utf8(line).map_err(|_| ParseError::Syntax)?;
    let mut fields = line.split_ascii_whitespace();
    let id = fields
        .next()
        .and_then(|id| id.parse::<u32>().ok())
        .filter(|id| *id != 0)
        .ok_or(ParseError::Syntax)?;
    let command = match fields.next() {
        Some("ON") => RuntimeCommand::On,
        Some("OFF") => RuntimeCommand::Off,
        Some("MAINTENANCE") => RuntimeCommand::EnterMaintenance,
        Some("EXIT") => RuntimeCommand::ExitMaintenance,
        Some("CLEAR_UTC") => RuntimeCommand::ClearUtc,
        Some("UTC") => RuntimeCommand::SetUtc(UtcSeconds(
            fields
                .next()
                .and_then(|utc| utc.parse().ok())
                .ok_or(ParseError::Syntax)?,
        )),
        Some("CONFIG") => {
            let hex = fields.next().ok_or(ParseError::Syntax)?.as_bytes();
            if !hex.len().is_multiple_of(2) || hex.len() / 2 > scratch.len() {
                return Err(ParseError::Configuration);
            }
            for (index, pair) in hex.chunks_exact(2).enumerate() {
                let high = digit(pair[0]).ok_or(ParseError::Configuration)?;
                let low = digit(pair[1]).ok_or(ParseError::Configuration)?;
                scratch[index] = high * 16 + low;
            }
            let config = ValidatedDeviceConfig::decode(&scratch[..hex.len() / 2])
                .map_err(|_| ParseError::Configuration)?;
            RuntimeCommand::SaveConfiguration(config)
        }
        _ => return Err(ParseError::Syntax),
    };
    if fields.next().is_some() {
        return Err(ParseError::Syntax);
    }
    Ok(Request { id, command })
}

fn digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::runtime::Acknowledgement;

    #[test]
    fn full_slot_off_cannot_be_lost_and_stale_completion_cannot_release_it() {
        let mut ingress = Ingress::new();
        assert!(ingress.submit(Request {
            id: 1,
            command: RuntimeCommand::On
        }));
        assert!(!ingress.submit(Request {
            id: 2,
            command: RuntimeCommand::Off
        }));
        let (off, request) = ingress.take();
        assert!(off);
        assert_eq!(request.unwrap().id, 1);
        assert!(!ingress.take().0);
        ingress.complete(Reply {
            id: 2,
            result: Ok(Acknowledgement::Applied),
        });
        assert!(ingress.take_reply().is_none());
        assert!(!ingress.submit(Request {
            id: 3,
            command: RuntimeCommand::On
        }));
        ingress.complete(Reply {
            id: 1,
            result: Ok(Acknowledgement::Applied),
        });
        assert_eq!(ingress.take_reply().unwrap().id, 1);
        assert!(ingress.submit(Request {
            id: 3,
            command: RuntimeCommand::On
        }));
    }

    #[test]
    fn parser_is_exact_bounded_and_never_accepts_malformed_configuration() {
        let mut scratch = [0; CONFIGURATION_BLOB_MAX_LEN];
        for line in [
            b"0 ON".as_slice(),
            b"1 ON extra",
            b"1 UTC -1",
            b"1 CONFIG xyz",
            b"1 CONFIG 00",
            b"1 UNKNOWN",
            b"1\xff OFF",
        ] {
            assert!(parse_line(line, &mut scratch).is_err());
        }
        assert!(matches!(
            parse_line(b"42 OFF", &mut scratch).unwrap().command,
            RuntimeCommand::Off
        ));
        assert!(matches!(
            parse_line(b"43 UTC 12345", &mut scratch).unwrap().command,
            RuntimeCommand::SetUtc(UtcSeconds(12345))
        ));
    }

    #[test]
    fn partial_lines_have_one_deadline_and_overflow_is_drained() {
        let mut receiver = Receiver::new();
        for byte in b"1 O" {
            assert!(receiver.push(0, *byte).is_none());
        }
        assert!(receiver.push(4_999, b'F').is_none());
        assert!(receiver.push(5_000, b'F').is_none());
        assert!(matches!(
            receiver.push(5_000, b'\n'),
            Some(Err(ParseError::Timeout))
        ));
        for _ in 0..(CONFIGURATION_BLOB_MAX_LEN * 2 + 33) {
            receiver.push(6_000, b'x');
        }
        assert!(matches!(
            receiver.push(6_000, b'\n'),
            Some(Err(ParseError::TooLong))
        ));
        for byte in b"2 OFF" {
            assert!(receiver.push(6_001, *byte).is_none());
        }
        assert_eq!(receiver.push(6_002, b'\n').unwrap().unwrap().id, 2);
        assert!(receiver
            .line
            .iter()
            .chain(receiver.scratch.iter())
            .all(|byte| *byte == 0));
    }
}
