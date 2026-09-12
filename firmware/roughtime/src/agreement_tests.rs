use super::*;
use crate::tests::{root, set, Model};
use crate::{frame, tag, MAX_ATTEMPT_MS, MAX_UNIX_MS};
use std::{cell::Cell, vec::Vec};

const SE: Provider = Provider::RoughtimeSe;
const INT: Provider = Provider::Int08h;
const MIDPOINT: u64 = 1_800_000_000;
const SE_REQUEST: &[u8] = include_bytes!("../tests/fixtures/roughtime.se.request.bin");
const SE_RESPONSE: &[u8] = include_bytes!("../tests/fixtures/roughtime.se.response.bin");
const INT_REQUEST: &[u8] = include_bytes!("../tests/fixtures/roughtime.int08h.com.request.bin");
const INT_RESPONSE: &[u8] = include_bytes!("../tests/fixtures/roughtime.int08h.com.response.bin");

fn nonce(request: &[u8]) -> [u8; 32] {
    frame(request)
        .unwrap()
        .get(tag(b"NONC"))
        .unwrap()
        .try_into()
        .unwrap()
}
fn synthetic(start: u64, deadline: u64, rate: ClockRateBound) -> AgreementRound {
    let mut round = AgreementRound::new(start, deadline, rate).unwrap();
    round.test_roots = [Some(root().verifying_key().to_bytes()); 2];
    round
}
fn response(round: &AgreementRound, provider: Provider, midpoint: u64, radius: u32) -> Vec<u8> {
    let Slot::Requested(request) = &round.slots[index(provider)] else {
        panic!("request missing")
    };
    let mut model = Model::new(request);
    set(&mut model.signed, b"MIDP", midpoint.to_le_bytes());
    set(&mut model.signed, b"RADI", radius.to_le_bytes());
    model.encode()
}
fn start_pair(round: &mut AgreementRound, at: u64) {
    round.begin(SE, [1; 32], at).unwrap();
    round.begin(INT, [2; 32], at).unwrap();
}
fn ready_at(at: u64) -> AgreementRound {
    let mut round = synthetic(at, at + 10_000, ClockRateBound::EXACT);
    start_pair(&mut round, at);
    for provider in [SE, INT] {
        let packet = response(&round, provider, MIDPOINT, 5);
        round.receive(provider, &packet, at, || at).unwrap();
    }
    round
}
fn assert_closed(mut round: AgreementRound, now: u64) {
    assert_eq!(round.begin(SE, [3; 32], now), Err(Error::Closed));
    assert_eq!(
        round.receive(INT, INT_RESPONSE, now, || now),
        Err(Error::Closed)
    );
    assert_eq!(round.finish(|| now), Err(Error::Closed));
}

#[test]
fn public_signed_pair_matches_wire_and_is_order_independent_at_original_capture() {
    for order in [[SE, INT], [INT, SE]] {
        let mut round = AgreementRound::new(100, 5000, ClockRateBound::EXACT).unwrap();
        assert_eq!(
            &round.begin(SE, nonce(SE_REQUEST), 100).unwrap()[..],
            SE_REQUEST
        );
        assert_eq!(
            &round.begin(INT, nonce(INT_REQUEST), 100).unwrap()[..],
            INT_REQUEST
        );
        for (at, provider) in order.into_iter().enumerate() {
            let (packet, receive) = if provider == SE {
                (SE_RESPONSE, 255)
            } else {
                (INT_RESPONSE, 170)
            };
            assert_eq!(
                round.receive(provider, packet, receive, || 300 + at as u64),
                Ok(if at == 0 {
                    Progress::Pending
                } else {
                    Progress::Ready
                })
            );
        }
        let agreement = round.finish(|| 1000).unwrap();
        let midpoint = 1_789_235_933_000;
        assert_eq!(agreement.observation().captured_at(), Millis(255));
        assert_eq!(agreement.captured_at_ms(SE), 255);
        assert_eq!(agreement.captured_at_ms(INT), 170);
        assert_eq!(
            agreement.projected(SE),
            UtcBounds::new(midpoint - 1000, midpoint + 1155).unwrap()
        );
        assert_eq!(
            agreement.projected(INT),
            UtcBounds::new(midpoint - 4915, midpoint + 5155).unwrap()
        );
        assert_eq!(agreement.observation().bounds(), agreement.projected(INT));
        assert_eq!(
            agreement.into_observation().bounds_at(Millis(1000)),
            UtcBounds::new(midpoint - 4170, midpoint + 5900)
        );
    }
}

#[test]
fn narrow_adversarial_overlap_keeps_the_honest_hull_not_the_intersection() {
    for narrow in [SE, INT] {
        let mut round = synthetic(100, 5000, ClockRateBound::EXACT);
        start_pair(&mut round, 100);
        for provider in [SE, INT] {
            let (mid, radius) = if provider == narrow {
                (MIDPOINT + 4, 1)
            } else {
                (MIDPOINT, 5)
            };
            let packet = response(&round, provider, mid, radius);
            round.receive(provider, &packet, 100, || 100).unwrap();
        }
        let agreement = round.finish(|| 200).unwrap();
        assert_eq!(
            agreement.observation().bounds(),
            UtcBounds::new(MIDPOINT * 1000 - 5000, MIDPOINT * 1000 + 5000).unwrap()
        );
        assert_eq!(agreement.observation().captured_at(), Millis(100));
    }
}

#[test]
fn touching_endpoints_and_exact_twenty_second_hull_pass_but_one_more_ms_fails() {
    for extra in [0, 1] {
        let mut round = synthetic(99, 5000, ClockRateBound::EXACT);
        round.begin(INT, [2; 32], 100 - extra).unwrap();
        round.begin(SE, [1; 32], 100).unwrap();
        for (provider, mid) in [(SE, MIDPOINT), (INT, MIDPOINT + 10)] {
            let packet = response(&round, provider, mid, 5);
            round.receive(provider, &packet, 100, || 100).unwrap();
        }
        let result = round.finish(|| 100);
        if extra == 0 {
            let bounds = result.unwrap().observation().bounds();
            assert_eq!(bounds.latest_ms() - bounds.earliest_ms(), MAX_HULL_MS);
        } else {
            assert_eq!(result, Err(Error::HullTooWide));
        }
    }
}

#[test]
fn projection_reveals_a_one_ms_gap_and_never_forces_agreement() {
    let mut round = synthetic(1000, 5000, ClockRateBound::EXACT);
    round.begin(INT, [2; 32], 1000).unwrap();
    let high = response(&round, INT, MIDPOINT + 10, 5);
    round.begin(SE, [1; 32], 1001).unwrap();
    let low = response(&round, SE, MIDPOINT, 5);
    round.receive(SE, &low, 1001, || 1001).unwrap();
    round.receive(INT, &high, 1000, || 1001).unwrap();
    assert_eq!(round.finish(|| 1001), Err(Error::NoOverlap));
}

#[test]
fn explicit_drift_and_quantization_expand_transport_and_projection_outward() {
    let rate = ClockRateBound::new(100, 1).unwrap();
    let mut round = synthetic(100, 5000, rate);
    round.begin(SE, [1; 32], 100).unwrap();
    let first = response(&round, SE, MIDPOINT, 5);
    round.receive(SE, &first, 1100, || 1110).unwrap();
    round.begin(INT, [2; 32], 1200).unwrap();
    let second = response(&round, INT, MIDPOINT, 5);
    round.receive(INT, &second, 2200, || 2210).unwrap();
    let agreement = round.finish(|| 2500).unwrap();
    let mid = MIDPOINT * 1000;
    assert_eq!(
        agreement.projected(SE),
        UtcBounds::new(mid - 3902, mid + 7104).unwrap()
    );
    assert_eq!(
        agreement.projected(INT),
        UtcBounds::new(mid - 5000, mid + 6004).unwrap()
    );
    assert_eq!(
        agreement.observation().bounds(),
        UtcBounds::new(mid - 5000, mid + 7104).unwrap()
    );
    assert_eq!(agreement.observation().rate(), rate);
    assert_eq!(agreement.observation().captured_at(), Millis(2200));
    assert!(agreement.observation().at(Millis(2500)).is_none());
}

#[test]
fn pending_missing_duplicate_and_unstarted_work_never_produces_partial_agreement() {
    let round = synthetic(0, 5000, ClockRateBound::EXACT);
    assert_eq!(round.finish(|| 0), Err(Error::Incomplete));
    let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
    start_pair(&mut round, 0);
    let packet = response(&round, SE, MIDPOINT, 5);
    round.receive(SE, &packet, 1, || 1).unwrap();
    assert_eq!(round.finish(|| 1), Err(Error::Incomplete));
    for after_verified in [false, true] {
        let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
        start_pair(&mut round, 0);
        if after_verified {
            let packet = response(&round, SE, MIDPOINT, 5);
            round.receive(SE, &packet, 1, || 1).unwrap();
        }
        assert_eq!(round.begin(SE, [3; 32], 1), Err(Error::DuplicateProvider));
        assert_closed(round, 1);
    }
    let mut round = ready_at(0);
    assert_eq!(
        round.receive(SE, SE_RESPONSE, 1, || 1),
        Err(Error::DuplicateProvider)
    );
    assert_closed(round, 1);
    let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
    assert_eq!(
        round.receive(SE, SE_RESPONSE, 0, || 0),
        Err(Error::UnstartedProvider)
    );
    assert_closed(round, 0);
    let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
    round.begin(SE, [1; 32], 0).unwrap();
    assert_eq!(round.begin(INT, [1; 32], 0), Err(Error::ReusedNonce));
    assert_closed(round, 0);
}

#[test]
fn real_bad_and_cross_round_datagrams_consume_the_round_without_sample_import() {
    let mut old = synthetic(0, 5000, ClockRateBound::EXACT);
    start_pair(&mut old, 0);
    let old_se = response(&old, SE, MIDPOINT, 5);
    old.receive(SE, &old_se, 1, || 1).unwrap();
    assert!(matches!(
        old.receive(INT, b"bad", 1, || 1),
        Err(Error::Verification { provider: INT, .. })
    ));
    assert_closed(old, 1);
    let mut newer = synthetic(1, 5000, ClockRateBound::EXACT);
    newer.begin(SE, [3; 32], 1).unwrap();
    newer.begin(INT, [4; 32], 1).unwrap();
    assert_eq!(
        newer.receive(SE, &old_se, 2, || 2),
        Err(Error::Verification {
            provider: SE,
            error: VerifyError::Nonce
        })
    );
    assert_closed(newer, 2);
    let mut wrong_provider = AgreementRound::new(0, 5000, ClockRateBound::EXACT).unwrap();
    wrong_provider.begin(INT, nonce(SE_REQUEST), 0).unwrap();
    assert_eq!(
        wrong_provider.receive(INT, SE_RESPONSE, 1, || 1),
        Err(Error::Verification {
            provider: INT,
            error: VerifyError::Signature
        })
    );
    assert_closed(wrong_provider, 1);
    let mut pinned = AgreementRound::new(0, 5000, ClockRateBound::EXACT).unwrap();
    pinned.begin(SE, [1; 32], 0).unwrap();
    let test_signed = response(&pinned, SE, MIDPOINT, 5);
    assert_eq!(
        pinned.receive(SE, &test_signed, 1, || 1),
        Err(Error::Verification {
            provider: SE,
            error: VerifyError::Signature
        })
    );
    assert_closed(pinned, 1);
}

#[test]
fn round_and_individual_deadlines_include_verification_and_final_completion() {
    let mut round = synthetic(100, 250, ClockRateBound::EXACT);
    round.begin(SE, [1; 32], 100).unwrap();
    let packet = response(&round, SE, MIDPOINT, 5);
    let clock = Cell::new(200);
    assert_eq!(
        round.receive(SE, &packet, 150, || {
            let n = clock.get();
            clock.set(250);
            n
        }),
        Err(Error::Deadline)
    );
    assert_closed(round, 250);
    for expired_at in [MAX_ATTEMPT_MS, MAX_ATTEMPT_MS + 1] {
        let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
        round.begin(SE, [1; 32], 0).unwrap();
        let packet = response(&round, SE, MIDPOINT, 5);
        assert_eq!(
            round.receive(SE, &packet, 1, || expired_at),
            Err(Error::Verification {
                provider: SE,
                error: VerifyError::Deadline
            })
        );
        assert_closed(round, expired_at);
    }
    let round = ready_at(0);
    assert_eq!(round.finish(|| 10_000), Err(Error::Deadline));
    let mut round = synthetic(0, 10, ClockRateBound::EXACT);
    assert_eq!(round.begin(SE, [1; 32], 10), Err(Error::Deadline));
    assert_closed(round, 10);
}

#[test]
fn clock_rollback_future_captures_and_counter_limits_fail_closed() {
    for (start, deadline) in [(0, 0), (2, 1), (0, i64::MAX as u64), (0, u64::MAX)] {
        assert!(matches!(
            AgreementRound::new(start, deadline, ClockRateBound::EXACT),
            Err(Error::InvalidDeadline)
        ));
    }
    for (received, entered, completed) in [
        (99, 200, 200),
        (201, 200, 201),
        (150, 200, 199),
        (150, 200, u64::MAX),
    ] {
        let mut round = synthetic(100, 5000, ClockRateBound::EXACT);
        round.begin(SE, [1; 32], 100).unwrap();
        let packet = response(&round, SE, MIDPOINT, 5);
        let next = Cell::new(entered);
        assert_eq!(
            round.receive(SE, &packet, received, || {
                let n = next.get();
                next.set(completed);
                n
            }),
            Err(Error::Timing)
        );
        assert_closed(round, 200);
    }
    let mut round = synthetic(100, 5000, ClockRateBound::EXACT);
    start_pair(&mut round, 200);
    assert_eq!(
        round.receive(SE, SE_RESPONSE, 150, || 199),
        Err(Error::Timing)
    );
    assert_closed(round, 200);
    assert_eq!(ready_at(100).finish(|| 99), Err(Error::Timing));
}

#[test]
fn historical_receives_do_not_mask_actual_clock_rollback_or_refresh_capture() {
    let mut round = synthetic(100, 5000, ClockRateBound::EXACT);
    round.begin(SE, [1; 32], 100).unwrap();
    let first = response(&round, SE, MIDPOINT, 5);
    round.begin(INT, [2; 32], 200).unwrap();
    let second = response(&round, INT, MIDPOINT, 5);
    round.receive(INT, &second, 250, || 300).unwrap();
    round.receive(SE, &first, 150, || 310).unwrap();
    let agreement = round.finish(|| 1500).unwrap();
    assert_eq!(agreement.observation().captured_at(), Millis(250));
    assert_eq!(agreement.captured_at_ms(SE), 150);
    assert_eq!(agreement.captured_at_ms(INT), 250);
}

#[test]
fn projection_range_overflow_and_expired_dispatch_never_create_an_observation() {
    let mut round = synthetic(0, 5000, ClockRateBound::EXACT);
    round.begin(SE, [1; 32], 0).unwrap();
    let packet = response(&round, SE, MAX_UNIX_MS / 1000 - 5, 5);
    round.receive(SE, &packet, 0, || 0).unwrap();
    round.begin(INT, [2; 32], 1000).unwrap();
    let packet = response(&round, INT, MAX_UNIX_MS / 1000 - 5, 5);
    round.receive(INT, &packet, 1000, || 1000).unwrap();
    assert_eq!(round.finish(|| 1000), Err(Error::TimeRange));
    let mut round = synthetic(
        0,
        i64::MAX as u64 - 1,
        ClockRateBound::new(999999, 0).unwrap(),
    );
    round.begin(SE, [1; 32], 0).unwrap();
    let packet = response(&round, SE, MIDPOINT, 5);
    round.receive(SE, &packet, 0, || 0).unwrap();
    let late = i64::MAX as u64 - 100;
    round.begin(INT, [2; 32], late).unwrap();
    let packet = response(&round, INT, MIDPOINT, 5);
    round.receive(INT, &packet, late, || late).unwrap();
    assert_eq!(round.finish(|| late), Err(Error::TimeRange));
    let mut round = ready_at(0);
    round.deadline_ms = crystal_shim_core::utc::MAX_AGE_MS + 1;
    assert_eq!(
        round.finish(|| crystal_shim_core::utc::MAX_AGE_MS),
        Err(Error::Timing)
    );
}

#[test]
fn complete_coordinator_storage_remains_fixed_and_small() {
    assert!(core::mem::size_of::<AgreementRound>() <= 4096);
    assert!(core::mem::size_of::<Agreement>() <= 256);
}

#[test]
fn projection_width_and_transport_deadlines_include_quantization() {
    for quantization in [1, 2] {
        let mut round = synthetic(0, 5000, ClockRateBound::new(0, quantization).unwrap());
        start_pair(&mut round, 0);
        for (provider, midpoint) in [(SE, MIDPOINT), (INT, MIDPOINT + 9)] {
            let packet = response(&round, provider, midpoint, 5);
            round.receive(provider, &packet, 998, || 1000).unwrap();
        }
        let result = round.finish(|| 1000);
        if quantization == 1 {
            let bounds = result.unwrap().observation().bounds();
            assert_eq!(bounds.latest_ms() - bounds.earliest_ms(), MAX_HULL_MS);
        } else {
            // At this rate the unprojected hull is exactly 20,000 ms wide.
            // Adding the projection's quantization must make it unusable.
            assert_eq!(result, Err(Error::HullTooWide));
        }
    }
    let mut round = synthetic(0, 5000, ClockRateBound::new(0, 1).unwrap());
    round.begin(SE, [1; 32], 0).unwrap();
    let packet = response(&round, SE, MIDPOINT, 5);
    assert_eq!(
        round.receive(SE, &packet, 1999, || 1999),
        Err(Error::Verification {
            provider: SE,
            error: VerifyError::Deadline
        })
    );
    assert_closed(round, 1999);
}
