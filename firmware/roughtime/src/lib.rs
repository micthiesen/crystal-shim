#![no_std]
#![forbid(unsafe_code)]

//! Offline verification of one pinned draft-19 Roughtime response.
//!
//! No network, allocator, RNG, clock, storage or clock-adoption owner is created.
//! A valid signature authenticates a server's claim, not its accuracy. The caller
//! must supply fresh CSPRNG nonces, conservative transport timing and an authority
//! agreement policy before using an interval as trusted UTC.

mod wire;

use ed25519_dalek::{Signature, VerifyingKey};
use sha2::{Digest, Sha512};
use wire::{tag, wide, word, Message};

pub const VERSION: u32 = 0x8000_000c;
pub const FRAME_HEADER_LEN: usize = 12;
pub const REQUEST_MESSAGE_LEN: usize = 1024;
pub const REQUEST_FRAME_LEN: usize = FRAME_HEADER_LEN + REQUEST_MESSAGE_LEN;
/// Draft 19 forbids a UDP response larger than its request. The existing app's
/// 1232-byte TX / 1583-byte RX buffers therefore both accommodate this profile.
pub const MAX_RESPONSE_FRAME_LEN: usize = REQUEST_FRAME_LEN;
pub const MAX_ATTEMPT_MS: u64 = 2000;
/// Local usability limit, not a protocol limit. Both pinned services fit it.
pub const MAX_RADIUS_SECONDS: u32 = 5;
/// The current application's supported calendar ends at 9999-12-31T23:59:59.999Z.
pub const MAX_UNIX_MS: u64 = 253_402_300_799_999;

const CERT_CONTEXT: &[u8] = b"RoughTime v1 delegation signature\0";
const RESPONSE_CONTEXT: &[u8] = b"RoughTime v1 response signature\0";

/// Out-of-band public identities. No key in a response can replace these roots.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Provider {
    RoughtimeSe,
    Int08h,
}

impl Provider {
    pub const fn hostname(self) -> &'static str {
        match self {
            Self::RoughtimeSe => "roughtime.se",
            Self::Int08h => "roughtime.int08h.com",
        }
    }

    pub const fn port(self) -> u16 {
        2002
    }

    pub const fn public_key(self) -> [u8; 32] {
        match self {
            Self::RoughtimeSe => [
                0x4b, 0x70, 0x33, 0x7d, 0x92, 0x79, 0x0a, 0x34, 0x9d, 0x90, 0x9d, 0xb5, 0x64, 0x91,
                0x9b, 0xc6, 0xa7, 0x58, 0x3f, 0xf4, 0xa8, 0x13, 0xc7, 0xd7, 0x29, 0x8d, 0x3e, 0x6a,
                0x27, 0x2c, 0x7a, 0x12,
            ],
            Self::Int08h => [
                0x01, 0x6e, 0x6e, 0x02, 0x84, 0xd2, 0x4c, 0x37, 0xc6, 0xe4, 0xd7, 0xd8, 0xd5, 0xb4,
                0xe1, 0xd3, 0xc1, 0x94, 0x9c, 0xea, 0xa5, 0x45, 0xbf, 0x87, 0x56, 0x16, 0xc9, 0xdc,
                0xe0, 0xc9, 0xbe, 0xc1,
            ],
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Length,
    Frame,
    Tags,
    Offsets,
    MissingTag,
    Nonce,
    Type,
    Version,
    Signature,
    Delegation,
    Merkle,
    Radius,
    TimeRange,
    Timing,
    Deadline,
}

/// Bounds at the original response receive capture, inclusive and outward-rounded.
/// These cover the signed radius and caller-bounded request/response delay, but
/// must acquire additional drift bounds when projected to another capture.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Interval {
    pub earliest_unix_ms: u64,
    pub latest_unix_ms: u64,
    pub captured_at_ms: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct VerifiedResponse {
    pub provider: Provider,
    pub interval: Interval,
    pub midpoint_unix_seconds: u64,
    pub radius_seconds: u32,
}

/// One original request, consumed by verification to discourage accidental reuse.
/// The caller still owns nonce uniqueness across requests and boots. Do not derive
/// a nonce from an untrusted clock or reconstruct a request to accept an old reply.
pub struct Request {
    bytes: [u8; REQUEST_FRAME_LEN],
    provider: Provider,
    nonce: [u8; 32],
    started_at_ms: u64,
}

impl Request {
    /// Capture `started_at_ms` before constructing/sending this request. Supply
    /// 32 fresh CSPRNG bytes (or the draft's chained nonce construction).
    pub fn new(provider: Provider, nonce: [u8; 32], started_at_ms: u64) -> Self {
        let mut bytes = [0; REQUEST_FRAME_LEN];
        bytes[..8].copy_from_slice(b"ROUGHTIM");
        bytes[8..12].copy_from_slice(&(REQUEST_MESSAGE_LEN as u32).to_le_bytes());
        let body = &mut bytes[12..];
        body[..4].copy_from_slice(&5u32.to_le_bytes());
        for (index, offset) in [4u32, 36, 68, 72].into_iter().enumerate() {
            body[4 + index * 4..8 + index * 4].copy_from_slice(&offset.to_le_bytes());
        }
        for (index, key) in [b"VER\0", b"SRV\0", b"NONC", b"TYPE", b"ZZZZ"]
            .into_iter()
            .enumerate()
        {
            body[20 + index * 4..24 + index * 4].copy_from_slice(key);
        }
        body[40..44].copy_from_slice(&VERSION.to_le_bytes());
        body[44..76].copy_from_slice(&hash(&[&[0xff], &provider.public_key()]));
        body[76..108].copy_from_slice(&nonce);
        // TYPE=0 and all 912 ZZZZ padding bytes were initialized above.
        Self {
            bytes,
            provider,
            nonce,
            started_at_ms,
        }
    }

    pub fn bytes(&self) -> &[u8; REQUEST_FRAME_LEN] {
        &self.bytes
    }

    /// Authenticate a whole UDP datagram. `received_at_ms` is captured immediately
    /// at receipt; `elapsed_upper_ms` must conservatively bound actual elapsed time
    /// from the original start to receipt, including timer quantization and drift.
    /// It cannot be less than the measured elapsed time or reach two seconds.
    /// No hardware accuracy is assumed or supplied by this crate.
    ///
    /// `completion_now` reads the same monotonic source AFTER verification. It
    /// rejects a result completed at/after the original two-second deadline even
    /// if a work-first async timeout would have returned Ready first. The result
    /// keeps the receive capture, never this later completion instant. Source and
    /// operator generation validation across awaits remains the caller's duty.
    pub fn verify(
        self,
        response: &[u8],
        received_at_ms: u64,
        elapsed_upper_ms: u64,
        completion_now: impl FnOnce() -> u64,
    ) -> Result<VerifiedResponse, Error> {
        self.verify_with_key(
            response,
            received_at_ms,
            elapsed_upper_ms,
            completion_now,
            &self.provider.public_key(),
        )
    }

    fn verify_with_key(
        &self,
        response: &[u8],
        received_at_ms: u64,
        elapsed_upper_ms: u64,
        completion_now: impl FnOnce() -> u64,
        root_key: &[u8; 32],
    ) -> Result<VerifiedResponse, Error> {
        let elapsed = received_at_ms
            .checked_sub(self.started_at_ms)
            .ok_or(Error::Timing)?;
        if elapsed_upper_ms < elapsed {
            return Err(Error::Timing);
        }
        if elapsed_upper_ms >= MAX_ATTEMPT_MS {
            return Err(Error::Deadline);
        }
        let reply = frame(response)?;
        if reply.get(tag(b"NONC"))? != self.nonce {
            return Err(Error::Nonce);
        }
        if word(reply.get(tag(b"TYPE"))?)? != 1 {
            return Err(Error::Type);
        }
        let certificate = Message::parse(reply.get(tag(b"CERT"))?)?;
        let delegation_bytes = certificate.get(tag(b"DELE"))?;
        let delegation = Message::parse(delegation_bytes)?;
        let signed_bytes = reply.get(tag(b"SREP"))?;
        let signed = Message::parse(signed_bytes)?;
        if word(signed.get(tag(b"VER\0"))?)? != VERSION {
            return Err(Error::Version);
        }
        versions(signed.get(tag(b"VERS"))?)?;
        let midpoint = wide(signed.get(tag(b"MIDP"))?)?;
        let radius = word(signed.get(tag(b"RADI"))?)?;
        if radius == 0 || radius > MAX_RADIUS_SECONDS {
            return Err(Error::Radius);
        }
        let mint = wide(delegation.get(tag(b"MINT"))?)?;
        let maxt = wide(delegation.get(tag(b"MAXT"))?)?;
        // Delegation endpoints remain full u64 seconds: MAXT=u64::MAX is valid.
        if midpoint < mint || midpoint > maxt || mint > maxt {
            return Err(Error::Delegation);
        }
        signature(
            root_key,
            certificate.get(tag(b"SIG\0"))?,
            CERT_CONTEXT,
            delegation_bytes,
        )?;
        let delegated_key = delegation
            .get(tag(b"PUBK"))?
            .try_into()
            .map_err(|_| Error::Length)?;
        signature(
            delegated_key,
            reply.get(tag(b"SIG\0"))?,
            RESPONSE_CONTEXT,
            signed_bytes,
        )?;
        merkle(&self.bytes, &reply, signed.get(tag(b"ROOT"))?)?;
        let earliest = midpoint
            .checked_sub(u64::from(radius))
            .and_then(|time| time.checked_mul(1000))
            .ok_or(Error::TimeRange)?;
        let latest = midpoint
            .checked_add(u64::from(radius))
            .and_then(|time| time.checked_mul(1000))
            .and_then(|time| time.checked_add(elapsed_upper_ms))
            .ok_or(Error::TimeRange)?;
        if latest > MAX_UNIX_MS {
            return Err(Error::TimeRange);
        }
        let completed_at_ms = completion_now();
        let complete_elapsed = completed_at_ms
            .checked_sub(self.started_at_ms)
            .ok_or(Error::Timing)?;
        if completed_at_ms < received_at_ms {
            return Err(Error::Timing);
        }
        if complete_elapsed >= MAX_ATTEMPT_MS {
            return Err(Error::Deadline);
        }
        Ok(VerifiedResponse {
            provider: self.provider,
            interval: Interval {
                earliest_unix_ms: earliest,
                latest_unix_ms: latest,
                captured_at_ms: received_at_ms,
            },
            midpoint_unix_seconds: midpoint,
            radius_seconds: radius,
        })
    }
}

fn frame(bytes: &[u8]) -> Result<Message<'_>, Error> {
    if bytes.len() < FRAME_HEADER_LEN || bytes.len() > MAX_RESPONSE_FRAME_LEN {
        return Err(Error::Length);
    }
    if &bytes[..8] != b"ROUGHTIM" || word(&bytes[8..12])? as usize != bytes.len() - 12 {
        return Err(Error::Frame);
    }
    Message::parse(&bytes[12..])
}

fn versions(bytes: &[u8]) -> Result<(), Error> {
    if bytes.is_empty() || bytes.len() > 32 * 4 || !bytes.len().is_multiple_of(4) {
        return Err(Error::Version);
    }
    let mut previous = None;
    let mut selected = false;
    for encoded in bytes.as_chunks::<4>().0 {
        let version = word(encoded)?;
        if previous.is_some_and(|previous| previous >= version) {
            return Err(Error::Version);
        }
        selected |= version == VERSION;
        previous = Some(version);
    }
    if selected {
        Ok(())
    } else {
        Err(Error::Version)
    }
}

fn hash(parts: &[&[u8]]) -> [u8; 32] {
    let mut state = Sha512::new();
    for bytes in parts {
        state.update(bytes);
    }
    state.finalize()[..32].try_into().unwrap()
}

fn signature(key: &[u8; 32], sig: &[u8], context: &[u8], message: &[u8]) -> Result<(), Error> {
    let sig = Signature::from_bytes(sig.try_into().map_err(|_| Error::Length)?);
    let key = VerifyingKey::from_bytes(key).map_err(|_| Error::Signature)?;
    // Bounded concatenation for ordinary Ed25519, not the incompatible Ed25519ph.
    // All signed bodies come from the single <=1024-byte response message.
    let mut buffer = [0; REQUEST_MESSAGE_LEN + CERT_CONTEXT.len()];
    let end = context.len() + message.len();
    if end > buffer.len() {
        return Err(Error::Length);
    }
    buffer[..context.len()].copy_from_slice(context);
    buffer[context.len()..end].copy_from_slice(message);
    key.verify_strict(&buffer[..end], &sig)
        .map_err(|_| Error::Signature)
}

fn merkle(request: &[u8], reply: &Message<'_>, root: &[u8]) -> Result<(), Error> {
    if root.len() != 32 {
        return Err(Error::Length);
    }
    let path = reply.get(tag(b"PATH"))?;
    if !path.len().is_multiple_of(32) || path.len() > 32 * 32 {
        return Err(Error::Merkle);
    }
    let mut index = word(reply.get(tag(b"INDX"))?)?;
    let mut node = hash(&[&[0], request]);
    for sibling in path.as_chunks::<32>().0 {
        node = if index & 1 == 0 {
            hash(&[&[1], &node, sibling])
        } else {
            hash(&[&[1], sibling, &node])
        };
        index >>= 1;
    }
    if index != 0 || node != root {
        Err(Error::Merkle)
    } else {
        Ok(())
    }
}

#[cfg(test)]
extern crate std;
#[cfg(test)]
mod tests;
