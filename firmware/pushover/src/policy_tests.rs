use super::*;
use crystal_shim_core::{configuration::PushoverCredentials, utc_bounds::UtcBounds, WaterState};
fn credentials() -> PushoverCredentials {
    PushoverCredentials::new(
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
        Some("tank"),
    )
    .unwrap()
}
fn observe(now: u64) -> Observation {
    Observation {
        now_ms: now,
        revision: Some(1),
        credentials: Some(credentials()),
        transition: Some(WaterTransition {
            from: WaterState::High,
            to: WaterState::Low,
        }),
        relay_on: false,
        state: State::Low,
        utc_bounds: UtcBounds::new(1000, 1002),
    }
}
fn none(now: u64) -> Observation {
    Observation {
        transition: None,
        ..observe(now)
    }
}
#[test]
fn captures_exact_edges_without_reclassification_or_coalescing() {
    let mut q = Queue::new();
    assert_eq!(q.observe(none(0)), None);
    assert_eq!(q.observe(observe(20)), Some(1));
    let high = Observation {
        transition: Some(WaterTransition {
            from: WaterState::Low,
            to: WaterState::High,
        }),
        relay_on: true,
        state: State::Running,
        ..observe(40)
    };
    assert_eq!(q.observe(high), Some(2));
    q.observe(none(60));
    let first = q.claim(60).unwrap();
    assert_eq!(first.attempt.event.captured_at_ms, 20);
    assert_eq!(
        first.attempt.event.transition,
        observe(20).transition.unwrap()
    );
    assert!(!first.attempt.event.relay_on);
    assert_eq!(first.attempt.event.state, State::Low);
    assert_eq!(first.attempt.event.utc_bounds, UtcBounds::new(1000, 1002));
    assert_eq!(first.attempt.event.expires_at_ms, 20 + EVENT_TTL_MS);
    assert!(q.claim(61).is_none());
    assert!(q.finish(61, first.attempt.token, Outcome::ApiAccepted));
    assert!(!q.finish(61, first.attempt.token, Outcome::ApiAccepted));
    let second = q.claim(62).unwrap();
    assert_eq!(second.attempt.event.transition, high.transition.unwrap());
    assert!(second.attempt.event.relay_on);
    q.finish(63, second.attempt.token, Outcome::ApiAccepted);
    assert!(q.claim(64).is_none());
    assert_eq!(q.diagnostics().stats.observed, 2);
    assert_eq!(q.diagnostics().stats.api_accepted, 2);
}
#[test]
fn capacity_counts_active_and_preserves_it_while_evicting_oldest_pending() {
    let mut q = Queue::new();
    q.observe(observe(0));
    let active = q.claim(0).unwrap();
    for at in 1..=9 {
        q.observe(observe(at));
    }
    assert_eq!(q.len, 7);
    assert!(q.is_current(active.attempt.token, 9));
    assert_eq!(q.diagnostics().stats.evicted, 2);
    q.finish(10, active.attempt.token, Outcome::ApiAccepted);
    for id in 4..=10 {
        let work = q.claim(10).unwrap();
        assert_eq!(work.attempt.event.id, id);
        q.finish(10, work.attempt.token, Outcome::ApiAccepted);
    }
    assert!(q.claim(10).is_none());
}
#[test]
fn retry_backoff_keeps_original_event_and_stops_after_three_attempts() {
    let mut q = Queue::new();
    q.observe(observe(0));
    let first = q.claim(0).unwrap();
    q.finish(
        100,
        first.attempt.token,
        Outcome::Transient { uncertain: true },
    );
    assert!(q.claim(5099).is_none());
    let second = q.claim(5100).unwrap();
    assert_eq!(second.attempt.number, 2);
    assert_eq!(second.attempt.event, first.attempt.event);
    assert_ne!(second.attempt.token, first.attempt.token);
    assert!(!q.finish(5101, first.attempt.token, Outcome::ApiAccepted));
    q.finish(
        5200,
        second.attempt.token,
        Outcome::Transient { uncertain: false },
    );
    assert!(q.claim(35199).is_none());
    let third = q.claim(35200).unwrap();
    assert_eq!(third.attempt.number, 3);
    q.finish(
        35201,
        third.attempt.token,
        Outcome::Transient { uncertain: true },
    );
    assert!(q.claim(100000).is_none());
    assert_eq!(q.stats.retried, 2);
    assert_eq!(q.stats.uncertain, 2);
    assert_eq!(q.stats.failed, 1);
}
#[test]
fn expiry_and_late_acceptance_never_renew_capture_or_acknowledge() {
    let mut q = Queue::new();
    q.observe(observe(0));
    let work = q.claim(EVENT_TTL_MS - 100).unwrap();
    assert_eq!(work.attempt.deadline_ms, EVENT_TTL_MS);
    assert!(!q.is_current(work.attempt.token, EVENT_TTL_MS));
    assert!(!q.finish(EVENT_TTL_MS, work.attempt.token, Outcome::ApiAccepted));
    assert_eq!(q.stats.expired, 1);
    assert_eq!(q.stats.api_accepted, 0);
    let mut q = Queue::new();
    q.observe(observe(0));
    let work = q.claim(0).unwrap();
    q.finish(ATTEMPT_MS, work.attempt.token, Outcome::ApiAccepted);
    assert_eq!(q.stats.api_accepted, 0);
    assert_eq!(q.stats.uncertain, 1);
    assert!(q.claim(ATTEMPT_MS + 4999).is_none());
    assert!(q.claim(ATTEMPT_MS + 5000).is_some());
}
#[test]
fn rejected_generation_survives_schedule_edits_and_explicit_clear_restores_it() {
    for reason in [
        Suspension::Http(400),
        Suspension::Http(429),
        Suspension::Api(0),
        Suspension::Api(2),
    ] {
        let mut q = Queue::new();
        q.observe(observe(0));
        q.observe(observe(1));
        let work = q.claim(1).unwrap();
        q.finish(2, work.attempt.token, Outcome::Suspend(reason));
        assert_eq!(q.diagnostics().suspended, Some(reason));
        assert_eq!(q.len, 0);
        let generation = q.generation;
        q.observe(Observation {
            revision: Some(2),
            ..observe(3)
        });
        assert_eq!(q.generation, generation);
        assert!(q.claim(3).is_none());
        assert_eq!(q.suspended, Some(reason));
        assert_eq!(q.stats.skipped, 1);
        q.observe(Observation {
            revision: Some(3),
            credentials: None,
            ..none(4)
        });
        assert_eq!(q.suspended, None);
        assert_eq!(q.generation, generation + 1);
        q.observe(Observation {
            revision: Some(4),
            ..observe(5)
        });
        let new = q.claim(5).unwrap();
        assert_eq!(new.attempt.event.credential_generation, generation + 2);
        assert!(!q.finish(6, work.attempt.token, Outcome::ApiAccepted));
        assert!(q.is_current(new.attempt.token, 6));
    }
}
#[test]
fn revision_and_credential_changes_cancel_old_pending_and_active_work() {
    let mut q = Queue::new();
    q.observe(observe(0));
    let work = q.claim(0).unwrap();
    q.observe(observe(1));
    q.observe(Observation {
        revision: Some(2),
        ..none(2)
    });
    assert_eq!(q.stats.cancelled, 2);
    assert_eq!(q.stats.uncertain, 1);
    assert!(!q.is_current(work.attempt.token, 2));
    assert!(!q.finish(2, work.attempt.token, Outcome::ApiAccepted));
    assert!(q.claim(2).is_none());
    q.observe(Observation {
        revision: Some(3),
        credentials: None,
        ..observe(3)
    });
    assert!(q.claim(3).is_none());
    assert_eq!(q.stats.skipped, 1);
}
#[test]
fn clock_rollback_and_counter_exhaustion_never_reuse_tokens() {
    let mut q = Queue::new();
    q.observe(observe(10));
    let work = q.claim(10).unwrap();
    assert!(q.claim(9).is_none());
    assert!(!q.is_current(work.attempt.token, 10));
    assert_eq!(q.stats.clock_faults, 1);
    for which in 0..3 {
        let mut q = Queue::new();
        q.observe(none(0));
        match which {
            0 => q.next_event = u64::MAX,
            1 => q.next_attempt = u64::MAX,
            _ => q.generation = u64::MAX,
        };
        if which == 2 {
            q.observe(Observation {
                credentials: None,
                ..none(1)
            });
        } else {
            q.observe(observe(1));
            q.claim(1);
        }
        assert!(q.exhausted);
        assert!(q.claim(2).is_none());
        assert_eq!(q.len, 0);
    }
    let mut q = Queue::new();
    q.observe(observe(u64::MAX));
    assert_eq!(q.stats.expired, 1);
    assert!(q.claim(u64::MAX).is_none());
}

#[test]
fn terminal_and_cancelled_unknown_outcomes_are_visible_without_retries() {
    for outcome in [
        Outcome::ProtocolFailure { uncertain: true },
        Outcome::Cancelled { uncertain: true },
    ] {
        let mut queue = Queue::new();
        queue.observe(observe(0));
        let work = queue.claim(0).unwrap();
        assert!(queue.finish(1, work.attempt.token, outcome));
        assert!(!queue.finish(1, work.attempt.token, outcome));
        assert!(queue.claim(60000).is_none());
        assert_eq!(queue.stats.uncertain, 1);
        assert_eq!(queue.stats.retried, 0);
        assert_eq!(queue.stats.api_accepted, 0);
    }
}

#[test]
fn known_rejections_never_become_retries_at_deadline_or_expiry() {
    for now in [ATTEMPT_MS, EVENT_TTL_MS] {
        let mut queue = Queue::new();
        queue.observe(observe(0));
        let work = queue.claim(0).unwrap();
        queue.observe(observe(1));
        assert!(queue.finish(
            now,
            work.attempt.token,
            Outcome::Suspend(Suspension::Http(429))
        ));
        assert_eq!(queue.diagnostics().suspended, Some(Suspension::Http(429)));
        assert_eq!(queue.stats.retried, 0);
        assert_eq!(queue.stats.rejected, 1);
        assert!(queue.claim(now + 1).is_none());
    }
    let mut queue = Queue::new();
    queue.observe(observe(0));
    let work = queue.claim(0).unwrap();
    queue.observe(Observation {
        revision: Some(2),
        ..none(1)
    });
    assert!(!queue.finish(
        2,
        work.attempt.token,
        Outcome::Suspend(Suspension::Http(429))
    ));
    assert_eq!(queue.diagnostics().suspended, None);
}

#[test]
fn accepted_replacement_cancels_before_durability_and_failure_keeps_delivery_paused() {
    use crystal_shim_core::{
        configuration::{RawDeviceConfig, ValidatedDeviceConfig},
        runtime::{
            Observation as RuntimeObservation, Request, Runtime, RuntimeCommand, StoreCompletion,
        },
        utc::ClockUpdate,
        Fault, HardwarePermit, Millis, Reading, RetainedState, Timing,
    };
    let config = |revision, keys| {
        ValidatedDeviceConfig::from_raw(
            RawDeviceConfig::builder(
                revision,
                200,
                800,
                500,
                Timing::PROVISIONAL,
                900,
                [0x5a; 32],
            )
            .timezone_rule("UTC0")
            .unwrap()
            .pushover(keys)
            .build(),
        )
        .unwrap()
    };
    let old = config(1, Some(credentials()));
    let candidate = config(2, None);
    let mut runtime =
        Runtime::new(Some(old), Some(RetainedState::new(1).unwrap()), Millis(0)).unwrap();
    let observation = |now| RuntimeObservation {
        now: Millis(now),
        sensor_revision: 1,
        reading: Reading::Invalid(Fault::Uncalibrated),
        hardware: HardwarePermit::Allowed,
        maintenance_pressed: false,
        force_off: false,
        clock_update: ClockUpdate::default(),
    };
    // Same sequence as the app's post-output hook; committed values stay old
    // until storage succeeds, while admission immediately pauses delivery.
    let capture = |q: &mut Queue, runtime: &Runtime, now| {
        let current = runtime.configuration().unwrap();
        q.observe(Observation {
            revision: Some(current.revision()),
            credentials: current.pushover().copied(),
            ..none(now)
        });
        if runtime.configuration_pending() {
            q.pause_for_configuration();
        }
    };
    let mut q = Queue::new();
    q.observe(observe(0));
    let active = q.claim(0).unwrap();
    q.observe(observe(1));
    runtime.step(
        observation(2),
        Some(Request {
            id: 1,
            command: RuntimeCommand::SaveConfiguration(candidate),
        }),
        None,
    );
    assert!(runtime.configuration_pending());
    assert_eq!(runtime.configuration().unwrap().revision(), 1);
    capture(&mut q, &runtime, 2);
    assert!(q.diagnostics().configuration_paused);
    assert!(!q.is_current(active.attempt.token, 2));
    assert!(!q.finish(2, active.attempt.token, Outcome::ApiAccepted));
    assert_eq!(q.diagnostics().pending, 0);

    let pending = runtime.store_request().unwrap();
    runtime.step(
        observation(3),
        None,
        Some(StoreCompletion {
            ticket: pending.ticket,
            succeeded: false,
        }),
    );
    assert!(!runtime.configuration_pending());
    assert!(runtime.storage_failed());
    capture(&mut q, &runtime, 3);
    q.observe(observe(4));
    assert!(q.claim(4).is_none());
    assert!(q.diagnostics().configuration_paused);

    runtime.step(
        observation(5),
        Some(Request {
            id: 2,
            command: RuntimeCommand::SaveConfiguration(candidate),
        }),
        None,
    );
    capture(&mut q, &runtime, 5);
    for now in 6..10 {
        if let Some(pending) = runtime.store_request() {
            runtime.step(
                observation(now),
                None,
                Some(StoreCompletion {
                    ticket: pending.ticket,
                    succeeded: true,
                }),
            );
            capture(&mut q, &runtime, now);
        }
    }
    assert_eq!(runtime.configuration().unwrap().revision(), 2);
    assert!(!runtime.configuration_pending());
    assert!(!q.diagnostics().configuration_paused);
    assert!(q.claim(10).is_none());
    assert_eq!(q.credentials, None);
    assert_eq!(q.stats.api_accepted, 0);
    assert_eq!(q.stats.uncertain, 1);
}

#[test]
fn configuration_pause_cannot_clear_a_rejected_credential_generation() {
    let mut q = Queue::new();
    q.observe(observe(0));
    let active = q.claim(0).unwrap();
    q.finish(
        1,
        active.attempt.token,
        Outcome::Suspend(Suspension::Http(429)),
    );
    let generation = q.generation;
    q.pause_for_configuration();
    q.observe(none(2)); // old committed configuration while writing
    assert!(q.configuration_paused);
    q.observe(Observation {
        revision: Some(2),
        ..observe(3)
    });
    assert!(!q.configuration_paused);
    assert_eq!(q.generation, generation);
    assert_eq!(q.suspended, Some(Suspension::Http(429)));
    assert!(q.claim(3).is_none());
}
