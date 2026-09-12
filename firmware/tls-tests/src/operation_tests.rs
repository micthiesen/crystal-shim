use super::*;
use crate::tests::{clock_test, fixture_date, hooked_utc, tick};
use crate::{set_trusted_observation, set_trusted_utc};

fn authority(generation: u64, source: ClockSource) -> ClockAuthority {
    ClockAuthority {
        observation: UtcObservation::new(1_789_128_000_001, Millis(0)).unwrap(),
        generation,
        source,
    }
}

fn covering() -> CertificateValidity {
    CertificateValidity {
        not_before: CertificateTime {
            year: 2020,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
        },
        not_after: CertificateTime {
            year: 2030,
            month: 1,
            day: 1,
            hour: 0,
            minute: 0,
            second: 0,
        },
        depth: 0,
    }
}

#[test]
fn explicit_mailbox_withdrawal_revokes_tls_before_control_consumes_it() {
    use crystal_shim_core::utc::{ClockMailbox, ReadResult};

    let _guard = clock_test();
    let mut mailbox = ClockMailbox::new();
    mailbox.set_source(Some(7_u8));
    mailbox.take();
    let accepted = authority(
        1,
        ClockSource::Network {
            source_epoch: mailbox.source_epoch().unwrap(),
        },
    );
    publish_clock(Some(accepted), mailbox.source_epoch());
    let lease = OperationLease::begin().unwrap();

    let transport = mailbox.begin().unwrap();
    assert!(!mailbox.finish(transport, ReadResult::TransportFailure, Millis(0)));
    publish_clock(Some(accepted), mailbox.source_epoch());
    assert!(lease.check().is_ok());

    let withdrawal = mailbox.begin().unwrap();
    assert!(!mailbox.finish(withdrawal, ReadResult::Unavailable, Millis(0)));
    // The app publishes this pair inside its mailbox critical section. The
    // control owner has not consumed the queued withdrawal or changed authority.
    publish_clock(Some(accepted), mailbox.source_epoch());
    assert!(matches!(
        lease.check(),
        Err(ProviderError::OperationRevoked)
    ));
    assert!(!has_trusted_bounds());
    assert!(hooked_utc().is_none());
    assert!(mailbox.take().revoke_network);
}

#[test]
fn valid_intervals_survive_scalar_queries_and_cover_the_original_deadline() {
    let _guard = clock_test();
    let sample = UtcObservation::bounded(
        UtcBounds::new(1_789_128_000_001, 1_789_128_010_999).unwrap(),
        Millis(100),
        ClockRateBound::new(100, 1).unwrap(),
    )
    .unwrap();
    tick(900);
    set_trusted_observation(sample);
    assert!(!has_trusted_utc());
    assert!(has_trusted_bounds());
    assert!(hooked_utc().is_none());
    let lease = OperationLease::begin().unwrap();
    assert_eq!((lease.started_at_ms(), lease.deadline_ms()), (900, 20_900));
    let scope = state(|state| state.scope.unwrap());
    let lower = sample.bounds_at(Millis(900)).unwrap().earliest_ms() / 1000;
    let upper = sample
        .bounds_at(Millis(20_900))
        .unwrap()
        .latest_ms()
        .div_ceil(1000);
    assert_eq!(
        scope.lower,
        certificate_date(UtcDateTime::from_unix(crystal_shim_core::UtcSeconds(lower)).unwrap())
    );
    assert_eq!(
        scope.upper,
        certificate_date(UtcDateTime::from_unix(crystal_shim_core::UtcSeconds(upper)).unwrap())
    );
    assert_eq!(hooked_utc().unwrap().tm_sec, scope.lower.second);
    for depth in 0..=4 {
        let exact = CertificateValidity {
            not_before: scope.lower,
            not_after: scope.upper,
            depth,
        };
        assert!(CertificateVerifier::check(&lease, exact).is_ok());
        let mut late_start = exact;
        late_start.not_before.second += 1;
        assert!(CertificateVerifier::check(&lease, late_start).is_err());
        let mut early_end = exact;
        early_end.not_after.second -= 1;
        assert!(CertificateVerifier::check(&lease, early_end).is_err());
    }
    tick(1_500);
    assert_eq!(hooked_utc().unwrap().tm_sec, scope.lower.second);
    assert!(lease.check().is_ok());
    assert!(matches!(
        OperationLease::begin(),
        Err(ProviderError::OperationBusy)
    ));
    drop(lease);
    assert!(hooked_utc().is_none());
    assert!(has_trusted_bounds());
}

#[test]
fn malformed_calendar_and_reversed_certificate_ranges_are_rejected() {
    let _guard = clock_test();
    set_trusted_utc(fixture_date());
    let lease = OperationLease::begin().unwrap();
    assert!(CertificateVerifier::check(&lease, covering()).is_ok());
    for date in [
        CertificateTime {
            year: -1,
            ..covering().not_before
        },
        CertificateTime {
            month: 13,
            ..covering().not_before
        },
        CertificateTime {
            year: 2026,
            month: 2,
            day: 29,
            ..covering().not_before
        },
        CertificateTime {
            hour: 24,
            ..covering().not_before
        },
        CertificateTime {
            minute: 60,
            ..covering().not_before
        },
        CertificateTime {
            second: 60,
            ..covering().not_before
        },
    ] {
        assert!(CertificateVerifier::check(
            &lease,
            CertificateValidity {
                not_before: date,
                ..covering()
            }
        )
        .is_err());
        assert!(CertificateVerifier::check(
            &lease,
            CertificateValidity {
                not_after: date,
                ..covering()
            }
        )
        .is_err());
    }
    assert!(CertificateVerifier::check(
        &lease,
        CertificateValidity {
            not_before: covering().not_after,
            not_after: covering().not_before,
            depth: 0
        }
    )
    .is_err());
}

#[test]
fn source_changes_revoke_network_but_preserve_independent_operator_authority() {
    let _guard = clock_test();
    for source in [
        ClockSource::Operator,
        ClockSource::Network { source_epoch: 1 },
    ] {
        let generation = state(|state| state.high_generation + 1);
        let accepted = authority(generation, source);
        publish_clock(Some(accepted), Some(1));
        let lease = OperationLease::begin().unwrap();
        publish_clock(Some(accepted), Some(2));
        if source == ClockSource::Operator {
            assert!(lease.check().is_ok());
            assert!(hooked_utc().is_some());
        } else {
            assert!(lease.check().is_err());
            assert!(hooked_utc().is_none());
            // Even a malformed epoch rollback cannot revive this authority.
            publish_clock(Some(accepted), Some(1));
            assert!(!has_trusted_bounds());
            assert!(lease.check().is_err());
        }
        drop(lease);
    }
}

#[test]
fn same_observation_new_authority_and_clear_cannot_reauthorize_an_old_scope() {
    let _guard = clock_test();
    let accepted = authority(1, ClockSource::Operator);
    publish_clock(Some(accepted), Some(0));
    let lease = OperationLease::begin().unwrap();
    let replacement = ClockAuthority {
        generation: 2,
        ..accepted
    };
    publish_clock(Some(replacement), Some(0));
    assert!(lease.check().is_err());
    // A fresh ordinary clock cannot serve an old scoped handshake.
    assert!(has_trusted_utc());
    assert!(hooked_utc().is_none());
    drop(lease);
    assert!(hooked_utc().is_some());
    let lease = OperationLease::begin().unwrap();
    publish_clock(None, Some(0));
    assert!(lease.check().is_err());
    publish_clock(Some(replacement), Some(0));
    assert!(!has_trusted_bounds());
    drop(lease);
    assert!(OperationLease::begin().is_err());
}

#[test]
fn exact_deadline_and_hook_observed_rollback_are_latched() {
    let _guard = clock_test();
    for end in [20_000, 20_001] {
        tick(0);
        set_trusted_utc(fixture_date());
        let lease = OperationLease::begin().unwrap();
        tick(end);
        assert!(lease.check().is_err());
        assert!(hooked_utc().is_none());
        tick(1);
        assert!(lease.check().is_err());
        drop(lease);
    }
    tick(100);
    set_trusted_utc(fixture_date());
    let lease = OperationLease::begin().unwrap();
    tick(200);
    assert!(hooked_utc().is_some());
    tick(199);
    assert!(hooked_utc().is_none());
    tick(201);
    assert!(hooked_utc().is_none());
    assert!(!has_trusted_bounds());
    assert!(lease.check().is_err());
}

#[test]
fn original_anchor_age_and_checked_scope_exhaustion_prevent_unsafe_start() {
    let _guard = clock_test();
    set_trusted_utc(fixture_date());
    tick(TRUSTED_UTC_MAX_AGE_MS - OPERATION_MS as i64);
    assert!(has_trusted_bounds());
    assert!(OperationLease::begin().is_err());
    tick(0);
    set_trusted_utc(fixture_date());
    state(|state| state.next_scope = Some(u64::MAX));
    let last = OperationLease::begin().unwrap();
    assert!(last.check().is_ok());
    drop(last);
    assert!(OperationLease::begin().is_err());
}
