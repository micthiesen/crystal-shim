use super::*;
use crate::utc::{ClockAuthority, ClockMailbox, ClockSource, ClockUpdate, NetworkObservation};

fn accepted(runtime: &Runtime) -> ClockAuthority {
    let authority = runtime.clock_authority().unwrap();
    assert_eq!(Some(authority.observation), runtime.clock_observation());
    assert_ne!(authority.generation, 0);
    authority
}

#[test]
fn identical_and_aba_operator_replacements_have_distinct_accepted_generations() {
    let mut runtime = configured(false);
    let first = utc_sample(1000, 0);
    let second = bounded_sample(1_000_005, 1_000_015, 0);
    for (index, sample) in [first, first, second, first].into_iter().enumerate() {
        let step = command(
            &mut runtime,
            index as u64 * 20,
            RuntimeCommand::SetUtcObserved(sample),
        );
        assert_eq!(
            step.command_reply.unwrap().result,
            Ok(Acknowledgement::Applied)
        );
        assert_eq!(
            accepted(&runtime),
            ClockAuthority {
                observation: sample,
                generation: index as u64 + 1,
                source: ClockSource::Operator
            }
        );
    }
    let authority = accepted(&runtime);
    tick(&mut runtime, 80);
    assert_eq!(
        accepted(&runtime),
        authority,
        "ordinary observation does not renew authority"
    );
}

#[test]
fn clear_with_or_without_an_anchor_invalidates_without_reusing_generation() {
    let mut runtime = configured(false);
    assert!(runtime.clock_authority().is_none());
    assert_eq!(
        command(&mut runtime, 0, RuntimeCommand::ClearUtc)
            .command_reply
            .unwrap()
            .result,
        Ok(Acknowledgement::Applied)
    );
    assert_eq!(runtime.clock_generation, 1);
    command(
        &mut runtime,
        20,
        RuntimeCommand::SetUtcObserved(utc_sample(1000, 20)),
    );
    assert_eq!(accepted(&runtime).generation, 2);
    command(&mut runtime, 40, RuntimeCommand::ClearUtc);
    command(&mut runtime, 60, RuntimeCommand::ClearUtc);
    assert!(runtime.clock_authority().is_none());
    command(
        &mut runtime,
        80,
        RuntimeCommand::SetUtcObserved(utc_sample(1000, 20)),
    );
    assert_eq!(accepted(&runtime).generation, 5);
}

#[test]
fn expired_or_rolled_back_anchor_is_invalidated_before_any_replacement() {
    for rollback in [false, true] {
        let mut runtime = configured(false);
        command(
            &mut runtime,
            20,
            RuntimeCommand::SetUtcObserved(utc_sample(1000, 20)),
        );
        tick(&mut runtime, 40);
        let at = if rollback { 39 } else { 20 + UTC_MAX_AGE_MS };
        tick(&mut runtime, at);
        assert!(runtime.clock_authority().is_none());
        assert_eq!(runtime.clock_generation, 2);
        tick(&mut runtime, at);
        assert_eq!(runtime.clock_generation, 2, "absence is not another expiry");
        command(
            &mut runtime,
            at + 1,
            RuntimeCommand::SetUtcObserved(utc_sample(1000, at + 1)),
        );
        assert_eq!(accepted(&runtime).generation, 3);
    }
    let mut runtime = configured(false);
    command(
        &mut runtime,
        0,
        RuntimeCommand::SetUtcObserved(utc_sample(1000, 0)),
    );
    command(
        &mut runtime,
        UTC_MAX_AGE_MS,
        RuntimeCommand::SetUtcObserved(utc_sample(1000, UTC_MAX_AGE_MS)),
    );
    assert_eq!(
        accepted(&runtime).generation,
        3,
        "old expiry is observed even when replacement is in the same step"
    );
}

#[test]
fn invalid_candidates_do_not_mint_authority_or_replace_valid_operator_time() {
    let mut runtime = configured(false);
    command(
        &mut runtime,
        0,
        RuntimeCommand::SetUtcObserved(utc_sample(1000, 0)),
    );
    let before = accepted(&runtime);
    for command_value in [
        RuntimeCommand::SetUtcObserved(utc_sample(1000, 100)),
        RuntimeCommand::SetUtc(UtcSeconds(u64::MAX)),
    ] {
        assert_eq!(
            command(&mut runtime, 20, command_value)
                .command_reply
                .unwrap()
                .result,
            Err(Error::InvalidTime)
        );
        assert_eq!(accepted(&runtime), before);
    }
    for candidate in [
        NetworkObservation {
            observation: utc_sample(1000, 100),
            source_epoch: 1,
        },
        NetworkObservation {
            observation: utc_sample(1000, 0),
            source_epoch: 0,
        },
    ] {
        network_tick(
            &mut runtime,
            20,
            ClockUpdate {
                sample: Some(candidate),
                revoke_network: true,
            },
        );
        assert_eq!(accepted(&runtime), before);
    }
    // Validation precedes generation allocation, including at its final value.
    runtime.clock_generation = u64::MAX;
    assert_eq!(
        command(
            &mut runtime,
            20,
            RuntimeCommand::SetUtcObserved(utc_sample(1000, 100))
        )
        .command_reply
        .unwrap()
        .result,
        Err(Error::InvalidTime)
    );
    assert_eq!(accepted(&runtime), before);
    assert!(!runtime.clock_generation_exhausted);
}

#[test]
fn network_authority_keeps_original_attempt_epoch_through_consumption_and_delay() {
    let mut mailbox = ClockMailbox::new();
    mailbox.set_source(Some(7));
    let attempt = mailbox.begin().unwrap();
    let original_epoch = mailbox.source_epoch().unwrap();
    let sample = bounded_sample(1_000_000, 1_000_010, 0);
    assert!(mailbox.offer(attempt, sample, Millis(20)));
    let offered = mailbox.take();
    let mut runtime = configured(false);
    network_tick(&mut runtime, 40, offered);
    assert_eq!(
        accepted(&runtime),
        ClockAuthority {
            observation: sample,
            generation: 1,
            source: ClockSource::Network {
                source_epoch: original_epoch
            }
        }
    );
    // Reaccepting an identical newly offered sample still gets a new control ID.
    let next = mailbox.begin().unwrap();
    assert!(mailbox.offer(next, sample, Millis(40)));
    network_tick(&mut runtime, 60, mailbox.take());
    assert_eq!(accepted(&runtime).generation, 2);
    assert_eq!(mailbox.source_epoch(), Some(original_epoch));
    let delayed = mailbox.begin().unwrap();
    mailbox.source_changed();
    assert!(!mailbox.offer(delayed, sample, Millis(60)));
    assert_ne!(mailbox.source_epoch(), Some(original_epoch));
    assert_eq!(
        accepted(&runtime).source,
        ClockSource::Network {
            source_epoch: original_epoch
        },
        "accepted metadata must not be restamped from current policy"
    );
    network_tick(&mut runtime, 80, mailbox.take());
    assert!(runtime.clock_authority().is_none());
    assert_eq!(runtime.clock_generation, 3);
}

#[test]
fn only_actual_network_revocation_advances_generation_and_it_bypasses_storage() {
    for operator in [false, true] {
        let mut runtime = configured(false);
        if operator {
            command(
                &mut runtime,
                0,
                RuntimeCommand::SetUtcObserved(utc_sample(1000, 0)),
            );
        } else {
            network_tick(
                &mut runtime,
                0,
                ClockUpdate {
                    sample: Some(network_sample(utc_sample(1000, 0))),
                    ..Default::default()
                },
            );
        }
        let before = accepted(&runtime);
        command(
            &mut runtime,
            20,
            RuntimeCommand::SaveConfiguration(config(2, 3, false, true)),
        );
        let ticket = runtime.store_request().unwrap().ticket;
        network_tick(
            &mut runtime,
            40,
            ClockUpdate {
                revoke_network: true,
                ..Default::default()
            },
        );
        assert_eq!(runtime.store_request().unwrap().ticket, ticket);
        if operator {
            assert_eq!(accepted(&runtime), before);
        } else {
            assert!(runtime.clock_authority().is_none());
            assert_eq!(runtime.clock_generation, before.generation + 1);
        }
        let generation = runtime.clock_generation;
        network_tick(
            &mut runtime,
            60,
            ClockUpdate {
                revoke_network: true,
                ..Default::default()
            },
        );
        assert_eq!(runtime.clock_generation, generation);
    }
}

#[test]
fn explicit_source_withdrawal_keeps_a_newer_operator_authority_unchanged() {
    let mut mailbox = ClockMailbox::new();
    mailbox.set_source(Some(7));
    let read = mailbox.begin().unwrap();
    assert!(mailbox.offer(read, utc_sample(1000, 0), Millis(0)));
    let mut runtime = configured(false);
    network_tick(&mut runtime, 0, mailbox.take());
    let network_epoch = mailbox.source_epoch();
    let failed = mailbox.begin().unwrap();
    mailbox.reject(failed);
    assert_ne!(mailbox.source_epoch(), network_epoch);
    // The operator command is accepted before control sees the older network
    // withdrawal. It is an independent authority and cannot be revoked by it.
    mailbox.operator_command();
    command(
        &mut runtime,
        20,
        RuntimeCommand::SetUtcObserved(utc_sample(2000, 20)),
    );
    let operator = accepted(&runtime);
    assert_eq!(operator.source, ClockSource::Operator);
    network_tick(&mut runtime, 40, mailbox.take());
    assert_eq!(accepted(&runtime), operator);
    mailbox.reject(failed);
    network_tick(&mut runtime, 60, mailbox.take());
    assert_eq!(accepted(&runtime), operator);
}

#[test]
fn invalid_network_observation_withdraws_network_authority_once() {
    let mut runtime = configured(false);
    network_tick(
        &mut runtime,
        0,
        ClockUpdate {
            sample: Some(network_sample(utc_sample(1000, 0))),
            ..Default::default()
        },
    );
    assert_eq!(accepted(&runtime).generation, 1);
    let invalid = ClockUpdate {
        sample: Some(network_sample(utc_sample(1000, 100))),
        ..Default::default()
    };
    network_tick(&mut runtime, 20, invalid);
    assert!(runtime.clock_authority().is_none());
    assert_eq!(runtime.clock_generation, 2);
    network_tick(&mut runtime, 40, invalid);
    assert_eq!(runtime.clock_generation, 2);
}

#[test]
fn checked_authority_exhaustion_closes_only_clock_and_keeps_pending_or_active_manual_lease() {
    for active in [false, true] {
        let mut runtime = if active { manual() } else { configured(false) };
        let now = if active { 120 } else { 0 };
        if !active {
            command(&mut runtime, now, RuntimeCommand::On);
        }
        let before = runtime.supervisor.as_ref().unwrap().status();
        assert_eq!(before.demand, Demand::Override);
        command(
            &mut runtime,
            now,
            RuntimeCommand::SetUtcObserved(utc_sample(1000, now)),
        );
        runtime.clock_generation = u64::MAX - 1;
        command(
            &mut runtime,
            now,
            RuntimeCommand::SetUtcObserved(utc_sample(1000, now)),
        );
        assert_eq!(accepted(&runtime).generation, u64::MAX);
        let mut observed = observation(now + 20);
        observed.reading = Reading::Valid {
            level: Level::new(100).unwrap(),
            observed_at: observed.now,
        };
        let exhausted = runtime.step(
            observed,
            Some(Request {
                id: 8,
                command: RuntimeCommand::SetUtcObserved(utc_sample(1000, now + 20)),
            }),
            None,
        );
        assert_eq!(
            exhausted.command_reply.unwrap().result,
            Err(Error::Exhausted)
        );
        assert!(runtime.clock_generation_exhausted);
        assert!(runtime.clock_authority().is_none());
        assert!(!runtime.storage_failed());
        assert!(runtime.store_request().is_none());
        let after = exhausted.status.unwrap();
        assert_eq!(after.demand, Demand::Override);
        assert_eq!(after.deadline, before.deadline);
        assert_eq!(after.control.relay, before.control.relay);
        assert_eq!(
            command(
                &mut runtime,
                now + 40,
                RuntimeCommand::SetUtcObserved(utc_sample(1000, now + 40))
            )
            .command_reply
            .unwrap()
            .result,
            Err(Error::Exhausted)
        );
        assert_eq!(
            command(&mut runtime, now + 60, RuntimeCommand::ClearUtc)
                .command_reply
                .unwrap()
                .result,
            Ok(Acknowledgement::Applied)
        );
        assert!(runtime.clock_authority().is_none());
        assert_eq!(runtime.clock_generation, u64::MAX);
    }
}

#[test]
fn every_clock_loss_path_fails_closed_at_the_last_generation() {
    for cause in 0..5 {
        let mut runtime = configured(false);
        runtime.clock_generation = u64::MAX - 1;
        network_tick(
            &mut runtime,
            0,
            ClockUpdate {
                sample: Some(network_sample(utc_sample(1000, 0))),
                ..Default::default()
            },
        );
        assert_eq!(accepted(&runtime).generation, u64::MAX);
        tick(&mut runtime, 20);
        let at = match cause {
            1 => UTC_MAX_AGE_MS,
            2 => 19,
            _ => 40,
        };
        match cause {
            0 => {
                command(&mut runtime, at, RuntimeCommand::ClearUtc);
            }
            1 | 2 => {
                tick(&mut runtime, at);
            }
            3 => {
                network_tick(
                    &mut runtime,
                    at,
                    ClockUpdate {
                        revoke_network: true,
                        ..Default::default()
                    },
                );
            }
            _ => {
                network_tick(
                    &mut runtime,
                    at,
                    ClockUpdate {
                        sample: Some(network_sample(utc_sample(1000, 100))),
                        ..Default::default()
                    },
                );
            }
        }
        assert!(runtime.clock_generation_exhausted);
        assert!(runtime.clock_authority().is_none());
        assert_eq!(runtime.clock_generation, u64::MAX);
        assert_eq!(
            command(
                &mut runtime,
                at + 20,
                RuntimeCommand::SetUtcObserved(utc_sample(1000, at + 20))
            )
            .command_reply
            .unwrap()
            .result,
            Err(Error::Exhausted)
        );
        assert_eq!(
            command(&mut runtime, at + 40, RuntimeCommand::Off)
                .command_reply
                .unwrap()
                .result,
            Ok(Acknowledgement::Applied)
        );
        assert!(!runtime.storage_failed());
    }
}
