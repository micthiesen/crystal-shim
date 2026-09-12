//! Fresh UTC observations, never a persisted or repeatedly republished wall clock.
use crate::utc_bounds::{ClockRateBound, UtcBounds};
use crate::{Millis, UtcSeconds};

pub const MAX_AGE_MS: u64 = 3_600_000;
pub const MAX_UNIX_MS: u64 = 253_402_300_799_999; // 9999-12-31T23:59:59.999Z
const MATTER_EPOCH_MS: u64 = 946_684_800_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UtcObservation {
    bounds: UtcBounds,
    captured_at: Millis,
    rate: ClockRateBound,
}
impl UtcObservation {
    pub const fn new(unix_ms: u64, captured_at: Millis) -> Option<Self> {
        let Some(bounds) = UtcBounds::new(unix_ms, unix_ms) else {
            return None;
        };
        Self::bounded(bounds, captured_at, ClockRateBound::EXACT)
    }
    /// The caller supplies authenticated bounds at the original capture and an
    /// explicit timer error model. This does not establish a source's accuracy.
    pub const fn bounded(
        bounds: UtcBounds,
        captured_at: Millis,
        rate: ClockRateBound,
    ) -> Option<Self> {
        if captured_at.0 >= i64::MAX as u64 {
            None
        } else {
            Some(Self {
                bounds,
                captured_at,
                rate,
            })
        }
    }
    pub fn from_seconds(utc: UtcSeconds, captured_at: Millis) -> Option<Self> {
        Self::new(utc.0.checked_mul(1_000)?, captured_at)
    }
    pub fn from_matter_micros(utc: u64, captured_at: Millis) -> Option<Self> {
        Self::new((utc / 1_000).checked_add(MATTER_EPOCH_MS)?, captured_at)
    }
    pub const fn captured_at(self) -> Millis {
        self.captured_at
    }
    pub const fn bounds(self) -> UtcBounds {
        self.bounds
    }
    pub const fn rate(self) -> ClockRateBound {
        self.rate
    }
    /// Legacy scalar access deliberately refuses uncertain observations. TLS
    /// cannot silently substitute an endpoint for two-boundary verification.
    pub fn at(self, now: Millis) -> Option<u64> {
        if self.rate != ClockRateBound::EXACT {
            return None;
        }
        self.bounds_at(now)?.point()
    }
    pub fn bounds_at(self, now: Millis) -> Option<UtcBounds> {
        if now.0 >= i64::MAX as u64 {
            return None;
        }
        let age = now.0.checked_sub(self.captured_at.0)?;
        let (_, upper_age) = self.rate.elapsed_bounds(age)?;
        if upper_age >= MAX_AGE_MS {
            return None;
        }
        self.bounds.project(age, self.rate)
    }
}

/// Mutable reads latch timer rollback/loss until a genuinely new observation.
#[derive(Clone, Copy, Debug)]
pub struct UtcAnchor {
    observation: Option<UtcObservation>,
    last_read: Millis,
}
impl UtcAnchor {
    pub fn new(observation: UtcObservation, now: Millis) -> Option<Self> {
        observation.bounds_at(now)?;
        Some(Self {
            observation: Some(observation),
            last_read: now,
        })
    }
    pub fn at(&mut self, now: Millis) -> Option<UtcSeconds> {
        let rate = self.observation?.rate;
        let value = self.bounds_at(now)?;
        (rate == ClockRateBound::EXACT).then_some(())?;
        value.point().map(|value| UtcSeconds(value / 1_000))
    }
    pub fn bounds_at(&mut self, now: Millis) -> Option<UtcBounds> {
        let value = (now >= self.last_read)
            .then_some(())
            .and_then(|()| self.observation?.bounds_at(now));
        self.last_read = now;
        if value.is_none() {
            self.observation = None;
        }
        value
    }
    pub const fn observation(self) -> Option<UtcObservation> {
        self.observation
    }
}

/// Revocation is retained separately: a later sample cannot hide a lost source.
#[derive(Clone, Copy, Debug, Default)]
pub struct ClockUpdate {
    pub revoke_network: bool,
    pub sample: Option<UtcObservation>,
}

/// Outcome from a bounded authenticated read; transport loss cannot renew age.
#[derive(Clone, Copy, Debug)]
pub enum ReadResult {
    Fresh {
        matter_micros: u64,
        captured_at: Millis,
    },
    Unavailable,
    TransportFailure,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Attempt<S> {
    generation: u64,
    source: S,
}

/// One producer/consumer mailbox; generations also cancel already-awaited work.
#[derive(Clone, Copy, Debug)]
pub struct ClockMailbox<S> {
    source: Option<S>,
    generation: u64,
    exhausted: bool,
    pending: ClockUpdate,
}
impl<S: Copy + Eq> Default for ClockMailbox<S> {
    fn default() -> Self {
        Self::new()
    }
}
impl<S: Copy + Eq> ClockMailbox<S> {
    pub const fn new() -> Self {
        Self {
            source: None,
            generation: 0,
            exhausted: false,
            pending: ClockUpdate {
                revoke_network: false,
                sample: None,
            },
        }
    }
    fn invalidate(&mut self) {
        self.pending.sample = None;
        match self.generation.checked_add(1) {
            Some(value) => self.generation = value,
            None => {
                self.exhausted = true;
                self.pending.revoke_network = true;
            }
        }
    }
    pub fn set_source(&mut self, source: Option<S>) {
        if source != self.source {
            self.invalidate();
            self.source = source;
            self.pending.revoke_network = true;
        }
    }
    /// A source policy mutation observed by the existing storage owner. This also
    /// catches source A -> B -> A between network-service polls.
    pub fn source_changed(&mut self) {
        self.invalidate();
        self.pending.revoke_network = true;
    }
    /// Called only when an explicit operator clock command enters the command slot.
    pub fn operator_command(&mut self) {
        self.invalidate();
    }
    pub fn begin(&self) -> Option<Attempt<S>> {
        (!self.exhausted).then_some(Attempt {
            generation: self.generation,
            source: self.source?,
        })
    }
    fn matches(&self, attempt: Attempt<S>) -> bool {
        !self.exhausted
            && self.generation == attempt.generation
            && self.source == Some(attempt.source)
    }
    pub fn offer(&mut self, attempt: Attempt<S>, sample: UtcObservation, now: Millis) -> bool {
        if !self.matches(attempt) || sample.bounds_at(now).is_none() {
            return false;
        }
        self.invalidate(); // consume this attempt, rejecting duplicate/late responses
        if self.exhausted {
            return false;
        }
        self.pending.sample = Some(sample);
        true
    }
    /// A null/invalid response explicitly withdraws this source's current time.
    pub fn reject(&mut self, attempt: Attempt<S>) {
        if self.matches(attempt) {
            self.invalidate();
            self.pending.revoke_network = true;
        }
    }
    pub fn finish(&mut self, attempt: Attempt<S>, result: ReadResult, now: Millis) -> bool {
        match result {
            ReadResult::Fresh {
                matter_micros,
                captured_at,
            } => match UtcObservation::from_matter_micros(matter_micros, captured_at) {
                Some(sample) if sample.bounds_at(now).is_some() => self.offer(attempt, sample, now),
                _ => {
                    self.reject(attempt);
                    false
                }
            },
            ReadResult::Unavailable => {
                self.reject(attempt);
                false
            }
            ReadResult::TransportFailure => {
                if self.matches(attempt) {
                    self.invalidate();
                }
                false
            }
        }
    }
    pub fn take(&mut self) -> ClockUpdate {
        core::mem::take(&mut self.pending)
    }
}

/// Constant-time Gregorian conversion; no loop proportional to a supplied year.
pub fn calendar(utc: UtcSeconds) -> Option<(u16, u8, u8, u8, u8, u8)> {
    if utc.0 > MAX_UNIX_MS / 1_000 {
        return None;
    }
    // Howard Hinnant's civil-from-days algorithm, shifted to the Unix epoch.
    let z = utc.0 / 86_400 + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    Some((
        (year + u64::from(month <= 2)) as u16,
        month as u8,
        day as u8,
        (utc.0 / 3_600 % 24) as u8,
        (utc.0 / 60 % 60) as u8,
        (utc.0 % 60) as u8,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample(at: u64) -> UtcObservation {
        UtcObservation::new(1_000_999, Millis(at)).unwrap()
    }
    #[test]
    fn original_capture_fraction_expiry_and_timer_failures() {
        let mut anchor = UtcAnchor::new(sample(100), Millis(800)).unwrap();
        assert_eq!(anchor.at(Millis(801)), Some(UtcSeconds(1_001)));
        assert!(anchor.at(Millis(100 + MAX_AGE_MS - 1)).is_some());
        assert!(anchor.at(Millis(100 + MAX_AGE_MS)).is_none());
        assert!(anchor.at(Millis(100)).is_none());
        assert!(UtcAnchor::new(sample(100), Millis(99)).is_none());
        for bad in [99, i64::MAX as u64, u64::MAX] {
            let mut anchor = UtcAnchor::new(sample(100), Millis(200)).unwrap();
            assert!(anchor.at(Millis(bad)).is_none());
            assert!(anchor.at(Millis(201)).is_none());
        }
    }
    #[test]
    fn epochs_and_calendar_limits() {
        let epoch = UtcObservation::from_matter_micros(999, Millis(0)).unwrap();
        assert_eq!(
            calendar(epoch.at(Millis(0)).map(|v| UtcSeconds(v / 1_000)).unwrap()),
            Some((2000, 1, 1, 0, 0, 0))
        );
        assert_eq!(calendar(UtcSeconds(0)), Some((1970, 1, 1, 0, 0, 0)));
        assert_eq!(
            calendar(UtcSeconds(1_709_251_199)),
            Some((2024, 2, 29, 23, 59, 59))
        );
        assert_eq!(
            calendar(UtcSeconds(2_085_978_496)),
            Some((2036, 2, 7, 6, 28, 16))
        );
        assert_eq!(
            calendar(UtcSeconds(MAX_UNIX_MS / 1_000)),
            Some((9999, 12, 31, 23, 59, 59))
        );
        assert!(UtcObservation::new(MAX_UNIX_MS + 1, Millis(0)).is_none());
        assert!(UtcObservation::from_matter_micros(u64::MAX, Millis(0)).is_none());
        assert!(UtcObservation::from_seconds(UtcSeconds(u64::MAX), Millis(0)).is_none());
        assert!(UtcObservation::new(MAX_UNIX_MS, Millis(0))
            .unwrap()
            .at(Millis(1))
            .is_none());
    }
    #[test]
    fn source_and_operator_generations_reject_old_work_and_preserve_revocation() {
        let mut mailbox = ClockMailbox::new();
        assert!(mailbox.begin().is_none());
        mailbox.set_source(Some(1));
        let old = mailbox.begin().unwrap();
        mailbox.set_source(Some(2));
        mailbox.set_source(Some(1)); // source ABA still invalidates the old await
        assert!(!mailbox.offer(old, sample(0), Millis(0)));
        let before_policy = mailbox.begin().unwrap();
        mailbox.source_changed(); // policy returned to A before the next poll
        assert!(!mailbox.offer(before_policy, sample(0), Millis(0)));
        let before_usb = mailbox.begin().unwrap();
        mailbox.operator_command();
        assert!(!mailbox.offer(before_usb, sample(0), Millis(0)));
        let fresh = mailbox.begin().unwrap();
        assert!(mailbox.offer(fresh, sample(0), Millis(0)));
        assert!(!mailbox.offer(fresh, sample(0), Millis(0)));
        let update = mailbox.take();
        assert!(update.revoke_network);
        assert_eq!(update.sample, Some(sample(0)));
        assert!(mailbox.take().sample.is_none());
        let clear = mailbox.begin().unwrap();
        mailbox.reject(clear);
        assert!(mailbox.take().revoke_network);
        mailbox.generation = u64::MAX;
        mailbox.operator_command();
        assert!(mailbox.begin().is_none());
        assert!(mailbox.take().revoke_network);
    }
    #[test]
    fn null_invalid_delayed_and_transport_results_never_create_freshness() {
        let mut mailbox = ClockMailbox::new();
        mailbox.set_source(Some(1));
        mailbox.take();
        let attempt = mailbox.begin().unwrap();
        assert!(!mailbox.finish(attempt, ReadResult::TransportFailure, Millis(10)));
        let update = mailbox.take();
        assert!(!update.revoke_network && update.sample.is_none());
        assert!(
            !mailbox.offer(attempt, sample(0), Millis(10)),
            "timed-out work is consumed"
        );
        for result in [
            ReadResult::Unavailable,
            ReadResult::Fresh {
                matter_micros: u64::MAX,
                captured_at: Millis(0),
            },
            ReadResult::Fresh {
                matter_micros: 0,
                captured_at: Millis(11),
            },
        ] {
            let attempt = mailbox.begin().unwrap();
            assert!(!mailbox.finish(attempt, result, Millis(10)));
            let update = mailbox.take();
            assert!(update.revoke_network && update.sample.is_none());
        }
        let old = mailbox.begin().unwrap();
        mailbox.set_source(None); // authority task cancelled or fabric removed
        assert!(!mailbox.finish(
            old,
            ReadResult::Fresh {
                matter_micros: 0,
                captured_at: Millis(20)
            },
            Millis(20)
        ));
        assert!(mailbox.take().revoke_network);
        assert!(mailbox.begin().is_none());
        mailbox.set_source(Some(1));
        let stale = mailbox.begin().unwrap();
        assert!(!mailbox.finish(
            stale,
            ReadResult::Fresh {
                matter_micros: 0,
                captured_at: Millis(0)
            },
            Millis(MAX_AGE_MS)
        ));
        assert!(mailbox.take().revoke_network);
    }
}
