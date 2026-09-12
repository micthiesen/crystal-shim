//! One immutable certificate horizon, tied to the control-accepted clock authority.
use super::*;
use crystal_shim_core::utc::{ClockAuthority, ClockSource};
use crystal_shim_core::utc_bounds::{ClockRateBound, UtcBounds};
use edge_nal_tls::mbedtls::{
    CertificateRejected, CertificateTime, CertificateValidity, CertificateVerifier,
};

/// Includes DNS, TCP, the full handshake and the complete HTTP response.
pub const OPERATION_MS: u64 = 20_000;

#[derive(Clone, Copy)]
struct Scope {
    id: u64,
    generation: u64,
    start: Millis,
    deadline: Millis,
    lower: CertificateTime,
    upper: CertificateTime,
    valid: bool,
}

#[derive(Clone, Copy)]
struct TrustState {
    published: Option<ClockAuthority>,
    anchor: Option<UtcAnchor>,
    high_generation: u64,
    source_epoch: Option<u64>,
    scope: Option<Scope>,
    next_scope: Option<u64>,
}
const EMPTY: TrustState = TrustState {
    published: None,
    anchor: None,
    high_generation: 0,
    source_epoch: Some(0),
    scope: None,
    next_scope: Some(1),
};
static STATE: Mutex<Cell<TrustState>> = Mutex::new(Cell::new(EMPTY));

fn state<R>(f: impl FnOnce(&mut TrustState) -> R) -> R {
    critical_section::with(|cs| {
        let mut value = STATE.borrow(cs).get();
        let result = f(&mut value);
        STATE.borrow(cs).set(value);
        result
    })
}

fn now() -> Option<Millis> {
    u64::try_from(TLS_TIMER.now()).ok().map(Millis)
}

impl TrustState {
    fn bounds(&mut self) -> Option<(Millis, UtcBounds)> {
        let mut anchor = self.anchor?;
        let value = now().and_then(|now| anchor.bounds_at(now).map(|bounds| (now, bounds)));
        // Only a failed bounded read invalidates the anchor. Refusing a scalar
        // view of a valid interval must never consume that interval.
        self.anchor = value.map(|_| anchor);
        value
    }

    fn source_matches(&self, authority: ClockAuthority) -> bool {
        match authority.source {
            ClockSource::Operator => true,
            ClockSource::Network { source_epoch } => self.source_epoch == Some(source_epoch),
        }
    }

    fn scope_checked(&mut self, id: u64) -> Option<Scope> {
        let mut scope = self.scope.filter(|scope| scope.id == id)?;
        let current = self.bounds();
        let authority = self.published;
        scope.valid &= current.is_some_and(|(now, _)| now >= scope.start && now < scope.deadline)
            && authority.is_some_and(|authority| {
                authority.generation == scope.generation && self.source_matches(authority)
            });
        self.scope = Some(scope);
        scope.valid.then_some(scope)
    }
}

/// Publish one atomic owner snapshot. The application calls this while holding
/// its clock mailbox lock, on both accepted-authority and source-policy changes.
/// Same-authority publication cannot revive an expired or rolled-back anchor.
pub fn publish_clock(authority: Option<ClockAuthority>, source_epoch: Option<u64>) {
    state(|state| {
        state.source_epoch = source_epoch;
        if state.published != authority {
            state.anchor = None;
            state.published = None;
            if let Some(authority) = authority {
                if authority.generation > state.high_generation {
                    state.high_generation = authority.generation;
                    state.published = Some(authority);
                    state.anchor = now().and_then(|now| UtcAnchor::new(authority.observation, now));
                }
            }
        }
        if state
            .published
            .is_some_and(|authority| !state.source_matches(authority))
        {
            state.anchor = None;
        }
        // Latch revocation now, even if no network future is currently polled.
        if let Some(scope) = state.scope {
            state.scope_checked(scope.id);
        }
    });
}

/// Scalar compatibility view. Valid uncertain anchors remain available to leases.
pub fn has_trusted_utc() -> bool {
    trusted_utc().is_some()
}

pub(super) fn trusted_utc() -> Option<UtcDateTime> {
    state(|state| {
        let (_, bounds) = state.bounds()?;
        let authority = state.published?;
        if authority.observation.rate() != ClockRateBound::EXACT || !state.source_matches(authority)
        {
            return None;
        }
        UtcDateTime::from_unix(crystal_shim_core::UtcSeconds(bounds.point()? / 1000))
    })
}

/// Interval-aware readiness without allocating a TLS session or reserving a scope.
pub fn has_trusted_bounds() -> bool {
    state(|state| {
        state.bounds().is_some()
            && state
                .published
                .is_some_and(|authority| state.source_matches(authority))
    })
}

pub(super) fn certificate_clock() -> Option<tm> {
    let scoped = state(|state| {
        state.scope.map(|scope| {
            state
                .scope_checked(scope.id)
                .and_then(|scope| valid_date(scope.lower).map(UtcDateTime::as_tm))
        })
    });
    // An invalid scoped operation must never fall back to a newer authority.
    scoped.unwrap_or_else(|| trusted_utc().map(UtcDateTime::as_tm))
}

/// Owns the sole scoped wall-clock override. Sessions borrow this object, which
/// keeps both date boundaries and the accepted generation alive until socket drop.
/// Dropping a pending handshake future alone is insufficient: drop its whole socket.
pub struct OperationLease {
    id: u64,
    start: Millis,
    deadline: Millis,
}

impl OperationLease {
    pub fn begin() -> Result<Self, ProviderError> {
        state(|state| {
            if state.scope.is_some() {
                return Err(ProviderError::OperationBusy);
            }
            let (start, initial) = state.bounds().ok_or(ProviderError::ClockUnavailable)?;
            let authority = state.published.ok_or(ProviderError::ClockUnavailable)?;
            if !state.source_matches(authority) {
                return Err(ProviderError::ClockUnavailable);
            }
            let deadline = Millis(
                start
                    .0
                    .checked_add(OPERATION_MS)
                    .ok_or(ProviderError::ClockUnavailable)?,
            );
            let final_bounds = authority
                .observation
                .bounds_at(deadline)
                .ok_or(ProviderError::ClockUnavailable)?;
            let horizon = UtcBounds::new(initial.earliest_ms(), final_bounds.latest_ms())
                .ok_or(ProviderError::ClockUnavailable)?;
            let (lower, upper) = horizon.outward_seconds();
            let lower = certificate_date(
                UtcDateTime::from_unix(crystal_shim_core::UtcSeconds(lower))
                    .ok_or(ProviderError::ClockUnavailable)?,
            );
            let upper = certificate_date(
                UtcDateTime::from_unix(crystal_shim_core::UtcSeconds(upper))
                    .ok_or(ProviderError::ClockUnavailable)?,
            );
            let id = state.next_scope.ok_or(ProviderError::ClockUnavailable)?;
            state.next_scope = id.checked_add(1);
            state.scope = Some(Scope {
                id,
                generation: authority.generation,
                start,
                deadline,
                lower,
                upper,
                valid: true,
            });
            Ok(Self {
                id,
                start,
                deadline,
            })
        })
    }

    pub fn check(&self) -> Result<(), ProviderError> {
        state(|state| {
            state
                .scope_checked(self.id)
                .map(|_| ())
                .ok_or(ProviderError::OperationRevoked)
        })
    }
    pub const fn started_at_ms(&self) -> u64 {
        self.start.0
    }
    pub const fn deadline_ms(&self) -> u64 {
        self.deadline.0
    }
}

impl CertificateVerifier for OperationLease {
    fn check(&self, certificate: CertificateValidity) -> Result<(), CertificateRejected> {
        state(|state| {
            let scope = state.scope_checked(self.id).ok_or(CertificateRejected)?;
            valid_date(certificate.not_before).ok_or(CertificateRejected)?;
            valid_date(certificate.not_after).ok_or(CertificateRejected)?;
            if certificate.not_before > certificate.not_after
                || certificate.not_before > scope.lower
                || certificate.not_after < scope.upper
            {
                Err(CertificateRejected)
            } else {
                Ok(())
            }
        })
    }
}

impl Drop for OperationLease {
    fn drop(&mut self) {
        state(|state| {
            if state.scope.is_some_and(|scope| scope.id == self.id) {
                state.scope = None;
            }
        });
    }
}

fn certificate_date(date: UtcDateTime) -> CertificateTime {
    CertificateTime {
        year: i32::from(date.year),
        month: i32::from(date.month),
        day: i32::from(date.day),
        hour: i32::from(date.hour),
        minute: i32::from(date.minute),
        second: i32::from(date.second),
    }
}
fn valid_date(date: CertificateTime) -> Option<UtcDateTime> {
    UtcDateTime::new(
        date.year.try_into().ok()?,
        date.month.try_into().ok()?,
        date.day.try_into().ok()?,
        date.hour.try_into().ok()?,
        date.minute.try_into().ok()?,
        date.second.try_into().ok()?,
    )
    .ok()
}

#[cfg(all(test, not(target_os = "none")))]
pub(super) fn test_observation(sample: Option<UtcObservation>) {
    let (authority, source_epoch) = state(|state| {
        (
            sample.map(|observation| ClockAuthority {
                observation,
                generation: state.high_generation.checked_add(1).unwrap(),
                source: ClockSource::Operator,
            }),
            state.source_epoch,
        )
    });
    publish_clock(authority, source_epoch);
}

#[cfg(all(test, not(target_os = "none")))]
pub(super) fn reset_for_test() {
    state(|state| *state = EMPTY);
}

#[cfg(all(test, not(target_os = "none")))]
#[path = "../../../tls-tests/src/operation_tests.rs"]
mod tests;
