//! Pure schedule evaluation with injected UTC and timezone resolution.
//!
//! The application owns time synchronization and the timezone database. This module does not
//! claim to implement IANA timezone rules: the adapter supplies the current civil time and
//! resolves each configured local start through [`LocalTimeResolver`]. That makes missing and
//! duplicated DST times explicit and keeps all relay deadlines monotonic.

use crate::{Millis, ScheduledWindow, WindowId};

const SECONDS_PER_DAY: u64 = 86_400;
const OCCURRENCE_ENTRY_BITS: u32 = 12;
const OCCURRENCE_SECOND_BITS: u32 = 17;
const MAX_ENTRY_ID: u16 = (1 << OCCURRENCE_ENTRY_BITS) - 1;

/// A deliberate fixed bound for validation and worst-case evaluation time.
pub const MAX_DAILY_ENTRIES: usize = 16;
/// Windows are at most one elapsed day, which bounds the UTC candidate horizon.
pub const MAX_WINDOW_SECONDS: u32 = SECONDS_PER_DAY as u32;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct UtcSeconds(pub u64);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UtcOffset(i32);

impl UtcOffset {
    pub const fn new(seconds: i32) -> Option<Self> {
        if seconds >= -(SECONDS_PER_DAY as i32) && seconds <= SECONDS_PER_DAY as i32 {
            Some(Self(seconds))
        } else {
            None
        }
    }

    pub const fn seconds(self) -> i32 {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct LocalDay(pub u32);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Fold {
    /// The only occurrence of a civil instant, or the earlier copy during a fallback.
    First,
    /// The later copy of a duplicated civil instant during a fallback.
    Second,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CivilTime {
    pub utc: UtcSeconds,
    pub day: LocalDay,
    pub second_of_day: u32,
    pub offset: UtcOffset,
    pub fold: Fold,
}

impl CivilTime {
    /// Construct a civil snapshot only when its UTC, local day/time and offset agree.
    pub fn new(
        utc: UtcSeconds,
        day: LocalDay,
        second_of_day: u32,
        offset: UtcOffset,
        fold: Fold,
    ) -> Result<Self, ScheduleError> {
        if second_of_day >= MAX_WINDOW_SECONDS {
            return Err(ScheduleError::InvalidCivilTime);
        }
        let local = i128::from(day.0) * i128::from(SECONDS_PER_DAY) + i128::from(second_of_day);
        if i128::from(utc.0) + i128::from(offset.0) != local {
            return Err(ScheduleError::InvalidCivilTime);
        }
        Ok(Self {
            utc,
            day,
            second_of_day,
            offset,
            fold,
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u8)]
pub enum Weekday {
    Monday = 0,
    Tuesday = 1,
    Wednesday = 2,
    Thursday = 3,
    Friday = 4,
    Saturday = 5,
    Sunday = 6,
}

impl Weekday {
    fn for_unix_day(day: LocalDay) -> Self {
        // 1970-01-01 was Thursday.
        match (day.0 % 7 + Weekday::Thursday as u32) % 7 {
            0 => Self::Monday,
            1 => Self::Tuesday,
            2 => Self::Wednesday,
            3 => Self::Thursday,
            4 => Self::Friday,
            5 => Self::Saturday,
            _ => Self::Sunday,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DayMask(u8);

impl DayMask {
    pub const EVERY_DAY: Self = Self(0x7f);

    pub const fn new(bits: u8) -> Option<Self> {
        if bits != 0 && bits & !0x7f == 0 {
            Some(Self(bits))
        } else {
            None
        }
    }

    pub const fn bits(self) -> u8 {
        self.0
    }

    pub const fn contains(self, day: Weekday) -> bool {
        self.0 & (1 << day as u8) != 0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DailyEntry {
    id: u16,
    days: DayMask,
    start_second: u32,
}

impl DailyEntry {
    /// `id` is stable across edits and unique within the schedule. Zero is reserved.
    pub const fn new(id: u16, days: DayMask, start_second: u32) -> Option<Self> {
        if id == 0 || id > MAX_ENTRY_ID || start_second >= MAX_WINDOW_SECONDS {
            None
        } else {
            Some(Self {
                id,
                days,
                start_second,
            })
        }
    }

    pub const fn id(self) -> u16 {
        self.id
    }

    pub const fn days(self) -> DayMask {
        self.days
    }

    pub const fn start_second(self) -> u32 {
        self.start_second
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LocalResolution {
    Missing,
    Unique(UtcSeconds),
    Ambiguous {
        earlier: UtcSeconds,
        later: UtcSeconds,
    },
}

/// Resolve a configured civil start with the selected timezone's actual rules.
pub trait LocalTimeResolver {
    fn resolve(&self, day: LocalDay, second_of_day: u32) -> LocalResolution;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Schedule<'a> {
    entries: &'a [DailyEntry],
    run_duration_seconds: u32,
}

impl<'a> Schedule<'a> {
    pub fn new(
        entries: &'a [DailyEntry],
        run_duration_seconds: u32,
    ) -> Result<Self, ScheduleError> {
        if entries.len() > MAX_DAILY_ENTRIES {
            return Err(ScheduleError::TooManyEntries);
        }
        if run_duration_seconds == 0 || run_duration_seconds > MAX_WINDOW_SECONDS {
            return Err(ScheduleError::InvalidDuration);
        }
        for (index, entry) in entries.iter().enumerate() {
            if entries[..index].iter().any(|other| other.id == entry.id) {
                return Err(ScheduleError::DuplicateEntryId);
            }
        }
        Ok(Self {
            entries,
            run_duration_seconds,
        })
    }

    pub const fn entries(self) -> &'a [DailyEntry] {
        self.entries
    }

    pub const fn run_duration_seconds(self) -> u32 {
        self.run_duration_seconds
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Occurrence {
    pub id: WindowId,
    pub starts_utc: UtcSeconds,
    pub ends_utc: UtcSeconds,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScheduleDecision {
    /// No trustworthy wall clock or no active configured occurrence.
    Inactive,
    /// Persist this occurrence and its original end before exposing it to the supervisor.
    PersistBeforeRun(Occurrence),
    /// A retained cancellation or replay watermark blocks this occurrence. Keep the existing
    /// durable record unchanged; this decision never requests a write or exposes an older ID.
    Suppressed,
    /// The occurrence may be passed to the supervisor.
    Active {
        window: ScheduledWindow,
        occurrence: Occurrence,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScheduleError {
    InvalidCivilTime,
    InvalidDuration,
    TooManyEntries,
    DuplicateEntryId,
    InvalidResolution,
    InvalidRetainedWindow(crate::RetainedError),
    TimeOverflow,
}

pub struct Scheduler;

impl Scheduler {
    /// Evaluate the current occurrence. `retained` is the last occurrence written to durable
    /// storage; its disposition decides whether the same occurrence may run after a reset.
    pub fn evaluate(
        now: Millis,
        civil: Option<CivilTime>,
        schedule: Schedule<'_>,
        resolver: &impl LocalTimeResolver,
        retained: Option<crate::RetainedWindow>,
    ) -> Result<ScheduleDecision, ScheduleError> {
        if let Some(saved) = retained {
            saved
                .validate()
                .map_err(ScheduleError::InvalidRetainedWindow)?;
        }
        let Some(civil) = civil else {
            return Ok(ScheduleDecision::Inactive);
        };
        // Fields are public for adapters; do not let a struct literal bypass validation.
        CivilTime::new(
            civil.utc,
            civil.day,
            civil.second_of_day,
            civil.offset,
            civil.fold,
        )?;
        let Some(mut occurrence) = active_occurrence(civil, schedule, resolver)? else {
            return Ok(ScheduleDecision::Inactive);
        };

        match retained {
            None => return Ok(ScheduleDecision::PersistBeforeRun(occurrence)),
            Some(saved) if occurrence.id < saved.id => {
                return Ok(ScheduleDecision::Suppressed);
            }
            Some(saved) if occurrence.id > saved.id => {
                return Ok(ScheduleDecision::PersistBeforeRun(occurrence));
            }
            Some(saved) => {
                occurrence.ends_utc = UtcSeconds(occurrence.ends_utc.0.min(saved.ends_utc.0));
                if saved.disposition == crate::WindowDisposition::Suppressed
                    || civil.utc >= occurrence.ends_utc
                {
                    return Ok(ScheduleDecision::Suppressed);
                }
            }
        }

        let remaining_seconds = occurrence
            .ends_utc
            .0
            .checked_sub(civil.utc.0)
            .ok_or(ScheduleError::TimeOverflow)?;
        let remaining_ms = remaining_seconds
            .checked_mul(1000)
            .ok_or(ScheduleError::TimeOverflow)?;
        let ends_at = now
            .0
            .checked_add(remaining_ms)
            .map(Millis)
            .ok_or(ScheduleError::TimeOverflow)?;

        Ok(ScheduleDecision::Active {
            window: ScheduledWindow {
                id: occurrence.id,
                ends_at,
            },
            occurrence,
        })
    }
}

fn active_occurrence(
    civil: CivilTime,
    schedule: Schedule<'_>,
    resolver: &impl LocalTimeResolver,
) -> Result<Option<Occurrence>, ScheduleError> {
    let mut selected: Option<Occurrence> = None;
    // A 24-hour elapsed run can cross two local midnights on a short DST day. Derive all
    // possible local start days from UTC and the resolver's allowed +/- one-day offset,
    // rather than assuming that the previous local day is sufficient. At most four days
    // are visited, even at the numeric boundaries or across a date-line change.
    let oldest_utc = civil
        .utc
        .0
        .saturating_sub(u64::from(schedule.run_duration_seconds) - 1);
    let first_day = oldest_utc.saturating_sub(SECONDS_PER_DAY) / SECONDS_PER_DAY;
    let last_day = (civil.utc.0 + SECONDS_PER_DAY) / SECONDS_PER_DAY;

    for day in first_day..=last_day.min(u64::from(u32::MAX)) {
        let day = LocalDay(day as u32);
        let weekday = Weekday::for_unix_day(day);
        for entry in schedule.entries {
            if !entry.days.contains(weekday) {
                continue;
            }
            let starts_utc = match resolver.resolve(day, entry.start_second) {
                LocalResolution::Missing => continue,
                LocalResolution::Unique(start)
                    if valid_resolution(day, entry.start_second, start) =>
                {
                    start
                }
                LocalResolution::Ambiguous { earlier, later }
                    if earlier < later
                        && valid_resolution(day, entry.start_second, earlier)
                        && valid_resolution(day, entry.start_second, later) =>
                {
                    earlier
                }
                LocalResolution::Unique(_) | LocalResolution::Ambiguous { .. } => {
                    return Err(ScheduleError::InvalidResolution);
                }
            };
            let ends_utc = UtcSeconds(
                starts_utc
                    .0
                    .checked_add(u64::from(schedule.run_duration_seconds))
                    .ok_or(ScheduleError::TimeOverflow)?,
            );
            if starts_utc <= civil.utc && civil.utc < ends_utc {
                let occurrence = Occurrence {
                    id: occurrence_id(day, *entry),
                    starts_utc,
                    ends_utc,
                };
                if selected.is_none_or(|current| {
                    (occurrence.starts_utc, occurrence.id) < (current.starts_utc, current.id)
                }) {
                    selected = Some(occurrence);
                }
            }
        }
    }
    Ok(selected)
}

fn valid_resolution(day: LocalDay, second: u32, utc: UtcSeconds) -> bool {
    let local = i128::from(day.0) * i128::from(SECONDS_PER_DAY) + i128::from(second);
    (local - i128::from(utc.0)).abs() <= i128::from(SECONDS_PER_DAY)
}

pub(crate) fn valid_occurrence_id(id: WindowId) -> bool {
    let second_mask = (1u64 << OCCURRENCE_SECOND_BITS) - 1;
    id.0 >> (32 + OCCURRENCE_SECOND_BITS + OCCURRENCE_ENTRY_BITS) == 0
        && id.0 & u64::from(MAX_ENTRY_ID) != 0
        && (id.0 >> OCCURRENCE_ENTRY_BITS) & second_mask < SECONDS_PER_DAY
}

fn occurrence_id(day: LocalDay, entry: DailyEntry) -> WindowId {
    WindowId(
        (u64::from(day.0) << (OCCURRENCE_SECOND_BITS + OCCURRENCE_ENTRY_BITS))
            | (u64::from(entry.start_second) << OCCURRENCE_ENTRY_BITS)
            | u64::from(entry.id),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{RetainedWindow, WindowDisposition};

    struct FixedOffset(i32);

    impl LocalTimeResolver for FixedOffset {
        fn resolve(&self, day: LocalDay, second: u32) -> LocalResolution {
            let local = u64::from(day.0) * SECONDS_PER_DAY + u64::from(second);
            let utc = i128::from(local) - i128::from(self.0);
            if let Ok(utc) = u64::try_from(utc) {
                LocalResolution::Unique(UtcSeconds(utc))
            } else {
                LocalResolution::Missing
            }
        }
    }

    fn civil(day: u32, second: u32, offset: i32, fold: Fold) -> CivilTime {
        let utc = (u64::from(day) * SECONDS_PER_DAY + u64::from(second))
            .checked_add_signed(-i64::from(offset))
            .unwrap();
        CivilTime::new(
            UtcSeconds(utc),
            LocalDay(day),
            second,
            UtcOffset::new(offset).unwrap(),
            fold,
        )
        .unwrap()
    }

    fn entry(id: u16, start: u32) -> DailyEntry {
        DailyEntry::new(id, DayMask::EVERY_DAY, start).unwrap()
    }

    fn retained(occurrence: Occurrence, disposition: WindowDisposition) -> RetainedWindow {
        RetainedWindow {
            id: occurrence.id,
            ends_utc: occurrence.ends_utc,
            disposition,
        }
    }

    #[test]
    fn unknown_time_and_missing_dst_start_do_not_open_a_window() {
        struct Missing;
        impl LocalTimeResolver for Missing {
            fn resolve(&self, _: LocalDay, _: u32) -> LocalResolution {
                LocalResolution::Missing
            }
        }
        let entries = [entry(1, 100)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        assert_eq!(
            Scheduler::evaluate(Millis(0), None, schedule, &Missing, None),
            Ok(ScheduleDecision::Inactive)
        );
        assert_eq!(
            Scheduler::evaluate(
                Millis(0),
                Some(civil(20_000, 100, 0, Fold::First)),
                schedule,
                &Missing,
                None
            ),
            Ok(ScheduleDecision::Inactive)
        );
    }

    #[test]
    fn occurrence_must_be_persisted_then_uses_only_its_remaining_time() {
        let entries = [entry(7, 1_000)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        let clock = civil(20_000, 1_100, -28_800, Fold::First);
        let decision = Scheduler::evaluate(
            Millis(5_000),
            Some(clock),
            schedule,
            &FixedOffset(-28_800),
            None,
        )
        .unwrap();
        let ScheduleDecision::PersistBeforeRun(occurrence) = decision else {
            panic!("first observation must request persistence")
        };
        let decision = Scheduler::evaluate(
            Millis(5_000),
            Some(clock),
            schedule,
            &FixedOffset(-28_800),
            Some(retained(occurrence, WindowDisposition::Eligible)),
        )
        .unwrap();
        let ScheduleDecision::Active { window, .. } = decision else {
            panic!("persisted occurrence should be active")
        };
        assert_eq!(window.ends_at, Millis(805_000));
    }

    #[test]
    fn a_longer_config_or_backward_clock_cannot_extend_a_retained_end() {
        let entries = [entry(1, 1_000)];
        let short = Schedule::new(&entries, 300).unwrap();
        let initial_clock = civil(20_000, 1_100, 0, Fold::First);
        let ScheduleDecision::PersistBeforeRun(original) = Scheduler::evaluate(
            Millis(10_000),
            Some(initial_clock),
            short,
            &FixedOffset(0),
            None,
        )
        .unwrap() else {
            panic!()
        };
        let guard = retained(original, WindowDisposition::Eligible);
        let long = Schedule::new(&entries, 3_600).unwrap();
        let earlier_clock = civil(20_000, 1_050, 0, Fold::First);
        let ScheduleDecision::Active { window, occurrence } = Scheduler::evaluate(
            Millis(20_000),
            Some(earlier_clock),
            long,
            &FixedOffset(0),
            Some(guard),
        )
        .unwrap() else {
            panic!()
        };
        assert_eq!(occurrence.ends_utc, original.ends_utc);
        assert_eq!(window.ends_at, Millis(270_000));
    }

    #[test]
    fn fallback_uses_only_the_earlier_resolution() {
        struct Fallback;
        impl LocalTimeResolver for Fallback {
            fn resolve(&self, day: LocalDay, second: u32) -> LocalResolution {
                let first = u64::from(day.0) * SECONDS_PER_DAY + u64::from(second);
                LocalResolution::Ambiguous {
                    earlier: UtcSeconds(first),
                    later: UtcSeconds(first + 3_600),
                }
            }
        }
        let entries = [entry(1, 3_600)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        let first = CivilTime::new(
            UtcSeconds(20_000 * SECONDS_PER_DAY + 3_700),
            LocalDay(20_000),
            3_700,
            UtcOffset::new(0).unwrap(),
            Fold::First,
        )
        .unwrap();
        assert!(matches!(
            Scheduler::evaluate(Millis(0), Some(first), schedule, &Fallback, None),
            Ok(ScheduleDecision::PersistBeforeRun(_))
        ));
        let second = CivilTime::new(
            UtcSeconds(20_000 * SECONDS_PER_DAY + 7_300),
            LocalDay(20_000),
            3_700,
            UtcOffset::new(-3_600).unwrap(),
            Fold::Second,
        )
        .unwrap();
        assert_eq!(
            Scheduler::evaluate(Millis(0), Some(second), schedule, &Fallback, None),
            Ok(ScheduleDecision::Inactive)
        );
    }

    #[test]
    fn midnight_overlap_and_adjacency_keep_distinct_ordered_occurrences() {
        let entries = [entry(1, 86_300), entry(2, 100), entry(3, 200)];
        let schedule = Schedule::new(&entries, 300).unwrap();
        let clock = civil(20_000, 150, 0, Fold::First);
        let ScheduleDecision::PersistBeforeRun(first) =
            Scheduler::evaluate(Millis(0), Some(clock), schedule, &FixedOffset(0), None).unwrap()
        else {
            panic!()
        };
        assert_eq!(first.starts_utc.0, 19_999 * SECONDS_PER_DAY + 86_300);
        let after_midnight = civil(20_000, 400, 0, Fold::First);
        let ScheduleDecision::PersistBeforeRun(next) = Scheduler::evaluate(
            Millis(0),
            Some(after_midnight),
            schedule,
            &FixedOffset(0),
            Some(retained(first, WindowDisposition::Eligible)),
        )
        .unwrap() else {
            panic!()
        };
        assert!(next.id > first.id);
        assert_eq!(next.starts_utc.0, 20_000 * SECONDS_PER_DAY + 200);
    }

    #[test]
    fn a_full_day_run_survives_two_midnights_across_spring_forward() {
        struct SpringForward;
        impl LocalTimeResolver for SpringForward {
            fn resolve(&self, day: LocalDay, second: u32) -> LocalResolution {
                let offset = if day.0 >= 20_001 { 3_600 } else { 0 };
                FixedOffset(offset).resolve(day, second)
            }
        }
        let entries = [entry(1, 86_340)];
        let schedule = Schedule::new(&entries, 86_400).unwrap();
        let clock = civil(20_002, 0, 3_600, Fold::First);
        let ScheduleDecision::PersistBeforeRun(occurrence) =
            Scheduler::evaluate(Millis(0), Some(clock), schedule, &SpringForward, None).unwrap()
        else {
            panic!("the run from two local dates ago still has 59 minutes left")
        };
        assert_eq!(occurrence.starts_utc.0, 20_000 * SECONDS_PER_DAY + 86_340);
        assert_eq!(occurrence.ends_utc.0 - clock.utc.0, 3_540);
    }

    #[test]
    fn maximum_local_day_has_correct_weekday_without_overflow() {
        let day = LocalDay(u32::MAX);
        let expected = (u64::from(day.0) + 3) % 7;
        assert_eq!(Weekday::for_unix_day(day) as u64, expected);
        let entries = [DailyEntry::new(1, DayMask::new(1 << expected).unwrap(), 0).unwrap()];
        assert!(matches!(
            Scheduler::evaluate(
                Millis(0),
                Some(civil(day.0, 0, 0, Fold::First)),
                Schedule::new(&entries, 900).unwrap(),
                &FixedOffset(0),
                None,
            ),
            Ok(ScheduleDecision::PersistBeforeRun(_))
        ));
    }

    #[test]
    fn replay_decision_cannot_replace_the_durable_off_watermark() {
        let entries = [entry(1, 1_000)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        let current = civil(20_000, 1_100, 0, Fold::First);
        let ScheduleDecision::PersistBeforeRun(occurrence) =
            Scheduler::evaluate(Millis(0), Some(current), schedule, &FixedOffset(0), None).unwrap()
        else {
            panic!()
        };
        let mut saved = retained(occurrence, WindowDisposition::Suppressed);
        for clock in [civil(19_999, 1_100, 0, Fold::First), current] {
            let decision = Scheduler::evaluate(
                Millis(0),
                Some(clock),
                schedule,
                &FixedOffset(0),
                Some(saved),
            )
            .unwrap();
            // Only the explicitly named persistence decision can replace the saved record.
            if let ScheduleDecision::PersistBeforeRun(next) = decision {
                saved = retained(next, WindowDisposition::Eligible);
            }
            assert_eq!(decision, ScheduleDecision::Suppressed);
            assert_eq!(saved.id, occurrence.id);
            assert_eq!(saved.disposition, WindowDisposition::Suppressed);
        }
    }

    #[test]
    fn public_civil_fields_and_out_of_range_resolutions_are_validated() {
        let entries = [entry(1, 1_000)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        let mut clock = civil(20_000, 1_100, 0, Fold::First);
        clock.day = LocalDay(0);
        assert_eq!(
            Scheduler::evaluate(Millis(0), Some(clock), schedule, &FixedOffset(0), None),
            Err(ScheduleError::InvalidCivilTime)
        );
        assert_eq!(
            Scheduler::evaluate(
                Millis(0),
                Some(civil(20_000, 1_100, 0, Fold::First)),
                schedule,
                &FixedOffset(86_401),
                None,
            ),
            Err(ScheduleError::InvalidResolution)
        );
    }

    #[test]
    fn scheduler_rejects_invalid_retained_structs_without_requiring_blob_decode() {
        let entries = [entry(1, 1_000)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        for (id, end, expected) in [
            (0, 0, crate::RetainedError::ZeroWindowId),
            (u64::MAX, 1, crate::RetainedError::InvalidWindowId),
            (1, 0, crate::RetainedError::ZeroWindowEnd),
        ] {
            let saved = RetainedWindow {
                id: WindowId(id),
                ends_utc: UtcSeconds(end),
                disposition: WindowDisposition::Eligible,
            };
            assert_eq!(
                Scheduler::evaluate(
                    Millis(0),
                    Some(civil(20_000, 1_100, 0, Fold::First)),
                    schedule,
                    &FixedOffset(0),
                    Some(saved),
                ),
                Err(ScheduleError::InvalidRetainedWindow(expected))
            );
        }
    }

    #[test]
    fn retained_suppression_and_watermark_block_reset_and_clock_replay() {
        let entries = [entry(1, 1_000)];
        let schedule = Schedule::new(&entries, 900).unwrap();
        let clock = civil(20_000, 1_100, 0, Fold::First);
        let ScheduleDecision::PersistBeforeRun(occurrence) =
            Scheduler::evaluate(Millis(0), Some(clock), schedule, &FixedOffset(0), None).unwrap()
        else {
            panic!()
        };
        let cancelled = retained(occurrence, WindowDisposition::Suppressed);
        assert!(matches!(
            Scheduler::evaluate(
                Millis(0),
                Some(clock),
                schedule,
                &FixedOffset(0),
                Some(cancelled)
            ),
            Ok(ScheduleDecision::Suppressed)
        ));

        let older_clock = civil(19_999, 1_100, 0, Fold::First);
        assert!(matches!(
            Scheduler::evaluate(
                Millis(0),
                Some(older_clock),
                schedule,
                &FixedOffset(0),
                Some(cancelled)
            ),
            Ok(ScheduleDecision::Suppressed)
        ));
    }

    #[test]
    fn malformed_inputs_and_numeric_limits_fail_closed() {
        assert_eq!(
            CivilTime::new(
                UtcSeconds(1),
                LocalDay(1),
                0,
                UtcOffset::new(0).unwrap(),
                Fold::First
            ),
            Err(ScheduleError::InvalidCivilTime)
        );
        assert!(DailyEntry::new(0, DayMask::EVERY_DAY, 0).is_none());
        assert!(DailyEntry::new(MAX_ENTRY_ID + 1, DayMask::EVERY_DAY, 0).is_none());
        assert!(DailyEntry::new(1, DayMask::EVERY_DAY, MAX_WINDOW_SECONDS).is_none());
        assert!(DayMask::new(0).is_none());
        assert!(DayMask::new(0x80).is_none());
        assert!(UtcOffset::new(-86_401).is_none());
        assert!(UtcOffset::new(86_401).is_none());

        let duplicate = [entry(1, 0), entry(1, 1)];
        assert_eq!(
            Schedule::new(&duplicate, 1),
            Err(ScheduleError::DuplicateEntryId)
        );
        let entries = [entry(1, 0); MAX_DAILY_ENTRIES + 1];
        assert_eq!(
            Schedule::new(&entries, 1),
            Err(ScheduleError::TooManyEntries)
        );
        assert_eq!(Schedule::new(&[], 0), Err(ScheduleError::InvalidDuration));
        assert_eq!(
            Schedule::new(&[], MAX_WINDOW_SECONDS + 1),
            Err(ScheduleError::InvalidDuration)
        );

        struct Invalid;
        impl LocalTimeResolver for Invalid {
            fn resolve(&self, _: LocalDay, _: u32) -> LocalResolution {
                LocalResolution::Ambiguous {
                    earlier: UtcSeconds(2),
                    later: UtcSeconds(1),
                }
            }
        }
        let entries = [entry(1, 0)];
        let schedule = Schedule::new(&entries, 1).unwrap();
        assert_eq!(
            Scheduler::evaluate(
                Millis(u64::MAX),
                Some(civil(1, 0, 0, Fold::First)),
                schedule,
                &Invalid,
                None
            ),
            Err(ScheduleError::InvalidResolution)
        );

        let clock = civil(1, 0, 0, Fold::First);
        let entries = [entry(1, 0)];
        let schedule = Schedule::new(&entries, 1).unwrap();
        let occurrence = Occurrence {
            id: occurrence_id(LocalDay(1), entries[0]),
            starts_utc: clock.utc,
            ends_utc: UtcSeconds(clock.utc.0 + 1),
        };
        assert_eq!(
            Scheduler::evaluate(
                Millis(u64::MAX),
                Some(clock),
                schedule,
                &FixedOffset(0),
                Some(retained(occurrence, WindowDisposition::Eligible))
            ),
            Err(ScheduleError::TimeOverflow)
        );
    }
}
