//! Demand arbitration. Calendar/timezone and Matter adapters stay outside this module.
use crate::{water::WaterMonitor, WaterState, WaterTransition};
use crate::{
    Command, Config, ConfigError, Controller, Demand, Fault, Millis, Reading, RelayCommand, State,
    Status,
};

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct WindowId(pub u64);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ScheduledWindow {
    /// Strictly increasing identity assigned by the scheduler. Never recycle an ID.
    pub id: WindowId,
    /// Original absolute monotonic end. The adapter supplies only an active window.
    pub ends_at: Millis,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SwitchCommand {
    None,
    On,
    Off,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HardwarePermit {
    Allowed,
    ForcedOff,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Inputs {
    pub reading: Reading,
    pub window: Option<ScheduledWindow>,
    pub switch: SwitchCommand,
    pub maintenance: Command,
    pub hardware: HardwarePermit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SupervisorConfig {
    interlock: Config,
    max_run_ms: u64,
}

impl SupervisorConfig {
    /// Configurable initial schedule/override duration: fifteen minutes.
    pub const INITIAL_MAX_RUN_MS: u64 = 900_000;

    pub const fn new(interlock: Config, max_run_ms: u64) -> Result<Self, ConfigError> {
        if max_run_ms == 0 {
            return Err(ConfigError::ZeroDuration);
        }
        Ok(Self {
            interlock,
            max_run_ms,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SupervisorStatus {
    pub control: Status,
    pub demand: Demand,
    pub deadline: Option<Millis>,
    pub suppressed_window: Option<WindowId>,
    pub water_state: Option<WaterState>,
    /// Returned once on the update that confirms the edge. `status()` never repeats it.
    pub water_transition: Option<WaterTransition>,
}

#[derive(Clone, Copy)]
struct Run {
    demand: Demand,
    requested_at: Millis,
    deadline: Millis,
    window_id: Option<WindowId>,
}

pub struct Supervisor {
    interlock: Controller,
    config: SupervisorConfig,
    last_window: Option<ScheduledWindow>,
    suppressed_window: Option<WindowId>,
    run: Option<Run>,
    water: WaterMonitor,
}

impl Supervisor {
    pub const fn new(config: SupervisorConfig, now: Millis) -> Self {
        Self {
            interlock: Controller::new(config.interlock, now),
            config,
            last_window: None,
            suppressed_window: None,
            run: None,
            water: WaterMonitor::new(config.interlock, now),
        }
    }

    pub fn status(&self) -> SupervisorStatus {
        SupervisorStatus {
            control: self.interlock.status(),
            demand: self.run.map_or(Demand::Off, |run| run.demand),
            deadline: self.run.map(|run| run.deadline),
            suppressed_window: self.suppressed_window,
            water_state: self.water.state,
            water_transition: None,
        }
    }

    /// Changes are local configuration, not run requests. Shortening the run limit
    /// clamps an existing deadline from its original request; increasing never extends it.
    pub fn reconfigure(&mut self, config: SupervisorConfig) {
        if config.interlock != self.config.interlock {
            // A calibration/threshold edit establishes a new silent baseline.
            self.water = WaterMonitor::new(config.interlock, self.interlock.last_tick);
            self.interlock.low_since = None;
            self.interlock.recovery_since = None;
        }
        self.config = config;
        self.interlock.config = config.interlock;
        if let Some(run) = &mut self.run {
            run.deadline = run
                .deadline
                .min(Millis(run.requested_at.0.saturating_add(config.max_run_ms)));
        }
    }

    fn active_window(
        &mut self,
        now: Millis,
        incoming: Option<ScheduledWindow>,
    ) -> Option<ScheduledWindow> {
        let mut window = incoming?;
        if let Some(previous) = self.last_window {
            if window.id < previous.id {
                return None;
            }
            if window.id == previous.id {
                // Neither an adapter bug nor a schedule edit can extend this instance.
                window.ends_at = window.ends_at.min(previous.ends_at);
            }
        }
        self.last_window = Some(window);
        (now < window.ends_at).then_some(window)
    }

    fn suppress(&mut self, window: Option<ScheduledWindow>) {
        if let Some(window) = window {
            self.suppressed_window = Some(window.id);
        }
    }

    fn new_run(&self, now: Millis, demand: Demand) -> Run {
        Run {
            demand,
            requested_at: now,
            deadline: Millis(now.0.saturating_add(self.config.max_run_ms)),
            window_id: None,
        }
    }

    pub fn update(&mut self, now: Millis, input: Inputs) -> SupervisorStatus {
        let water_transition = self.water.update(now, input.reading);
        let reading = match input.hardware {
            HardwarePermit::Allowed => input.reading,
            HardwarePermit::ForcedOff => Reading::Invalid(Fault::HardwareOff),
        };
        if now < self.interlock.last_tick {
            if input.switch == SwitchCommand::Off {
                self.run = None;
                self.suppress(
                    self.last_window
                        .filter(|window| self.interlock.last_tick < window.ends_at),
                );
            }
            self.interlock
                .update_with_demand(now, reading, input.maintenance, Demand::Off);
            if self.run.is_some_and(|run| run.demand == Demand::Override) {
                self.run = None;
            }
            return SupervisorStatus {
                water_transition,
                ..self.status()
            };
        }
        let window = self.active_window(now, input.window);
        if let (Some(run), Some(window)) = (&mut self.run, window) {
            if run.demand == Demand::Automatic {
                run.deadline = run.deadline.min(window.ends_at);
            }
        }
        let expired_run = self.run.filter(|run| now >= run.deadline);
        let expired = expired_run.is_some();
        if let Some(run) = expired_run {
            self.run = None;
            if run.demand == Demand::Automatic {
                self.suppressed_window = run.window_id;
            } else {
                self.suppress(window);
            }
        }

        match input.switch {
            SwitchCommand::Off => {
                self.run = None;
                // Retain the current instance even if the calendar adapter briefly
                // withholds its window, for example while time is being resynchronized.
                self.suppress(window.or(self.last_window.filter(|window| now < window.ends_at)));
            }
            SwitchCommand::On if !expired => {
                self.run = Some(match self.run {
                    Some(run)
                        if run.demand == Demand::Override
                            || self.interlock.status().relay == RelayCommand::On =>
                    {
                        // An ON command can change mode, never an active run's deadline.
                        Run {
                            demand: Demand::Override,
                            ..run
                        }
                    }
                    _ => self.new_run(now, Demand::Override),
                });
            }
            SwitchCommand::None | SwitchCommand::On => {}
        }

        if self.run.is_none() && !expired && input.switch != SwitchCommand::Off {
            if let Some(window) = window.filter(|window| Some(window.id) != self.suppressed_window)
            {
                let mut run = self.new_run(now, Demand::Automatic);
                run.deadline = run.deadline.min(window.ends_at);
                run.window_id = Some(window.id);
                self.run = Some(run);
            }
        }
        let demand = self.run.map_or(Demand::Off, |run| match run.demand {
            Demand::Automatic if window.is_none() => Demand::Off,
            demand => demand,
        });
        let control = self
            .interlock
            .update_with_demand(now, reading, input.maintenance, demand);
        if matches!(control.state, State::Fault(_) | State::Maintenance)
            && self.run.is_some_and(|run| run.demand == Demand::Override)
        {
            // Do not queue an override through a fault or maintenance for a surprise restart.
            self.run = None;
            self.suppress(window);
        }
        SupervisorStatus {
            water_transition,
            ..self.status()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Level, Timing};

    fn config(max_run_ms: u64) -> SupervisorConfig {
        let interlock = Config::new(
            Level::new(200).unwrap(),
            Level::new(400).unwrap(),
            100,
            Timing {
                low_confirmation_ms: 100,
                recovery_ms: 200,
                minimum_off_ms: 300,
            },
        )
        .unwrap();
        SupervisorConfig::new(interlock, max_run_ms).unwrap()
    }

    fn window(id: u64, end: u64) -> Option<ScheduledWindow> {
        Some(ScheduledWindow {
            id: WindowId(id),
            ends_at: Millis(end),
        })
    }

    fn input(now: u64, level: u16, window: Option<ScheduledWindow>) -> Inputs {
        Inputs {
            reading: Reading::Valid {
                level: Level::new(level).unwrap(),
                observed_at: Millis(now),
            },
            window,
            switch: SwitchCommand::None,
            maintenance: Command::None,
            hardware: HardwarePermit::Allowed,
        }
    }

    fn tick(
        controller: &mut Supervisor,
        now: u64,
        level: u16,
        window: Option<ScheduledWindow>,
    ) -> SupervisorStatus {
        controller.update(Millis(now), input(now, level, window))
    }

    fn automatic() -> Supervisor {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        for now in (0..=300).step_by(50) {
            tick(&mut controller, now, 600, window(1, 1000));
        }
        assert_eq!(controller.status().control.relay, RelayCommand::On);
        controller
    }

    fn manual() -> Supervisor {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        let mut first = input(0, 100, None);
        first.switch = SwitchCommand::On;
        assert_eq!(
            controller.update(Millis(0), first).control.relay,
            RelayCommand::Off
        );
        for now in (50..300).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 100, None).control.relay,
                RelayCommand::Off
            );
        }
        assert_eq!(
            tick(&mut controller, 300, 100, None).control.relay,
            RelayCommand::On
        );
        controller
    }

    #[test]
    fn scheduled_run_requires_high_water_and_expires_at_original_end() {
        let mut controller = automatic();
        for now in (350..1000).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 600, window(1, 3000)).deadline,
                Some(Millis(1000))
            );
        }
        assert_eq!(
            tick(&mut controller, 1000, 600, window(1, 3000))
                .control
                .relay,
            RelayCommand::Off
        );
        assert_eq!(
            tick(&mut controller, 1050, 600, None).control.relay,
            RelayCommand::Off
        );
        let mut low = Supervisor::new(config(1500), Millis(0));
        for now in (0..=1000).step_by(50) {
            assert_eq!(
                tick(&mut low, now, 100, window(1, 1000)).control.relay,
                RelayCommand::Off
            );
        }
    }

    #[test]
    fn homekit_off_suppresses_current_window_but_not_a_later_slot() {
        let mut controller = automatic();
        let mut off = input(350, 600, window(1, 1000));
        off.switch = SwitchCommand::Off;
        assert_eq!(
            controller.update(Millis(350), off).control.relay,
            RelayCommand::Off
        );
        for now in (400..=1000).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 600, window(1, 1000))
                    .control
                    .relay,
                RelayCommand::Off
            );
        }
        for now in (1050..1250).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 600, window(2, 2000))
                    .control
                    .relay,
                RelayCommand::Off
            );
        }
        assert_eq!(
            tick(&mut controller, 1250, 600, window(2, 2000))
                .control
                .relay,
            RelayCommand::On
        );
    }

    #[test]
    fn off_survives_a_temporarily_missing_window_and_a_bad_clock() {
        for now in [250, 350] {
            let mut controller = automatic();
            let mut off = input(now, 600, None);
            off.switch = SwitchCommand::Off;
            assert_eq!(
                controller.update(Millis(now), off).control.relay,
                RelayCommand::Off
            );
            for next in (350..=900).step_by(50) {
                assert_eq!(
                    tick(&mut controller, next, 600, window(1, 1000))
                        .control
                        .relay,
                    RelayCommand::Off
                );
            }
        }
    }

    #[test]
    fn manual_low_override_is_bounded_and_repeated_on_cannot_extend_it() {
        let mut controller = manual();
        for now in (350..=1500).step_by(50) {
            let mut on = input(now, 100, None);
            on.switch = SwitchCommand::On;
            let status = controller.update(Millis(now), on);
            if now < 1500 {
                assert_eq!(status.control.relay, RelayCommand::On);
                assert_eq!(status.deadline, Some(Millis(1500)));
            } else {
                assert_eq!(status.control.relay, RelayCommand::Off);
            }
        }
        assert_eq!(
            tick(&mut controller, 1550, 100, None).control.relay,
            RelayCommand::Off
        );
    }

    #[test]
    fn on_during_automatic_run_retains_the_original_deadline() {
        let mut controller = automatic();
        let mut on = input(350, 100, window(1, 1000));
        on.switch = SwitchCommand::On;
        let status = controller.update(Millis(350), on);
        assert_eq!(status.demand, Demand::Override);
        assert_eq!(status.deadline, Some(Millis(1000)));
        for now in (400..=1000).step_by(50) {
            tick(&mut controller, now, 100, window(1, 1000));
        }
        assert_eq!(controller.status().control.relay, RelayCommand::Off);
    }

    #[test]
    fn off_then_explicit_on_starts_a_new_override_after_minimum_off() {
        let mut controller = automatic();
        let mut off = input(350, 100, window(1, 1000));
        off.switch = SwitchCommand::Off;
        controller.update(Millis(350), off);
        let mut on = input(400, 100, window(1, 1000));
        on.switch = SwitchCommand::On;
        assert_eq!(
            controller.update(Millis(400), on).deadline,
            Some(Millis(1900))
        );
        for now in (450..650).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 100, window(1, 1000))
                    .control
                    .relay,
                RelayCommand::Off
            );
        }
        assert_eq!(
            tick(&mut controller, 650, 100, window(1, 1000))
                .control
                .relay,
            RelayCommand::On
        );
    }

    #[test]
    fn overlapping_and_adjacent_windows_cannot_extend_continuous_run() {
        for change_at in [700, 1000] {
            let mut controller = automatic();
            for now in (350..=1000).step_by(50) {
                let active = if now >= change_at {
                    window(2, 2000)
                } else {
                    window(1, 1000)
                };
                let status = tick(&mut controller, now, 600, active);
                if now < 1000 {
                    assert_eq!(status.deadline, Some(Millis(1000)));
                }
            }
            assert_eq!(controller.status().control.relay, RelayCommand::Off);
            for now in (1050..1300).step_by(50) {
                assert_eq!(
                    tick(&mut controller, now, 600, window(2, 2000))
                        .control
                        .relay,
                    RelayCommand::Off
                );
            }
            assert_eq!(
                tick(&mut controller, 1300, 600, window(2, 2000))
                    .control
                    .relay,
                RelayCommand::On
            );
        }
    }

    #[test]
    fn expiry_after_a_gap_does_not_suppress_a_new_window() {
        let mut controller = automatic();
        for now in (350..1000).step_by(50) {
            tick(&mut controller, now, 600, None);
        }
        let status = tick(&mut controller, 1000, 600, window(2, 2000));
        assert_eq!(status.suppressed_window, Some(WindowId(1)));
        for now in (1050..=1250).step_by(50) {
            tick(&mut controller, now, 600, window(2, 2000));
        }
        assert_eq!(controller.status().control.relay, RelayCommand::On);
    }

    #[test]
    fn faults_hardware_off_and_maintenance_cancel_manual_override() {
        for case in 0..4 {
            let mut controller = manual();
            let mut failed = input(350, 100, None);
            match case {
                0 => failed.reading = Reading::Invalid(Fault::Disconnected),
                1 => {
                    failed.reading = Reading::Valid {
                        level: Level::new(100).unwrap(),
                        observed_at: Millis(0),
                    }
                }
                2 => failed.maintenance = Command::EnterMaintenance,
                _ => failed.hardware = HardwarePermit::ForcedOff,
            }
            let status = controller.update(Millis(350), failed);
            assert_eq!(status.control.relay, RelayCommand::Off);
            assert_eq!(status.demand, Demand::Off);
            let mut restored = input(400, 100, None);
            restored.maintenance = Command::ExitMaintenance;
            assert_eq!(
                controller.update(Millis(400), restored).control.relay,
                RelayCommand::Off
            );
        }
    }

    #[test]
    fn on_with_invalid_sensor_is_not_queued_for_later() {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        let mut failed = input(0, 100, None);
        failed.reading = Reading::Invalid(Fault::Disconnected);
        failed.switch = SwitchCommand::On;
        assert_eq!(controller.update(Millis(0), failed).demand, Demand::Off);
        for now in (50..=500).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 100, None).control.relay,
                RelayCommand::Off
            );
        }
    }

    #[test]
    fn changed_thresholds_require_new_recovery_confirmation() {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        for now in (0..=250).step_by(50) {
            tick(&mut controller, now, 600, window(1, 1000));
        }
        let mut changed = config(1500);
        changed.interlock.restart = Level::new(800).unwrap();
        controller.reconfigure(changed);
        for now in (300..500).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 900, window(1, 1000))
                    .control
                    .relay,
                RelayCommand::Off
            );
        }
        assert_eq!(
            tick(&mut controller, 500, 900, window(1, 1000))
                .control
                .relay,
            RelayCommand::On
        );
    }

    #[test]
    fn changing_run_duration_cannot_extend_an_active_request() {
        let mut controller = manual();
        controller.reconfigure(config(3000));
        assert_eq!(controller.status().deadline, Some(Millis(1500)));
        controller.reconfigure(config(500));
        assert_eq!(controller.status().deadline, Some(Millis(500)));
        for now in (350..=500).step_by(50) {
            tick(&mut controller, now, 100, None);
        }
        assert_eq!(controller.status().control.relay, RelayCommand::Off);
        assert_eq!(
            SupervisorConfig::new(config(1500).interlock, 0),
            Err(ConfigError::ZeroDuration)
        );
    }

    #[test]
    fn high_water_recovery_cannot_restart_outside_original_window() {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        for now in (0..800).step_by(50) {
            tick(&mut controller, now, 100, window(1, 1000));
        }
        for now in (800..=1100).step_by(50) {
            assert_eq!(
                tick(&mut controller, now, 600, window(1, 1000))
                    .control
                    .relay,
                RelayCommand::Off
            );
        }
    }

    #[test]
    fn water_edges_are_independent_of_schedule_relay_and_manual_override() {
        let mut controller = Supervisor::new(config(1500), Millis(0));
        for now in (0..=200).step_by(50) {
            let status = tick(&mut controller, now, 600, None);
            assert_eq!(status.control.relay, RelayCommand::Off);
            assert_eq!(status.water_transition, None);
        }
        assert_eq!(controller.status().water_state, Some(WaterState::High));
        for now in (250..350).step_by(50) {
            tick(&mut controller, now, 100, None);
        }
        let mut on = input(350, 100, None);
        on.switch = SwitchCommand::On;
        let status = controller.update(Millis(350), on);
        assert_eq!(status.control.relay, RelayCommand::On);
        assert_eq!(
            status.water_transition,
            Some(WaterTransition {
                from: WaterState::High,
                to: WaterState::Low
            })
        );
        assert_eq!(controller.status().water_transition, None);
        for now in (400..600).step_by(50) {
            assert_eq!(tick(&mut controller, now, 600, None).water_transition, None);
        }
        assert_eq!(
            tick(&mut controller, 600, 600, None).water_transition,
            Some(WaterTransition {
                from: WaterState::Low,
                to: WaterState::High
            })
        );
    }
}
