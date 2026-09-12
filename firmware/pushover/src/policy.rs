//! Fixed RAM queue. It receives confirmed edges; it never classifies water.
use crate::guard::ATTEMPT_MS;
use crystal_shim_core::{
    configuration::PushoverCredentials, utc_bounds::UtcBounds, State, WaterTransition,
};

pub const CAPACITY: usize = 8;
pub const EVENT_TTL_MS: u64 = 900_000;
pub const MAX_ATTEMPTS: u8 = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Event {
    pub id: u64,
    pub revision: u32,
    pub credential_generation: u64,
    pub captured_at_ms: u64,
    pub expires_at_ms: u64,
    pub transition: WaterTransition,
    pub relay_on: bool,
    pub state: State,
    pub utc_bounds: Option<UtcBounds>,
}
/// Called once per completed control iteration, after the physical relay write.
#[derive(Clone, Copy)]
pub struct Observation {
    pub now_ms: u64,
    pub revision: Option<u32>,
    pub credentials: Option<PushoverCredentials>,
    pub transition: Option<WaterTransition>,
    pub relay_on: bool,
    pub state: State,
    pub utc_bounds: Option<UtcBounds>,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Token {
    event: u64,
    attempt: u64,
    revision: u32,
    credentials: u64,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Attempt {
    pub token: Token,
    pub event: Event,
    pub number: u8,
    pub started_at_ms: u64,
    pub deadline_ms: u64,
}
#[derive(Clone, Copy)]
pub struct Work {
    pub attempt: Attempt,
    pub credentials: PushoverCredentials,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Suspension {
    Http(u16),
    Api(i64),
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Outcome {
    /// The API accepted the message; this is not proof of delivery to a phone.
    ApiAccepted,
    Suspend(Suspension),
    Transient {
        uncertain: bool,
    },
    ProtocolFailure {
        uncertain: bool,
    },
    Cancelled {
        uncertain: bool,
    },
}
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Stats {
    pub observed: u64,
    pub skipped: u64,
    pub evicted: u64,
    pub expired: u64,
    pub cancelled: u64,
    pub api_accepted: u64,
    pub rejected: u64,
    pub uncertain: u64,
    pub retried: u64,
    pub failed: u64,
    pub clock_faults: u64,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Diagnostics {
    pub pending: usize,
    pub active: bool,
    pub credential_generation: u64,
    pub suspended: Option<Suspension>,
    pub exhausted: bool,
    pub configuration_paused: bool,
    pub stats: Stats,
}
#[derive(Clone, Copy)]
struct Pending {
    event: Event,
    attempts: u8,
    ready_at_ms: u64,
}

pub struct Queue {
    pending: [Option<Pending>; CAPACITY],
    len: usize,
    active: Option<Attempt>,
    revision: Option<u32>,
    credentials: Option<PushoverCredentials>,
    generation: u64,
    next_event: u64,
    next_attempt: u64,
    suspended: Option<Suspension>,
    exhausted: bool,
    configuration_paused: bool,
    last_now: u64,
    stats: Stats,
}
fn increment(value: &mut u64) {
    *value = value.saturating_add(1);
}
impl Default for Queue {
    fn default() -> Self {
        Self::new()
    }
}
impl Queue {
    pub const fn new() -> Self {
        Self {
            pending: [None; CAPACITY],
            len: 0,
            active: None,
            revision: None,
            credentials: None,
            generation: 0,
            next_event: 0,
            next_attempt: 0,
            suspended: None,
            exhausted: false,
            configuration_paused: false,
            last_now: 0,
            stats: Stats {
                observed: 0,
                skipped: 0,
                evicted: 0,
                expired: 0,
                cancelled: 0,
                api_accepted: 0,
                rejected: 0,
                uncertain: 0,
                retried: 0,
                failed: 0,
                clock_faults: 0,
            },
        }
    }
    pub fn diagnostics(&self) -> Diagnostics {
        Diagnostics {
            pending: self.len,
            active: self.active.is_some(),
            credential_generation: self.generation,
            suspended: self.suspended,
            exhausted: self.exhausted,
            configuration_paused: self.configuration_paused,
            stats: self.stats,
        }
    }
    fn clear(&mut self) {
        // An invalidated in-flight request may already have reached the API.
        if self.active.is_some() {
            increment(&mut self.stats.uncertain);
        }
        self.stats.cancelled = self
            .stats
            .cancelled
            .saturating_add((self.len + usize::from(self.active.is_some())) as u64);
        self.pending.fill(None);
        self.len = 0;
        self.active = None;
    }
    fn exhaust(&mut self) {
        self.exhausted = true;
        self.clear();
    }
    /// Accepted settings replacement immediately retires old credentials/work.
    /// Keep the rejection generation intact. Only a committed revision change
    /// releases this pause, including after a failed save of the candidate.
    pub fn pause_for_configuration(&mut self) {
        self.configuration_paused = true;
        self.clear();
    }
    fn remove(&mut self, index: usize) -> Pending {
        let value = self.pending[index].take().expect("occupied queue slot");
        for at in index..self.len - 1 {
            self.pending[at] = self.pending[at + 1];
        }
        self.len -= 1;
        self.pending[self.len] = None;
        value
    }
    fn tick(&mut self, now: u64) -> bool {
        if now < self.last_now {
            self.clear();
            increment(&mut self.stats.clock_faults);
            return false;
        }
        self.last_now = now;
        let mut at = 0;
        while at < self.len {
            if now >= self.pending[at].unwrap().event.expires_at_ms {
                self.remove(at);
                increment(&mut self.stats.expired);
            } else {
                at += 1;
            }
        }
        if self.active.is_some_and(|a| now >= a.event.expires_at_ms) {
            self.active = None;
            increment(&mut self.stats.expired);
            increment(&mut self.stats.uncertain);
        }
        true
    }
    /// No allocation, I/O, logging, await, flash, or watchdog work. Credential
    /// changes are compared separately from ordinary configuration revisions.
    pub fn observe(&mut self, observation: Observation) -> Option<u64> {
        let o = observation;
        let credentials = o.revision.and(o.credentials);
        if self.revision != o.revision {
            self.configuration_paused = false;
        }
        if self.revision != o.revision || self.credentials != credentials {
            self.clear();
            if self.credentials != credentials {
                let Some(next) = self.generation.checked_add(1) else {
                    self.exhaust();
                    return None;
                };
                self.generation = next;
                self.suspended = None;
                self.credentials = credentials;
            }
            self.revision = o.revision;
        }
        if !self.tick(o.now_ms) || self.exhausted {
            return None;
        }
        let transition = o.transition?;
        increment(&mut self.stats.observed);
        let Some(id) = self.next_event.checked_add(1) else {
            self.exhaust();
            return None;
        };
        self.next_event = id;
        if self.credentials.is_none() || self.suspended.is_some() || self.configuration_paused {
            increment(&mut self.stats.skipped);
            return Some(id);
        }
        let Some(expires_at_ms) = o.now_ms.checked_add(EVENT_TTL_MS) else {
            increment(&mut self.stats.expired);
            return Some(id);
        };
        let event = Event {
            id,
            revision: self.revision.unwrap(),
            credential_generation: self.generation,
            captured_at_ms: o.now_ms,
            expires_at_ms,
            transition,
            relay_on: o.relay_on,
            state: o.state,
            utc_bounds: o.utc_bounds,
        };
        if self.len + usize::from(self.active.is_some()) == CAPACITY {
            self.remove(0);
            increment(&mut self.stats.evicted);
        }
        self.pending[self.len] = Some(Pending {
            event,
            attempts: 0,
            ready_at_ms: o.now_ms,
        });
        self.len += 1;
        Some(id)
    }
    pub fn claim(&mut self, now: u64) -> Option<Work> {
        if !self.tick(now)
            || self.exhausted
            || self.configuration_paused
            || self.suspended.is_some()
            || self.active.is_some()
            || self.len == 0
        {
            return None;
        }
        let credentials = self.credentials?;
        if now < self.pending[0]?.ready_at_ms {
            return None;
        }
        let Some(id) = self.next_attempt.checked_add(1) else {
            self.exhaust();
            return None;
        };
        let Some(deadline) = now.checked_add(ATTEMPT_MS) else {
            self.exhaust();
            return None;
        };
        self.next_attempt = id;
        let pending = self.remove(0);
        let attempt = Attempt {
            token: Token {
                event: pending.event.id,
                attempt: id,
                revision: pending.event.revision,
                credentials: self.generation,
            },
            event: pending.event,
            number: pending.attempts + 1,
            started_at_ms: now,
            deadline_ms: deadline.min(pending.event.expires_at_ms),
        };
        self.active = Some(attempt);
        Some(Work {
            attempt,
            credentials,
        })
    }
    pub fn is_current(&self, token: Token, now: u64) -> bool {
        !self.exhausted
            && !self.configuration_paused
            && self.suspended.is_none()
            && now >= self.last_now
            && self
                .active
                .is_some_and(|a| a.token == token && now >= a.started_at_ms && now < a.deadline_ms)
    }
    /// A stale completion can never retire or acknowledge a different event.
    pub fn finish(&mut self, now: u64, token: Token, mut outcome: Outcome) -> bool {
        // A known rejection remains restrictive even if acquiring the completion
        // lock crosses the deadline. It must never become an identical retry.
        // Only the still-active token can carry that rejection across expiry.
        let rejection = self.active.filter(|active| {
            active.token == token && now >= self.last_now && matches!(outcome, Outcome::Suspend(_))
        });
        if rejection.is_some() {
            self.active = None;
        }
        if !self.tick(now) {
            return false;
        }
        let Some(active) = self.active.filter(|a| a.token == token).or(rejection) else {
            return false;
        };
        self.active = None;
        if now >= active.deadline_ms && outcome == Outcome::ApiAccepted {
            outcome = Outcome::Transient { uncertain: true };
        }
        match outcome {
            Outcome::ApiAccepted => increment(&mut self.stats.api_accepted),
            Outcome::Suspend(reason) => {
                self.suspended = Some(reason);
                increment(&mut self.stats.rejected);
                self.clear();
            }
            Outcome::Cancelled { uncertain } => {
                increment(&mut self.stats.cancelled);
                if uncertain {
                    increment(&mut self.stats.uncertain);
                }
            }
            Outcome::ProtocolFailure { uncertain } => {
                increment(&mut self.stats.failed);
                if uncertain {
                    increment(&mut self.stats.uncertain);
                }
            }
            Outcome::Transient { uncertain } => {
                if uncertain {
                    increment(&mut self.stats.uncertain);
                }
                let delay = if active.number == 1 { 5_000 } else { 30_000 };
                if active.number >= MAX_ATTEMPTS {
                    increment(&mut self.stats.failed);
                } else if let Some(ready) = now
                    .checked_add(delay)
                    .filter(|ready| *ready < active.event.expires_at_ms)
                {
                    // The active slot reserved capacity, including while waiting
                    // for its response. Retried work stays before newer events.
                    for index in (0..self.len).rev() {
                        self.pending[index + 1] = self.pending[index];
                    }
                    self.pending[0] = Some(Pending {
                        event: active.event,
                        attempts: active.number,
                        ready_at_ms: ready,
                    });
                    self.len += 1;
                    increment(&mut self.stats.retried);
                } else {
                    increment(&mut self.stats.expired);
                }
            }
        }
        true
    }
}
#[cfg(test)]
#[path = "policy_tests.rs"]
mod tests;
