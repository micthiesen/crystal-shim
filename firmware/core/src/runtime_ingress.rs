//! Bounded command ingress. Off has a reserved flag; UTC clear has a small reply slot.
use crate::configuration::{ValidatedDeviceConfig, CONFIGURATION_BLOB_MAX_LEN};
use crate::runtime::{Error, Reply, Request, RuntimeCommand};
use crate::UtcSeconds;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Source {
    Usb,
    Matter,
    Provisioning,
}

/// An opaque generation owned by one producer. User correlation IDs are separate.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Token {
    generation: u32,
    source: Source,
}

#[derive(Clone, Copy)]
struct Route {
    token: Token,
    correlation: u32,
}

#[derive(Clone, Copy)]
// This is the single statically allocated request slot, not a growable queue.
#[allow(clippy::large_enum_variant)]
enum Slot {
    Empty,
    Queued(Request, Route),
    InFlight(Route, bool),
    Replied(Reply, Route),
}

// Revocation carries only its route and reply, never a second configuration buffer.
#[derive(Clone, Copy)]
enum ClearSlot {
    Empty,
    Queued(Route),
    InFlight(Route, bool),
    Replied(Reply, Route),
}

#[derive(Clone, Copy)]
pub struct Ingress {
    slot: Slot,
    clear: ClearSlot,
    off: bool,
    generation: u32,
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
            clear: ClearSlot::Empty,
            off: false,
            generation: 0,
        }
    }

    /// False means Busy. Off still revokes output, including any queued On.
    pub fn submit(&mut self, request: Request) -> bool {
        self.submit_from(Source::Usb, request).is_some()
    }

    pub fn submit_from(&mut self, source: Source, mut request: Request) -> Option<Token> {
        if matches!(request.command, RuntimeCommand::Off) {
            self.off = true;
        }
        let clearing = matches!(request.command, RuntimeCommand::ClearUtc);
        if if clearing {
            !matches!(self.clear, ClearSlot::Empty)
        } else {
            !matches!(self.slot, Slot::Empty)
        } {
            return None;
        }
        let generation = self.generation.checked_add(1)?;
        self.generation = generation;
        let token = Token { generation, source };
        let route = Route {
            token,
            correlation: request.id,
        };
        request.id = generation;
        if clearing {
            // A newer revocation must not let an older queued UTC command apply
            // on the following tick. Preserve that request's correlated error.
            if let Slot::Queued(older, older_route) = self.slot {
                if matches!(
                    older.command,
                    RuntimeCommand::SetUtc(_) | RuntimeCommand::SetUtcObserved(_)
                ) {
                    self.slot = Slot::Replied(
                        Reply {
                            id: older_route.correlation,
                            result: Err(Error::Superseded),
                        },
                        older_route,
                    );
                }
            }
            self.clear = ClearSlot::Queued(route);
        } else {
            self.slot = Slot::Queued(request, route);
        }
        Some(token)
    }

    pub fn take(&mut self) -> (bool, Option<Request>) {
        let off = core::mem::take(&mut self.off);
        if let ClearSlot::Queued(route) = self.clear {
            self.clear = ClearSlot::InFlight(route, false);
            return (
                off,
                Some(Request {
                    id: route.token.generation,
                    command: RuntimeCommand::ClearUtc,
                }),
            );
        }
        let request = match self.slot {
            Slot::Queued(request, route) => {
                self.slot = Slot::InFlight(route, false);
                Some(request)
            }
            _ => None,
        };
        (off, request)
    }

    pub fn complete(&mut self, reply: Reply) {
        if let ClearSlot::InFlight(route, abandoned) = self.clear {
            if route.token.generation == reply.id {
                self.clear = if abandoned {
                    ClearSlot::Empty
                } else {
                    ClearSlot::Replied(
                        Reply {
                            id: route.correlation,
                            ..reply
                        },
                        route,
                    )
                };
                return;
            }
        }
        if let Slot::InFlight(route, abandoned) = self.slot {
            if route.token.generation == reply.id {
                self.slot = if abandoned {
                    Slot::Empty
                } else {
                    Slot::Replied(
                        Reply {
                            id: route.correlation,
                            ..reply
                        },
                        route,
                    )
                };
            }
        }
    }

    pub fn take_reply(&mut self) -> Option<Reply> {
        if let ClearSlot::Replied(_, route) = self.clear {
            if route.token.source == Source::Usb {
                return self.take_reply_for(route.token);
            }
        }
        let Slot::Replied(_, route) = self.slot else {
            return None;
        };
        if route.token.source != Source::Usb {
            return None;
        }
        self.take_reply_for(route.token)
    }

    pub fn take_reply_for(&mut self, token: Token) -> Option<Reply> {
        if let ClearSlot::Replied(reply, route) = self.clear {
            if route.token == token {
                self.clear = ClearSlot::Empty;
                return Some(reply);
            }
        }
        let Slot::Replied(reply, route) = self.slot else {
            return None;
        };
        if route.token != token {
            return None;
        }
        self.slot = Slot::Empty;
        Some(reply)
    }

    /// Remove a queued request; after dispatch, only abandon its reply. An
    /// already-applied command is never rolled back because its client vanished.
    /// Keep dispatched ownership until its completion so cancellation cannot
    /// allow a stale reply to acknowledge another producer's request.
    pub fn cancel(&mut self, token: Token) {
        match self.clear {
            ClearSlot::Queued(route) | ClearSlot::Replied(_, route) if route.token == token => {
                self.clear = ClearSlot::Empty
            }
            ClearSlot::InFlight(route, _) if route.token == token => {
                self.clear = ClearSlot::InFlight(route, true)
            }
            _ => {}
        }
        match self.slot {
            Slot::Queued(_, route) | Slot::Replied(_, route) if route.token == token => {
                self.slot = Slot::Empty;
            }
            Slot::InFlight(route, _) if route.token == token => {
                self.slot = Slot::InFlight(route, true);
            }
            _ => {}
        }
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
        self.push_with(now_ms, byte, parse_line)
    }

    /// One shared bounded framer; the parser returns an owned result before wipe.
    pub fn push_with<T>(
        &mut self,
        now_ms: u64,
        byte: u8,
        parse: impl FnOnce(&[u8], &mut [u8; CONFIGURATION_BLOB_MAX_LEN]) -> Result<T, ParseError>,
    ) -> Option<Result<T, ParseError>> {
        self.expire(now_ms);
        if byte == b'\n' {
            let result = if let Some(error) = self.discarded {
                Err(error)
            } else {
                parse(&self.line[..self.len], &mut self.scratch)
            };
            self.clear();
            self.started_at = None;
            self.discarded = None;
            return Some(result);
        }
        self.started_at.get_or_insert(now_ms);
        if self.discarded.is_none() {
            if self.len == self.line.len() {
                self.discarded = Some(ParseError::TooLong);
                self.clear();
            } else {
                self.line[self.len] = byte;
                self.len += 1;
            }
        }
        None
    }

    /// Poll even without input. Wipe immediately, then drain the old line to LF.
    pub fn expire(&mut self, now_ms: u64) {
        if self.discarded != Some(ParseError::Timeout)
            && self
                .started_at
                .is_some_and(|at| now_ms < at || now_ms - at >= 5_000)
        {
            self.discarded = Some(ParseError::Timeout);
            self.clear();
        }
    }

    fn clear(&mut self) {
        // Volatile stores retain the clearing even if this buffer is never read
        // again. This does not promise erasure of earlier copies or flash bytes.
        for byte in self.line.iter_mut().chain(self.scratch.iter_mut()) {
            // SAFETY: each pointer comes from a unique live mutable byte reference.
            unsafe { core::ptr::write_volatile(byte, 0) };
        }
        core::sync::atomic::compiler_fence(core::sync::atomic::Ordering::SeqCst);
        self.len = 0;
    }
}

impl Drop for Receiver {
    fn drop(&mut self) {
        self.clear();
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
        Some("TOGGLE") => RuntimeCommand::Toggle,
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
            for (index, pair) in hex.as_chunks::<2>().0.iter().enumerate() {
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
    fn silent_expiry_and_overflow_wipe_partial_bytes_before_the_next_newline() {
        for at in [5_000, 0] {
            let mut receiver = Receiver::new();
            for byte in b"1 CONFIG sensitive" {
                receiver.push(1, *byte);
            }
            receiver.scratch.fill(0x5a);
            receiver.expire(if at == 0 { 0 } else { 5_001 });
            assert!(receiver.line.iter().all(|byte| *byte == 0));
            assert!(receiver.scratch.iter().all(|byte| *byte == 0));
            assert_eq!(receiver.len, 0);
            for byte in b"2 ON" {
                assert!(receiver.push(5_001, *byte).is_none());
            }
            assert!(matches!(
                receiver.push(5_001, b'\n'),
                Some(Err(ParseError::Timeout))
            ));
        }
        let mut receiver = Receiver::new();
        for _ in 0..=CONFIGURATION_BLOB_MAX_LEN * 2 + 32 {
            receiver.push(0, b'a');
        }
        assert!(receiver.line.iter().all(|byte| *byte == 0));
        assert!(matches!(
            receiver.push(0, b'\n'),
            Some(Err(ParseError::TooLong))
        ));
    }

    #[test]
    fn producer_and_generation_route_replies_independently_of_user_ids() {
        let mut ingress = Ingress::new();
        let request = Request {
            id: 42,
            command: RuntimeCommand::On,
        };
        let first = ingress.submit_from(Source::Matter, request).unwrap();
        let dispatched = ingress.take().1.unwrap();
        assert_ne!(dispatched.id, 42);
        ingress.complete(Reply {
            id: dispatched.id,
            result: Ok(Acknowledgement::Applied),
        });
        assert!(ingress.take_reply().is_none());
        assert_eq!(ingress.take_reply_for(first).unwrap().id, 42);
        let second = ingress.submit_from(Source::Usb, request).unwrap();
        assert_ne!(first, second);
        let current = ingress.take().1.unwrap();
        ingress.cancel(first);
        ingress.complete(Reply {
            id: dispatched.id,
            result: Ok(Acknowledgement::Applied),
        });
        assert!(ingress.take_reply_for(second).is_none());
        ingress.complete(Reply {
            id: current.id,
            result: Ok(Acknowledgement::Applied),
        });
        assert!(ingress.take_reply_for(first).is_none());
        assert_eq!(ingress.take_reply().unwrap().id, 42);
    }

    #[test]
    fn cancelled_queued_work_is_removed_but_dispatched_work_keeps_ownership_until_ack() {
        let mut ingress = Ingress::new();
        let request = Request {
            id: 1,
            command: RuntimeCommand::On,
        };
        let queued = ingress.submit_from(Source::Matter, request).unwrap();
        ingress.cancel(queued);
        assert!(ingress.take().1.is_none());
        let dispatched = ingress.submit_from(Source::Matter, request).unwrap();
        let actual = ingress.take().1.unwrap();
        ingress.cancel(dispatched);
        assert!(ingress.submit_from(Source::Usb, request).is_none());
        assert!(ingress
            .submit_from(
                Source::Usb,
                Request {
                    command: RuntimeCommand::Off,
                    ..request
                }
            )
            .is_none());
        assert!(ingress.take().0);
        ingress.complete(Reply {
            id: actual.id,
            result: Ok(Acknowledgement::Applied),
        });
        assert!(ingress.take_reply_for(dispatched).is_none());
        assert!(ingress.submit_from(Source::Usb, request).is_some());
    }

    #[test]
    fn generation_exhaustion_and_cancelled_off_cannot_lose_revocation() {
        let mut ingress = Ingress::new();
        let request = Request {
            id: 1,
            command: RuntimeCommand::Off,
        };
        let off = ingress.submit_from(Source::Matter, request).unwrap();
        ingress.cancel(off);
        let (reserved, queued) = ingress.take();
        assert!(reserved);
        assert!(queued.is_none());
        ingress.generation = u32::MAX;
        assert!(ingress.submit_from(Source::Matter, request).is_none());
        assert!(ingress.take().0);
        assert!(ingress
            .submit_from(
                Source::Usb,
                Request {
                    command: RuntimeCommand::On,
                    ..request
                }
            )
            .is_none());
    }

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
