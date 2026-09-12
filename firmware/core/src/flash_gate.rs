//! Exclusive flash access after an observed output-off control iteration.
//! Callers synchronize these short transitions; no flash or waiting belongs in that lock.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Ticket(u64);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GateError {
    Busy,
    StaleTicket,
    Exhausted,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct FlashGate {
    generation: u64,
    active: Option<Ticket>,
    acknowledged: bool,
    exhausted: bool,
}

impl FlashGate {
    pub const fn new() -> Self {
        Self {
            generation: 0,
            active: None,
            acknowledged: false,
            exhausted: false,
        }
    }

    pub fn request(&mut self) -> Result<Ticket, GateError> {
        if self.exhausted {
            return Err(GateError::Exhausted);
        }
        if self.active.is_some() {
            return Err(GateError::Busy);
        }
        self.issue()
    }

    /// Keep output inhibited while requiring a new completed control iteration.
    /// Use between flash chunks so only the output owner feeds the watchdog.
    pub fn checkpoint(&mut self, ticket: Ticket) -> Result<Ticket, GateError> {
        if self.active != Some(ticket) {
            return Err(GateError::StaleTicket);
        }
        self.issue()
    }

    fn issue(&mut self) -> Result<Ticket, GateError> {
        let Some(generation) = self.generation.checked_add(1) else {
            self.exhausted = true;
            self.acknowledged = false;
            return Err(GateError::Exhausted);
        };
        self.generation = generation;
        let ticket = Ticket(generation);
        self.active = Some(ticket);
        self.acknowledged = false;
        Ok(ticket)
    }

    pub const fn pending(&self) -> Option<Ticket> {
        self.active
    }
    pub const fn inhibited(&self) -> bool {
        self.active.is_some() || self.exhausted
    }

    /// Only the output owner may call this, after physically writing LOW and feeding
    /// its watchdog. A stale observation cannot authorize a newer flash chunk.
    pub fn acknowledge_off(&mut self, observed: Ticket) -> bool {
        if self.exhausted || self.active != Some(observed) {
            return false;
        }
        self.acknowledged = true;
        true
    }

    pub fn may_access(&self, ticket: Ticket) -> bool {
        !self.exhausted && self.active == Some(ticket) && self.acknowledged
    }

    pub fn release(&mut self, ticket: Ticket) -> bool {
        if self.active != Some(ticket) {
            return false;
        }
        self.active = None;
        self.acknowledged = false;
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_chunk_requires_its_own_off_acknowledgement() {
        let mut gate = FlashGate::new();
        let first = gate.request().unwrap();
        assert!(gate.inhibited());
        assert!(!gate.may_access(first));
        assert_eq!(gate.request(), Err(GateError::Busy));
        assert!(gate.acknowledge_off(first));
        assert!(gate.may_access(first));
        let second = gate.checkpoint(first).unwrap();
        assert!(gate.inhibited());
        assert!(!gate.may_access(second));
        assert!(!gate.acknowledge_off(first));
        assert!(!gate.release(first));
        assert!(!gate.may_access(first));
        assert!(gate.acknowledge_off(second));
        assert!(gate.may_access(second));
        assert!(gate.release(second));
        assert!(!gate.inhibited());
    }

    #[test]
    fn cancelled_or_completed_requests_cannot_authorize_a_later_request() {
        let mut gate = FlashGate::new();
        let old = gate.request().unwrap();
        assert!(gate.release(old));
        let current = gate.request().unwrap();
        assert!(!gate.acknowledge_off(old));
        assert_eq!(gate.checkpoint(old), Err(GateError::StaleTicket));
        assert!(!gate.release(old));
        assert!(!gate.may_access(current));
        assert!(gate.acknowledge_off(current));
    }

    #[test]
    fn generation_exhaustion_permanently_inhibits_without_reusing_a_ticket() {
        let mut gate = FlashGate {
            generation: u64::MAX - 1,
            ..FlashGate::new()
        };
        let last = gate.request().unwrap();
        gate.acknowledge_off(last);
        assert_eq!(gate.checkpoint(last), Err(GateError::Exhausted));
        assert!(!gate.may_access(last));
        assert!(!gate.acknowledge_off(last));
        gate.release(last);
        assert!(gate.inhibited());
        assert_eq!(gate.request(), Err(GateError::Exhausted));
    }
}
