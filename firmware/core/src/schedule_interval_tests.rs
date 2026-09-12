use super::*;
use crate::timezone::PosixTimeZone;
use crate::{DailyEntry, DayMask, UtcSeconds, WindowDisposition};

fn clock(lo: u64, hi: u64, rate: ClockRateBound, zone: &PosixTimeZone) -> ScheduleInterval {
    ScheduleInterval::new(
        UtcBounds::new(lo, hi).unwrap(),
        rate,
        zone.civil_at(UtcSeconds(lo / 1000)).unwrap(),
        zone.civil_at(UtcSeconds(hi / 1000)).unwrap(),
    )
    .unwrap()
}
fn entry(id: u16, start: u32) -> DailyEntry {
    DailyEntry::new(id, DayMask::EVERY_DAY, start).unwrap()
}

#[test]
fn uncertainty_must_fit_one_whole_occurrence_including_its_end_boundary() {
    let zone = PosixTimeZone::parse("UTC0").unwrap();
    let entries = [entry(1, 1_000)];
    let schedule = Schedule::new(&entries, 900).unwrap();
    for (lo, hi) in [
        (999_999, 1_000_000),
        (1_899_999, 1_900_000),
        (900_000, 2_000_000),
    ] {
        assert_eq!(
            Scheduler::evaluate_interval(
                Millis(0),
                Some(clock(lo, hi, ClockRateBound::EXACT, &zone)),
                schedule,
                &zone,
                None
            ),
            Ok(ScheduleDecision::Inactive)
        );
    }
    let interval = clock(
        1_000_000,
        1_010_999,
        ClockRateBound::new(100, 1).unwrap(),
        &zone,
    );
    let ScheduleDecision::PersistBeforeRun(occurrence) =
        Scheduler::evaluate_interval(Millis(500), Some(interval), schedule, &zone, None).unwrap()
    else {
        panic!()
    };
    let saved = RetainedWindow {
        id: occurrence.id,
        ends_utc: occurrence.ends_utc,
        disposition: WindowDisposition::Eligible,
    };
    let ScheduleDecision::Active { window, .. } =
        Scheduler::evaluate_interval(Millis(500), Some(interval), schedule, &zone, Some(saved))
            .unwrap()
    else {
        panic!()
    };
    assert_eq!(window.ends_at, Millis(889_411)); // 889001 ms real budget, slow-clock bound and 1 ms quantization
    let suppressed = RetainedWindow {
        disposition: WindowDisposition::Suppressed,
        ..saved
    };
    assert_eq!(
        Scheduler::evaluate_interval(
            Millis(500),
            Some(interval),
            schedule,
            &zone,
            Some(suppressed)
        ),
        Ok(ScheduleDecision::Suppressed)
    );
    let expired = RetainedWindow {
        ends_utc: UtcSeconds(1005),
        ..saved
    };
    assert_eq!(
        Scheduler::evaluate_interval(Millis(500), Some(interval), schedule, &zone, Some(expired)),
        Ok(ScheduleDecision::Suppressed)
    );
}

#[test]
fn overlapping_occurrences_cannot_lend_each_other_uncertain_time() {
    let zone = PosixTimeZone::parse("UTC0").unwrap();
    let entries = [entry(1, 1_000), entry(2, 1_050)];
    let schedule = Schedule::new(&entries, 100).unwrap();
    assert_eq!(
        Scheduler::evaluate_interval(
            Millis(0),
            Some(clock(1_099_999, 1_100_000, ClockRateBound::EXACT, &zone)),
            schedule,
            &zone,
            None
        ),
        Ok(ScheduleDecision::Inactive)
    );
    assert!(matches!(
        Scheduler::evaluate_interval(
            Millis(0),
            Some(clock(1_050_000, 1_099_999, ClockRateBound::EXACT, &zone)),
            schedule,
            &zone,
            None
        ),
        Ok(ScheduleDecision::PersistBeforeRun(_))
    ));
}

#[test]
fn midnight_and_dst_fold_share_one_utc_occurrence_only() {
    let utc = PosixTimeZone::parse("UTC0").unwrap();
    let entries = [entry(1, 86_350)];
    let schedule = Schedule::new(&entries, 100).unwrap();
    assert!(matches!(
        Scheduler::evaluate_interval(
            Millis(0),
            Some(clock(86_390_000, 86_410_000, ClockRateBound::EXACT, &utc)),
            schedule,
            &utc,
            None
        ),
        Ok(ScheduleDecision::PersistBeforeRun(_))
    ));
    let zone = PosixTimeZone::parse("PST8PDT,M3.2.0/2,M11.1.0/2").unwrap();
    // 2026-11-01 08:59:59..09:00:01Z crosses the autumn 01:59 -> 01:00 fold.
    let entries = [entry(1, 5_400)];
    let schedule = Schedule::new(&entries, 7_200).unwrap();
    let interval = clock(
        1_793_523_599_000,
        1_793_523_601_000,
        ClockRateBound::EXACT,
        &zone,
    );
    assert_ne!(interval.earliest.fold, interval.latest.fold);
    assert!(matches!(
        Scheduler::evaluate_interval(Millis(0), Some(interval), schedule, &zone, None),
        Ok(ScheduleDecision::PersistBeforeRun(_))
    ));
}

#[test]
fn mismatched_civil_interval_and_invalid_retained_fields_fail_closed() {
    let zone = PosixTimeZone::parse("UTC0").unwrap();
    let bound = UtcBounds::new(1000, 2000).unwrap();
    let civil = zone.civil_at(UtcSeconds(1)).unwrap();
    assert!(ScheduleInterval::new(bound, ClockRateBound::EXACT, civil, civil).is_err());
    let entries = [entry(1, 1000)];
    let invalid = RetainedWindow {
        id: crate::WindowId(0),
        ends_utc: UtcSeconds(1001),
        disposition: WindowDisposition::Eligible,
    };
    assert!(Scheduler::evaluate_interval(
        Millis(0),
        None,
        Schedule::new(&entries, 100).unwrap(),
        &zone,
        Some(invalid)
    )
    .is_err());
}
