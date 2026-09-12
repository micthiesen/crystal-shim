//! Runtime transactions driven by control, with an external, acknowledged flash owner.
//!
//! Storage requests are immutable. Only a matching completion advances a transaction.
//! A configuration replacement deliberately stops the run and enters maintenance;
//! the owner must explicitly exit after the new configuration is durable.

use crate::configuration::ValidatedDeviceConfig;
use crate::utc::{ClockUpdate, UtcAnchor, UtcObservation};
use crate::{
    Command, Demand, Fault, HardwarePermit, Inputs, Millis, Reading, RelayCommand, RetainedState,
    RetainedWindow, ScheduleDecision, Scheduler, Supervisor, SupervisorStatus, SwitchCommand,
    UtcSeconds, WindowDisposition,
};

pub const UTC_MAX_AGE_MS: u64 = crate::utc::MAX_AGE_MS;

#[derive(Clone, Copy, Debug)]
// One fixed mailbox owns the complete validated configuration; no allocator or
// borrowed configuration can cross the control/flash ownership boundary.
#[allow(clippy::large_enum_variant)]
pub enum RuntimeCommand {
    SaveConfiguration(ValidatedDeviceConfig),
    On,
    Off,
    /// Resolve against the actual commanded output in the control iteration.
    Toggle,
    EnterMaintenance,
    ExitMaintenance,
    /// A newly acquired, trusted observation, never a republished cached value.
    SetUtc(UtcSeconds),
    /// Timestamped at operator ingress, before any dispatch delay.
    SetUtcObserved(UtcObservation),
    ClearUtc,
}

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;

#[derive(Clone, Copy, Debug)]
pub struct Request {
    pub id: u32,
    pub command: RuntimeCommand,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Busy,
    Unconfigured,
    Revision,
    RecoveryRequired,
    Storage,
    Superseded,
    InvalidTime,
    Exhausted,
    /// Control rejected or cancelled On; no valid override lease remains.
    Rejected,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Acknowledgement {
    /// Applied by control. On retains a valid override lease, possibly waiting
    /// for minimum-off recovery; this never claims that the relay is energized.
    Applied,
    /// Matching configuration/retained state has completed its storage writes.
    Durable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Reply {
    pub id: u32,
    pub result: Result<Acknowledgement, Error>,
}

#[derive(Clone, Copy, Debug)]
// One immutable, fixed-capacity transaction slot, including configuration writes.
#[allow(clippy::large_enum_variant)]
pub enum Record {
    Retained(RetainedState),
    Configuration(ValidatedDeviceConfig),
}

#[derive(Clone, Copy, Debug)]
pub struct StoreRequest {
    pub ticket: u64,
    pub record: Record,
}

#[derive(Clone, Copy, Debug)]
pub struct StoreCompletion {
    pub ticket: u64,
    pub succeeded: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct Observation {
    pub now: Millis,
    /// The calibration revision that produced `reading`.
    pub sensor_revision: u32,
    pub reading: Reading,
    pub hardware: HardwarePermit,
    pub maintenance_pressed: bool,
    /// Reserved lossless ingress, including Off requests rejected with Busy.
    pub force_off: bool,
    /// Latest authenticated observation and loss, independent of storage admission.
    pub clock_update: ClockUpdate,
}

#[derive(Clone, Copy, Debug)]
pub struct Step {
    pub status: Option<SupervisorStatus>,
    pub command_reply: Option<Reply>,
    pub completed_reply: Option<Reply>,
}

#[derive(Clone, Copy)]
enum Purpose {
    Configuration,
    EnterMaintenance,
    ExitMaintenance,
}

#[derive(Clone, Copy)]
struct ActiveRequest {
    id: u32,
    purpose: Purpose,
}

#[derive(Clone, Copy)]
struct Clock {
    anchor: UtcAnchor,
    network: bool,
}

pub struct Runtime {
    configuration: Option<ValidatedDeviceConfig>,
    supervisor: Option<Supervisor>,
    desired: Option<RetainedState>,
    durable: Option<RetainedState>,
    replacement: Option<ValidatedDeviceConfig>,
    pending: Option<StoreRequest>,
    next_ticket: u64,
    active_request: Option<ActiveRequest>,
    maintenance: bool,
    storage_failed: bool,
    clock: Option<Clock>,
}

impl Runtime {
    /// Boot records must already have completed `load_retained` repair.
    pub fn new(
        configuration: Option<ValidatedDeviceConfig>,
        retained: Option<RetainedState>,
        now: Millis,
    ) -> Result<Self, Error> {
        match (&configuration, retained) {
            (None, None) => {}
            (Some(config), Some(state))
                if state.config_revision == config.revision()
                    && state.encode().is_ok()
                    && state.window.is_none_or(|window| {
                        window.disposition == WindowDisposition::Suppressed
                    }) => {}
            _ => return Err(Error::RecoveryRequired),
        }
        Ok(Self {
            supervisor: configuration
                .map(|config| Supervisor::new(config.supervisor_config(), now)),
            configuration,
            desired: retained,
            durable: retained,
            replacement: None,
            pending: None,
            next_ticket: 0,
            active_request: None,
            maintenance: retained.is_none_or(|state| state.maintenance),
            storage_failed: false,
            clock: None,
        })
    }

    pub const fn configuration(&self) -> Option<ValidatedDeviceConfig> {
        self.configuration
    }

    pub const fn store_request(&self) -> Option<StoreRequest> {
        self.pending
    }

    pub const fn storage_failed(&self) -> bool {
        self.storage_failed
    }

    pub const fn durable_state(&self) -> Option<RetainedState> {
        self.durable
    }

    /// Current administrative permission, not a cached command acknowledgement.
    /// The hardware owner must additionally acknowledge the actual relay-low write.
    pub fn durable_maintenance(&self) -> bool {
        self.configuration.is_some()
            && self.maintenance
            && self.desired == self.durable
            && self.durable.is_some_and(|state| state.maintenance)
            && self.pending.is_none()
            && self.replacement.is_none()
            && self.active_request.is_none()
            && !self.storage_failed
    }

    pub fn step(
        &mut self,
        observation: Observation,
        request: Option<Request>,
        completion: Option<StoreCompletion>,
    ) -> Step {
        let request = request.map(|mut request| {
            if matches!(request.command, RuntimeCommand::Toggle) {
                request.command =
                    if self.supervisor.as_ref().is_some_and(|supervisor| {
                        supervisor.status().control.relay == RelayCommand::On
                    }) {
                        RuntimeCommand::Off
                    } else {
                        RuntimeCommand::On
                    };
            }
            request
        });
        let mut completed_reply = None;
        if observation.maintenance_pressed {
            self.enter_maintenance();
            if self
                .active_request
                .is_some_and(|active| matches!(active.purpose, Purpose::ExitMaintenance))
            {
                completed_reply = self.finish_request(Err(Error::Superseded));
            }
        }
        if let Some(completion) = completion {
            if let Some(reply) = self.complete(completion, observation.now) {
                completed_reply = Some(reply);
            }
        }

        // Observe expiry on the existing anchor before a command can replace it.
        // In particular, a late eligibility ACK plus a backwards correction must
        // not resurrect an occurrence the supervisor never had a chance to see.
        self.observe_utc(observation.now);
        if observation.clock_update.revoke_network && self.clock.is_some_and(|clock| clock.network)
        {
            self.clock = None;
            self.suppress();
        }
        if let Some(sample) = observation.clock_update.sample {
            // The producer has already checked source and generation. Acceptance
            // still checks this original capture; dispatch never refreshes age.
            if self.set_utc(sample, observation.now, true).is_err()
                && self.clock.is_some_and(|clock| clock.network)
            {
                self.clock = None;
                self.suppress();
            }
        }

        let explicit_off = observation.force_off
            || request.is_some_and(|request| matches!(request.command, RuntimeCommand::Off));
        let mut switch = if explicit_off {
            SwitchCommand::Off
        } else {
            SwitchCommand::None
        };
        let command_reply = request.and_then(|request| {
            self.accept(request, observation, explicit_off, &mut switch)
                .map(|result| Reply {
                    id: request.id,
                    result,
                })
        });

        let utc = self.observe_utc(observation.now);
        let decision = self.configuration.and_then(|config| {
            let civil = utc.and_then(|utc| config.timezone().civil_at(utc).ok());
            Scheduler::evaluate(
                observation.now,
                civil,
                config.schedule(),
                &config.timezone(),
                self.desired.and_then(|state| state.window),
            )
            .ok()
        });
        if matches!(
            decision,
            None | Some(ScheduleDecision::Inactive | ScheduleDecision::Suppressed)
        ) {
            // A correction can move before the saved occurrence as well as past
            // its end. Once that occurrence loses calendar eligibility, a later
            // correction must not recreate its elapsed lease from retained data.
            self.suppress();
        }
        if switch == SwitchCommand::None
            && self
                .desired
                .and_then(|state| state.window)
                .is_some_and(|window| window.disposition == WindowDisposition::Suppressed)
            && self
                .supervisor
                .as_ref()
                .is_some_and(|supervisor| supervisor.status().demand == Demand::Automatic)
        {
            // Calendar invalidation revokes automatic demand before a different
            // occurrence can borrow its lease. Manual demand remains independent;
            // normal Active/overlap updates still preserve the existing run cap.
            switch = SwitchCommand::Off;
        }
        let was_on = self
            .supervisor
            .as_ref()
            .is_some_and(|supervisor| supervisor.status().control.relay == RelayCommand::On);
        let manual_pending = switch == SwitchCommand::On
            || self
                .supervisor
                .as_ref()
                .is_some_and(|supervisor| supervisor.status().demand == Demand::Override);
        if self.replacement.is_none() && !self.storage_failed {
            if let Some(ScheduleDecision::PersistBeforeRun(occurrence)) = decision {
                // Defer ordinary new-window persistence while energized. A stop
                // still records suppression immediately, even before eligibility.
                if explicit_off
                    || (!self.maintenance && !was_on && !manual_pending && self.pending.is_none())
                {
                    if let Some(state) = &mut self.desired {
                        state.window = Some(RetainedWindow {
                            id: occurrence.id,
                            ends_utc: occurrence.ends_utc,
                            disposition: if explicit_off {
                                WindowDisposition::Suppressed
                            } else {
                                WindowDisposition::Eligible
                            },
                        });
                    }
                }
            }
        }
        if explicit_off {
            self.suppress();
        }
        // An elapsed occurrence is blocked in RAM immediately. Its suppression
        // alone may wait for a manual lease to finish: writing flash would force
        // the relay off. A reset meanwhile repairs the old Eligible record.
        let defer_suppression = manual_pending
            && !explicit_off
            && switch != SwitchCommand::Off
            && self.active_request.is_none()
            && self.replacement.is_none()
            && self.pending.is_none()
            && self.only_suppression_pending();
        if !defer_suppression {
            self.ensure_store();
        }
        if self.storage_failed && self.active_request.is_some() {
            completed_reply = self.finish_request(Err(Error::Exhausted));
        }

        let ready = !self.storage_failed
            && self.replacement.is_none()
            && self.pending.is_none()
            && (self.desired == self.durable || defer_suppression);
        if ready && !observation.maintenance_pressed {
            self.maintenance = self.desired.is_none_or(|state| state.maintenance);
        }
        if ready && self.active_request.is_some() {
            completed_reply = self.finish_request(Ok(Acknowledgement::Durable));
        }
        let window = if ready && !self.maintenance && !explicit_off {
            match decision {
                Some(ScheduleDecision::Active { window, .. }) => Some(window),
                _ => None,
            }
        } else {
            None
        };
        let reading = match self.configuration {
            Some(config)
                if config.revision() == observation.sensor_revision
                    && config.calibration().is_some() =>
            {
                observation.reading
            }
            _ => Reading::Invalid(Fault::Uncalibrated),
        };
        let status = self.supervisor.as_mut().map(|supervisor| {
            supervisor.update(
                observation.now,
                Inputs {
                    reading,
                    window,
                    // Every runtime maintenance entry revokes both lease modes.
                    // Off retains the supervisor's occurrence/suppression history
                    // without allowing an old run to survive a later durable exit.
                    switch: if self.maintenance {
                        SwitchCommand::Off
                    } else {
                        switch
                    },
                    maintenance: if self.maintenance {
                        Command::EnterMaintenance
                    } else {
                        Command::ExitMaintenance
                    },
                    hardware: if ready {
                        observation.hardware
                    } else {
                        HardwarePermit::ForcedOff
                    },
                },
            )
        });
        let command_reply = command_reply.map(|mut reply| {
            // Admission is provisional until the supervisor has applied every
            // safety/expiry rule. A valid pending override is still accepted.
            if request.is_some_and(|request| matches!(request.command, RuntimeCommand::On))
                && reply.result == Ok(Acknowledgement::Applied)
                && !status.is_some_and(|status| {
                    status.demand == Demand::Override && status.deadline.is_some()
                })
            {
                reply.result = Err(Error::Rejected);
            }
            reply
        });
        Step {
            status,
            command_reply,
            completed_reply,
        }
    }

    fn accept(
        &mut self,
        request: Request,
        observation: Observation,
        explicit_off: bool,
        switch: &mut SwitchCommand,
    ) -> Option<Result<Acknowledgement, Error>> {
        if matches!(request.command, RuntimeCommand::ClearUtc) {
            // Revocation must never wait behind a configuration/flash transaction.
            self.clock = None;
            self.suppress();
            return Some(Ok(Acknowledgement::Applied));
        }
        if self.active_request.is_some() || self.pending.is_some() {
            return Some(Err(Error::Busy));
        }
        if self.storage_failed
            && !matches!(
                request.command,
                RuntimeCommand::SaveConfiguration(_)
                    | RuntimeCommand::Off
                    | RuntimeCommand::EnterMaintenance
            )
        {
            return Some(Err(Error::RecoveryRequired));
        }
        let purpose = match request.command {
            RuntimeCommand::SaveConfiguration(config) => {
                let revision = self.configuration.map_or(0, |config| config.revision());
                if revision.checked_add(1) != Some(config.revision()) {
                    return Some(Err(Error::Revision));
                }
                self.enter_maintenance();
                let mut state = self.desired.unwrap_or(RetainedState {
                    config_revision: config.revision(),
                    maintenance: true,
                    window: None,
                });
                state.config_revision = config.revision();
                state.maintenance = true;
                self.desired = Some(state);
                self.replacement = Some(config);
                self.storage_failed = false;
                Purpose::Configuration
            }
            RuntimeCommand::On => {
                if explicit_off {
                    return Some(Err(Error::Superseded));
                }
                if self.configuration.is_none() {
                    return Some(Err(Error::Unconfigured));
                }
                *switch = SwitchCommand::On;
                return Some(Ok(Acknowledgement::Applied));
            }
            RuntimeCommand::Off => {
                *switch = SwitchCommand::Off;
                // Output revocation is acknowledged by this control iteration.
                // Retained suppression proceeds independently, with the storage
                // ticket's completion reporting durability or failure.
                return Some(Ok(Acknowledgement::Applied));
            }
            RuntimeCommand::EnterMaintenance => {
                self.enter_maintenance();
                if self.configuration.is_none() {
                    return Some(Ok(Acknowledgement::Applied));
                }
                if self.storage_failed {
                    return Some(Err(Error::RecoveryRequired));
                }
                Purpose::EnterMaintenance
            }
            RuntimeCommand::ExitMaintenance => {
                if observation.maintenance_pressed {
                    return Some(Err(Error::Superseded));
                }
                let Some(state) = &mut self.desired else {
                    return Some(Err(Error::Unconfigured));
                };
                state.maintenance = false;
                Purpose::ExitMaintenance
            }
            RuntimeCommand::SetUtc(utc) => {
                let result = UtcObservation::from_seconds(utc, observation.now)
                    .ok_or(Error::InvalidTime)
                    .and_then(|sample| self.set_utc(sample, observation.now, false));
                return Some(result.map(|()| Acknowledgement::Applied));
            }
            RuntimeCommand::SetUtcObserved(sample) => {
                return Some(
                    self.set_utc(sample, observation.now, false)
                        .map(|()| Acknowledgement::Applied),
                );
            }
            RuntimeCommand::ClearUtc => unreachable!("revocation handled before storage admission"),
            RuntimeCommand::Toggle => unreachable!("resolved by control before acceptance"),
        };
        self.active_request = Some(ActiveRequest {
            id: request.id,
            purpose,
        });
        None
    }

    pub fn clock_observation(&self) -> Option<UtcObservation> {
        self.clock.and_then(|clock| clock.anchor.observation())
    }

    fn set_utc(&mut self, sample: UtcObservation, now: Millis, network: bool) -> Result<(), Error> {
        let mut anchor = UtcAnchor::new(sample, now).ok_or(Error::InvalidTime)?;
        let utc = anchor.at(now).ok_or(Error::InvalidTime)?;
        if self
            .configuration
            .is_none_or(|config| config.timezone().civil_at(utc).is_err())
        {
            return Err(Error::InvalidTime);
        }
        self.clock = Some(Clock { anchor, network });
        Ok(())
    }

    fn enter_maintenance(&mut self) {
        self.maintenance = true;
        if let Some(state) = &mut self.desired {
            state.maintenance = true;
        }
        self.suppress();
    }

    fn observe_utc(&mut self, now: Millis) -> Option<UtcSeconds> {
        let utc = self.clock.as_mut()?.anchor.at(now);
        match utc {
            Some(utc) => {
                if self
                    .desired
                    .and_then(|state| state.window)
                    .is_some_and(|window| utc >= window.ends_utc)
                {
                    self.suppress();
                }
            }
            None => {
                self.clock = None;
                // With no valid anchor, an unexposed occurrence's elapsed cap
                // cannot be reconstructed safely from a future clock correction.
                self.suppress();
            }
        }
        utc
    }

    fn only_suppression_pending(&self) -> bool {
        let (Some(desired), Some(mut durable)) = (self.desired, self.durable) else {
            return false;
        };
        let Some(window) = &mut durable.window else {
            return false;
        };
        if window.disposition != WindowDisposition::Eligible {
            return false;
        }
        window.disposition = WindowDisposition::Suppressed;
        desired == durable
    }

    fn suppress(&mut self) {
        if let Some(window) = self
            .desired
            .as_mut()
            .and_then(|state| state.window.as_mut())
        {
            window.disposition = WindowDisposition::Suppressed;
        }
    }

    fn enqueue(&mut self, record: Record) {
        let Some(ticket) = self.next_ticket.checked_add(1) else {
            self.storage_failed = true;
            self.enter_maintenance();
            return;
        };
        self.next_ticket = ticket;
        self.pending = Some(StoreRequest { ticket, record });
    }

    fn ensure_store(&mut self) {
        if self.storage_failed || self.pending.is_some() {
            return;
        }
        if self.desired != self.durable {
            if let Some(state) = self.desired {
                self.enqueue(Record::Retained(state));
            }
        } else if let Some(config) = self.replacement {
            // A previous configuration write can have failed after this exact
            // maintenance record was durable. Recovery still writes configuration.
            self.enqueue(Record::Configuration(config));
        }
    }

    fn complete(&mut self, completion: StoreCompletion, now: Millis) -> Option<Reply> {
        let pending = self
            .pending
            .filter(|pending| pending.ticket == completion.ticket)?;
        self.pending = None;
        if !completion.succeeded {
            self.storage_failed = true;
            self.replacement = None;
            // Keep the published configuration revision authoritative for recovery.
            if let (Some(state), Some(config)) = (&mut self.desired, self.configuration) {
                state.config_revision = config.revision();
            }
            self.enter_maintenance();
            return self.finish_request(Err(Error::Storage));
        }
        match pending.record {
            Record::Retained(state) => {
                self.durable = Some(state);
                if let Some(config) = self.replacement {
                    if state.config_revision == config.revision() {
                        self.enqueue(Record::Configuration(config));
                    }
                }
            }
            Record::Configuration(config) => {
                self.configuration = Some(config);
                match &mut self.supervisor {
                    Some(supervisor) => supervisor.reconfigure(config.supervisor_config()),
                    None => {
                        self.supervisor = Some(Supervisor::new(config.supervisor_config(), now))
                    }
                }
                self.replacement = None;
            }
        }
        None
    }

    fn finish_request(&mut self, result: Result<Acknowledgement, Error>) -> Option<Reply> {
        self.active_request.take().map(|active| Reply {
            id: active.id,
            result,
        })
    }
}
