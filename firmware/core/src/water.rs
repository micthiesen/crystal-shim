//! Confirmed water transitions for advisory notifications, independent of run demand.
use crate::{Config, Millis, Reading};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WaterState {
    Low,
    High,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WaterTransition {
    pub from: WaterState,
    pub to: WaterState,
}

pub(crate) struct WaterMonitor {
    config: Config,
    pub state: Option<WaterState>,
    candidate: Option<(WaterState, Millis)>,
    last_tick: Millis,
}

impl WaterMonitor {
    pub const fn new(config: Config, now: Millis) -> Self {
        Self {
            config,
            state: None,
            candidate: None,
            last_tick: now,
        }
    }

    pub fn update(&mut self, now: Millis, reading: Reading) -> Option<WaterTransition> {
        if now < self.last_tick || now.0 - self.last_tick.0 > self.config.max_sample_age_ms {
            self.candidate = None;
            self.last_tick = now.max(self.last_tick);
            return None;
        }
        self.last_tick = now;
        let Reading::Valid { level, observed_at } = reading else {
            self.candidate = None;
            return None;
        };
        if observed_at > now || now.0 - observed_at.0 > self.config.max_sample_age_ms {
            self.candidate = None;
            return None;
        }
        let (target, delay) = if level <= self.config.stop {
            (WaterState::Low, self.config.timing.low_confirmation_ms)
        } else if level >= self.config.restart {
            (WaterState::High, self.config.timing.recovery_ms)
        } else {
            self.candidate = None;
            return None;
        };
        if self.state == Some(target) {
            self.candidate = None;
            return None;
        }
        let since = match self.candidate {
            Some((candidate, since)) if candidate == target => since,
            _ => {
                self.candidate = Some((target, now));
                now
            }
        };
        if observed_at.0.saturating_sub(since.0) < delay {
            return None;
        }
        self.candidate = None;
        self.state
            .replace(target)
            .map(|from| WaterTransition { from, to: target })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Fault, Level, Timing};

    fn monitor() -> WaterMonitor {
        WaterMonitor::new(
            Config::new(
                Level::new(200).unwrap(),
                Level::new(400).unwrap(),
                100,
                Timing {
                    low_confirmation_ms: 100,
                    recovery_ms: 200,
                    minimum_off_ms: 300,
                },
            )
            .unwrap(),
            Millis(0),
        )
    }

    fn fresh(monitor: &mut WaterMonitor, now: u64, level: u16) -> Option<WaterTransition> {
        monitor.update(
            Millis(now),
            Reading::Valid {
                level: Level::new(level).unwrap(),
                observed_at: Millis(now),
            },
        )
    }

    #[test]
    fn first_low_classification_is_silent_and_edges_are_not_repeated() {
        let mut monitor = monitor();
        for now in (0..=100).step_by(50) {
            assert_eq!(fresh(&mut monitor, now, 100), None);
        }
        assert_eq!(monitor.state, Some(WaterState::Low));
        for now in (150..350).step_by(50) {
            assert_eq!(fresh(&mut monitor, now, 600), None);
        }
        assert_eq!(
            fresh(&mut monitor, 350, 600),
            Some(WaterTransition {
                from: WaterState::Low,
                to: WaterState::High
            })
        );
        for now in (400..=600).step_by(50) {
            assert_eq!(fresh(&mut monitor, now, 600), None);
        }
    }

    #[test]
    fn intermediate_band_and_faults_reset_confirmation_without_fabricating_edges() {
        let mut monitor = monitor();
        for now in (0..=200).step_by(50) {
            fresh(&mut monitor, now, 600);
        }
        fresh(&mut monitor, 250, 100);
        fresh(&mut monitor, 300, 300);
        assert_eq!(fresh(&mut monitor, 350, 100), None);
        assert_eq!(
            monitor.update(Millis(400), Reading::Invalid(Fault::Bus)),
            None
        );
        assert_eq!(fresh(&mut monitor, 450, 100), None);
        assert_eq!(fresh(&mut monitor, 500, 100), None);
        assert_eq!(
            fresh(&mut monitor, 550, 100),
            Some(WaterTransition {
                from: WaterState::High,
                to: WaterState::Low
            })
        );
    }

    #[test]
    fn cached_stale_and_future_samples_cannot_confirm_a_water_change() {
        let mut monitor = monitor();
        let reading = Reading::Valid {
            level: Level::new(600).unwrap(),
            observed_at: Millis(0),
        };
        for now in (0..=300).step_by(50) {
            assert_eq!(monitor.update(Millis(now), reading), None);
        }
        assert_eq!(monitor.state, None);
        assert_eq!(
            monitor.update(
                Millis(350),
                Reading::Valid {
                    level: Level::new(600).unwrap(),
                    observed_at: Millis(400)
                }
            ),
            None
        );
        assert_eq!(monitor.state, None);
    }
}
