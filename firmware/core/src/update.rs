//! Firmware-update reset and self-confirmation policy.
//!
//! Pure decisions only. The app owns the gated OTA flash client and the reset.
//! A reset never energizes the relay: boot starts off and an eligible run is
//! converted to suppressed before control can use it, so these decisions trade
//! availability against image trust, never against output safety.

/// A newly booted image must prove itself within this bound or is rolled back.
pub const CONFIRM_DEADLINE_MS: u64 = 300_000;
/// A requested reset waits at most this long for in-flight retained or
/// configuration writes, so an update does not land the unit in revision-mismatch
/// maintenance recovery. Expiry resets anyway; recovery from that is also safe.
pub const STORAGE_GRACE_MS: u64 = 10_000;
/// Calibrated valid readings must have been continuous for this long.
pub const SENSOR_STABLE_MS: u64 = 10_000;
/// A reading counts as current only if acquired this recently (frames are ~50 ms apart).
pub const SENSOR_FRESH_MS: u64 = 1_000;
/// The Priority3 output owner must have completed an iteration this recently.
pub const CONTROL_FRESH_MS: u64 = 1_000;

/// Evidence that this image can do the unit's job. Every field must hold at once.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct Health {
    /// The gated storage owner opened and boot records loaded without error.
    pub storage_ready: bool,
    /// Last completed output iteration, in the same monotonic milliseconds.
    pub control_observed_at_ms: Option<u64>,
    /// Matter has an operational interface with an IPv4 address.
    pub network_operational: bool,
    /// Start of the current unbroken run of fresh, valid calibrated readings
    /// (see [`SensorStability`]).
    pub sensor_valid_since_ms: Option<u64>,
}

impl Health {
    pub fn is_healthy(&self, now_ms: u64) -> bool {
        self.storage_ready
            && self.network_operational
            && self
                .sensor_valid_since_ms
                .is_some_and(|since| since <= now_ms && now_ms - since >= SENSOR_STABLE_MS)
            && self
                .control_observed_at_ms
                .is_some_and(|at| at <= now_ms && now_ms - at < CONTROL_FRESH_MS)
    }
}

/// Tracks an unbroken run of current, valid sensor readings across polls. Any
/// poll that sees an invalid or stale reading, or any new acquisition failure
/// between polls, restarts the run: "worked once" is not evidence.
#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct SensorStability {
    since: Option<u64>,
    failures: Option<u32>,
}

impl SensorStability {
    /// `valid_observed_at_ms` is the acquisition time of the current reading when
    /// it is valid; `failures` is the driver's monotonically increasing failure count.
    pub fn observe(
        &mut self,
        now_ms: u64,
        valid_observed_at_ms: Option<u64>,
        failures: u32,
    ) -> Option<u64> {
        let current =
            valid_observed_at_ms.is_some_and(|at| at <= now_ms && now_ms - at <= SENSOR_FRESH_MS);
        let failed = self.failures.is_some_and(|seen| seen != failures);
        self.failures = Some(failures);
        self.since = if current && !failed {
            Some(self.since.unwrap_or(now_ms))
        } else {
            None
        };
        self.since
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Confirmation {
    Wait,
    /// Mark the running image valid.
    Confirm,
    /// Reset without confirming; the rollback bootloader starts the previous image.
    RollBack,
}

/// Decide for an image that booted unconfirmed at `booted_at_ms`.
/// Health observed on the deadline tick still confirms. A clock that went
/// backwards cannot extend the trial. Without a rollback bootloader a reset
/// would restart the same image, so the trial never resets: it keeps waiting
/// for health instead of looping through resets.
pub fn confirmation(
    now_ms: u64,
    booted_at_ms: u64,
    health: Health,
    rollback_supported: bool,
) -> Confirmation {
    if health.is_healthy(now_ms) {
        Confirmation::Confirm
    } else if rollback_supported
        && (now_ms < booted_at_ms || now_ms - booted_at_ms >= CONFIRM_DEADLINE_MS)
    {
        Confirmation::RollBack
    } else {
        Confirmation::Wait
    }
}

/// Whether a new upload may start. An upload forces the relay off for its whole
/// duration and ends in a reset that suppresses the current window, so it waits
/// until no run or override is active, the relay is commanded off and no
/// retained/configuration write is in flight. `None` means control has no
/// runtime (unconfigured): the relay is off. An upload already in progress
/// continues regardless; esp-ota retries a refused `Begin` for two minutes.
pub fn accepts_upload(status: Option<crate::SupervisorStatus>, storage_idle: bool) -> bool {
    storage_idle
        && status.is_none_or(|status| {
            status.control.relay == crate::RelayCommand::Off && status.demand == crate::Demand::Off
        })
}

/// Whether a requested update or rollback reset may happen now.
pub fn reset_ready(now_ms: u64, requested_at_ms: u64, storage_idle: bool) -> bool {
    storage_idle || now_ms < requested_at_ms || now_ms - requested_at_ms >= STORAGE_GRACE_MS
}

#[cfg(test)]
mod tests {
    use super::*;

    fn healthy(now: u64) -> Health {
        Health {
            storage_ready: true,
            control_observed_at_ms: Some(now),
            network_operational: true,
            sensor_valid_since_ms: Some(now - SENSOR_STABLE_MS),
        }
    }

    #[test]
    fn every_health_signal_is_required_to_confirm() {
        let now = 50_000;
        assert_eq!(
            confirmation(now, 0, healthy(now), true),
            Confirmation::Confirm
        );
        let broken = [
            Health {
                storage_ready: false,
                ..healthy(now)
            },
            Health {
                network_operational: false,
                ..healthy(now)
            },
            Health {
                sensor_valid_since_ms: Some(now - SENSOR_STABLE_MS + 1),
                ..healthy(now)
            },
            Health {
                sensor_valid_since_ms: None,
                ..healthy(now)
            },
            Health {
                control_observed_at_ms: None,
                ..healthy(now)
            },
            // A stalled output owner is not rescued by a stale observation.
            Health {
                control_observed_at_ms: Some(now - CONTROL_FRESH_MS),
                ..healthy(now)
            },
            // An observation from the future is not evidence either.
            Health {
                control_observed_at_ms: Some(now + 1),
                ..healthy(now)
            },
        ];
        for health in broken {
            assert_eq!(
                confirmation(now, 0, health, true),
                Confirmation::Wait,
                "{health:?}"
            );
        }
    }

    #[test]
    fn unhealthy_image_rolls_back_at_the_deadline_but_health_on_that_tick_confirms() {
        let unhealthy = Health::default();
        let boot = 1_000;
        let deadline = boot + CONFIRM_DEADLINE_MS;
        assert_eq!(
            confirmation(deadline - 1, boot, unhealthy, true),
            Confirmation::Wait
        );
        assert_eq!(
            confirmation(deadline, boot, unhealthy, true),
            Confirmation::RollBack
        );
        assert_eq!(
            confirmation(deadline, boot, healthy(deadline), true),
            Confirmation::Confirm
        );
        assert_eq!(
            confirmation(boot - 1, boot, unhealthy, true),
            Confirmation::RollBack
        );
    }

    #[test]
    fn without_rollback_support_an_unhealthy_image_is_never_reset_in_a_loop() {
        let late = CONFIRM_DEADLINE_MS * 10;
        assert_eq!(
            confirmation(late, 0, Health::default(), false),
            Confirmation::Wait
        );
        assert_eq!(
            confirmation(late, 0, healthy(late), false),
            Confirmation::Confirm
        );
    }

    #[test]
    fn sensor_evidence_must_be_current_valid_and_unbroken() {
        let mut track = SensorStability::default();
        assert_eq!(track.observe(1_000, Some(1_000), 0), Some(1_000));
        assert_eq!(track.observe(2_000, Some(1_950), 0), Some(1_000));
        // A stale (cached) valid reading breaks the run.
        assert_eq!(track.observe(4_000, Some(2_000), 0), None);
        assert_eq!(track.observe(5_000, Some(5_000), 0), Some(5_000));
        // A failure between polls breaks it even if the latest reading is valid.
        assert_eq!(track.observe(6_000, Some(6_000), 1), None);
        assert_eq!(track.observe(7_000, Some(7_000), 1), Some(7_000));
        // Invalid or future readings break it.
        assert_eq!(track.observe(8_000, None, 1), None);
        assert_eq!(track.observe(9_000, Some(9_001), 1), None);
    }

    #[test]
    fn uploads_wait_for_an_idle_output_and_storage() {
        use crate::{Demand, RelayCommand, State, Status, SupervisorStatus};
        let status = |relay, demand| SupervisorStatus {
            control: Status {
                state: State::Idle,
                relay,
            },
            demand,
            deadline: None,
            suppressed_window: None,
            water_state: None,
            water_transition: None,
        };
        assert!(accepts_upload(None, true));
        assert!(accepts_upload(
            Some(status(RelayCommand::Off, Demand::Off)),
            true
        ));
        assert!(!accepts_upload(
            Some(status(RelayCommand::Off, Demand::Off)),
            false
        ));
        assert!(!accepts_upload(
            Some(status(RelayCommand::On, Demand::Automatic)),
            true
        ));
        // A pending override waiting out minimum-off is still an active run.
        assert!(!accepts_upload(
            Some(status(RelayCommand::Off, Demand::Override)),
            true
        ));
    }

    #[test]
    fn reset_waits_for_pending_storage_only_within_the_grace_period() {
        let requested = 10_000;
        assert!(reset_ready(requested, requested, true));
        assert!(!reset_ready(requested, requested, false));
        assert!(!reset_ready(
            requested + STORAGE_GRACE_MS - 1,
            requested,
            false
        ));
        assert!(reset_ready(requested + STORAGE_GRACE_MS, requested, false));
        assert!(reset_ready(requested - 1, requested, false));
    }
}
