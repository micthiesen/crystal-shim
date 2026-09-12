//! Conservative schedule evaluation from one control-accepted UTC interval.
use crate::schedule::active_occurrence;
use crate::utc_bounds::{ClockRateBound, UtcBounds};
use crate::{
    CivilTime, LocalTimeResolver, Millis, RetainedWindow, Schedule, ScheduleDecision,
    ScheduleError, Scheduler,
};

/// Civil endpoints resolved from the same timezone policy as the schedule.
#[derive(Clone, Copy, Debug)]
pub struct ScheduleInterval {
    earliest: CivilTime,
    latest: CivilTime,
    bounds: UtcBounds,
    rate: ClockRateBound,
}

impl ScheduleInterval {
    pub fn new(
        bounds: UtcBounds,
        rate: ClockRateBound,
        earliest: CivilTime,
        latest: CivilTime,
    ) -> Result<Self, ScheduleError> {
        for civil in [earliest, latest] {
            CivilTime::new(
                civil.utc,
                civil.day,
                civil.second_of_day,
                civil.offset,
                civil.fold,
            )?;
        }
        if earliest.utc.0 != bounds.earliest_ms() / 1000
            || latest.utc.0 != bounds.latest_ms() / 1000
        {
            return Err(ScheduleError::InvalidCivilTime);
        }
        Ok(Self {
            earliest,
            latest,
            bounds,
            rate,
        })
    }
}

impl Scheduler {
    /// Require the same selected occurrence at both endpoints. Every occurrence
    /// is one continuous UTC interval; selection is ordered by its fixed start.
    /// Therefore an occurrence selected at both endpoints remains selected between
    /// them, including through a fold, overlap or local midnight.
    pub fn evaluate_interval(
        now: Millis,
        clock: Option<ScheduleInterval>,
        schedule: Schedule<'_>,
        resolver: &impl LocalTimeResolver,
        retained: Option<RetainedWindow>,
    ) -> Result<ScheduleDecision, ScheduleError> {
        if let Some(saved) = retained {
            saved
                .validate()
                .map_err(ScheduleError::InvalidRetainedWindow)?;
        }
        let Some(clock) = clock else {
            return Ok(ScheduleDecision::Inactive);
        };
        let first = active_occurrence(clock.earliest, schedule, resolver)?;
        if first.is_none() || first != active_occurrence(clock.latest, schedule, resolver)? {
            return Ok(ScheduleDecision::Inactive);
        }
        let decision = Self::evaluate(now, Some(clock.latest), schedule, resolver, retained)?;
        if let ScheduleDecision::Active {
            mut window,
            occurrence,
        } = decision
        {
            let remaining = occurrence
                .ends_utc
                .0
                .checked_mul(1000)
                .and_then(|end| end.checked_sub(clock.bounds.latest_ms()))
                .and_then(|duration| clock.rate.safe_duration_ms(duration))
                .ok_or(ScheduleError::TimeOverflow)?;
            if remaining == 0 {
                return Ok(ScheduleDecision::Inactive);
            }
            window.ends_at = Millis(
                now.0
                    .checked_add(remaining)
                    .ok_or(ScheduleError::TimeOverflow)?,
            );
            Ok(ScheduleDecision::Active { window, occurrence })
        } else {
            Ok(decision)
        }
    }
}

#[cfg(test)]
#[path = "schedule_interval_tests.rs"]
mod tests;
