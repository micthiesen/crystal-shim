use super::*;
extern crate std;
use crate::calibration::{
    CalibrationData, ChannelLimits, Channels, CountsRange, LevelDomain, MinimumRatioSpan,
    ReferenceSign,
};
use crate::configuration::{RawDeviceConfig, RawScheduleEntry};
use crate::{load_retained, ConfigurationLifecycle, Level, LoadDisposition, State, Timing};

fn config(
    revision: u32,
    duration: u32,
    scheduled: bool,
    calibrated: bool,
) -> ValidatedDeviceConfig {
    config_at(revision, duration, scheduled, calibrated, 1_000)
}

fn config_at(
    revision: u32,
    duration: u32,
    scheduled: bool,
    calibrated: bool,
    start_second: u32,
) -> ValidatedDeviceConfig {
    config_at_with_minimum_off(revision, duration, scheduled, calibrated, start_second, 100)
}

fn config_at_with_minimum_off(
    revision: u32,
    duration: u32,
    scheduled: bool,
    calibrated: bool,
    start_second: u32,
    minimum_off_ms: u64,
) -> ValidatedDeviceConfig {
    // Synthetic arithmetic/transaction fixture, never production calibration.
    let limits = ChannelLimits {
        envelope: CountsRange {
            min: -5_000,
            max: 5_000,
        },
        max_slew_counts_per_second: 70_000,
    };
    let calibration = CalibrationData {
        level_empty_counts: 1_000,
        wet_reference_empty_counts: 300,
        low_endpoint: Channels {
            level: 1_200,
            wet_reference: 700,
        },
        high_endpoint: Channels {
            level: 2_500,
            wet_reference: 900,
        },
        channels: Channels {
            level: limits,
            wet_reference: limits,
        },
        reference_sign: ReferenceSign::Positive,
        minimum_reference_span_counts: 100,
        minimum_endpoint_ratio_span: MinimumRatioSpan {
            numerator: 1,
            denominator: 10,
        },
        supported_level: LevelDomain {
            min: Level::new(100).unwrap(),
            max: Level::new(900).unwrap(),
        },
        max_frame_age_ms: 500,
        max_frame_duration_ms: 100,
        max_level_slew_per_second: 8_000,
    };
    let entries = [RawScheduleEntry::new(1, 0x7f, start_second)];
    let raw = RawDeviceConfig::builder(
        revision,
        200,
        800,
        500,
        Timing {
            low_confirmation_ms: 50,
            recovery_ms: 60,
            minimum_off_ms,
        },
        duration,
        [0x5a; 32],
    )
    .schedule_entries(if scheduled { &entries } else { &[] })
    .unwrap()
    .timezone_rule("UTC0")
    .unwrap()
    .calibration(calibrated.then_some(calibration))
    .build();
    ValidatedDeviceConfig::from_raw(raw).unwrap()
}

fn configured(scheduled: bool) -> Runtime {
    Runtime::new(
        Some(config(1, 3, scheduled, true)),
        Some(RetainedState::new(1).unwrap()),
        Millis(0),
    )
    .unwrap()
}

#[test]
fn durable_administration_requires_current_configured_quiescent_maintenance() {
    let mut empty = Runtime::new(None, None, Millis(0)).unwrap();
    assert!(!empty.durable_maintenance());
    assert_eq!(
        command(&mut empty, 0, RuntimeCommand::EnterMaintenance)
            .command_reply
            .unwrap()
            .result,
        Ok(Acknowledgement::Applied)
    );
    assert!(!empty.durable_maintenance());

    let mut runtime = Runtime::new(
        Some(config(1, 3, false, false)),
        Some(RetainedState::new(1).unwrap()),
        Millis(0),
    )
    .unwrap();
    assert!(!runtime.durable_maintenance());
    command(&mut runtime, 0, RuntimeCommand::EnterMaintenance);
    assert!(!runtime.durable_maintenance());
    complete(&mut runtime, 20, true);
    assert!(
        runtime.durable_maintenance(),
        "calibration is not required for maintenance"
    );
    command(&mut runtime, 40, RuntimeCommand::ExitMaintenance);
    assert!(
        !runtime.durable_maintenance(),
        "old durable maintenance cannot authorize a pending exit"
    );
    complete(&mut runtime, 60, true);
    assert!(!runtime.durable_maintenance());
    command(&mut runtime, 80, RuntimeCommand::EnterMaintenance);
    complete(&mut runtime, 100, false);
    assert!(!runtime.durable_maintenance());
}

fn observation(now: u64) -> Observation {
    Observation {
        now: Millis(now),
        sensor_revision: 1,
        reading: Reading::Valid {
            level: Level::new(850).unwrap(),
            observed_at: Millis(now),
        },
        hardware: HardwarePermit::Allowed,
        maintenance_pressed: false,
        force_off: false,
        clock_update: Default::default(),
    }
}

fn tick(runtime: &mut Runtime, now: u64) -> Step {
    runtime.step(observation(now), None, None)
}
fn command(runtime: &mut Runtime, now: u64, command: RuntimeCommand) -> Step {
    runtime.step(observation(now), Some(Request { id: 7, command }), None)
}
fn complete(runtime: &mut Runtime, now: u64, succeeded: bool) -> Step {
    let ticket = runtime.store_request().expect("pending write").ticket;
    runtime.step(
        observation(now),
        None,
        Some(StoreCompletion { ticket, succeeded }),
    )
}
fn until(runtime: &mut Runtime, from: u64, through: u64) {
    for now in (from..=through).step_by(20) {
        tick(runtime, now);
    }
}
fn manual() -> Runtime {
    let mut runtime = configured(false);
    until(&mut runtime, 0, 100);
    let status = command(&mut runtime, 120, RuntimeCommand::On)
        .status
        .unwrap();
    assert_eq!(status.control.relay, RelayCommand::On);
    runtime
}

#[test]
fn first_configuration_commits_retained_then_config_before_publication() {
    let mut runtime = Runtime::new(None, None, Millis(0)).unwrap();
    assert_eq!(
        command(&mut runtime, 0, RuntimeCommand::On)
            .command_reply
            .unwrap()
            .result,
        Err(Error::Unconfigured)
    );
    assert!(command(
        &mut runtime,
        20,
        RuntimeCommand::SaveConfiguration(config(1, 3, false, true))
    )
    .command_reply
    .is_none());
    assert!(runtime.configuration().is_none());
    let Record::Retained(state) = runtime.store_request().unwrap().record else {
        panic!("retained must be first")
    };
    assert!(state.maintenance);
    complete(&mut runtime, 40, true);
    assert!(runtime.configuration().is_none());
    assert!(matches!(
        runtime.store_request().unwrap().record,
        Record::Configuration(_)
    ));
    let result = complete(&mut runtime, 60, true);
    assert_eq!(
        result.completed_reply.unwrap().result,
        Ok(Acknowledgement::Durable)
    );
    assert_eq!(runtime.configuration().unwrap().revision(), 1);
    assert_eq!(result.status.unwrap().control.state, State::Maintenance);
}

#[test]
fn configuration_power_cuts_after_first_record_commit_recover_in_maintenance() {
    let old = config(1, 3, false, true);
    let new = config(2, 30, false, true);
    let mut runtime =
        Runtime::new(Some(old), Some(RetainedState::new(1).unwrap()), Millis(0)).unwrap();
    command(&mut runtime, 0, RuntimeCommand::SaveConfiguration(new));
    let Record::Retained(state) = runtime.store_request().unwrap().record else {
        panic!()
    };
    let blob = state.encode().unwrap();
    let interrupted = load_retained(
        Some(&blob),
        ConfigurationLifecycle::Configured { revision: 1 },
    )
    .unwrap()
    .unwrap();
    assert!(matches!(
        interrupted.disposition,
        LoadDisposition::RecoveryRequired(_)
    ));
    assert!(interrupted.state.maintenance);
    complete(&mut runtime, 20, true);
    let restored = load_retained(
        Some(&blob),
        ConfigurationLifecycle::Configured { revision: 2 },
    )
    .unwrap()
    .unwrap();
    assert!(restored.state.maintenance);
    assert!(Runtime::new(Some(new), Some(restored.state), Millis(0)).is_ok());
}

#[test]
fn failed_configuration_writes_do_not_publish_and_same_revision_repair_can_finish() {
    for fail_configuration in [false, true] {
        let mut runtime = configured(false);
        command(
            &mut runtime,
            0,
            RuntimeCommand::SaveConfiguration(config(2, 30, false, true)),
        );
        if fail_configuration {
            complete(&mut runtime, 20, true);
        }
        let failed = complete(&mut runtime, 40, false);
        assert_eq!(failed.completed_reply.unwrap().result, Err(Error::Storage));
        assert_eq!(runtime.configuration().unwrap().revision(), 1);
        assert!(runtime.storage_failed());
        assert_eq!(
            command(&mut runtime, 60, RuntimeCommand::ExitMaintenance)
                .command_reply
                .unwrap()
                .result,
            Err(Error::RecoveryRequired)
        );
        command(
            &mut runtime,
            80,
            RuntimeCommand::SaveConfiguration(config(2, 30, false, true)),
        );
        let first = complete(&mut runtime, 100, true);
        let repaired = if fail_configuration {
            first
        } else {
            complete(&mut runtime, 120, true)
        };
        assert_eq!(
            repaired.completed_reply.unwrap().result,
            Ok(Acknowledgement::Durable)
        );
        assert!(!runtime.storage_failed());
        assert_eq!(runtime.configuration().unwrap().revision(), 2);
    }
}

#[test]
fn first_boot_failed_second_write_can_retry_when_retained_is_already_identical() {
    let mut runtime = Runtime::new(None, None, Millis(0)).unwrap();
    command(
        &mut runtime,
        0,
        RuntimeCommand::SaveConfiguration(config(1, 3, false, true)),
    );
    complete(&mut runtime, 20, true);
    complete(&mut runtime, 40, false);
    command(
        &mut runtime,
        60,
        RuntimeCommand::SaveConfiguration(config(1, 3, false, true)),
    );
    assert!(matches!(
        runtime.store_request().unwrap().record,
        Record::Configuration(_)
    ));
    assert_eq!(
        complete(&mut runtime, 80, true)
            .completed_reply
            .unwrap()
            .result,
        Ok(Acknowledgement::Durable)
    );
}

#[test]
fn stale_and_duplicate_storage_acks_cannot_advance_transactions() {
    let mut runtime = configured(false);
    command(
        &mut runtime,
        0,
        RuntimeCommand::SaveConfiguration(config(2, 3, false, true)),
    );
    let first = runtime.store_request().unwrap().ticket;
    runtime.step(
        observation(20),
        None,
        Some(StoreCompletion {
            ticket: first + 1,
            succeeded: true,
        }),
    );
    assert_eq!(runtime.store_request().unwrap().ticket, first);
    complete(&mut runtime, 40, true);
    let second = runtime.store_request().unwrap().ticket;
    runtime.step(
        observation(60),
        None,
        Some(StoreCompletion {
            ticket: first,
            succeeded: false,
        }),
    );
    assert_eq!(runtime.store_request().unwrap().ticket, second);
    assert!(!runtime.storage_failed());
    complete(&mut runtime, 80, true);
    assert_eq!(runtime.configuration().unwrap().revision(), 2);
}

#[test]
fn maintenance_exit_waits_for_storage_and_a_pressed_button_supersedes_it() {
    let mut runtime = configured(false);
    command(&mut runtime, 0, RuntimeCommand::EnterMaintenance);
    complete(&mut runtime, 20, true);
    let pending = command(&mut runtime, 40, RuntimeCommand::ExitMaintenance);
    assert_eq!(pending.status.unwrap().control.state, State::Maintenance);
    let ticket = runtime.store_request().unwrap().ticket;
    let result = runtime.step(
        Observation {
            maintenance_pressed: true,
            ..observation(60)
        },
        None,
        Some(StoreCompletion {
            ticket,
            succeeded: true,
        }),
    );
    assert_eq!(
        result.completed_reply.unwrap().result,
        Err(Error::Superseded)
    );
    assert_eq!(result.status.unwrap().control.state, State::Maintenance);
    let Record::Retained(state) = runtime.store_request().unwrap().record else {
        panic!()
    };
    assert!(state.maintenance);
    complete(&mut runtime, 80, true);
    command(&mut runtime, 100, RuntimeCommand::ExitMaintenance);
    assert_eq!(
        complete(&mut runtime, 120, true)
            .completed_reply
            .unwrap()
            .result,
        Ok(Acknowledgement::Durable)
    );
}

#[test]
fn schedule_requires_durable_eligibility_and_off_has_separate_durable_ack() {
    let mut runtime = configured(true);
    let first = command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    assert_eq!(first.status.unwrap().control.relay, RelayCommand::Off);
    let Record::Retained(eligible) = runtime.store_request().unwrap().record else {
        panic!()
    };
    assert_eq!(
        eligible.window.unwrap().disposition,
        WindowDisposition::Eligible
    );
    assert_eq!(
        tick(&mut runtime, 20).status.unwrap().control.relay,
        RelayCommand::Off
    );
    complete(&mut runtime, 40, true);
    until(&mut runtime, 60, 120);
    assert_eq!(
        tick(&mut runtime, 140).status.unwrap().control.relay,
        RelayCommand::On
    );
    let stopped = command(&mut runtime, 160, RuntimeCommand::Off);
    assert_eq!(stopped.status.unwrap().control.relay, RelayCommand::Off);
    assert_eq!(
        stopped.command_reply.unwrap().result,
        Ok(Acknowledgement::Applied)
    );
    assert!(stopped.completed_reply.is_none());
    assert!(runtime.store_request().is_some());
    let reboot = load_retained(
        Some(&eligible.encode().unwrap()),
        ConfigurationLifecycle::Configured { revision: 1 },
    )
    .unwrap()
    .unwrap();
    assert_eq!(
        reboot.state.window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    assert!(complete(&mut runtime, 180, true).completed_reply.is_none());
    assert_eq!(
        runtime.durable_state().unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    until(&mut runtime, 200, 500);
    assert_eq!(
        tick(&mut runtime, 520).status.unwrap().control.relay,
        RelayCommand::Off
    );
}

#[test]
fn off_during_eligibility_write_cannot_be_overwritten_by_its_ack() {
    let mut runtime = configured(true);
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    let ticket = runtime.store_request().unwrap().ticket;
    let applied = command(&mut runtime, 20, RuntimeCommand::Off);
    assert_eq!(
        applied.command_reply.unwrap().result,
        Ok(Acknowledgement::Applied)
    );
    assert_eq!(applied.status.unwrap().control.relay, RelayCommand::Off);
    runtime.step(
        observation(40),
        None,
        Some(StoreCompletion {
            ticket,
            succeeded: true,
        }),
    );
    let Record::Retained(state) = runtime.store_request().unwrap().record else {
        panic!()
    };
    assert_eq!(
        state.window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    complete(&mut runtime, 60, true);
    until(&mut runtime, 80, 240);
    assert_eq!(
        tick(&mut runtime, 260).status.unwrap().control.relay,
        RelayCommand::Off
    );
}

#[test]
fn repeated_on_and_rejected_configuration_cannot_extend_manual_deadline() {
    let mut runtime = manual();
    let deadline = tick(&mut runtime, 140).status.unwrap().deadline;
    assert_eq!(
        command(&mut runtime, 160, RuntimeCommand::On)
            .status
            .unwrap()
            .deadline,
        deadline
    );
    let invalid = command(
        &mut runtime,
        180,
        RuntimeCommand::SaveConfiguration(config(1, 60, false, true)),
    );
    assert_eq!(invalid.command_reply.unwrap().result, Err(Error::Revision));
    assert_eq!(invalid.status.unwrap().deadline, deadline);
    until(&mut runtime, 200, 3_140);
    assert_eq!(
        tick(&mut runtime, 3_160).status.unwrap().control.relay,
        RelayCommand::Off
    );
}

#[test]
fn full_ingress_off_supersedes_queued_on_before_a_control_tick() {
    for start in [RuntimeCommand::On, RuntimeCommand::Toggle] {
        let mut runtime = configured(false);
        until(&mut runtime, 0, 100);
        let mut ingress = crate::runtime_ingress::Ingress::new();
        assert!(ingress.submit(Request {
            id: 1,
            command: start
        }));
        assert!(ingress.submit(Request {
            id: 2,
            command: RuntimeCommand::Off
        }));
        let superseded = ingress.take_reply().unwrap();
        assert_eq!(
            superseded,
            Reply {
                id: 1,
                result: Err(Error::Superseded)
            }
        );
        let (force_off, request) = ingress.take();
        let result = runtime.step(
            Observation {
                force_off,
                ..observation(120)
            },
            request,
            None,
        );
        let reply = result.command_reply.unwrap();
        assert_eq!(reply.result, Ok(Acknowledgement::Applied));
        assert_eq!(result.status.unwrap().control.relay, RelayCommand::Off);
        ingress.complete(reply);
        assert_eq!(ingress.take_reply().unwrap().id, 2);
        assert!(ingress.take().1.is_none());
        assert_eq!(
            tick(&mut runtime, 140).status.unwrap().control.relay,
            RelayCommand::Off
        );
        // Only a new, explicit start can obtain a later manual run.
        assert!(ingress.submit(Request {
            id: 3,
            command: RuntimeCommand::On
        }));
        let (force_off, request) = ingress.take();
        let result = runtime.step(
            Observation {
                force_off,
                ..observation(240)
            },
            request,
            None,
        );
        assert_eq!(
            result.command_reply.unwrap().result,
            Ok(Acknowledgement::Applied)
        );
    }
}

#[test]
fn off_discards_older_queued_clock_instead_of_revealing_a_schedule_afterward() {
    use crate::runtime_ingress::{Ingress, Source};
    for clock in [
        RuntimeCommand::SetUtc(UtcSeconds(1_000)),
        RuntimeCommand::SetUtcObserved(utc_sample(1_000, 0)),
    ] {
        let mut runtime = configured(true);
        let mut ingress = Ingress::new();
        let older = ingress
            .submit_from(
                Source::Usb,
                Request {
                    id: 41,
                    command: clock,
                },
            )
            .unwrap();
        let off = ingress
            .submit_from(
                Source::Matter,
                Request {
                    id: 42,
                    command: RuntimeCommand::Off,
                },
            )
            .unwrap();
        for now in (0..=200).step_by(20) {
            let (force_off, request) = ingress.take();
            let completion = runtime.store_request().map(|write| StoreCompletion {
                ticket: write.ticket,
                succeeded: true,
            });
            let step = runtime.step(
                Observation {
                    force_off,
                    ..observation(now)
                },
                request,
                completion,
            );
            assert_eq!(
                step.status.unwrap().control.relay,
                RelayCommand::Off,
                "queued pre-Off clock must not reveal and start an automatic window at {now}"
            );
            for reply in [step.command_reply, step.completed_reply]
                .into_iter()
                .flatten()
            {
                ingress.complete(reply);
            }
        }
        assert!(runtime.clock_observation().is_none());
        assert_eq!(
            ingress.take_reply_for(older).unwrap(),
            Reply {
                id: 41,
                result: Err(Error::Superseded)
            }
        );
        assert_eq!(
            ingress.take_reply_for(off).unwrap(),
            Reply {
                id: 42,
                result: Ok(Acknowledgement::Applied)
            }
        );
        assert!(ingress.take().1.is_none());
        // A later explicit time observation remains admissible; Off does not
        // permanently disable UTC administration or future scheduled operation.
        assert!(ingress
            .submit_from(
                Source::Usb,
                Request {
                    id: 43,
                    command: RuntimeCommand::SetUtcObserved(utc_sample(1_004, 220)),
                }
            )
            .is_some());
        let (force_off, request) = ingress.take();
        let step = runtime.step(
            Observation {
                force_off,
                ..observation(220)
            },
            request,
            None,
        );
        assert_eq!(
            step.command_reply.unwrap().result,
            Ok(Acknowledgement::Applied)
        );
        assert!(runtime.clock_observation().is_some());
    }
}

#[test]
fn published_revision_rejects_old_sensor_frames_and_missing_calibration() {
    for calibrated in [false, true] {
        let mut runtime = manual();
        command(
            &mut runtime,
            140,
            RuntimeCommand::SaveConfiguration(config(2, 60, false, calibrated)),
        );
        complete(&mut runtime, 160, true);
        complete(&mut runtime, 180, true);
        command(&mut runtime, 200, RuntimeCommand::ExitMaintenance);
        complete(&mut runtime, 220, true);
        until(&mut runtime, 240, 400);
        assert_eq!(
            command(&mut runtime, 420, RuntimeCommand::On)
                .status
                .unwrap()
                .control
                .relay,
            RelayCommand::Off
        );
        let result = runtime.step(
            Observation {
                sensor_revision: 2,
                ..observation(440)
            },
            Some(Request {
                id: 9,
                command: RuntimeCommand::On,
            }),
            None,
        );
        assert_eq!(
            result.status.unwrap().control.relay,
            if calibrated {
                RelayCommand::On
            } else {
                RelayCommand::Off
            }
        );
    }
}

#[test]
fn configuration_stops_and_suppresses_the_active_occurrence() {
    let mut runtime = configured(true);
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    complete(&mut runtime, 20, true);
    until(&mut runtime, 40, 120);
    assert_eq!(
        tick(&mut runtime, 140).status.unwrap().control.relay,
        RelayCommand::On
    );
    assert_eq!(
        command(
            &mut runtime,
            160,
            RuntimeCommand::SaveConfiguration(config(2, 60, true, true))
        )
        .status
        .unwrap()
        .control
        .relay,
        RelayCommand::Off
    );
    complete(&mut runtime, 180, true);
    complete(&mut runtime, 200, true);
    command(&mut runtime, 220, RuntimeCommand::ExitMaintenance);
    complete(&mut runtime, 240, true);
    for now in (260..600).step_by(20) {
        let result = runtime.step(
            Observation {
                sensor_revision: 2,
                ..observation(now)
            },
            None,
            None,
        );
        assert_eq!(result.status.unwrap().control.relay, RelayCommand::Off);
    }
}

#[test]
fn no_clock_is_inactive_and_rollback_or_expiry_does_not_revive_it() {
    let mut runtime = configured(true);
    until(&mut runtime, 0, 100);
    assert!(runtime.store_request().is_none());
    command(&mut runtime, 120, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    complete(&mut runtime, 140, true);
    tick(&mut runtime, 130);
    assert!(runtime.clock.is_none());
    assert_eq!(
        runtime.desired.unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    complete(&mut runtime, 160, true);
    assert!(runtime.clock.is_none());
    command(&mut runtime, 180, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    tick(&mut runtime, 180 + UTC_MAX_AGE_MS - 1);
    assert!(runtime.clock.is_some());
    tick(&mut runtime, 180 + UTC_MAX_AGE_MS);
    assert!(runtime.clock.is_none());
    assert!(runtime.store_request().is_none());
}

#[test]
fn ticket_exhaustion_fails_closed_with_a_reply() {
    let mut runtime = configured(false);
    runtime.next_ticket = u64::MAX;
    let result = command(&mut runtime, 0, RuntimeCommand::EnterMaintenance);
    assert_eq!(
        result.completed_reply.unwrap().result,
        Err(Error::Exhausted)
    );
    assert!(runtime.store_request().is_none());
    assert_eq!(result.status.unwrap().control.state, State::Maintenance);
}

#[test]
fn automatic_persistence_does_not_cancel_an_accepted_manual_wait_or_run() {
    let mut runtime = configured(true);
    tick(&mut runtime, 0);
    let accepted = command(&mut runtime, 20, RuntimeCommand::On);
    let deadline = accepted.status.unwrap().deadline;
    assert_eq!(accepted.status.unwrap().control.relay, RelayCommand::Off);
    command(&mut runtime, 40, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    assert!(runtime.store_request().is_none());
    until(&mut runtime, 60, 160);
    let status = tick(&mut runtime, 180).status.unwrap();
    assert_eq!(status.control.relay, RelayCommand::On);
    assert_eq!(status.deadline, deadline);
    assert!(runtime.store_request().is_none());
}

#[test]
fn usb_configuration_uses_the_canonical_codec_and_runtime_transaction() {
    use core::fmt::Write;
    let configuration = config(1, 3, false, true).encode().unwrap();
    let mut line = std::string::String::from("91 CONFIG ");
    for byte in configuration.as_bytes() {
        write!(line, "{byte:02x}").unwrap();
    }
    line.push('\n');
    let mut receiver = crate::runtime_ingress::Receiver::new();
    let mut request = None;
    for byte in line.bytes() {
        if let Some(result) = receiver.push(100, byte) {
            request = Some(result.unwrap());
        }
    }
    let mut runtime = Runtime::new(None, None, Millis(0)).unwrap();
    runtime.step(observation(100), request, None);
    complete(&mut runtime, 120, true);
    let done = complete(&mut runtime, 140, true);
    assert_eq!(
        done.completed_reply,
        Some(Reply {
            id: 91,
            result: Ok(Acknowledgement::Durable)
        })
    );
    assert_eq!(runtime.configuration().unwrap().revision(), 1);
}

#[test]
fn toggle_is_resolved_by_control_and_reserved_off_still_wins() {
    let mut runtime = configured(false);
    until(&mut runtime, 0, 100);
    let started = command(&mut runtime, 120, RuntimeCommand::Toggle)
        .status
        .unwrap();
    assert_eq!(started.control.relay, RelayCommand::On);
    let stopped = command(&mut runtime, 140, RuntimeCommand::Toggle)
        .status
        .unwrap();
    assert_eq!(stopped.control.relay, RelayCommand::Off);
    assert_eq!(stopped.deadline, None);
    let waiting = command(&mut runtime, 160, RuntimeCommand::Toggle)
        .status
        .unwrap();
    assert_eq!(waiting.control.relay, RelayCommand::Off);
    let repeated = command(&mut runtime, 180, RuntimeCommand::Toggle)
        .status
        .unwrap();
    assert_eq!(repeated.deadline, waiting.deadline);
    let cancelled = runtime.step(
        Observation {
            force_off: true,
            ..observation(200)
        },
        Some(Request {
            id: 8,
            command: RuntimeCommand::Toggle,
        }),
        None,
    );
    assert_eq!(
        cancelled.command_reply.unwrap().result,
        Err(Error::Superseded)
    );
    assert_eq!(cancelled.status.unwrap().deadline, None);
}

#[test]
fn on_and_toggle_acknowledgements_follow_the_final_safety_decision() {
    for request in [RuntimeCommand::On, RuntimeCommand::Toggle] {
        for scenario in 0..9 {
            let mut runtime = configured(false);
            until(&mut runtime, 0, 100);
            let mut input = observation(120);
            match scenario {
                0 => input.reading = Reading::Invalid(Fault::Bus),
                1 => {
                    input.reading = Reading::Valid {
                        level: Level::new(850).unwrap(),
                        observed_at: Millis(121),
                    }
                }
                2 => {
                    input.now = Millis(700);
                    input.reading = Reading::Valid {
                        level: Level::new(850).unwrap(),
                        observed_at: Millis(100),
                    };
                    until(&mut runtime, 120, 680);
                }
                3 => input.sensor_revision = 2,
                4 => input.hardware = HardwarePermit::ForcedOff,
                5 => input.maintenance_pressed = true,
                6 => {
                    command(&mut runtime, 120, RuntimeCommand::EnterMaintenance);
                    complete(&mut runtime, 140, true);
                    input.now = Millis(160);
                    input.reading = observation(160).reading;
                }
                7 => input.now = Millis(99),
                _ => {
                    runtime = Runtime::new(
                        Some(config(1, 3, false, false)),
                        Some(RetainedState::new(1).unwrap()),
                        Millis(0),
                    )
                    .unwrap()
                }
            }
            let step = runtime.step(
                input,
                Some(Request {
                    id: 91,
                    command: request,
                }),
                None,
            );
            let status = step.status.unwrap();
            assert_eq!(
                status.control.relay,
                RelayCommand::Off,
                "scenario {scenario}"
            );
            assert_eq!(status.demand, Demand::Off, "scenario {scenario}");
            assert_eq!(status.deadline, None, "scenario {scenario}");
            assert_eq!(
                step.command_reply.unwrap().result,
                Err(Error::Rejected),
                "scenario {scenario}"
            );
            assert_eq!(step.command_reply.unwrap().id, 91);
        }
    }
}

#[test]
fn valid_low_on_and_toggle_pending_recovery_are_applied_without_extending_the_lease() {
    for request in [RuntimeCommand::On, RuntimeCommand::Toggle] {
        let mut runtime = configured(false);
        let low = |now| Observation {
            reading: Reading::Valid {
                level: Level::new(100).unwrap(),
                observed_at: Millis(now),
            },
            ..observation(now)
        };
        let first = runtime.step(
            low(0),
            Some(Request {
                id: 1,
                command: request,
            }),
            None,
        );
        assert_eq!(
            first.command_reply.unwrap().result,
            Ok(Acknowledgement::Applied)
        );
        let pending = first.status.unwrap();
        assert_eq!(pending.demand, Demand::Override);
        assert_eq!(pending.control.relay, RelayCommand::Off);
        assert_eq!(pending.deadline, Some(Millis(3_000)));
        let repeated = runtime.step(
            low(20),
            Some(Request {
                id: 2,
                command: request,
            }),
            None,
        );
        assert_eq!(
            repeated.command_reply.unwrap().result,
            Ok(Acknowledgement::Applied)
        );
        assert_eq!(repeated.status.unwrap().deadline, pending.deadline);
        let mut status = repeated.status.unwrap();
        for now in (40..=100).step_by(20) {
            status = runtime.step(low(now), None, None).status.unwrap();
        }
        assert_eq!(status.control.relay, RelayCommand::On);
        assert_eq!(status.deadline, pending.deadline);
    }
}

#[test]
fn expiry_tick_on_cannot_succeed_or_renew_but_toggle_to_off_still_applies() {
    for request in [RuntimeCommand::On, RuntimeCommand::Toggle] {
        let mut runtime = manual();
        until(&mut runtime, 140, 3_100);
        let step = command(&mut runtime, 3_120, request);
        assert_eq!(step.status.unwrap().deadline, None);
        assert_eq!(step.status.unwrap().control.relay, RelayCommand::Off);
        match request {
            RuntimeCommand::On => {
                assert_eq!(step.command_reply.unwrap().result, Err(Error::Rejected))
            }
            RuntimeCommand::Toggle => assert_eq!(
                step.command_reply.unwrap().result,
                Ok(Acknowledgement::Applied)
            ),
            _ => unreachable!(),
        }
    }
    // A valid pending override can expire before minimum-off recovery finishes.
    // Toggle resolves to On from that Off state, and must not renew the expired cap.
    let config = config_at_with_minimum_off(1, 1, false, true, 1_000, 2_000);
    let mut runtime = Runtime::new(
        Some(config),
        Some(RetainedState::new(1).unwrap()),
        Millis(0),
    )
    .unwrap();
    let first = command(&mut runtime, 0, RuntimeCommand::On);
    assert_eq!(first.status.unwrap().deadline, Some(Millis(1_000)));
    until(&mut runtime, 20, 980);
    let expired = command(&mut runtime, 1_000, RuntimeCommand::Toggle);
    assert_eq!(expired.status.unwrap().deadline, None);
    assert_eq!(expired.command_reply.unwrap().result, Err(Error::Rejected));
}

#[test]
fn off_is_applied_before_a_later_suppression_failure_is_known() {
    let mut runtime = configured(true);
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    complete(&mut runtime, 20, true);
    until(&mut runtime, 40, 120);
    let stopped = command(&mut runtime, 140, RuntimeCommand::Off);
    assert_eq!(
        stopped.command_reply.unwrap().result,
        Ok(Acknowledgement::Applied)
    );
    assert_eq!(stopped.status.unwrap().control.relay, RelayCommand::Off);
    let failed = complete(&mut runtime, 160, false);
    assert!(failed.completed_reply.is_none());
    assert!(runtime.storage_failed());
    assert_eq!(failed.status.unwrap().control.state, State::Maintenance);
}

#[test]
fn expired_eligibility_is_suppressed_even_when_its_write_ack_is_late() {
    for expiry_before_ack in [false, true] {
        let mut runtime = configured(true);
        command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        let eligibility_ticket = runtime.store_request().unwrap().ticket;
        until(&mut runtime, 20, 2_980);
        assert_eq!(
            runtime.desired.unwrap().window.unwrap().disposition,
            WindowDisposition::Eligible
        );
        if expiry_before_ack {
            // The boundary is inclusive, including while the old write is in flight.
            tick(&mut runtime, 3_000);
            assert_eq!(
                runtime.desired.unwrap().window.unwrap().disposition,
                WindowDisposition::Suppressed
            );
        }
        // A fresh backwards clock observation in the same iteration as the late
        // ACK cannot hide elapsed time on the preceding clock anchor.
        let result = runtime.step(
            observation(3_020),
            Some(Request {
                id: 8,
                command: RuntimeCommand::SetUtc(UtcSeconds(1_000)),
            }),
            Some(StoreCompletion {
                ticket: eligibility_ticket,
                succeeded: true,
            }),
        );
        assert_eq!(result.status.unwrap().control.relay, RelayCommand::Off);
        let Record::Retained(suppressed) = runtime.store_request().unwrap().record else {
            panic!()
        };
        assert_eq!(
            suppressed.window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        assert_eq!(
            runtime.durable_state().unwrap().window.unwrap().disposition,
            WindowDisposition::Eligible
        );
        complete(&mut runtime, 3_040, true);
        command(
            &mut runtime,
            3_060,
            RuntimeCommand::SetUtc(UtcSeconds(1_000)),
        );
        until(&mut runtime, 3_080, 3_200);
        assert_eq!(
            tick(&mut runtime, 3_220).status.unwrap().control.relay,
            RelayCommand::Off
        );
        assert_eq!(
            runtime.durable_state().unwrap().window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        assert!(runtime.store_request().is_none());
    }
}

#[test]
fn expiry_suppression_waits_for_manual_lease_without_allowing_schedule_replay() {
    for already_energized in [false, true] {
        let mut runtime = configured(true);
        command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        complete(&mut runtime, 20, true);
        let accepted_at = if already_energized { 140 } else { 40 };
        until(&mut runtime, 40, accepted_at - 20);
        let manual = command(&mut runtime, accepted_at, RuntimeCommand::On)
            .status
            .unwrap();
        assert_eq!(
            manual.control.relay,
            if already_energized {
                RelayCommand::On
            } else {
                RelayCommand::Off
            }
        );
        let corrected = command(
            &mut runtime,
            accepted_at + 20,
            RuntimeCommand::SetUtc(UtcSeconds(1_003)),
        )
        .status
        .unwrap();
        assert_eq!(corrected.control.relay, manual.control.relay);
        assert_eq!(corrected.demand, Demand::Override);
        assert_eq!(corrected.deadline, manual.deadline);
        assert_eq!(
            runtime.desired.unwrap().window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        assert!(runtime.store_request().is_none());
        command(
            &mut runtime,
            accepted_at + 40,
            RuntimeCommand::SetUtc(UtcSeconds(1_000)),
        );
        until(&mut runtime, accepted_at + 60, accepted_at + 160);
        assert_eq!(
            tick(&mut runtime, accepted_at + 180)
                .status
                .unwrap()
                .control
                .relay,
            RelayCommand::On
        );
        let end = manual.deadline.unwrap().0;
        until(&mut runtime, accepted_at + 200, end);
        assert_eq!(
            tick(&mut runtime, end + 20).status.unwrap().control.relay,
            RelayCommand::Off
        );
        complete(&mut runtime, end + 40, true);
        let next = command(&mut runtime, end + 60, RuntimeCommand::On)
            .status
            .unwrap();
        assert_eq!(next.control.relay, RelayCommand::Off);
        assert_eq!(next.deadline, Some(Millis(end + 3_060)));
        let repeated = command(&mut runtime, end + 80, RuntimeCommand::On)
            .status
            .unwrap();
        assert_eq!(repeated.deadline, next.deadline);
        until(&mut runtime, end + 100, end + 200);
        assert_eq!(
            tick(&mut runtime, end + 220).status.unwrap().control.relay,
            RelayCommand::On
        );
    }
}

#[test]
fn configuration_save_revokes_automatic_lease_before_a_distinct_window() {
    let mut runtime = Runtime::new(
        Some(config(1, 10, true, true)),
        Some(RetainedState::new(1).unwrap()),
        Millis(0),
    )
    .unwrap();
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    complete(&mut runtime, 20, true);
    until(&mut runtime, 40, 120);
    let old_run = tick(&mut runtime, 140).status.unwrap();
    assert_eq!(old_run.control.relay, RelayCommand::On);
    let old_window = runtime.desired.unwrap().window.unwrap();
    let saved = command(
        &mut runtime,
        160,
        RuntimeCommand::SaveConfiguration(config_at(2, 10, true, true, 1_001)),
    )
    .status
    .unwrap();
    assert_eq!(saved.control.relay, RelayCommand::Off);
    assert_eq!(saved.demand, Demand::Off);
    assert_eq!(saved.deadline, None);
    assert_eq!(saved.suppressed_window, Some(old_window.id));
    complete(&mut runtime, 180, true);
    complete(&mut runtime, 200, true);
    command(&mut runtime, 220, RuntimeCommand::ExitMaintenance);
    complete(&mut runtime, 240, true);
    for now in (260..=1_100).step_by(20) {
        let status = runtime
            .step(
                Observation {
                    sensor_revision: 2,
                    ..observation(now)
                },
                None,
                None,
            )
            .status
            .unwrap();
        assert_eq!(status.control.relay, RelayCommand::Off);
        assert_eq!(status.deadline, None);
    }
    let new_window = runtime.desired.unwrap().window.unwrap();
    assert!(new_window.id > old_window.id);
    let ticket = runtime.store_request().unwrap().ticket;
    let started = runtime
        .step(
            Observation {
                sensor_revision: 2,
                ..observation(1_120)
            },
            None,
            Some(StoreCompletion {
                ticket,
                succeeded: true,
            }),
        )
        .status
        .unwrap();
    assert_eq!(started.demand, Demand::Automatic);
    assert!(started.deadline > old_run.deadline);
    let new_deadline = started.deadline;
    for now in (1_140..=1_300).step_by(20) {
        let status = runtime
            .step(
                Observation {
                    sensor_revision: 2,
                    ..observation(now)
                },
                None,
                None,
            )
            .status
            .unwrap();
        assert_eq!(status.deadline, new_deadline);
    }
    let on = runtime
        .step(
            Observation {
                sensor_revision: 2,
                ..observation(1_320)
            },
            Some(Request {
                id: 9,
                command: RuntimeCommand::On,
            }),
            None,
        )
        .status
        .unwrap();
    assert_eq!(on.control.relay, RelayCommand::On);
    assert_eq!(on.deadline, new_deadline);
}

#[test]
fn usb_and_physical_maintenance_revoke_both_leases_before_a_distinct_window() {
    for physical in [false, true] {
        for manual_override in [false, true] {
            let mut runtime = Runtime::new(
                Some(config(1, 10, true, true)),
                Some(RetainedState::new(1).unwrap()),
                Millis(0),
            )
            .unwrap();
            command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
            complete(&mut runtime, 20, true);
            until(&mut runtime, 40, 120);
            let old_run = if manual_override {
                command(&mut runtime, 140, RuntimeCommand::On)
            } else {
                tick(&mut runtime, 140)
            }
            .status
            .unwrap();
            assert_eq!(old_run.control.relay, RelayCommand::On);
            let old_window = runtime.desired.unwrap().window.unwrap();
            let entered = if physical {
                runtime.step(
                    Observation {
                        maintenance_pressed: true,
                        ..observation(160)
                    },
                    None,
                    None,
                )
            } else {
                command(&mut runtime, 160, RuntimeCommand::EnterMaintenance)
            }
            .status
            .unwrap();
            assert_eq!(entered.control.state, State::Maintenance);
            assert_eq!(entered.control.relay, RelayCommand::Off);
            assert_eq!(entered.demand, Demand::Off);
            assert_eq!(entered.deadline, None);
            assert_eq!(entered.suppressed_window, Some(old_window.id));
            complete(&mut runtime, 180, true);
            let exiting = command(&mut runtime, 200, RuntimeCommand::ExitMaintenance)
                .status
                .unwrap();
            assert_eq!(exiting.control.state, State::Maintenance);
            assert_eq!(exiting.deadline, None);
            assert_eq!(
                complete(&mut runtime, 220, true)
                    .completed_reply
                    .unwrap()
                    .result,
                Ok(Acknowledgement::Durable)
            );
            // A later daily occurrence is distinct even though the preceding
            // lease's monotonic deadline has not yet passed.
            command(
                &mut runtime,
                240,
                RuntimeCommand::SetUtc(UtcSeconds(86_400 + 1_000)),
            );
            assert!(runtime.desired.unwrap().window.unwrap().id > old_window.id);
            let started = complete(&mut runtime, 260, true).status.unwrap();
            assert_eq!(started.demand, Demand::Automatic);
            assert!(started.deadline > old_run.deadline);
            for now in (280..=400).step_by(20) {
                assert_eq!(
                    tick(&mut runtime, now).status.unwrap().deadline,
                    started.deadline
                );
            }
            assert_eq!(
                tick(&mut runtime, 420).status.unwrap().control.relay,
                RelayCommand::On
            );
        }
    }
}

#[test]
fn invalidated_calendar_occurrence_cannot_lend_its_automatic_lease_to_a_later_window() {
    for discontinuity in 0..4 {
        let mut runtime = Runtime::new(
            Some(config(1, 10, true, true)),
            Some(RetainedState::new(1).unwrap()),
            Millis(0),
        )
        .unwrap();
        command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        complete(&mut runtime, 20, true);
        until(&mut runtime, 40, 120);
        let old = tick(&mut runtime, 140).status.unwrap();
        assert_eq!(old.control.relay, RelayCommand::On);
        let old_window = runtime.desired.unwrap().window.unwrap();
        let changed = match discontinuity {
            0 => command(
                &mut runtime,
                160,
                RuntimeCommand::SetUtc(UtcSeconds(86_400 + 1_000)),
            ),
            1 => command(&mut runtime, 160, RuntimeCommand::ClearUtc),
            2 => tick(&mut runtime, 130),
            _ => command(&mut runtime, 160, RuntimeCommand::SetUtc(UtcSeconds(999))),
        }
        .status
        .unwrap();
        assert_eq!(changed.control.relay, RelayCommand::Off);
        assert_eq!(changed.demand, Demand::Off);
        assert_eq!(changed.deadline, None);
        assert_eq!(changed.suppressed_window, Some(old_window.id));
        complete(&mut runtime, 180, true);
        let new_started_at = if discontinuity == 0 {
            200
        } else {
            command(&mut runtime, 200, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
            assert!(runtime.store_request().is_none());
            assert_eq!(tick(&mut runtime, 220).status.unwrap().demand, Demand::Off);
            command(
                &mut runtime,
                240,
                RuntimeCommand::SetUtc(UtcSeconds(86_400 + 1_000)),
            );
            260
        };
        let started = complete(&mut runtime, new_started_at, true).status.unwrap();
        assert_eq!(started.demand, Demand::Automatic);
        assert!(started.deadline > old.deadline);
        assert!(runtime.desired.unwrap().window.unwrap().id > old_window.id);
        until(&mut runtime, new_started_at + 20, new_started_at + 180);
        assert_eq!(
            tick(&mut runtime, new_started_at + 200)
                .status
                .unwrap()
                .control
                .relay,
            RelayCommand::On
        );
        let manual = command(&mut runtime, new_started_at + 220, RuntimeCommand::On)
            .status
            .unwrap();
        assert_eq!(manual.deadline, started.deadline);
    }
}

#[test]
fn clock_corrections_within_an_active_occurrence_cannot_extend_its_run_cap() {
    let mut runtime = Runtime::new(
        Some(config(1, 10, true, true)),
        Some(RetainedState::new(1).unwrap()),
        Millis(0),
    )
    .unwrap();
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    complete(&mut runtime, 20, true);
    until(&mut runtime, 40, 120);
    let old = tick(&mut runtime, 140).status.unwrap();
    let forward = command(&mut runtime, 160, RuntimeCommand::SetUtc(UtcSeconds(1_001)))
        .status
        .unwrap();
    assert_eq!(forward.control.relay, RelayCommand::On);
    assert_eq!(forward.demand, Demand::Automatic);
    assert!(forward.deadline < old.deadline);
    let backwards = command(&mut runtime, 180, RuntimeCommand::SetUtc(UtcSeconds(1_000)))
        .status
        .unwrap();
    assert_eq!(backwards.control.relay, RelayCommand::On);
    assert_eq!(backwards.deadline, forward.deadline);
    assert!(runtime.store_request().is_none());
    assert_eq!(
        command(&mut runtime, 200, RuntimeCommand::On)
            .status
            .unwrap()
            .deadline,
        forward.deadline
    );
}

#[test]
fn reset_before_first_configuration_commit_uses_old_records_and_repairs_eligibility() {
    for previously_eligible in [false, true] {
        let old = config(1, 3, true, true);
        let mut runtime =
            Runtime::new(Some(old), Some(RetainedState::new(1).unwrap()), Millis(0)).unwrap();
        if previously_eligible {
            command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
            complete(&mut runtime, 20, true);
        }
        let old_durable = runtime.durable_state().unwrap();
        let accepted = command(
            &mut runtime,
            40,
            RuntimeCommand::SaveConfiguration(config(2, 30, false, true)),
        );
        assert_eq!(accepted.status.unwrap().control.state, State::Maintenance);
        assert!(accepted.completed_reply.is_none());
        let Record::Retained(proposed) = runtime.store_request().unwrap().record else {
            panic!()
        };
        assert!(proposed.maintenance);
        assert_eq!(proposed.config_revision, 2);
        // No first record has committed. Reboot can only observe the old pair.
        let loaded = load_retained(
            Some(&old_durable.encode().unwrap()),
            ConfigurationLifecycle::Configured { revision: 1 },
        )
        .unwrap()
        .unwrap();
        assert!(!loaded.state.maintenance);
        assert_eq!(loaded.must_store, previously_eligible);
        if previously_eligible {
            assert_eq!(
                loaded.state.window.unwrap().disposition,
                WindowDisposition::Suppressed
            );
        }
        // Production boot completes any required repair before constructing Runtime.
        let mut rebooted = Runtime::new(Some(old), Some(loaded.state), Millis(0)).unwrap();
        assert_eq!(rebooted.configuration().unwrap().revision(), 1);
        command(&mut rebooted, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        if !previously_eligible {
            complete(&mut rebooted, 20, true);
        }
        until(&mut rebooted, 40, 120);
        assert_eq!(
            tick(&mut rebooted, 140).status.unwrap().control.relay,
            if previously_eligible {
                RelayCommand::Off
            } else {
                RelayCommand::On
            }
        );
    }
}

#[test]
fn clearing_or_aging_clock_suppresses_unexposed_eligibility() {
    for explicit_clear in [false, true] {
        let mut runtime = configured(true);
        command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        let ticket = runtime.store_request().unwrap().ticket;
        let now = if explicit_clear { 20 } else { UTC_MAX_AGE_MS };
        let lost_clock = runtime.step(
            observation(now),
            explicit_clear.then_some(Request {
                id: 8,
                command: RuntimeCommand::ClearUtc,
            }),
            Some(StoreCompletion {
                ticket,
                succeeded: true,
            }),
        );
        assert_eq!(lost_clock.status.unwrap().control.relay, RelayCommand::Off);
        assert!(runtime.clock.is_none());
        let Record::Retained(state) = runtime.store_request().unwrap().record else {
            panic!()
        };
        assert_eq!(
            state.window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        complete(&mut runtime, now + 20, true);
        command(
            &mut runtime,
            now + 40,
            RuntimeCommand::SetUtc(UtcSeconds(1_000)),
        );
        until(&mut runtime, now + 60, now + 200);
        assert_eq!(
            tick(&mut runtime, now + 220).status.unwrap().control.relay,
            RelayCommand::Off
        );
    }
}

#[test]
fn explicit_stops_do_not_defer_their_writes_behind_a_manual_lease() {
    for stop in [
        RuntimeCommand::Off,
        RuntimeCommand::EnterMaintenance,
        RuntimeCommand::SaveConfiguration(config(2, 30, true, true)),
    ] {
        let mut runtime = configured(true);
        command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
        complete(&mut runtime, 20, true);
        until(&mut runtime, 40, 120);
        command(&mut runtime, 140, RuntimeCommand::On);
        command(&mut runtime, 160, RuntimeCommand::SetUtc(UtcSeconds(1_003)));
        assert!(runtime.store_request().is_none());
        let stopped = command(&mut runtime, 180, stop).status.unwrap();
        assert_eq!(stopped.control.relay, RelayCommand::Off);
        assert_eq!(stopped.demand, Demand::Off);
        let Record::Retained(state) = runtime.store_request().unwrap().record else {
            panic!()
        };
        assert_eq!(
            state.window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        assert_eq!(state.maintenance, !matches!(stop, RuntimeCommand::Off));
    }
}

fn network_tick(runtime: &mut Runtime, now: u64, update: crate::utc::ClockUpdate) -> Step {
    runtime.step(
        Observation {
            clock_update: update,
            ..observation(now)
        },
        None,
        None,
    )
}
fn utc_sample(seconds: u64, captured_at: u64) -> crate::utc::UtcObservation {
    crate::utc::UtcObservation::from_seconds(UtcSeconds(seconds), Millis(captured_at)).unwrap()
}

fn network_sample(observation: UtcObservation) -> crate::utc::NetworkObservation {
    crate::utc::NetworkObservation {
        observation,
        source_epoch: 1,
    }
}

fn bounded_sample(lo: u64, hi: u64, captured_at: u64) -> crate::utc::UtcObservation {
    UtcObservation::bounded(
        UtcBounds::new(lo, hi).unwrap(),
        Millis(captured_at),
        crate::utc_bounds::ClockRateBound::EXACT,
    )
    .unwrap()
}

#[test]
fn automatic_interval_waits_for_certain_start_and_stops_at_possible_end() {
    let mut runtime = configured(true);
    let sample = bounded_sample(999_980, 1_000_020, 0);
    network_tick(
        &mut runtime,
        0,
        crate::utc::ClockUpdate {
            sample: Some(network_sample(sample)),
            ..Default::default()
        },
    );
    assert!(
        runtime.store_request().is_none(),
        "uncertain entry cannot request eligibility"
    );
    assert_eq!(
        tick(&mut runtime, 20).status.unwrap().control.relay,
        RelayCommand::Off
    );
    let ticket = runtime.store_request().unwrap().ticket;
    runtime.step(
        observation(40),
        None,
        Some(StoreCompletion {
            ticket,
            succeeded: true,
        }),
    );
    until(&mut runtime, 60, 120);
    let started = tick(&mut runtime, 140).status.unwrap();
    assert_eq!(started.control.relay, RelayCommand::On);
    assert_eq!(started.deadline, Some(Millis(2_980)));
    until(&mut runtime, 160, 2_960);
    let stopped = tick(&mut runtime, 2_980).status.unwrap();
    assert_eq!(stopped.control.relay, RelayCommand::Off);
    assert_eq!(
        runtime.desired.unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    complete(&mut runtime, 3_000, true);
    network_tick(
        &mut runtime,
        3_020,
        crate::utc::ClockUpdate {
            sample: Some(network_sample(bounded_sample(1_001_000, 1_001_010, 3_020))),
            ..Default::default()
        },
    );
    until(&mut runtime, 3_040, 3_200);
    assert_eq!(
        tick(&mut runtime, 3_220).status.unwrap().control.relay,
        RelayCommand::Off,
        "later narrower correction cannot revive the expired occurrence"
    );
}

#[test]
fn late_eligibility_ack_cannot_reopen_an_interval_that_may_have_ended() {
    let mut runtime = configured(true);
    network_tick(
        &mut runtime,
        0,
        crate::utc::ClockUpdate {
            sample: Some(network_sample(bounded_sample(1_000_000, 1_002_980, 0))),
            ..Default::default()
        },
    );
    let ticket = runtime.store_request().unwrap().ticket;
    runtime.step(
        Observation {
            clock_update: crate::utc::ClockUpdate {
                sample: Some(network_sample(bounded_sample(1_000_000, 1_001_000, 20))),
                ..Default::default()
            },
            ..observation(20)
        },
        None,
        Some(StoreCompletion {
            ticket,
            succeeded: true,
        }),
    );
    assert_eq!(
        runtime.desired.unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    assert_eq!(
        tick(&mut runtime, 40).status.unwrap().control.relay,
        RelayCommand::Off
    );
}

#[test]
fn uncertain_clock_corrections_and_revocation_do_not_extend_or_cancel_manual_low_lease() {
    let mut runtime = configured(false);
    for now in (0..=100).step_by(20) {
        let mut observed = observation(now);
        observed.reading = Reading::Valid {
            level: Level::new(100).unwrap(),
            observed_at: Millis(now),
        };
        runtime.step(observed, None, None);
    }
    let mut observed = observation(120);
    observed.reading = Reading::Valid {
        level: Level::new(100).unwrap(),
        observed_at: Millis(120),
    };
    let run = runtime
        .step(
            observed,
            Some(Request {
                id: 91,
                command: RuntimeCommand::On,
            }),
            None,
        )
        .status
        .unwrap();
    assert_eq!(run.control.relay, RelayCommand::On);
    for (now, update) in [
        (
            140,
            crate::utc::ClockUpdate {
                sample: Some(network_sample(bounded_sample(999_000, 1_009_000, 140))),
                ..Default::default()
            },
        ),
        (
            160,
            crate::utc::ClockUpdate {
                revoke_network: true,
                sample: None,
            },
        ),
    ] {
        let mut observed = observation(now);
        observed.clock_update = update;
        observed.reading = Reading::Valid {
            level: Level::new(100).unwrap(),
            observed_at: Millis(now),
        };
        let after = runtime.step(observed, None, None).status.unwrap();
        assert_eq!(after.deadline, run.deadline);
        assert_eq!(after.control.relay, RelayCommand::On);
    }
}

#[test]
fn original_utc_capture_survives_dispatch_and_matches_exact_expiry() {
    let mut runtime = configured(false);
    let sample = utc_sample(1_000, 100);
    let reply = command(&mut runtime, 1_100, RuntimeCommand::SetUtcObserved(sample))
        .command_reply
        .unwrap();
    assert_eq!(reply.result, Ok(Acknowledgement::Applied));
    assert_eq!(runtime.clock_observation(), Some(sample));
    assert_eq!(
        runtime.observe_utc(Millis(1_100)),
        UtcBounds::new(1_001_000, 1_001_000)
    );
    tick(&mut runtime, 100 + UTC_MAX_AGE_MS - 1);
    assert!(runtime.clock_observation().is_some());
    tick(&mut runtime, 100 + UTC_MAX_AGE_MS);
    assert!(runtime.clock_observation().is_none());
    for now in [99, 100 + UTC_MAX_AGE_MS, i64::MAX as u64] {
        let reply = command(&mut runtime, now, RuntimeCommand::SetUtcObserved(sample))
            .command_reply
            .unwrap();
        assert_eq!(reply.result, Err(Error::InvalidTime));
        assert!(runtime.clock_observation().is_none());
    }
}

#[test]
fn clock_loss_bypasses_immutable_storage_and_does_not_revoke_operator_time() {
    let mut runtime = configured(true);
    network_tick(
        &mut runtime,
        0,
        crate::utc::ClockUpdate {
            sample: Some(network_sample(utc_sample(1_000, 0))),
            ..Default::default()
        },
    );
    let pending = runtime.store_request().unwrap();
    network_tick(
        &mut runtime,
        20,
        crate::utc::ClockUpdate {
            revoke_network: true,
            sample: None,
        },
    );
    assert!(runtime.clock_observation().is_none());
    assert_eq!(runtime.store_request().unwrap().ticket, pending.ticket);
    let Record::Retained(immutable) = pending.record else {
        panic!()
    };
    assert_eq!(
        immutable.window.unwrap().disposition,
        WindowDisposition::Eligible
    );
    assert_eq!(
        runtime.desired.unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    // USB clear has its own correlated Applied response even before the old write completes.
    let reply = command(&mut runtime, 40, RuntimeCommand::ClearUtc)
        .command_reply
        .unwrap();
    assert_eq!(
        reply,
        Reply {
            id: 7,
            result: Ok(Acknowledgement::Applied)
        }
    );
    complete(&mut runtime, 60, true);
    complete(&mut runtime, 80, true);
    command(&mut runtime, 100, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    let operator = runtime.clock_observation().unwrap();
    network_tick(
        &mut runtime,
        120,
        crate::utc::ClockUpdate {
            revoke_network: true,
            sample: None,
        },
    );
    assert_eq!(runtime.clock_observation(), Some(operator));
}

#[test]
fn network_revocation_and_fresh_correction_observe_old_expiry_before_late_ack() {
    let mut runtime = configured(true);
    network_tick(
        &mut runtime,
        0,
        crate::utc::ClockUpdate {
            sample: Some(network_sample(utc_sample(1_000, 0))),
            ..Default::default()
        },
    );
    let ticket = runtime.store_request().unwrap().ticket;
    let step = runtime.step(
        Observation {
            clock_update: crate::utc::ClockUpdate {
                revoke_network: true,
                sample: Some(network_sample(utc_sample(1_000, 3_000))),
            },
            ..observation(3_000)
        },
        None,
        Some(StoreCompletion {
            ticket,
            succeeded: true,
        }),
    );
    assert_eq!(step.status.unwrap().control.relay, RelayCommand::Off);
    assert_eq!(
        runtime.desired.unwrap().window.unwrap().disposition,
        WindowDisposition::Suppressed
    );
    complete(&mut runtime, 3_020, true);
    until(&mut runtime, 3_040, 3_200);
    assert_eq!(
        tick(&mut runtime, 3_220).status.unwrap().demand,
        Demand::Off
    );
}

#[test]
fn same_tick_operator_wins_and_network_loss_preserves_waiting_and_active_low_override() {
    for minimum_off in [100, 1_000] {
        let mut runtime = Runtime::new(
            Some(config_at_with_minimum_off(
                1,
                10,
                false,
                true,
                1_000,
                minimum_off,
            )),
            Some(RetainedState::new(1).unwrap()),
            Millis(0),
        )
        .unwrap();
        let input = |now| Observation {
            reading: Reading::Valid {
                level: Level::new(100).unwrap(),
                observed_at: Millis(now),
            },
            ..observation(now)
        };
        for now in (0..120).step_by(20) {
            runtime.step(input(now), None, None);
        }
        let sample = utc_sample(1_000, 120);
        runtime.step(
            Observation {
                clock_update: crate::utc::ClockUpdate {
                    sample: Some(network_sample(sample)),
                    ..Default::default()
                },
                ..input(120)
            },
            Some(Request {
                id: 8,
                command: RuntimeCommand::On,
            }),
            None,
        );
        let before = runtime.supervisor.as_ref().unwrap().status();
        assert_eq!(before.demand, Demand::Override);
        let after = runtime
            .step(
                Observation {
                    clock_update: crate::utc::ClockUpdate {
                        revoke_network: true,
                        sample: None,
                    },
                    ..input(140)
                },
                None,
                None,
            )
            .status
            .unwrap();
        assert_eq!(after.demand, Demand::Override);
        assert_eq!(after.deadline, before.deadline);
        assert_eq!(after.control.relay, before.control.relay);
        assert!(runtime.clock_observation().is_none());
        let operator = utc_sample(2_000, 160);
        let step = runtime.step(
            Observation {
                clock_update: crate::utc::ClockUpdate {
                    sample: Some(network_sample(utc_sample(1_000, 160))),
                    ..Default::default()
                },
                ..input(160)
            },
            Some(Request {
                id: 9,
                command: RuntimeCommand::SetUtcObserved(operator),
            }),
            None,
        );
        assert_eq!(
            step.command_reply.unwrap(),
            Reply {
                id: 9,
                result: Ok(Acknowledgement::Applied)
            }
        );
        assert_eq!(runtime.clock_observation(), Some(operator));
        assert_eq!(step.status.unwrap().deadline, before.deadline);
    }
}

#[test]
fn reserved_usb_clock_clear_applies_and_routes_its_reply_while_config_owns_ingress() {
    use crate::runtime_ingress::{Ingress, Source};
    let mut ingress = Ingress::new();
    let mut runtime = configured(false);
    command(&mut runtime, 0, RuntimeCommand::SetUtc(UtcSeconds(1_000)));
    let configuration = ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 41,
                command: RuntimeCommand::SaveConfiguration(config(2, 3, false, true)),
            },
        )
        .unwrap();
    let (force_off, request) = ingress.take();
    let first = runtime.step(
        Observation {
            force_off,
            ..observation(20)
        },
        request,
        None,
    );
    assert!(first.command_reply.is_none());
    assert!(runtime.store_request().is_some());
    let clear = ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 42,
                command: RuntimeCommand::ClearUtc,
            },
        )
        .unwrap();
    assert!(ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 43,
                command: RuntimeCommand::On
            }
        )
        .is_none());
    // Both safety actions retain independent acknowledgements while config owns
    // the large slot; UTC clear gets dispatch priority but Off applies now.
    let off = ingress
        .submit_from(
            Source::Matter,
            Request {
                id: 44,
                command: RuntimeCommand::Off,
            },
        )
        .unwrap();
    let (force_off, request) = ingress.take();
    assert!(force_off);
    let applied = runtime
        .step(
            Observation {
                force_off,
                ..observation(40)
            },
            request,
            None,
        )
        .command_reply
        .unwrap();
    assert!(runtime.clock_observation().is_none());
    ingress.complete(applied);
    assert!(ingress.take_reply_for(configuration).is_none());
    assert_eq!(
        ingress.take_reply_for(clear).unwrap(),
        Reply {
            id: 42,
            result: Ok(Acknowledgement::Applied)
        }
    );
    assert!(ingress.take_reply_for(clear).is_none());
    let (force_off, request) = ingress.take();
    let step = runtime.step(
        Observation {
            force_off,
            ..observation(50)
        },
        request,
        None,
    );
    assert_eq!(step.status.unwrap().control.relay, RelayCommand::Off);
    ingress.complete(step.command_reply.unwrap());
    assert!(ingress.take_reply().is_none()); // Matter Off cannot leak to USB.
    assert_eq!(
        ingress.take_reply_for(off).unwrap(),
        Reply {
            id: 44,
            result: Ok(Acknowledgement::Applied),
        }
    );
    complete(&mut runtime, 60, true);
    let durable = complete(&mut runtime, 80, true).completed_reply.unwrap();
    ingress.complete(durable);
    assert_eq!(
        ingress.take_reply_for(configuration).unwrap(),
        Reply {
            id: 41,
            result: Ok(Acknowledgement::Durable)
        }
    );
    // A stale clear completion cannot acknowledge the next distinct request.
    let next = ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 42,
                command: RuntimeCommand::ClearUtc,
            },
        )
        .unwrap();
    let (_, request) = ingress.take();
    ingress.complete(applied);
    assert!(ingress.take_reply_for(next).is_none());
    let reply = runtime
        .step(observation(100), request, None)
        .command_reply
        .unwrap();
    ingress.complete(reply);
    assert_eq!(
        ingress.take_reply_for(next).unwrap().result,
        Ok(Acknowledgement::Applied)
    );
}

#[test]
fn rejected_network_candidate_withdraws_network_but_preserves_operator_anchor() {
    for network in [false, true] {
        let mut runtime = configured(false);
        let fresh = utc_sample(1_000, UTC_MAX_AGE_MS);
        if network {
            network_tick(
                &mut runtime,
                UTC_MAX_AGE_MS,
                crate::utc::ClockUpdate {
                    sample: Some(network_sample(fresh)),
                    ..Default::default()
                },
            );
        } else {
            command(
                &mut runtime,
                UTC_MAX_AGE_MS,
                RuntimeCommand::SetUtcObserved(fresh),
            );
        }
        network_tick(
            &mut runtime,
            UTC_MAX_AGE_MS + 20,
            crate::utc::ClockUpdate {
                sample: Some(network_sample(utc_sample(1_000, 0))),
                ..Default::default()
            },
        );
        assert_eq!(
            runtime.clock_observation(),
            if network { None } else { Some(fresh) }
        );
    }
}

#[test]
fn clear_supersedes_an_older_queued_utc_but_a_later_operator_observation_can_apply() {
    use crate::runtime_ingress::{Ingress, Source};
    let mut ingress = Ingress::new();
    let mut runtime = configured(false);
    for command in [
        RuntimeCommand::SetUtc(UtcSeconds(1_000)),
        RuntimeCommand::SetUtcObserved(utc_sample(1_000, 0)),
    ] {
        let older = ingress
            .submit_from(Source::Usb, Request { id: 1, command })
            .unwrap();
        let clear = ingress
            .submit_from(
                Source::Usb,
                Request {
                    id: 2,
                    command: RuntimeCommand::ClearUtc,
                },
            )
            .unwrap();
        assert_eq!(
            ingress.take_reply_for(older).unwrap(),
            Reply {
                id: 1,
                result: Err(Error::Superseded)
            }
        );
        let (_, request) = ingress.take();
        let reply = runtime
            .step(observation(20), request, None)
            .command_reply
            .unwrap();
        ingress.complete(reply);
        assert_eq!(
            ingress.take_reply_for(clear).unwrap().result,
            Ok(Acknowledgement::Applied)
        );
        assert!(
            ingress.take().1.is_none(),
            "the older queued UTC cannot revive after clear"
        );
        assert!(runtime.clock_observation().is_none());
    }
    let clear = ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 3,
                command: RuntimeCommand::ClearUtc,
            },
        )
        .unwrap();
    let fresh = ingress
        .submit_from(
            Source::Usb,
            Request {
                id: 4,
                command: RuntimeCommand::SetUtcObserved(utc_sample(1_001, 40)),
            },
        )
        .unwrap();
    let (_, request) = ingress.take();
    ingress.complete(
        runtime
            .step(observation(40), request, None)
            .command_reply
            .unwrap(),
    );
    assert!(runtime.clock_observation().is_none());
    let (_, request) = ingress.take();
    ingress.complete(
        runtime
            .step(observation(60), request, None)
            .command_reply
            .unwrap(),
    );
    assert_eq!(ingress.take_reply_for(clear).unwrap().id, 3);
    assert_eq!(
        ingress.take_reply_for(fresh).unwrap(),
        Reply {
            id: 4,
            result: Ok(Acknowledgement::Applied)
        }
    );
    assert_eq!(runtime.clock_observation(), Some(utc_sample(1_001, 40)));
}

#[path = "clock_authority_tests.rs"]
mod clock_authority_tests;
