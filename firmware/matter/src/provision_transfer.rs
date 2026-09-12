//! Physical USB staging only. No radio activation, alternate storage, or secret logs.
use core::fmt;
use crystal_shim_core::{
    configuration::CONFIGURATION_BLOB_MAX_LEN,
    runtime::{Acknowledgement, Request as ControlRequest, RuntimeCommand},
    runtime_ingress::{self, ParseError, Source, Token},
};
use p256::elliptic_curve::zeroize::Zeroize;
use sha2::{Digest, Sha256};

use crate::{
    on_off::{BridgeError, Control},
    provisioning::{Provisioning, MAX_BYTES},
    storage::{InstallError, InstallOutcome, ProvisionStore},
};

pub const CHUNK_BYTES: usize = 256;
pub const ADMISSION_MS: u64 = 5_000;
pub const IDLE_MS: u64 = 5_000;
pub const TOTAL_MS: u64 = 60_000;
pub const RECEIPT_MS: u64 = 120_000;
pub const OBSERVATION_MS: u64 = 100;

/// The service owns the raw USB read buffer as well as the framed/chunk copies.
pub fn clear_input(bytes: &mut [u8]) {
    bytes.zeroize();
}

/// Published by the hardware owner after writing GPIO low, never by the USB task.
#[derive(Clone, Copy, Default)]
pub struct Readiness {
    pub configured: bool,
    pub durable_maintenance: bool,
    pub relay_off: bool,
    pub observed_at_ms: u64,
}
impl Readiness {
    fn current(self, now: u64) -> bool {
        !elapsed(now, self.observed_at_ms, OBSERVATION_MS)
    }
    fn ready(self, now: u64) -> bool {
        self.current(now) && self.configured && self.durable_maintenance && self.relay_off
    }
}

/// Public correlation, not authentication. The host chooses a fresh nonce per boot/retry.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Owner {
    pub generation: u64,
    pub nonce: [u8; 16],
}
impl fmt::Display for Owner {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:", self.generation)?;
        for byte in self.nonce {
            write!(f, "{byte:02x}")?;
        }
        Ok(())
    }
}

pub struct Chunk {
    bytes: [u8; CHUNK_BYTES],
    len: usize,
}
impl Drop for Chunk {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}
// One owned 256-byte chunk, without allocating a box on the embedded heap.
#[allow(clippy::large_enum_variant)]
pub enum Command {
    Begin {
        nonce: [u8; 16],
        length: usize,
        sha256: [u8; 32],
    },
    Chunk {
        owner: Owner,
        offset: usize,
        chunk: Chunk,
    },
    Commit(Owner),
    Cancel(Owner),
    Status(Owner),
    Reboot(Owner),
    /// A malformed request with an identifiable owner aborts only that owner.
    Invalid(Owner),
}
pub struct Request {
    pub id: u32,
    pub command: Command,
}
// Runtime CONFIG is larger than a provisioning chunk; preserve the existing bound.
#[allow(clippy::large_enum_variant)]
pub enum LocalCommand {
    Runtime(ControlRequest),
    Provision(Request),
    SettingsToken {
        id: u32,
        replacement: Option<SettingsToken>,
    },
}

/// Explicit physical USB administration. Never printed by Debug or echoed.
pub struct SettingsToken([u8; 32]);
impl SettingsToken {
    pub fn bytes(&self) -> &[u8; 32] {
        &self.0
    }
}
impl Drop for SettingsToken {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Busy,
    NotReady,
    Unconfigured,
    Exhausted,
    StaleToken,
    Timeout,
    Malformed,
    Length,
    Offset,
    Integrity,
    InvalidRecord,
    Control(BridgeError),
    MaintenanceNotDurable,
    Store(InstallError),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Progress {
    Pending,
    Ready(usize),
    Next(usize),
    Cancelled,
    Complete(InstallOutcome),
    Rebooting,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Response {
    pub id: u32,
    pub owner: Option<Owner>,
    pub result: Result<Progress, Error>,
}
impl fmt::Display for Response {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PROVISION {} ", self.id)?;
        if let Some(owner) = self.owner {
            write!(f, "{owner} ")?;
        } else {
            write!(f, "- ")?;
        }
        write!(f, "{:?}", self.result)
    }
}

#[derive(Clone, Copy)]
enum Phase {
    Maintenance {
        token: Token,
        acknowledged: bool,
        reboot: bool,
    },
    Receiving,
}
#[derive(Clone, Copy)]
struct Active {
    owner: Owner,
    id: u32,
    started: u64,
    last_chunk: u64,
    length: usize,
    received: usize,
    sha256: [u8; 32],
    phase: Phase,
}
#[derive(Clone, Copy)]
struct Receipt {
    owner: Owner,
    at: u64,
    outcome: InstallOutcome,
}

pub struct Transfer {
    bytes: [u8; MAX_BYTES],
    generation: u64,
    active: Option<Active>,
    receipt: Option<Receipt>,
    last_observed: Option<u64>,
}
impl Default for Transfer {
    fn default() -> Self {
        Self::new()
    }
}
impl Transfer {
    pub const fn new() -> Self {
        Self {
            bytes: [0; MAX_BYTES],
            generation: 0,
            active: None,
            receipt: None,
            last_observed: None,
        }
    }

    /// The only current EXIT/CONFIG producer is USB. Keep it reserved while live.
    /// Future administrative producers must participate in this same reservation.
    pub fn allows_runtime(&self, command: RuntimeCommand) -> bool {
        self.active.is_none() || matches!(command, RuntimeCommand::Off)
    }

    fn release(&mut self, control: &impl Control) {
        if let Some(Active {
            phase: Phase::Maintenance { token, .. },
            ..
        }) = self.active
        {
            control.cancel(token);
        }
        self.active = None;
        self.bytes.zeroize();
    }

    fn expire(&mut self, now: u64, control: &impl Control) -> Option<Response> {
        let backwards = self.last_observed.is_some_and(|previous| now < previous);
        self.last_observed = Some(now);
        if self
            .receipt
            .is_some_and(|receipt| backwards || elapsed(now, receipt.at, RECEIPT_MS))
        {
            self.receipt = None;
        }
        let active = self.active?;
        let expired = backwards
            || match active.phase {
                Phase::Maintenance { .. } => elapsed(now, active.started, ADMISSION_MS),
                Phase::Receiving => {
                    elapsed(now, active.started, TOTAL_MS)
                        || elapsed(now, active.last_chunk, IDLE_MS)
                }
            };
        if expired {
            self.release(control);
            return Some(Response {
                id: active.id,
                owner: Some(active.owner),
                result: Err(Error::Timeout),
            });
        }
        None
    }

    /// Call without waiting for input, including after the radio task has returned.
    pub fn poll(
        &mut self,
        now: u64,
        control: &impl Control,
        readiness: Readiness,
    ) -> Option<Response> {
        if let Some(response) = self.expire(now, control) {
            return Some(response);
        }
        let mut active = self.active?;
        let Phase::Maintenance {
            token,
            mut acknowledged,
            reboot,
        } = active.phase
        else {
            return None;
        };
        if !acknowledged {
            if let Some(reply) = control.reply(token) {
                let error = match reply.result {
                    Ok(Acknowledgement::Durable) => None,
                    Ok(Acknowledgement::Applied) => Some(Error::MaintenanceNotDurable),
                    Err(error) => Some(Error::Control(BridgeError::Control(error))),
                };
                if let Some(error) = error {
                    self.release(control);
                    return Some(Response {
                        id: active.id,
                        owner: Some(active.owner),
                        result: Err(error),
                    });
                }
                acknowledged = true;
            }
        }
        active.phase = Phase::Maintenance {
            token,
            acknowledged,
            reboot,
        };
        self.active = Some(active);
        if !acknowledged || !readiness.ready(now) {
            return None;
        }
        let result = if reboot {
            self.release(control);
            self.receipt = None;
            Progress::Rebooting
        } else {
            active.phase = Phase::Receiving;
            active.last_chunk = now;
            self.active = Some(active);
            Progress::Ready(0)
        };
        Some(Response {
            id: active.id,
            owner: Some(active.owner),
            result: Ok(result),
        })
    }

    pub fn handle(
        &mut self,
        request: Request,
        now: u64,
        control: &impl Control,
        readiness: Readiness,
        store: Option<&dyn ProvisionStore>,
    ) -> Response {
        if let Some(mut response) = self.expire(now, control) {
            response.id = request.id;
            return response;
        }
        let owner = match &request.command {
            Command::Begin { .. } => None,
            Command::Chunk { owner, .. } => Some(*owner),
            Command::Commit(owner)
            | Command::Cancel(owner)
            | Command::Status(owner)
            | Command::Reboot(owner)
            | Command::Invalid(owner) => Some(*owner),
        };
        let result = self.apply(request.id, request.command, now, control, readiness, store);
        Response {
            id: request.id,
            owner: owner.or(self.active.map(|active| active.owner)),
            result,
        }
    }

    fn apply(
        &mut self,
        id: u32,
        command: Command,
        now: u64,
        control: &impl Control,
        readiness: Readiness,
        store: Option<&dyn ProvisionStore>,
    ) -> Result<Progress, Error> {
        match command {
            Command::Begin {
                nonce,
                length,
                sha256,
            } => {
                if self.active.is_some() {
                    return Err(Error::Busy);
                }
                if length == 0 || length > MAX_BYTES || nonce == [0; 16] {
                    return Err(Error::Length);
                }
                if !readiness.current(now) || store.is_none() {
                    return Err(Error::NotReady);
                }
                if !readiness.configured {
                    return Err(Error::Unconfigured);
                }
                let generation = self.generation.checked_add(1).ok_or(Error::Exhausted)?;
                self.generation = generation;
                let token = control
                    .begin(
                        Source::Provisioning,
                        ControlRequest {
                            id,
                            command: RuntimeCommand::EnterMaintenance,
                        },
                    )
                    .map_err(Error::Control)?;
                self.receipt = None;
                self.active = Some(Active {
                    owner: Owner { generation, nonce },
                    id,
                    started: now,
                    last_chunk: now,
                    length,
                    received: 0,
                    sha256,
                    phase: Phase::Maintenance {
                        token,
                        acknowledged: false,
                        reboot: false,
                    },
                });
                Ok(Progress::Pending)
            }
            Command::Reboot(owner) => {
                if self.active.is_some() {
                    return Err(Error::Busy);
                }
                self.receipt
                    .filter(|receipt| receipt.owner == owner)
                    .ok_or(Error::StaleToken)?;
                if !readiness.current(now) || !readiness.configured || store.is_none() {
                    return Err(Error::NotReady);
                }
                let token = control
                    .begin(
                        Source::Provisioning,
                        ControlRequest {
                            id,
                            command: RuntimeCommand::EnterMaintenance,
                        },
                    )
                    .map_err(Error::Control)?;
                self.active = Some(Active {
                    owner,
                    id,
                    started: now,
                    last_chunk: now,
                    length: 0,
                    received: 0,
                    sha256: [0; 32],
                    phase: Phase::Maintenance {
                        token,
                        acknowledged: false,
                        reboot: true,
                    },
                });
                Ok(Progress::Pending)
            }
            Command::Status(owner) => {
                if let Some(active) = self.active.filter(|active| active.owner == owner) {
                    return Ok(match active.phase {
                        Phase::Maintenance { .. } => Progress::Pending,
                        Phase::Receiving => Progress::Next(active.received),
                    });
                }
                self.receipt
                    .filter(|receipt| receipt.owner == owner)
                    .map(|receipt| Progress::Complete(receipt.outcome))
                    .ok_or(Error::StaleToken)
            }
            command => {
                let owner = match &command {
                    Command::Chunk { owner, .. }
                    | Command::Commit(owner)
                    | Command::Cancel(owner)
                    | Command::Invalid(owner) => *owner,
                    _ => unreachable!(),
                };
                let mut active = self
                    .active
                    .filter(|active| active.owner == owner)
                    .ok_or(Error::StaleToken)?;
                if matches!(command, Command::Cancel(_)) {
                    self.release(control);
                    return Ok(Progress::Cancelled);
                }
                if matches!(command, Command::Invalid(_)) {
                    self.release(control);
                    return Err(Error::Malformed);
                }
                if !matches!(active.phase, Phase::Receiving) {
                    return Err(Error::NotReady);
                }
                if !readiness.ready(now) {
                    self.release(control);
                    return Err(Error::MaintenanceNotDurable);
                }
                match command {
                    Command::Chunk { offset, chunk, .. } => {
                        let end = offset
                            .checked_add(chunk.len)
                            .filter(|end| *end <= active.length);
                        let error = if offset != active.received {
                            Some(Error::Offset)
                        } else if chunk.len == 0 || end.is_none() {
                            Some(Error::Length)
                        } else {
                            None
                        };
                        if let Some(error) = error {
                            self.release(control);
                            return Err(error);
                        }
                        let end = end.unwrap();
                        self.bytes[offset..end].copy_from_slice(&chunk.bytes[..chunk.len]);
                        active.received = end;
                        active.last_chunk = now;
                        self.active = Some(active);
                        Ok(Progress::Next(end))
                    }
                    Command::Commit(_) => {
                        let result = if active.received != active.length {
                            Err(Error::Length)
                        } else if Sha256::digest(&self.bytes[..active.length])[..] != active.sha256
                        {
                            Err(Error::Integrity)
                        } else if Provisioning::decode(&self.bytes[..active.length]).is_err() {
                            Err(Error::InvalidRecord)
                        } else {
                            store.ok_or(Error::NotReady).and_then(|store| {
                                store
                                    .install(&self.bytes[..active.length])
                                    .map_err(Error::Store)
                            })
                        };
                        // The KV operation is synchronous and cannot be cancelled by USB
                        // midway. Its verified result remains true even if time elapsed.
                        if let Ok(outcome) = result {
                            self.receipt = Some(Receipt {
                                owner,
                                at: control.now_ms(),
                                outcome,
                            });
                        }
                        self.release(control);
                        result.map(Progress::Complete)
                    }
                    _ => unreachable!(),
                }
            }
        }
    }
}
impl Drop for Transfer {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}
fn elapsed(now: u64, at: u64, limit: u64) -> bool {
    now.checked_sub(at).is_none_or(|age| age >= limit)
}

/// Shared USB framing calls this once. Secrets never enter an error or reply value.
pub fn parse_line(
    line: &[u8],
    scratch: &mut [u8; CONFIGURATION_BLOB_MAX_LEN],
) -> Result<LocalCommand, ParseError> {
    if line.len() > CONFIGURATION_BLOB_MAX_LEN * 2 + 32 {
        return Err(ParseError::TooLong);
    }
    let text = core::str::from_utf8(line).map_err(|_| ParseError::Syntax)?;
    let mut fields = text.split_ascii_whitespace();
    let id = fields
        .next()
        .and_then(|id| id.parse::<u32>().ok())
        .filter(|id| *id != 0)
        .ok_or(ParseError::Syntax)?;
    let name = fields.next().ok_or(ParseError::Syntax)?;
    if name == "SETTINGS_TOKEN" || name == "SETTINGS_TOKEN_ROTATE" {
        let replacement = if name == "SETTINGS_TOKEN_ROTATE" {
            let mut token = SettingsToken([0; 32]);
            decode_exact(fields.next(), &mut token.0)?;
            if token.0 == [0; 32] {
                return Err(ParseError::Configuration);
            }
            Some(token)
        } else {
            None
        };
        if fields.next().is_some() {
            return Err(ParseError::Syntax);
        }
        return Ok(LocalCommand::SettingsToken { id, replacement });
    }
    if !name.starts_with("PROVISION_") {
        return runtime_ingress::parse_line(line, scratch).map(LocalCommand::Runtime);
    }
    let command = if name == "PROVISION_BEGIN" {
        let mut nonce = [0; 16];
        decode_exact(fields.next(), &mut nonce)?;
        let length = fields
            .next()
            .and_then(|length| length.parse().ok())
            .ok_or(ParseError::Syntax)?;
        let mut sha256 = [0; 32];
        decode_exact(fields.next(), &mut sha256)?;
        if fields.next().is_some() {
            return Err(ParseError::Syntax);
        }
        Command::Begin {
            nonce,
            length,
            sha256,
        }
    } else {
        let owner = parse_owner(fields.next().ok_or(ParseError::Syntax)?)?;
        let result = (|| {
            let command = match name {
                "PROVISION_CHUNK" => {
                    let offset = fields
                        .next()
                        .and_then(|offset| offset.parse().ok())
                        .ok_or(ParseError::Syntax)?;
                    let hex = fields.next().ok_or(ParseError::Syntax)?;
                    let mut chunk = Chunk {
                        bytes: [0; CHUNK_BYTES],
                        len: hex.len() / 2,
                    };
                    if hex.is_empty() || chunk.len > CHUNK_BYTES {
                        return Err(ParseError::Syntax);
                    }
                    decode_exact(Some(hex), &mut chunk.bytes[..chunk.len])?;
                    Command::Chunk {
                        owner,
                        offset,
                        chunk,
                    }
                }
                "PROVISION_COMMIT" => Command::Commit(owner),
                "PROVISION_CANCEL" => Command::Cancel(owner),
                "PROVISION_STATUS" => Command::Status(owner),
                "PROVISION_REBOOT" => Command::Reboot(owner),
                _ => return Err(ParseError::Syntax),
            };
            if fields.next().is_some() {
                return Err(ParseError::Syntax);
            }
            Ok(command)
        })();
        result.unwrap_or(Command::Invalid(owner))
    };
    Ok(LocalCommand::Provision(Request { id, command }))
}
fn parse_owner(text: &str) -> Result<Owner, ParseError> {
    let (generation, nonce) = text.split_once(':').ok_or(ParseError::Syntax)?;
    let generation = generation
        .parse::<u64>()
        .ok()
        .filter(|generation| *generation != 0)
        .ok_or(ParseError::Syntax)?;
    let mut bytes = [0; 16];
    decode_exact(Some(nonce), &mut bytes)?;
    Ok(Owner {
        generation,
        nonce: bytes,
    })
}
fn decode_exact(text: Option<&str>, out: &mut [u8]) -> Result<(), ParseError> {
    let hex = text.ok_or(ParseError::Syntax)?.as_bytes();
    if hex.len() != out.len() * 2 {
        return Err(ParseError::Syntax);
    }
    for (byte, pair) in out.iter_mut().zip(hex.as_chunks::<2>().0) {
        *byte = digit(pair[0])? * 16 + digit(pair[1])?;
    }
    Ok(())
}
fn digit(byte: u8) -> Result<u8, ParseError> {
    match byte {
        b'0'..=b'9' => Ok(byte - b'0'),
        b'a'..=b'f' => Ok(byte - b'a' + 10),
        b'A'..=b'F' => Ok(byte - b'A' + 10),
        _ => Err(ParseError::Syntax),
    }
}

#[cfg(test)]
#[path = "provision_transfer_tests.rs"]
mod tests;
