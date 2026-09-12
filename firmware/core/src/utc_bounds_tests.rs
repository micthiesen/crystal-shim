use super::*;
use crate::{
    utc::{UtcAnchor, UtcObservation, MAX_AGE_MS},
    Millis,
};

#[test]
fn bounds_calendar_and_outward_seconds_never_collapse_uncertainty() {
    assert!(UtcBounds::new(2, 1).is_none());
    assert!(UtcBounds::new(0, MAX_UNIX_MS + 1).is_none());
    let range = UtcBounds::new(1999, 2001).unwrap();
    assert_eq!(range.outward_seconds(), (1, 3));
    assert!(range.point().is_none());
    assert_eq!(
        UtcBounds::new(2000, 2000).unwrap().outward_seconds(),
        (2, 2)
    );
    assert!(ClockRateBound::new(1_000_000, 0).is_none());
    assert!(ClockRateBound::new(u32::MAX, 0).is_none());
    assert!(UtcBounds::new(MAX_UNIX_MS, MAX_UNIX_MS)
        .unwrap()
        .project(1, ClockRateBound::EXACT)
        .is_none());
}

#[test]
fn elapsed_extrema_are_outward_and_tight_by_integer_cross_multiplication() {
    for ppm in [0, 1, 100, 500, 999_999] {
        for quantum in [0, 1, 9] {
            let rate = ClockRateBound::new(ppm, quantum).unwrap();
            for measured in [
                0u64,
                1,
                2,
                1000,
                1_999,
                3_599_999,
                3_600_000,
                u32::MAX as u64,
            ] {
                let (lo, hi) = rate.elapsed_bounds(measured).unwrap();
                let small = u128::from(measured.saturating_sub(u64::from(quantum))) * SCALE;
                let large = (u128::from(measured) + u128::from(quantum)) * SCALE;
                let fast = SCALE + u128::from(ppm);
                let slow = SCALE - u128::from(ppm);
                assert!(u128::from(lo) * fast <= small);
                assert!((u128::from(lo) + 1) * fast > small);
                assert!(u128::from(hi) * slow >= large);
                assert!(hi == 0 || u128::from(hi - 1) * slow < large);
                assert!(lo <= hi);
            }
        }
    }
    assert!(ClockRateBound::new(999_999, 1)
        .unwrap()
        .elapsed_bounds(u64::MAX)
        .is_none());
}

#[test]
fn inverse_deadline_cannot_outlast_the_latest_possible_utc() {
    for ppm in [0, 100, 100_000, 999_999] {
        for quantum in [0, 1, 4] {
            let rate = ClockRateBound::new(ppm, quantum).unwrap();
            for remaining in [0u64, 1, 2, 10, 1_000, 900_000, 86_400_000] {
                let delta = rate.safe_duration_ms(remaining).unwrap();
                // Zero means no eligible run, including budgets below quantization.
                if delta > 0 {
                    assert!(rate.elapsed_bounds(delta).unwrap().1 <= remaining);
                }
                assert!(rate.elapsed_bounds(delta + 1).unwrap().1 > remaining);
            }
        }
    }
}

#[test]
fn original_interval_survives_dispatch_but_expires_and_latches_rollback() {
    let rate = ClockRateBound::new(100, 1).unwrap();
    let original = UtcObservation::bounded(
        UtcBounds::new(1_000_000, 1_010_000).unwrap(),
        Millis(100),
        rate,
    )
    .unwrap();
    assert!(
        original.at(Millis(100)).is_none(),
        "scalar consumers must refuse intervals"
    );
    let mut anchor = UtcAnchor::new(original, Millis(600)).unwrap();
    assert_eq!(anchor.observation(), Some(original));
    let projected = anchor.bounds_at(Millis(1_100)).unwrap();
    assert_eq!(projected.earliest_ms(), 1_000_998);
    assert_eq!(projected.latest_ms(), 1_011_002);
    assert!(anchor.at(Millis(1_100)).is_none());
    assert!(
        anchor.bounds_at(Millis(1_100)).is_some(),
        "scalar refusal does not destroy the valid interval"
    );
    assert!(anchor.bounds_at(Millis(1_099)).is_none());
    assert!(anchor.bounds_at(Millis(1_101)).is_none());
    let mut anchor = UtcAnchor::new(original, Millis(100)).unwrap();
    assert!(anchor.bounds_at(Millis(100 + MAX_AGE_MS - 362)).is_some());
    assert!(anchor.bounds_at(Millis(100 + MAX_AGE_MS - 361)).is_none());
    assert!(anchor.bounds_at(Millis(100)).is_none());
    for invalid in [99, i64::MAX as u64, u64::MAX] {
        assert!(UtcAnchor::new(original, Millis(invalid)).is_none());
    }
    let point_with_rate = UtcObservation::bounded(
        UtcBounds::new(1_000_000, 1_000_000).unwrap(),
        Millis(0),
        ClockRateBound::new(100, 0).unwrap(),
    )
    .unwrap();
    assert!(
        point_with_rate.at(Millis(0)).is_none(),
        "future uncertainty requires the interval API even at capture"
    );
}
