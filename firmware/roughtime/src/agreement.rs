//! A single, caller-timed agreement round for both compiled provider identities.
//!
//! A signature proves a provider's claim. The additional agreement assumption is
//! that at least one accepted interval contains true UTC, including the security
//! of historical delegated keys still authorized by that provider's root. This
//! two-provider policy is not the draft's three-provider chained-query procedure.
//!
//! The caller supplies fresh CSPRNG nonces, a justified timer error bound and an
//! original absolute round deadline. There is no default drift or round duration.
//! App authority generations, networking, acquisition retries and adoption remain
//! caller-owned. A result is an agreement candidate, not an adopted clock.

use crate::{Error as VerifyError, Provider, Request, VerifiedResponse, REQUEST_FRAME_LEN};
use crystal_shim_core::{
    utc::UtcObservation,
    utc_bounds::{ClockRateBound, UtcBounds},
    Millis,
};

pub const MAX_HULL_MS: u64 = 20_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    InvalidDeadline,
    Timing,
    Deadline,
    DuplicateProvider,
    UnstartedProvider,
    ReusedNonce,
    Verification {
        provider: Provider,
        error: VerifyError,
    },
    Incomplete,
    NoOverlap,
    HullTooWide,
    TimeRange,
    Closed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Progress {
    Pending,
    Ready,
}

/// An immutable candidate at the latest original receive capture. Projection to
/// that capture retains the full hull; later consumption never renews its age.
#[derive(Debug, Eq, PartialEq)]
pub struct Agreement {
    observation: UtcObservation,
    projected: [UtcBounds; 2],
    captures: [u64; 2],
}
impl Agreement {
    pub const fn observation(&self) -> UtcObservation {
        self.observation
    }
    pub const fn projected(&self, provider: Provider) -> UtcBounds {
        self.projected[index(provider)]
    }
    pub const fn captured_at_ms(&self, provider: Provider) -> u64 {
        self.captures[index(provider)]
    }
    pub fn into_observation(self) -> UtcObservation {
        self.observation
    }
}

// A completed slot is reachable only through this round's actual verifier, never
// through a caller-constructed VerifiedResponse or a response from another round.
// Exactly two in-place slots avoid an allocator and bound the entire round.
#[allow(clippy::large_enum_variant)]
enum Slot {
    Empty,
    Requested(Request),
    Verified(VerifiedResponse),
}

pub struct AgreementRound {
    slots: [Slot; 2],
    nonces: [Option<[u8; 32]>; 2],
    started_at_ms: u64,
    deadline_ms: u64,
    last_now_ms: u64,
    rate: ClockRateBound,
    failed: bool,
    #[cfg(test)]
    test_roots: [Option<[u8; 32]>; 2],
}

const fn index(provider: Provider) -> usize {
    match provider {
        Provider::RoughtimeSe => 0,
        Provider::Int08h => 1,
    }
}

impl AgreementRound {
    /// Both times belong to the same monotonic timer. Capture start before any
    /// round work; deadline is immutable and must be finite in the core domain.
    pub fn new(started_at_ms: u64, deadline_ms: u64, rate: ClockRateBound) -> Result<Self, Error> {
        if started_at_ms >= deadline_ms || deadline_ms >= i64::MAX as u64 {
            return Err(Error::InvalidDeadline);
        }
        Ok(Self {
            slots: [Slot::Empty, Slot::Empty],
            nonces: [None, None],
            started_at_ms,
            deadline_ms,
            last_now_ms: started_at_ms,
            rate,
            failed: false,
            #[cfg(test)]
            test_roots: [None, None],
        })
    }

    fn fail<T>(&mut self, error: Error) -> Result<T, Error> {
        self.failed = true;
        self.slots = [Slot::Empty, Slot::Empty];
        Err(error)
    }

    fn check_now(&mut self, now: u64) -> Result<(), Error> {
        if self.failed {
            return Err(Error::Closed);
        }
        if now < self.last_now_ms || now >= i64::MAX as u64 {
            return self.fail(Error::Timing);
        }
        if now >= self.deadline_ms {
            return self.fail(Error::Deadline);
        }
        self.last_now_ms = now;
        Ok(())
    }

    /// Create this provider's only request. Capture its start before constructing
    /// or sending it. A retry requires a new round and new CSPRNG nonces.
    pub fn begin(
        &mut self,
        provider: Provider,
        nonce: [u8; 32],
        started_at_ms: u64,
    ) -> Result<&[u8; REQUEST_FRAME_LEN], Error> {
        self.check_now(started_at_ms)?;
        let at = index(provider);
        if !matches!(self.slots[at], Slot::Empty) {
            return self.fail(Error::DuplicateProvider);
        }
        if self.nonces.contains(&Some(nonce)) {
            return self.fail(Error::ReusedNonce);
        }
        self.nonces[at] = Some(nonce);
        self.slots[at] = Slot::Requested(Request::new(provider, nonce, started_at_ms));
        let Slot::Requested(request) = &self.slots[at] else {
            unreachable!("request was just installed")
        };
        Ok(request.bytes())
    }

    /// Verify a complete datagram internally. `received_at_ms` is the original
    /// receive capture, which can precede a previously processed response.
    /// `now` reads actual monotonic time before and after cryptographic work.
    pub fn receive(
        &mut self,
        provider: Provider,
        datagram: &[u8],
        received_at_ms: u64,
        mut now: impl FnMut() -> u64,
    ) -> Result<Progress, Error> {
        let entered_at = now();
        self.check_now(entered_at)?;
        let at = index(provider);
        let request = match core::mem::replace(&mut self.slots[at], Slot::Empty) {
            Slot::Requested(request) => request,
            Slot::Empty => return self.fail(Error::UnstartedProvider),
            Slot::Verified(_) => return self.fail(Error::DuplicateProvider),
        };
        let Some(elapsed) = received_at_ms.checked_sub(request.started_at_ms) else {
            return self.fail(Error::Timing);
        };
        if received_at_ms < self.started_at_ms || received_at_ms > entered_at {
            return self.fail(Error::Timing);
        }
        let Some((_, upper)) = self.rate.elapsed_bounds(elapsed) else {
            return self.fail(Error::Timing);
        };
        let mut completed_at = None;
        let capture_completion = || {
            let completed = now();
            completed_at = Some(completed);
            completed
        };
        #[cfg(not(test))]
        let result = request.verify(datagram, received_at_ms, upper, capture_completion);
        #[cfg(test)]
        let result = match self.test_roots[at] {
            Some(root) => {
                request.verify_with_key(datagram, received_at_ms, upper, capture_completion, &root)
            }
            None => request.verify(datagram, received_at_ms, upper, capture_completion),
        };
        if let Some(completed) = completed_at {
            self.check_now(completed)?;
        }
        let verified = match result {
            Ok(verified) => verified,
            Err(error) => return self.fail(Error::Verification { provider, error }),
        };
        self.slots[at] = Slot::Verified(verified);
        Ok(
            if self
                .slots
                .iter()
                .all(|slot| matches!(slot, Slot::Verified(_)))
            {
                Progress::Ready
            } else {
                Progress::Pending
            },
        )
    }

    /// Consume the round, requiring both providers. The final clock read occurs
    /// after interval work so an exactly-expired completion cannot return trust.
    pub fn finish(mut self, completion_now: impl FnOnce() -> u64) -> Result<Agreement, Error> {
        if self.failed {
            return Err(Error::Closed);
        }
        let mut responses = [None, None];
        for (at, slot) in self.slots.iter().enumerate() {
            let Slot::Verified(response) = slot else {
                return Err(Error::Incomplete);
            };
            responses[at] = Some(*response);
        }
        let responses = responses.map(|response| response.expect("both slots verified"));
        let captures = responses.map(|response| response.interval.captured_at_ms);
        let capture = captures[0].max(captures[1]);
        let mut projected = [UtcBounds::new(0, 0).expect("valid origin"); 2];
        for (at, response) in responses.into_iter().enumerate() {
            let bounds = UtcBounds::new(
                response.interval.earliest_unix_ms,
                response.interval.latest_unix_ms,
            )
            .ok_or(Error::TimeRange)?;
            projected[at] = bounds
                .project(capture - captures[at], self.rate)
                .ok_or(Error::TimeRange)?;
        }
        if projected[0].earliest_ms().max(projected[1].earliest_ms())
            > projected[0].latest_ms().min(projected[1].latest_ms())
        {
            return Err(Error::NoOverlap);
        }
        let hull = UtcBounds::new(
            projected[0].earliest_ms().min(projected[1].earliest_ms()),
            projected[0].latest_ms().max(projected[1].latest_ms()),
        )
        .ok_or(Error::TimeRange)?;
        if hull.latest_ms() - hull.earliest_ms() > MAX_HULL_MS {
            return Err(Error::HullTooWide);
        }
        let observation =
            UtcObservation::bounded(hull, Millis(capture), self.rate).ok_or(Error::TimeRange)?;
        let completed = completion_now();
        self.check_now(completed)?;
        // No adoption of an agreement that has already expired during dispatch.
        observation
            .bounds_at(Millis(completed))
            .ok_or(Error::Timing)?;
        Ok(Agreement {
            observation,
            projected,
            captures,
        })
    }
}

#[cfg(test)]
#[path = "agreement_tests.rs"]
mod tests;
