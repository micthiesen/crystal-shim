//! Host-only, stop-and-wait protocol. No transcript, credentials in errors, or time knobs.
use super::files::Bytes;
use crystal_shim_core::runtime::Error as ControlError;
use crystal_shim_matter::{
    on_off::BridgeError,
    provision_transfer::{Error, Owner, Progress, Response, ADMISSION_MS, CHUNK_BYTES, TOTAL_MS},
    provisioning::MAX_BYTES,
    storage::{InstallError, InstallOutcome},
};
use sha2::{Digest, Sha256};
use std::io::Write;

const ACK_MS: u64 = 1_000;
const STATUS_MS: u64 = 1_000;
// Leave a margin before the device's total staging deadline. These are not CLI options.
const TRANSFER_MS: u64 = TOTAL_MS - 1_000;
const LINE_BYTES: usize = 1_024;

pub trait Stream {
    fn now_ms(&self) -> u64;
    fn write(&mut self, bytes: &[u8], deadline_ms: u64) -> Result<(), ()>;
    /// None means the absolute deadline expired. Implementations must not echo data.
    fn read(&mut self, deadline_ms: u64) -> Result<Option<u8>, ()>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Failure {
    Transport,
    Timeout,
    Protocol,
    Rejected(Error),
    CommitUncertain,
    RebootUncertain,
}
impl Failure {
    pub fn message(self) -> &'static str {
        match self {
            Self::Transport => "serial I/O failed before commit; no verified installation; maintenance may remain active",
            Self::Timeout => "transfer timed out before commit; no verified installation; maintenance may remain active",
            Self::Protocol => "unexpected provisioning reply; no verified installation; maintenance may remain active",
            Self::Rejected(Error::Store(InstallError::Conflict)) => "device has a different record; it was not replaced",
            Self::Rejected(_) => "device rejected provisioning; no verified installation; maintenance may remain active",
            Self::CommitUncertain => "commit outcome is uncertain; leave maintenance active and retry the identical private record to obtain verified readback",
            Self::RebootUncertain => "installation verified, but reboot acknowledgement is unconfirmed; do not assume activation; retry the identical record with --reboot if activation is intended",
        }
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Success {
    pub outcome: InstallOutcome,
    /// Fresh writer acknowledgement, not proof that a physical reboot completed.
    pub reboot_acknowledged: bool,
}

struct Client<'a, S> {
    io: &'a mut S,
    next_id: u32,
    owner: Option<Owner>,
    nonce: [u8; 16],
    deadline: u64,
    line: Bytes,
    overflow: bool,
}
impl<S: Stream> Client<'_, S> {
    fn until(&self, duration: u64) -> u64 {
        self.io.now_ms().saturating_add(duration).min(self.deadline)
    }
    fn id(&mut self) -> u32 {
        let id = self.next_id;
        self.next_id += 1; // At most 2 commands/chunk and a bounded number of STATUS requests.
        id
    }
    fn write(&mut self, bytes: &[u8]) -> Result<(), Failure> {
        if self.io.now_ms() >= self.deadline {
            return Err(Failure::Timeout);
        }
        self.io
            .write(bytes, self.until(ACK_MS))
            .map_err(|_| Failure::Transport)
    }
    fn command(&mut self, command: &str) -> Result<u32, Failure> {
        let id = self.id();
        let owner = self.owner.ok_or(Failure::Protocol)?;
        self.write(format!("{id} {command} {owner}\n").as_bytes())?;
        Ok(id)
    }
    fn response(&mut self, id: u32, deadline: u64) -> Result<Option<Progress>, Failure> {
        while self.io.now_ms() < deadline {
            let Some(byte) = self.io.read(deadline).map_err(|_| Failure::Transport)? else {
                return Ok(None);
            };
            if byte != b'\n' {
                if self.line.0.len() < LINE_BYTES && !self.overflow {
                    self.line.0.push(byte);
                } else {
                    crystal_shim_matter::provision_transfer::clear_input(&mut self.line.0);
                    self.line.0.clear();
                    self.overflow = true;
                }
                continue;
            }
            let parsed = (!self.overflow)
                .then(|| parse_response(&self.line.0))
                .flatten();
            crystal_shim_matter::provision_transfer::clear_input(&mut self.line.0);
            self.line.0.clear();
            self.overflow = false;
            let Some(reply) = parsed else { continue };
            if reply.id != id {
                continue;
            }
            if let Some(owner) = self.owner {
                if reply.owner != Some(owner) {
                    continue;
                }
            } else {
                // An immediate BEGIN rejection can carry no owner or the busy
                // transfer's owner. It cannot grant ownership or installation.
                if let Err(error) = reply.result {
                    return Err(Failure::Rejected(error));
                }
                let Some(owner) = reply.owner.filter(|owner| owner.nonce == self.nonce) else {
                    continue;
                };
                self.owner = Some(owner);
            }
            return reply.result.map(Some).map_err(Failure::Rejected);
        }
        Ok(None)
    }
    fn status(&mut self) -> Result<Progress, Failure> {
        let id = self.command("PROVISION_STATUS")?;
        self.response(id, self.until(STATUS_MS))?
            .ok_or(Failure::Timeout)
    }
    fn chunks(&mut self, bytes: &[u8]) -> Result<(), Failure> {
        for (index, chunk) in bytes.chunks(CHUNK_BYTES).enumerate() {
            let offset = index * CHUNK_BYTES;
            let expected = offset + chunk.len();
            let mut accepted = false;
            for _ in 0..2 {
                let id = self.id();
                let mut command = Bytes(Vec::with_capacity(640));
                write!(
                    command.0,
                    "{id} PROVISION_CHUNK {} {offset} ",
                    self.owner.unwrap()
                )
                .unwrap();
                for byte in chunk {
                    write!(command.0, "{byte:02x}").unwrap();
                }
                command.0.push(b'\n');
                self.write(&command.0)?;
                let progress = match self.response(id, self.until(ACK_MS))? {
                    Some(progress) => progress,
                    None => self.status()?,
                };
                match progress {
                    Progress::Next(next) if next == expected => {
                        accepted = true;
                        break;
                    }
                    // Only an ordered STATUS proving the unchanged offset can
                    // permit another write. A direct stale ACK never permits it.
                    Progress::Next(next) if next == offset => {
                        if self.status()? != Progress::Next(offset) {
                            return Err(Failure::Protocol);
                        }
                    }
                    _ => return Err(Failure::Protocol),
                }
            }
            if !accepted {
                return Err(Failure::Timeout);
            }
        }
        Ok(())
    }
    fn commit(&mut self, length: usize) -> Result<InstallOutcome, Failure> {
        for _ in 0..2 {
            let id = self
                .command("PROVISION_COMMIT")
                .map_err(|_| Failure::CommitUncertain)?;
            // Storage may still complete after the host stops waiting. All
            // receipt recovery here remains within the fixed exchange deadline.
            let progress = match self.response(id, self.until(2_000)) {
                Ok(Some(progress)) => progress,
                Err(Failure::Rejected(Error::Store(InstallError::Conflict))) => {
                    return Err(Failure::Rejected(Error::Store(InstallError::Conflict)))
                }
                Ok(None) => self.status().map_err(|_| Failure::CommitUncertain)?,
                Err(_) => return Err(Failure::CommitUncertain),
            };
            match progress {
                Progress::Complete(outcome) => return Ok(outcome),
                Progress::Next(next) if next == length => {
                    if self.status().map_err(|_| Failure::CommitUncertain)?
                        != Progress::Next(length)
                    {
                        return Err(Failure::CommitUncertain);
                    }
                }
                _ => return Err(Failure::CommitUncertain),
            }
        }
        Err(Failure::CommitUncertain)
    }
}

/// The caller must finish offline trust validation of THESE bytes before opening
/// the stream. This function never reloads a file, creates credentials, or logs.
pub fn send(
    io: &mut impl Stream,
    bytes: &[u8],
    nonce: [u8; 16],
    reboot: bool,
) -> Result<Success, Failure> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES || nonce == [0; 16] {
        return Err(Failure::Protocol);
    }
    let deadline = io.now_ms().saturating_add(TRANSFER_MS);
    let mut client = Client {
        io,
        next_id: 1,
        owner: None,
        nonce,
        deadline,
        line: Bytes(Vec::with_capacity(LINE_BYTES)),
        overflow: false,
    };
    let id = client.id();
    let digest = Sha256::digest(bytes);
    let nonce_hex: String = nonce.iter().map(|byte| format!("{byte:02x}")).collect();
    let digest_hex: String = digest.iter().map(|byte| format!("{byte:02x}")).collect();
    client.write(
        format!(
            "{id} PROVISION_BEGIN {nonce_hex} {} {digest_hex}\n",
            bytes.len()
        )
        .as_bytes(),
    )?;
    let precommit = (|| {
        let admission = client.until(ADMISSION_MS + 250);
        loop {
            match client.response(id, admission)? {
                Some(Progress::Pending) => (),
                Some(Progress::Ready(0)) => break,
                Some(_) => return Err(Failure::Protocol),
                None => return Err(Failure::Timeout),
            }
        }
        client.chunks(bytes)
    })();
    if let Err(error) = precommit {
        // Best effort, using only the acquired owner; never EXIT maintenance.
        // A partial transport write may leave framing uncertain, so do not append
        // another command on a failed stream. The writer's idle expiry clears it.
        if error != Failure::Transport && client.owner.is_some() {
            let _ = client.command("PROVISION_CANCEL");
        }
        return Err(error);
    }
    let outcome = client.commit(bytes.len())?;
    if reboot {
        client.deadline = client.io.now_ms().saturating_add(ADMISSION_MS + 250);
        let id = client
            .command("PROVISION_REBOOT")
            .map_err(|_| Failure::RebootUncertain)?;
        loop {
            match client
                .response(id, client.deadline)
                .map_err(|_| Failure::RebootUncertain)?
            {
                Some(Progress::Pending) => (),
                Some(Progress::Rebooting) => break,
                _ => return Err(Failure::RebootUncertain),
            }
        }
    }
    Ok(Success {
        outcome,
        reboot_acknowledged: reboot,
    })
}

fn decimal<T: std::str::FromStr + std::fmt::Display>(text: &str) -> Option<T> {
    let number = text.parse::<T>().ok()?;
    (number.to_string() == text).then_some(number)
}
fn parse_response(bytes: &[u8]) -> Option<Response> {
    let text = std::str::from_utf8(bytes)
        .ok()?
        .strip_suffix('\r')
        .unwrap_or(std::str::from_utf8(bytes).ok()?);
    let mut fields = text.splitn(4, ' ');
    if fields.next()? != "PROVISION" {
        return None;
    }
    let id = decimal::<u32>(fields.next()?).filter(|id| *id != 0)?;
    let token = fields.next()?;
    let owner = if token == "-" {
        None
    } else {
        let (generation, hex) = token.split_once(':')?;
        let generation = decimal::<u64>(generation).filter(|g| *g != 0)?;
        if hex.len() != 32
            || !hex
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return None;
        }
        let mut nonce = [0; 16];
        for (n, pair) in nonce.iter_mut().zip(hex.as_bytes().as_chunks::<2>().0) {
            *n = u8::from_str_radix(std::str::from_utf8(pair).ok()?, 16).ok()?;
        }
        if nonce == [0; 16] {
            return None;
        }
        Some(Owner { generation, nonce })
    };
    let payload = fields.next()?;
    let result = if let Some(body) = payload
        .strip_prefix("Ok(")
        .and_then(|s| s.strip_suffix(')'))
    {
        Ok(match body {
            "Pending" => Progress::Pending,
            "Cancelled" => Progress::Cancelled,
            "Rebooting" => Progress::Rebooting,
            "Complete(StoredVerified)" => Progress::Complete(InstallOutcome::StoredVerified),
            "Complete(AlreadyPresentVerified)" => {
                Progress::Complete(InstallOutcome::AlreadyPresentVerified)
            }
            _ => {
                let (name, count) = body.split_once('(')?;
                let count =
                    decimal::<usize>(count.strip_suffix(')')?).filter(|n| *n <= MAX_BYTES)?;
                match name {
                    "Ready" => Progress::Ready(count),
                    "Next" => Progress::Next(count),
                    _ => return None,
                }
            }
        })
    } else {
        let body = payload.strip_prefix("Err(")?.strip_suffix(')')?;
        let simple = [
            Error::Busy,
            Error::NotReady,
            Error::Unconfigured,
            Error::Exhausted,
            Error::StaleToken,
            Error::Timeout,
            Error::Malformed,
            Error::Length,
            Error::Offset,
            Error::Integrity,
            Error::InvalidRecord,
            Error::MaintenanceNotDurable,
            Error::Store(InstallError::InvalidRecord),
            Error::Store(InstallError::Conflict),
            Error::Store(InstallError::Storage),
            Error::Store(InstallError::Verification),
            Error::Control(BridgeError::Busy),
            Error::Control(BridgeError::NotReady),
            Error::Control(BridgeError::Timeout),
        ];
        let control = [
            ControlError::Busy,
            ControlError::Unconfigured,
            ControlError::Revision,
            ControlError::RecoveryRequired,
            ControlError::Storage,
            ControlError::Superseded,
            ControlError::InvalidTime,
            ControlError::Exhausted,
            ControlError::Rejected,
        ];
        Err(simple
            .into_iter()
            .chain(control.map(|e| Error::Control(BridgeError::Control(e))))
            .find(|error| format!("{error:?}") == body)?)
    };
    Some(Response { id, owner, result })
}

#[cfg(test)]
#[path = "sender_tests.rs"]
mod tests;
