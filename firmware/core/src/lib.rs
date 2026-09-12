//! Scheduled skimmer control with bounded manual override, independent of hardware.
#![no_std]

pub mod calibration;
pub mod configuration;
pub mod flash_gate;
mod policy;
mod retained;
pub mod runtime;
pub mod runtime_ingress;
mod schedule;
pub mod timezone;
mod water;
pub use policy::{
    HardwarePermit, Inputs, ScheduledWindow, Supervisor, SupervisorConfig, SupervisorStatus,
    SwitchCommand, WindowId,
};
pub use retained::{
    load_retained, ConfigurationLifecycle, LoadDisposition, LoadedRetainedState, RetainedError,
    RetainedState, RetainedWindow, WindowDisposition, RETAINED_BLOB_LEN, RETAINED_STORAGE_KEY,
};
pub use schedule::{
    CivilTime, DailyEntry, DayMask, Fold, LocalDay, LocalResolution, LocalTimeResolver, Occurrence,
    Schedule, ScheduleDecision, ScheduleError, Scheduler, UtcOffset, UtcSeconds, Weekday,
    MAX_DAILY_ENTRIES, MAX_WINDOW_SECONDS,
};
pub use water::{WaterState, WaterTransition};

/// Injected monotonic time since boot. Wall-clock time must never be used here.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Millis(pub u64);

/// Calibrated fraction of the chosen sensing range, in thousandths, not millimetres.
#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct Level(u16);

impl Level {
    pub const fn new(value: u16) -> Option<Self> {
        if value <= 1000 {
            Some(Self(value))
        } else {
            None
        }
    }

    pub const fn value(self) -> u16 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Timing {
    pub low_confirmation_ms: u64,
    pub recovery_ms: u64,
    pub minimum_off_ms: u64,
}

impl Timing {
    /// Starting values from the design brief, pending real-pump commissioning.
    pub const PROVISIONAL: Self = Self {
        low_confirmation_ms: 1000,
        recovery_ms: 10_000,
        minimum_off_ms: 30_000,
    };
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigError {
    ThresholdOrder,
    ZeroDuration,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Config {
    stop: Level,
    restart: Level,
    max_sample_age_ms: u64,
    timing: Timing,
}

impl Config {
    /// There are no default thresholds or freshness deadline: commissioning chooses them.
    pub const fn new(
        stop: Level,
        restart: Level,
        max_sample_age_ms: u64,
        timing: Timing,
    ) -> Result<Self, ConfigError> {
        if stop.0 >= restart.0 {
            return Err(ConfigError::ThresholdOrder);
        }
        if max_sample_age_ms == 0
            || timing.low_confirmation_ms == 0
            || timing.recovery_ms == 0
            || timing.minimum_off_ms == 0
        {
            return Err(ConfigError::ZeroDuration);
        }
        Ok(Self {
            stop,
            restart,
            max_sample_age_ms,
            timing,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Fault {
    Disconnected,
    Uncalibrated,
    OutOfRange,
    Bus,
    Stale,
    FutureSample,
    ClockWentBackwards,
    ControlGap,
    HardwareOff,
    InvalidSensorFrame,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Reading {
    Invalid(Fault),
    /// `observed_at` advances only after a successful acquisition, never on a cached read.
    Valid {
        level: Level,
        observed_at: Millis,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Command {
    None,
    EnterMaintenance,
    ExitMaintenance,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum State {
    Boot,
    Idle,
    Low,
    Recovering,
    Running,
    Maintenance,
    Fault(Fault),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RelayCommand {
    Off,
    On,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Status {
    pub state: State,
    /// Desired coil state only. This cannot detect welded contacts.
    pub relay: RelayCommand,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Demand {
    Off,
    Automatic,
    Override,
}

/// No I/O, allocation, GPIO numbers, calibration algorithm, or network dependency.
pub(crate) struct Controller {
    config: Config,
    state: State,
    last_tick: Millis,
    off_since: Millis,
    low_since: Option<Millis>,
    recovery_since: Option<Millis>,
}

impl Controller {
    pub const fn new(config: Config, now: Millis) -> Self {
        Self {
            config,
            state: State::Boot,
            last_tick: now,
            off_since: now,
            low_since: None,
            recovery_since: None,
        }
    }

    pub const fn status(&self) -> Status {
        Status {
            state: self.state,
            relay: if matches!(self.state, State::Running) {
                RelayCommand::On
            } else {
                RelayCommand::Off
            },
        }
    }

    fn stop(&mut self, now: Millis, state: State) {
        if self.state == State::Running {
            self.off_since = now;
        }
        self.state = state;
        self.low_since = None;
        self.recovery_since = None;
    }

    /// Call periodically even when no new sample arrives. A delayed control loop fails
    /// closed; fresh data after an unobserved gap cannot establish continuous recovery.
    #[cfg(test)]
    pub fn update(&mut self, now: Millis, reading: Reading, command: Command) -> Status {
        self.update_with_demand(now, reading, command, Demand::Automatic)
    }

    pub fn update_with_demand(
        &mut self,
        now: Millis,
        reading: Reading,
        command: Command,
        demand: Demand,
    ) -> Status {
        if command == Command::EnterMaintenance {
            self.stop(now.max(self.last_tick), State::Maintenance);
        }
        if now < self.last_tick {
            // Keep maintenance latched even when the caller's clock is broken.
            if self.state != State::Maintenance {
                self.stop(self.last_tick, State::Fault(Fault::ClockWentBackwards));
            }
            return self.status();
        }
        let missed_deadline = now.0 - self.last_tick.0 > self.config.max_sample_age_ms;
        self.last_tick = now;

        match command {
            Command::ExitMaintenance if self.state == State::Maintenance => {
                self.stop(now, State::Boot);
            }
            Command::None | Command::EnterMaintenance | Command::ExitMaintenance => {}
        }
        if self.state == State::Maintenance {
            return self.status();
        }
        if missed_deadline {
            self.stop(now, State::Fault(Fault::ControlGap));
            return self.status();
        }

        let (level, observed_at) = match reading {
            Reading::Invalid(fault) => {
                self.stop(now, State::Fault(fault));
                return self.status();
            }
            Reading::Valid { level, observed_at } => (level, observed_at),
        };
        if observed_at > now {
            self.stop(now, State::Fault(Fault::FutureSample));
            return self.status();
        }
        if now.0 - observed_at.0 > self.config.max_sample_age_ms {
            self.stop(now, State::Fault(Fault::Stale));
            return self.status();
        }

        match demand {
            Demand::Off => {
                self.stop(now, State::Idle);
                return self.status();
            }
            Demand::Override => {
                self.low_since = None;
                self.recovery_since = None;
                if self.state == State::Running
                    || now.0 - self.off_since.0 >= self.config.timing.minimum_off_ms
                {
                    self.state = State::Running;
                } else {
                    self.state = State::Recovering;
                }
                return self.status();
            }
            Demand::Automatic => {}
        }

        if self.state == State::Running {
            if level <= self.config.stop {
                let since = self.low_since.get_or_insert(now);
                if observed_at.0.saturating_sub(since.0) >= self.config.timing.low_confirmation_ms {
                    self.stop(now, State::Low);
                }
            } else {
                self.low_since = None;
            }
        } else if level >= self.config.restart {
            let since = self.recovery_since.get_or_insert(now);
            self.state = State::Recovering;
            if observed_at.0.saturating_sub(since.0) >= self.config.timing.recovery_ms
                && now.0 - self.off_since.0 >= self.config.timing.minimum_off_ms
            {
                self.state = State::Running;
                self.recovery_since = None;
            }
        } else {
            self.stop(now, State::Low);
        }
        self.status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config() -> Config {
        // Synthetic thresholds and deadline, never commissioning recommendations.
        Config::new(
            Level::new(200).unwrap(),
            Level::new(400).unwrap(),
            500,
            Timing::PROVISIONAL,
        )
        .unwrap()
    }

    fn fresh(controller: &mut Controller, now: u64, level: u16) -> Status {
        controller.update(
            Millis(now),
            Reading::Valid {
                level: Level::new(level).unwrap(),
                observed_at: Millis(now),
            },
            Command::None,
        )
    }

    fn running() -> Controller {
        let mut controller = Controller::new(config(), Millis(0));
        for now in (0..=30_000).step_by(100) {
            let status = fresh(&mut controller, now, 600);
            if now < 30_000 {
                assert_eq!(status.relay, RelayCommand::Off);
            }
        }
        assert_eq!(controller.status().state, State::Running);
        controller
    }

    #[test]
    fn boot_is_off_and_waits_for_both_timers() {
        assert_eq!(
            Controller::new(config(), Millis(0)).status().relay,
            RelayCommand::Off
        );
        running();
    }

    #[test]
    fn bad_configuration_is_rejected() {
        assert!(Level::new(1001).is_none());
        let level = Level::new(400).unwrap();
        assert_eq!(
            Config::new(level, level, 500, Timing::PROVISIONAL),
            Err(ConfigError::ThresholdOrder)
        );
        assert_eq!(
            Config::new(Level::new(200).unwrap(), level, 0, Timing::PROVISIONAL),
            Err(ConfigError::ZeroDuration)
        );
    }

    #[test]
    fn low_debounce_resets_and_restart_requires_hysteresis_and_minimum_off() {
        let mut controller = running();
        for now in (30_100..=30_900).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 200).relay, RelayCommand::On);
        }
        fresh(&mut controller, 31_000, 201);
        for now in (31_100..=32_000).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 200).relay, RelayCommand::On);
        }
        assert_eq!(fresh(&mut controller, 32_100, 200).state, State::Low);
        for now in (32_200..=62_100).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 399).relay, RelayCommand::Off);
        }
        for now in (62_200..72_200).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 400).relay, RelayCommand::Off);
        }
        assert_eq!(fresh(&mut controller, 72_200, 400).relay, RelayCommand::On);
    }

    #[test]
    fn invalid_sensor_immediately_stops_without_low_debounce() {
        for fault in [
            Fault::Disconnected,
            Fault::Uncalibrated,
            Fault::OutOfRange,
            Fault::Bus,
        ] {
            let mut controller = running();
            assert_eq!(
                controller.update(Millis(30_100), Reading::Invalid(fault), Command::None),
                Status {
                    state: State::Fault(fault),
                    relay: RelayCommand::Off
                }
            );
            assert_eq!(fresh(&mut controller, 30_200, 600).relay, RelayCommand::Off);
        }
    }

    #[test]
    fn stale_sample_stops_even_when_level_was_high() {
        let mut controller = running();
        let reading = Reading::Valid {
            level: Level::new(600).unwrap(),
            observed_at: Millis(30_000),
        };
        for now in (30_100..=30_500).step_by(100) {
            assert_eq!(
                controller.update(Millis(now), reading, Command::None).relay,
                RelayCommand::On
            );
        }
        assert_eq!(
            controller
                .update(Millis(30_501), reading, Command::None)
                .state,
            State::Fault(Fault::Stale)
        );
    }

    #[test]
    fn one_cached_reading_cannot_prove_stable_recovery() {
        let mut config = config();
        config.max_sample_age_ms = 60_000;
        let mut controller = Controller::new(config, Millis(0));
        let reading = Reading::Valid {
            level: Level::new(600).unwrap(),
            observed_at: Millis(0),
        };
        controller.update(Millis(0), reading, Command::None);
        assert_eq!(
            controller
                .update(Millis(30_000), reading, Command::None)
                .relay,
            RelayCommand::Off
        );
    }

    #[test]
    fn maintenance_is_latched_and_exit_requires_fresh_recovery() {
        let mut controller = running();
        assert_eq!(
            controller
                .update(
                    Millis(30_100),
                    Reading::Invalid(Fault::Disconnected),
                    Command::EnterMaintenance
                )
                .state,
            State::Maintenance
        );
        for now in (30_200..=70_000).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 600).state, State::Maintenance);
        }
        let reading = Reading::Valid {
            level: Level::new(600).unwrap(),
            observed_at: Millis(70_100),
        };
        assert_eq!(
            controller
                .update(Millis(70_100), reading, Command::ExitMaintenance)
                .relay,
            RelayCommand::Off
        );
        for now in (70_200..80_100).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 600).relay, RelayCommand::Off);
        }
        assert_eq!(fresh(&mut controller, 80_100, 600).relay, RelayCommand::On);
    }

    #[test]
    fn long_control_gap_requires_recovery_even_with_new_data() {
        let mut controller = running();
        assert_eq!(
            fresh(&mut controller, 31_000, 600).state,
            State::Fault(Fault::ControlGap)
        );
        assert_eq!(fresh(&mut controller, 31_100, 600).relay, RelayCommand::Off);
    }

    #[test]
    fn a_fault_restarts_the_minimum_off_period() {
        let mut controller = running();
        controller.update(Millis(30_100), Reading::Invalid(Fault::Bus), Command::None);
        for now in (30_200..60_100).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 600).relay, RelayCommand::Off);
        }
        assert_eq!(fresh(&mut controller, 60_100, 600).relay, RelayCommand::On);
    }

    #[test]
    fn a_dip_below_restart_discards_the_recovery_timer() {
        let mut controller = Controller::new(config(), Millis(0));
        for now in (0..=30_000).step_by(100) {
            fresh(&mut controller, now, 100);
        }
        for now in (30_100..=39_100).step_by(100) {
            fresh(&mut controller, now, 600);
        }
        fresh(&mut controller, 39_200, 399);
        for now in (39_300..49_300).step_by(100) {
            assert_eq!(fresh(&mut controller, now, 600).relay, RelayCommand::Off);
        }
        assert_eq!(fresh(&mut controller, 49_300, 600).relay, RelayCommand::On);
    }

    #[test]
    fn maintenance_entry_survives_a_bad_clock_and_requires_an_explicit_exit() {
        let mut controller = running();
        assert_eq!(
            controller
                .update(
                    Millis(29_000),
                    Reading::Invalid(Fault::Bus),
                    Command::EnterMaintenance
                )
                .state,
            State::Maintenance
        );
        assert_eq!(
            fresh(&mut controller, 30_100, 600).state,
            State::Maintenance
        );
    }

    #[test]
    fn invalid_times_fail_closed() {
        let mut controller = running();
        let reading = Reading::Valid {
            level: Level::new(600).unwrap(),
            observed_at: Millis(30_200),
        };
        assert_eq!(
            controller
                .update(Millis(30_100), reading, Command::None)
                .state,
            State::Fault(Fault::FutureSample)
        );
        assert_eq!(
            fresh(&mut controller, 30_099, 600).state,
            State::Fault(Fault::ClockWentBackwards)
        );
    }
}
