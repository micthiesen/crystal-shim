//! Bounded POSIX TZ parsing and proleptic civil-time resolution.
//!
//! This deliberately implements only fixed offsets and DST strings with two explicit
//! `Mmonth.week.weekday[/time]` rules. It does not contain an IANA timezone database.

use crate::{CivilTime, Fold, LocalDay, LocalResolution, LocalTimeResolver, UtcOffset, UtcSeconds};

const SECONDS_PER_DAY: i64 = 86_400;
const MAX_UNIX_DAY: u32 = 2_932_896; // 9999-12-31
const MAX_UTC_SECONDS: u64 = 253_402_300_799; // 9999-12-31 23:59:59 UTC

/// Maximum accepted POSIX TZ string length, excluding the string terminator.
pub const MAX_POSIX_TZ_BYTES: usize = 128;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TimeZoneError {
    Empty,
    TooLong,
    NonAscii,
    InvalidSyntax,
    /// A Julian (`J` or numeric) rule, omitted DST rules, or another rule form is unsupported.
    UnsupportedRule,
    /// Signed or greater-than-24-hour transition times are not implemented.
    UnsupportedTransitionTime,
    OffsetOutOfRange,
    /// The start and end rules collapse to the same local or UTC transition instant.
    AmbiguousRules,
    UtcOutOfRange,
    LocalOutOfRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct MonthRule {
    month: u8,
    week: u8,
    weekday: u8,
    second: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct DaylightRules {
    offset: UtcOffset,
    start: MonthRule,
    end: MonthRule,
}

/// A parsed, allocation-free proleptic POSIX timezone rule.
///
/// Names are validated but not retained. Configuration storage should preserve the original
/// string when it needs to render or encode the user's display spelling.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PosixTimeZone {
    standard_offset: UtcOffset,
    daylight: Option<DaylightRules>,
}

impl PosixTimeZone {
    pub fn parse(input: &str) -> Result<Self, TimeZoneError> {
        if input.is_empty() {
            return Err(TimeZoneError::Empty);
        }
        if input.len() > MAX_POSIX_TZ_BYTES {
            return Err(TimeZoneError::TooLong);
        }
        if !input.is_ascii() {
            return Err(TimeZoneError::NonAscii);
        }

        let mut parser = Parser::new(input.as_bytes());
        parser.name()?;
        let standard_offset = parser.offset()?;
        if parser.at_end() {
            return Ok(Self {
                standard_offset,
                daylight: None,
            });
        }

        parser.name()?;
        if parser.at_end() {
            // POSIX leaves default DST rules up to the implementation. The firmware cannot
            // safely depend on an unstored platform rule set.
            return Err(TimeZoneError::UnsupportedRule);
        }
        let daylight_offset = if parser.peek() == Some(b',') {
            UtcOffset::new(
                standard_offset
                    .seconds()
                    .checked_add(3_600)
                    .ok_or(TimeZoneError::OffsetOutOfRange)?,
            )
            .ok_or(TimeZoneError::OffsetOutOfRange)?
        } else {
            parser.offset()?
        };
        if parser.at_end() {
            // POSIX leaves default DST rules up to the implementation. The firmware cannot
            // safely depend on an unstored platform rule set.
            return Err(TimeZoneError::UnsupportedRule);
        }
        parser.byte(b',')?;
        let start = parser.month_rule()?;
        parser.byte(b',')?;
        let end = parser.month_rule()?;
        if !parser.at_end() {
            return Err(TimeZoneError::InvalidSyntax);
        }
        if rules_are_ambiguous(start, end, standard_offset, daylight_offset) {
            return Err(TimeZoneError::AmbiguousRules);
        }

        Ok(Self {
            standard_offset,
            daylight: Some(DaylightRules {
                offset: daylight_offset,
                start,
                end,
            }),
        })
    }

    pub const fn standard_offset(self) -> UtcOffset {
        self.standard_offset
    }

    pub const fn daylight_offset(self) -> Option<UtcOffset> {
        match self.daylight {
            Some(daylight) => Some(daylight.offset),
            None => None,
        }
    }

    /// Convert a supported UTC instant into its local civil representation.
    pub fn civil_at(&self, utc: UtcSeconds) -> Result<CivilTime, TimeZoneError> {
        if utc.0 > MAX_UTC_SECONDS {
            return Err(TimeZoneError::UtcOutOfRange);
        }
        let utc_seconds = i64::try_from(utc.0).map_err(|_| TimeZoneError::UtcOutOfRange)?;
        let offset = self.offset_at(utc_seconds);
        let local = utc_seconds
            .checked_add(i64::from(offset.seconds()))
            .ok_or(TimeZoneError::LocalOutOfRange)?;
        if !(0..=MAX_UTC_SECONDS as i64).contains(&local) {
            return Err(TimeZoneError::LocalOutOfRange);
        }

        let day = LocalDay((local / SECONDS_PER_DAY) as u32);
        let second_of_day = (local % SECONDS_PER_DAY) as u32;
        let fold = if self.is_second_fold_copy(utc_seconds) {
            Fold::Second
        } else {
            Fold::First
        };
        CivilTime::new(utc, day, second_of_day, offset, fold)
            .map_err(|_| TimeZoneError::LocalOutOfRange)
    }

    fn offset_at(&self, utc: i64) -> UtcOffset {
        let Some(daylight) = self.daylight else {
            return self.standard_offset;
        };
        let utc_year = civil_from_days(utc.div_euclid(SECONDS_PER_DAY)).0;
        let mut latest: Option<Transition> = None;
        for year in (utc_year - 2)..=(utc_year + 1) {
            let start = transition(year, daylight.start, self.standard_offset, daylight.offset);
            let end = transition(year, daylight.end, daylight.offset, self.standard_offset);
            for candidate in [start, end] {
                if candidate.utc <= utc && latest.is_none_or(|current| candidate.utc > current.utc)
                {
                    latest = Some(candidate);
                }
            }
        }
        latest.map_or(self.standard_offset, |event| event.after)
    }

    fn is_second_fold_copy(&self, utc: i64) -> bool {
        let Some(daylight) = self.daylight else {
            return false;
        };
        let utc_year = civil_from_days(utc.div_euclid(SECONDS_PER_DAY)).0;
        for year in (utc_year - 1)..=(utc_year + 1) {
            for event in [
                transition(year, daylight.start, self.standard_offset, daylight.offset),
                transition(year, daylight.end, daylight.offset, self.standard_offset),
            ] {
                let fold_seconds = event.before.seconds() - event.after.seconds();
                if fold_seconds > 0 && event.utc <= utc && utc < event.utc + i64::from(fold_seconds)
                {
                    return true;
                }
            }
        }
        false
    }

    fn candidate(&self, local: i64, offset: UtcOffset) -> Option<UtcSeconds> {
        let utc = local.checked_sub(i64::from(offset.seconds()))?;
        if !(0..=MAX_UTC_SECONDS as i64).contains(&utc) || self.offset_at(utc) != offset {
            return None;
        }
        Some(UtcSeconds(utc as u64))
    }
}

impl LocalTimeResolver for PosixTimeZone {
    fn resolve(&self, day: LocalDay, second_of_day: u32) -> LocalResolution {
        if day.0 > MAX_UNIX_DAY || second_of_day >= SECONDS_PER_DAY as u32 {
            return LocalResolution::Missing;
        }
        let local = i64::from(day.0) * SECONDS_PER_DAY + i64::from(second_of_day);
        let standard = self.candidate(local, self.standard_offset);
        let daylight = self
            .daylight
            .and_then(|rules| self.candidate(local, rules.offset));

        match (standard, daylight) {
            (None, None) => LocalResolution::Missing,
            (Some(utc), None) | (None, Some(utc)) => LocalResolution::Unique(utc),
            (Some(first), Some(second)) if first == second => LocalResolution::Unique(first),
            (Some(first), Some(second)) if first < second => LocalResolution::Ambiguous {
                earlier: first,
                later: second,
            },
            (Some(first), Some(second)) => LocalResolution::Ambiguous {
                earlier: second,
                later: first,
            },
        }
    }
}

#[derive(Clone, Copy)]
struct Transition {
    utc: i64,
    before: UtcOffset,
    after: UtcOffset,
}

fn transition(year: i32, rule: MonthRule, before: UtcOffset, after: UtcOffset) -> Transition {
    let local = rule_local_seconds(year, rule);
    Transition {
        utc: local - i64::from(before.seconds()),
        before,
        after,
    }
}

fn rule_local_seconds(year: i32, rule: MonthRule) -> i64 {
    let first = days_from_civil(year, rule.month, 1);
    let first_weekday = (first + 4).rem_euclid(7) as u8; // 1970-01-01 was Thursday.
    let mut day =
        1 + u32::from((rule.weekday + 7 - first_weekday) % 7) + 7 * (u32::from(rule.week) - 1);
    let month_days = u32::from(days_in_month(year, rule.month));
    if day > month_days {
        day -= 7;
    }
    days_from_civil(year, rule.month, day as u8) * SECONDS_PER_DAY + i64::from(rule.second)
}

fn rules_are_ambiguous(
    start: MonthRule,
    end: MonthRule,
    standard: UtcOffset,
    daylight: UtcOffset,
) -> bool {
    // Gregorian M rules repeat every 400 years. Reject any rule pair that collapses to one
    // local or UTC transition in that cycle instead of picking an arbitrary event order.
    for year in 2_000..2_400 {
        let start_local = rule_local_seconds(year, start);
        for end_year in (year - 1)..=(year + 1) {
            let end_local = rule_local_seconds(end_year, end);
            if start_local == end_local
                || start_local - i64::from(standard.seconds())
                    == end_local - i64::from(daylight.seconds())
            {
                return true;
            }
        }
    }
    false
}

struct Parser<'a> {
    input: &'a [u8],
    position: usize,
}

impl<'a> Parser<'a> {
    const fn new(input: &'a [u8]) -> Self {
        Self { input, position: 0 }
    }

    fn at_end(&self) -> bool {
        self.position == self.input.len()
    }

    fn peek(&self) -> Option<u8> {
        self.input.get(self.position).copied()
    }

    fn byte(&mut self, expected: u8) -> Result<(), TimeZoneError> {
        if self.peek() != Some(expected) {
            return Err(TimeZoneError::InvalidSyntax);
        }
        self.position += 1;
        Ok(())
    }

    fn name(&mut self) -> Result<(), TimeZoneError> {
        let start = self.position;
        if self.peek() == Some(b'<') {
            self.position += 1;
            let body = self.position;
            while self
                .peek()
                .is_some_and(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-'))
            {
                self.position += 1;
            }
            let length = self.position - body;
            if length < 3 || self.peek() != Some(b'>') {
                return Err(TimeZoneError::InvalidSyntax);
            }
            self.position += 1;
        } else {
            while self.peek().is_some_and(|byte| byte.is_ascii_alphabetic()) {
                self.position += 1;
            }
            if self.position - start < 3 {
                return Err(TimeZoneError::InvalidSyntax);
            }
        }
        Ok(())
    }

    /// Parse the POSIX value added to local time to get UTC, returning the inverse UTC offset.
    fn offset(&mut self) -> Result<UtcOffset, TimeZoneError> {
        let sign = match self.peek() {
            Some(b'-') => {
                self.position += 1;
                -1i64
            }
            Some(b'+') => {
                self.position += 1;
                1i64
            }
            _ => 1i64,
        };
        let hours = self.number()?;
        if hours > 24 {
            return Err(TimeZoneError::OffsetOutOfRange);
        }
        let mut minutes = 0;
        let mut seconds = 0;
        if self.peek() == Some(b':') {
            self.position += 1;
            minutes = self.component()?;
            if self.peek() == Some(b':') {
                self.position += 1;
                seconds = self.component()?;
            }
        }
        if hours == 24 && (minutes != 0 || seconds != 0) {
            return Err(TimeZoneError::OffsetOutOfRange);
        }
        let posix =
            sign * (i64::from(hours) * 3_600 + i64::from(minutes) * 60 + i64::from(seconds));
        let local_offset = i32::try_from(-posix).map_err(|_| TimeZoneError::OffsetOutOfRange)?;
        UtcOffset::new(local_offset).ok_or(TimeZoneError::OffsetOutOfRange)
    }

    fn month_rule(&mut self) -> Result<MonthRule, TimeZoneError> {
        match self.peek() {
            Some(b'M') => self.position += 1,
            Some(b'J' | b'0'..=b'9') => return Err(TimeZoneError::UnsupportedRule),
            _ => return Err(TimeZoneError::InvalidSyntax),
        }
        let month = self.number()?;
        self.byte(b'.')?;
        let week = self.number()?;
        self.byte(b'.')?;
        let weekday = self.number()?;
        if !(1..=12).contains(&month) || !(1..=5).contains(&week) || weekday > 6 {
            return Err(TimeZoneError::InvalidSyntax);
        }
        let second = if self.peek() == Some(b'/') {
            self.position += 1;
            self.transition_time()?
        } else {
            7_200
        };
        Ok(MonthRule {
            month: month as u8,
            week: week as u8,
            weekday: weekday as u8,
            second,
        })
    }

    fn transition_time(&mut self) -> Result<u32, TimeZoneError> {
        if matches!(self.peek(), Some(b'+' | b'-')) {
            return Err(TimeZoneError::UnsupportedTransitionTime);
        }
        let hours = self.number()?;
        if hours > 24 {
            return Err(TimeZoneError::UnsupportedTransitionTime);
        }
        let mut minutes = 0;
        let mut seconds = 0;
        if self.peek() == Some(b':') {
            self.position += 1;
            minutes = self.component()?;
            if self.peek() == Some(b':') {
                self.position += 1;
                seconds = self.component()?;
            }
        }
        if hours == 24 && (minutes != 0 || seconds != 0) {
            return Err(TimeZoneError::UnsupportedTransitionTime);
        }
        Ok(hours * 3_600 + minutes * 60 + seconds)
    }

    fn component(&mut self) -> Result<u32, TimeZoneError> {
        let value = self.number()?;
        if value > 59 {
            return Err(TimeZoneError::InvalidSyntax);
        }
        Ok(value)
    }

    fn number(&mut self) -> Result<u32, TimeZoneError> {
        let start = self.position;
        let mut value = 0u32;
        while let Some(byte @ b'0'..=b'9') = self.peek() {
            value = value
                .checked_mul(10)
                .and_then(|current| current.checked_add(u32::from(byte - b'0')))
                .ok_or(TimeZoneError::InvalidSyntax)?;
            self.position += 1;
        }
        if self.position == start {
            return Err(TimeZoneError::InvalidSyntax);
        }
        Ok(value)
    }
}

const fn is_leap_year(year: i32) -> bool {
    year % 4 == 0 && (year % 100 != 0 || year % 400 == 0)
}

const fn days_in_month(year: i32, month: u8) -> u8 {
    match month {
        2 if is_leap_year(year) => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    }
}

// Howard Hinnant's civil calendar algorithms, shifted to the Unix epoch.
fn days_from_civil(year: i32, month: u8, day: u8) -> i64 {
    let adjusted_year = year - i32::from(month <= 2);
    let era = adjusted_year.div_euclid(400);
    let year_of_era = adjusted_year - era * 400;
    let shifted_month = i32::from(month) + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * shifted_month + 2) / 5 + i32::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    i64::from(era * 146_097 + day_of_era - 719_468)
}

fn civil_from_days(days: i64) -> (i32, u8, u8) {
    let shifted = days + 719_468;
    let era = shifted.div_euclid(146_097);
    let day_of_era = shifted - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year as i32, month as u8, day as u8)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn utc(year: i32, month: u8, day: u8, hour: u32, minute: u32) -> UtcSeconds {
        UtcSeconds(
            (days_from_civil(year, month, day) * SECONDS_PER_DAY
                + i64::from(hour * 3_600 + minute * 60)) as u64,
        )
    }

    fn local(year: i32, month: u8, day: u8, hour: u32, minute: u32) -> (LocalDay, u32) {
        (
            LocalDay(days_from_civil(year, month, day) as u32),
            hour * 3_600 + minute * 60,
        )
    }

    #[test]
    fn vancouver_2026_gap_and_fold_are_exact() {
        let zone = PosixTimeZone::parse("PST8PDT,M3.2.0,M11.1.0").unwrap();

        let (gap_day, gap_time) = local(2026, 3, 8, 2, 30);
        assert_eq!(zone.resolve(gap_day, gap_time), LocalResolution::Missing);
        let before = zone.civil_at(utc(2026, 3, 8, 9, 59)).unwrap();
        assert_eq!(
            (before.second_of_day, before.offset.seconds()),
            (7_140, -28_800)
        );
        let after = zone.civil_at(utc(2026, 3, 8, 10, 0)).unwrap();
        assert_eq!(
            (after.second_of_day, after.offset.seconds()),
            (10_800, -25_200)
        );

        let (fold_day, fold_time) = local(2026, 11, 1, 1, 30);
        assert_eq!(
            zone.resolve(fold_day, fold_time),
            LocalResolution::Ambiguous {
                earlier: utc(2026, 11, 1, 8, 30),
                later: utc(2026, 11, 1, 9, 30),
            }
        );
        assert_eq!(
            zone.civil_at(utc(2026, 11, 1, 8, 30)).unwrap().fold,
            Fold::First
        );
        assert_eq!(
            zone.civil_at(utc(2026, 11, 1, 9, 30)).unwrap().fold,
            Fold::Second
        );
    }

    #[test]
    fn southern_hemisphere_spans_new_year() {
        let zone = PosixTimeZone::parse("AEST-10AEDT-11,M10.1.0,M4.1.0/3").unwrap();
        assert_eq!(
            zone.civil_at(utc(2026, 1, 15, 0, 0))
                .unwrap()
                .offset
                .seconds(),
            39_600
        );
        assert_eq!(
            zone.civil_at(utc(2026, 7, 15, 0, 0))
                .unwrap()
                .offset
                .seconds(),
            36_000
        );
    }

    #[test]
    fn fixed_fractional_offset_round_trips() {
        let zone = PosixTimeZone::parse("NPT-5:45").unwrap();
        let civil = zone.civil_at(utc(2026, 9, 11, 0, 0)).unwrap();
        assert_eq!(
            (civil.second_of_day, civil.offset.seconds()),
            (20_700, 20_700)
        );
        assert_eq!(
            zone.resolve(civil.day, civil.second_of_day),
            LocalResolution::Unique(civil.utc)
        );
    }

    #[test]
    fn non_hour_daylight_shift_has_thirty_minute_gap_and_fold() {
        let zone = PosixTimeZone::parse("LHST-10:30LHDT-11,M10.1.0/2,M4.1.0/2").unwrap();
        let (gap_day, gap_time) = local(2026, 10, 4, 2, 15);
        assert_eq!(zone.resolve(gap_day, gap_time), LocalResolution::Missing);
        let (fold_day, fold_time) = local(2026, 4, 5, 1, 45);
        assert!(matches!(
            zone.resolve(fold_day, fold_time),
            LocalResolution::Ambiguous { .. }
        ));
    }

    #[test]
    fn negative_daylight_shift_reverses_the_gap_and_fold_seasons() {
        // This is the POSIX form for Irish winter time: standard UTC+1, DST UTC+0.
        let zone = PosixTimeZone::parse("IST-1GMT0,M10.5.0,M3.5.0/1").unwrap();
        assert_eq!(
            zone.civil_at(utc(2026, 1, 15, 0, 0))
                .unwrap()
                .offset
                .seconds(),
            0
        );
        assert_eq!(
            zone.civil_at(utc(2026, 7, 15, 0, 0))
                .unwrap()
                .offset
                .seconds(),
            3_600
        );
        let (gap_day, gap_time) = local(2026, 3, 29, 1, 30);
        assert_eq!(zone.resolve(gap_day, gap_time), LocalResolution::Missing);
        let (fold_day, fold_time) = local(2026, 10, 25, 1, 30);
        assert_eq!(
            zone.resolve(fold_day, fold_time),
            LocalResolution::Ambiguous {
                earlier: utc(2026, 10, 25, 0, 30),
                later: utc(2026, 10, 25, 1, 30),
            }
        );
    }

    #[test]
    fn malformed_and_implementation_dependent_rules_are_rejected() {
        assert_eq!(PosixTimeZone::parse(""), Err(TimeZoneError::Empty));
        assert_eq!(
            PosixTimeZone::parse("PST8PDT"),
            Err(TimeZoneError::UnsupportedRule)
        );
        assert_eq!(
            PosixTimeZone::parse("PST8PDT,J60/2,J300/2"),
            Err(TimeZoneError::UnsupportedRule)
        );
        assert_eq!(
            PosixTimeZone::parse("PST8PDT,M3.2.0/-1,M11.1.0"),
            Err(TimeZoneError::UnsupportedTransitionTime)
        );
        assert_eq!(
            PosixTimeZone::parse("PST8PDT,M3.2.0/25,M11.1.0"),
            Err(TimeZoneError::UnsupportedTransitionTime)
        );
        assert_eq!(
            PosixTimeZone::parse("PST8PDT,M3.2.0,M3.2.0"),
            Err(TimeZoneError::AmbiguousRules)
        );
        assert_eq!(
            PosixTimeZone::parse("STD0DST,M3.1.0/24,M3.1.1/0"),
            Err(TimeZoneError::AmbiguousRules)
        );
        assert_eq!(
            PosixTimeZone::parse("A8"),
            Err(TimeZoneError::InvalidSyntax)
        );
        assert_eq!(
            PosixTimeZone::parse("PST25"),
            Err(TimeZoneError::OffsetOutOfRange)
        );
        assert_eq!(PosixTimeZone::parse("PÉT8"), Err(TimeZoneError::NonAscii));
        let oversized = "A".repeat(MAX_POSIX_TZ_BYTES + 1);
        assert_eq!(
            PosixTimeZone::parse(&oversized),
            Err(TimeZoneError::TooLong)
        );
    }

    #[test]
    fn utc_and_local_calendar_boundaries_fail_without_wrapping() {
        let west = PosixTimeZone::parse("PST8").unwrap();
        assert_eq!(
            west.civil_at(UtcSeconds(0)),
            Err(TimeZoneError::LocalOutOfRange)
        );
        assert_eq!(
            west.resolve(LocalDay(0), 0),
            LocalResolution::Unique(UtcSeconds(28_800))
        );

        let east = PosixTimeZone::parse("NPT-5:45").unwrap();
        assert_eq!(
            east.civil_at(UtcSeconds(MAX_UTC_SECONDS)),
            Err(TimeZoneError::LocalOutOfRange)
        );
        assert_eq!(east.resolve(LocalDay(0), 0), LocalResolution::Missing);
        assert_eq!(
            east.civil_at(UtcSeconds(MAX_UTC_SECONDS + 1)),
            Err(TimeZoneError::UtcOutOfRange)
        );
        assert_eq!(
            east.resolve(LocalDay(MAX_UNIX_DAY + 1), 0),
            LocalResolution::Missing
        );
        assert_eq!(east.resolve(LocalDay(1), 86_400), LocalResolution::Missing);

        let vancouver = PosixTimeZone::parse("PST8PDT,M3.2.0,M11.1.0").unwrap();
        let first_local = vancouver.civil_at(utc(1970, 1, 1, 8, 0)).unwrap();
        assert_eq!(
            (first_local.day, first_local.second_of_day),
            (LocalDay(0), 0)
        );
        let last_year = vancouver.civil_at(utc(9999, 7, 1, 0, 0)).unwrap();
        assert_eq!(last_year.offset.seconds(), -25_200);
    }

    #[test]
    fn quoted_names_and_24_hour_transition_are_supported() {
        let fixed = PosixTimeZone::parse("<+0545>-5:45").unwrap();
        assert_eq!(fixed.standard_offset().seconds(), 20_700);
        assert!(PosixTimeZone::parse("STD0DST,M3.1.0/24,M10.1.0/24").is_ok());
    }
}
