//! Integer UTC intervals and an explicitly supplied monotonic clock error bound.
//! No oscillator accuracy is assumed here. A caller must justify both bounds.

use crate::utc::MAX_UNIX_MS;

const SCALE: u128 = 1_000_000;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UtcBounds {
    earliest_ms: u64,
    latest_ms: u64,
}

impl UtcBounds {
    pub const fn new(earliest_ms: u64, latest_ms: u64) -> Option<Self> {
        if earliest_ms > latest_ms || latest_ms > MAX_UNIX_MS {
            None
        } else {
            Some(Self {
                earliest_ms,
                latest_ms,
            })
        }
    }

    pub const fn earliest_ms(self) -> u64 {
        self.earliest_ms
    }
    pub const fn latest_ms(self) -> u64 {
        self.latest_ms
    }

    pub const fn point(self) -> Option<u64> {
        if self.earliest_ms == self.latest_ms {
            Some(self.earliest_ms)
        } else {
            None
        }
    }

    /// Outward seconds for certificate validity comparisons, never a scalar clock.
    pub fn outward_seconds(self) -> (u64, u64) {
        (self.earliest_ms / 1000, self.latest_ms.div_ceil(1000))
    }

    pub fn project(self, measured_age_ms: u64, rate: ClockRateBound) -> Option<Self> {
        let (earliest_age, latest_age) = rate.elapsed_bounds(measured_age_ms)?;
        Self::new(
            self.earliest_ms.checked_add(earliest_age)?,
            self.latest_ms.checked_add(latest_age)?,
        )
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ClockRateBound {
    ppm: u32,
    quantization_ms: u32,
}

impl ClockRateBound {
    /// Existing point-clock contract and deterministic tests, not hardware accuracy.
    pub const EXACT: Self = Self {
        ppm: 0,
        quantization_ms: 0,
    };

    /// `ppm` bounds relative measured-rate error. `quantization_ms` bounds the
    /// error of a DIFFERENCE of two timer readings, in measured milliseconds.
    pub const fn new(ppm: u32, quantization_ms: u32) -> Option<Self> {
        if ppm >= SCALE as u32 {
            None
        } else {
            Some(Self {
                ppm,
                quantization_ms,
            })
        }
    }

    pub const fn ppm(self) -> u32 {
        self.ppm
    }
    pub const fn quantization_ms(self) -> u32 {
        self.quantization_ms
    }

    pub fn elapsed_bounds(self, measured_ms: u64) -> Option<(u64, u64)> {
        let low = u128::from(measured_ms.saturating_sub(u64::from(self.quantization_ms)));
        let high = u128::from(measured_ms) + u128::from(self.quantization_ms);
        Some((
            u64::try_from(low * SCALE / (SCALE + u128::from(self.ppm))).ok()?,
            u64::try_from((high * SCALE).div_ceil(SCALE - u128::from(self.ppm))).ok()?,
        ))
    }

    /// Largest timer delta whose upper real elapsed bound fits the remaining UTC
    /// budget. An already established relay deadline may only be shortened.
    pub fn safe_duration_ms(self, remaining_real_ms: u64) -> Option<u64> {
        let measured = u128::from(remaining_real_ms) * (SCALE - u128::from(self.ppm)) / SCALE;
        Some(
            u64::try_from(measured)
                .ok()?
                .saturating_sub(u64::from(self.quantization_ms)),
        )
    }
}

#[cfg(test)]
#[path = "utc_bounds_tests.rs"]
mod tests;
