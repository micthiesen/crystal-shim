//! TI TIDU736A Eq. 2 with measured endpoint normalization and commissioned validity limits.
//! Counts are signed FDC1004 differential results in units of 2^-19 pF, CAPDAC disabled.
use crate::{Fault, Level, Millis, Reading};

/// Strict differential operating bound from the FDC1004 data sheet, not a tank calibration.
pub const CONVERTER_LIMIT_COUNTS: i32 = 15 * (1 << 19);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Channel {
    Level,
    WetReference,
    DryReference,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Channels<T> {
    pub level: T,
    pub wet_reference: T,
    pub dry_reference: T,
}

impl<T: Copy> Channels<T> {
    fn get(self, channel: Channel) -> T {
        match channel {
            Channel::Level => self.level,
            Channel::WetReference => self.wet_reference,
            Channel::DryReference => self.dry_reference,
        }
    }
}

const CHANNELS: [Channel; 3] = [Channel::Level, Channel::WetReference, Channel::DryReference];
pub type RawChannels = Channels<i32>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RawFrame {
    pub channels: RawChannels,
    /// Increment only for a newly completed set; never reset during bus/device recovery.
    pub sequence: u64,
    pub started_at: Millis,
    pub completed_at: Millis,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CountsRange {
    pub min: i32,
    pub max: i32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ChannelLimits {
    /// Inclusive commissioned envelope, strictly inside the converter's operating range.
    pub envelope: CountsRange,
    pub max_slew_counts_per_second: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReferenceSign {
    Positive,
    Negative,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LevelDomain {
    pub min: Level,
    pub max: Level,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct MinimumRatioSpan {
    pub numerator: u32,
    pub denominator: u32,
}

/// Final mounted-unit measurements and accepted limits. There are deliberately no defaults.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CalibrationData {
    /// TI C_LEVEL(0): measured with the LEVEL electrode's sensing region empty/dry.
    /// It is not C_RE and need not lie in the normal operating envelope.
    pub level_empty_counts: i32,
    /// Measured lower/upper water endpoint triples. Their ratio response maps to 0/1000.
    pub low_endpoint: RawChannels,
    pub high_endpoint: RawChannels,
    pub channels: Channels<ChannelLimits>,
    pub reference_sign: ReferenceSign,
    pub minimum_reference_span_counts: u32,
    pub minimum_endpoint_ratio_span: MinimumRatioSpan,
    pub supported_level: LevelDomain,
    pub max_frame_age_ms: u64,
    pub max_frame_duration_ms: u64,
    /// Slew of the rounded calibrated response fraction, in thousandths per second.
    pub max_level_slew_per_second: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Endpoint {
    Low,
    High,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CalibrationConfigError {
    EmptyLevelOutsideConverterRange,
    InvalidEnvelope(Channel),
    ZeroSlewLimit,
    InvalidReferenceMinimum,
    InvalidMinimumRatioSpan,
    InvalidLevelDomain,
    InvalidFrameTiming,
    InvalidEndpoint {
        endpoint: Endpoint,
        error: CalibrationError,
    },
    ReversedOrCollapsedEndpoints,
    InsufficientEndpointRatioSpan,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CalibrationError {
    ClockWentBackwards {
        previous: Millis,
        received: Millis,
    },
    SequenceNotIncreasing {
        previous: u64,
        received: u64,
    },
    InvalidFrameTimes {
        started: Millis,
        completed: Millis,
    },
    FutureFrame {
        completed: Millis,
        now: Millis,
    },
    OverlappingFrame {
        previous_completed: Millis,
        started: Millis,
    },
    FrameTooLong {
        duration_ms: u64,
        maximum_ms: u64,
    },
    StaleFrame {
        age_ms: u64,
        maximum_ms: u64,
    },
    ConverterRange {
        channel: Channel,
        counts: i32,
    },
    ChannelEnvelope {
        channel: Channel,
        counts: i32,
        allowed: CountsRange,
    },
    ReferencePolarity {
        span_counts: i64,
        expected: ReferenceSign,
    },
    ReferenceCollapsed {
        span_counts: i64,
        minimum_counts: u32,
    },
    OutsideLevelDomain {
        scaled_numerator: i128,
        denominator: i128,
        allowed: LevelDomain,
    },
    ChannelSlew {
        channel: Channel,
        delta_counts: u32,
        elapsed_ms: u64,
        maximum_per_second: u32,
    },
    LevelSlew {
        delta_thousandths: u16,
        elapsed_ms: u64,
        maximum_per_second: u32,
    },
}

impl CalibrationError {
    pub const fn fault(self) -> Fault {
        match self {
            Self::ClockWentBackwards { .. } => Fault::ClockWentBackwards,
            Self::FutureFrame { .. } => Fault::FutureSample,
            Self::StaleFrame { .. } => Fault::Stale,
            Self::SequenceNotIncreasing { .. }
            | Self::InvalidFrameTimes { .. }
            | Self::OverlappingFrame { .. }
            | Self::FrameTooLong { .. } => Fault::InvalidSensorFrame,
            _ => Fault::OutOfRange,
        }
    }
}

/// Exact TI response ratio. The denominator is positive after applying the calibrated sign.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Ratio {
    pub numerator: i64,
    pub denominator: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Calibration {
    data: CalibrationData,
    low_ratio: Ratio,
    high_ratio: Ratio,
    endpoint_span_cross: i128,
}

fn inside_converter(counts: i32) -> bool {
    counts > -CONVERTER_LIMIT_COUNTS && counts < CONVERTER_LIMIT_COUNTS
}

impl Calibration {
    pub fn new(data: CalibrationData) -> Result<Self, CalibrationConfigError> {
        if !inside_converter(data.level_empty_counts) {
            return Err(CalibrationConfigError::EmptyLevelOutsideConverterRange);
        }
        for channel in CHANNELS {
            let limits = data.channels.get(channel);
            if limits.envelope.min >= limits.envelope.max
                || !inside_converter(limits.envelope.min)
                || !inside_converter(limits.envelope.max)
            {
                return Err(CalibrationConfigError::InvalidEnvelope(channel));
            }
            if limits.max_slew_counts_per_second == 0 {
                return Err(CalibrationConfigError::ZeroSlewLimit);
            }
        }
        if data.max_level_slew_per_second == 0 {
            return Err(CalibrationConfigError::ZeroSlewLimit);
        }
        if data.minimum_reference_span_counts == 0
            || data.minimum_reference_span_counts > (2 * CONVERTER_LIMIT_COUNTS - 2) as u32
        {
            return Err(CalibrationConfigError::InvalidReferenceMinimum);
        }
        if data.minimum_endpoint_ratio_span.numerator == 0
            || data.minimum_endpoint_ratio_span.denominator == 0
        {
            return Err(CalibrationConfigError::InvalidMinimumRatioSpan);
        }
        if data.supported_level.min >= data.supported_level.max {
            return Err(CalibrationConfigError::InvalidLevelDomain);
        }
        if data.max_frame_duration_ms == 0 || data.max_frame_age_ms < data.max_frame_duration_ms {
            return Err(CalibrationConfigError::InvalidFrameTiming);
        }
        let low_ratio = Self::ratio(&data, data.low_endpoint).map_err(|error| {
            CalibrationConfigError::InvalidEndpoint {
                endpoint: Endpoint::Low,
                error,
            }
        })?;
        let high_ratio = Self::ratio(&data, data.high_endpoint).map_err(|error| {
            CalibrationConfigError::InvalidEndpoint {
                endpoint: Endpoint::High,
                error,
            }
        })?;
        let span = i128::from(high_ratio.numerator) * i128::from(low_ratio.denominator)
            - i128::from(low_ratio.numerator) * i128::from(high_ratio.denominator);
        if span <= 0 {
            return Err(CalibrationConfigError::ReversedOrCollapsedEndpoints);
        }
        let minimum = data.minimum_endpoint_ratio_span;
        if span * i128::from(minimum.denominator)
            < i128::from(minimum.numerator)
                * i128::from(low_ratio.denominator)
                * i128::from(high_ratio.denominator)
        {
            return Err(CalibrationConfigError::InsufficientEndpointRatioSpan);
        }
        Ok(Self {
            data,
            low_ratio,
            high_ratio,
            endpoint_span_cross: span,
        })
    }

    pub const fn data(&self) -> &CalibrationData {
        &self.data
    }
    pub const fn endpoint_ratios(&self) -> (Ratio, Ratio) {
        (self.low_ratio, self.high_ratio)
    }

    fn ratio(data: &CalibrationData, channels: RawChannels) -> Result<Ratio, CalibrationError> {
        for channel in CHANNELS {
            let counts = channels.get(channel);
            if !inside_converter(counts) {
                return Err(CalibrationError::ConverterRange { channel, counts });
            }
            let allowed = data.channels.get(channel).envelope;
            if counts < allowed.min || counts > allowed.max {
                return Err(CalibrationError::ChannelEnvelope {
                    channel,
                    counts,
                    allowed,
                });
            }
        }
        let span = i64::from(channels.wet_reference) - i64::from(channels.dry_reference);
        if span == 0 || span.unsigned_abs() < u64::from(data.minimum_reference_span_counts) {
            return Err(CalibrationError::ReferenceCollapsed {
                span_counts: span,
                minimum_counts: data.minimum_reference_span_counts,
            });
        }
        let sign = match data.reference_sign {
            ReferenceSign::Positive => 1,
            ReferenceSign::Negative => -1,
        };
        if span * sign <= 0 {
            return Err(CalibrationError::ReferencePolarity {
                span_counts: span,
                expected: data.reference_sign,
            });
        }
        Ok(Ratio {
            numerator: (i64::from(channels.level) - i64::from(data.level_empty_counts)) * sign,
            denominator: (span * sign) as u32,
        })
    }

    fn normalize(&self, channels: RawChannels) -> Result<(Level, Ratio), CalibrationError> {
        let ratio = Self::ratio(&self.data, channels)?;
        // 1000 * (q - q_low) / (q_high - q_low), without dividing either q first.
        // Strict converter bounds keep these products below 2^83; see calibration.md.
        let numerator = (i128::from(ratio.numerator) * i128::from(self.low_ratio.denominator)
            - i128::from(self.low_ratio.numerator) * i128::from(ratio.denominator))
            * i128::from(self.high_ratio.denominator)
            * 1000;
        let denominator = i128::from(ratio.denominator) * self.endpoint_span_cross;
        let domain = self.data.supported_level;
        if numerator < i128::from(domain.min.value()) * denominator
            || numerator > i128::from(domain.max.value()) * denominator
        {
            return Err(CalibrationError::OutsideLevelDomain {
                scaled_numerator: numerator,
                denominator,
                allowed: domain,
            });
        }
        // Domain validation happens on the exact rational BEFORE rounding, never clipping.
        Ok((
            Level(((numerator + denominator / 2) / denominator) as u16),
            ratio,
        ))
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CalibrationResult {
    pub reading: Reading,
    pub frame: RawFrame,
    pub ratio: Option<Ratio>,
    pub error: Option<CalibrationError>,
}

/// Per-boot acquisition history. Keep this instance across sensor/bus recovery.
#[derive(Clone)]
pub struct CalibrationStage {
    calibration: Calibration,
    last_now: Millis,
    last_sequence: Option<u64>,
    last_completed: Option<Millis>,
    last_valid: Option<(RawFrame, Level)>,
}

impl CalibrationStage {
    pub const fn new(calibration: Calibration, now: Millis) -> Self {
        Self {
            calibration,
            last_now: now,
            last_sequence: None,
            last_completed: None,
            last_valid: None,
        }
    }

    pub const fn calibration(&self) -> &Calibration {
        &self.calibration
    }

    pub fn process(&mut self, now: Millis, frame: RawFrame) -> CalibrationResult {
        match self.validate(now, frame) {
            Ok((level, ratio)) => {
                self.last_valid = Some((frame, level));
                CalibrationResult {
                    reading: Reading::Valid {
                        level,
                        observed_at: frame.started_at,
                    },
                    frame,
                    ratio: Some(ratio),
                    error: None,
                }
            }
            Err(error) => CalibrationResult {
                reading: Reading::Invalid(error.fault()),
                frame,
                ratio: None,
                error: Some(error),
            },
        }
    }

    fn validate(
        &mut self,
        now: Millis,
        frame: RawFrame,
    ) -> Result<(Level, Ratio), CalibrationError> {
        // Consume advancing IDs even when their frame is rejected: later time must not
        // make the same rejected acquisition appear new. Replays never move this mark back.
        let previous_sequence = self.last_sequence;
        if previous_sequence.is_none_or(|previous| frame.sequence > previous) {
            self.last_sequence = Some(frame.sequence);
        }
        if now < self.last_now {
            return Err(CalibrationError::ClockWentBackwards {
                previous: self.last_now,
                received: now,
            });
        }
        self.last_now = now;
        if let Some(previous) = previous_sequence {
            if frame.sequence <= previous {
                return Err(CalibrationError::SequenceNotIncreasing {
                    previous,
                    received: frame.sequence,
                });
            }
        }
        if frame.started_at >= frame.completed_at {
            return Err(CalibrationError::InvalidFrameTimes {
                started: frame.started_at,
                completed: frame.completed_at,
            });
        }
        if frame.completed_at > now {
            return Err(CalibrationError::FutureFrame {
                completed: frame.completed_at,
                now,
            });
        }
        if let Some(previous_completed) = self.last_completed {
            if frame.started_at < previous_completed {
                return Err(CalibrationError::OverlappingFrame {
                    previous_completed,
                    started: frame.started_at,
                });
            }
        }
        self.last_completed = Some(frame.completed_at);
        let data = self.calibration.data;
        let duration_ms = frame.completed_at.0 - frame.started_at.0;
        if duration_ms > data.max_frame_duration_ms {
            return Err(CalibrationError::FrameTooLong {
                duration_ms,
                maximum_ms: data.max_frame_duration_ms,
            });
        }
        let age_ms = now.0 - frame.started_at.0;
        if age_ms > data.max_frame_age_ms {
            return Err(CalibrationError::StaleFrame {
                age_ms,
                maximum_ms: data.max_frame_age_ms,
            });
        }
        let (level, ratio) = self.calibration.normalize(frame.channels)?;
        if let Some((previous, previous_level)) = self.last_valid {
            let elapsed_ms = frame.started_at.0 - previous.started_at.0;
            for channel in CHANNELS {
                let delta_counts = frame
                    .channels
                    .get(channel)
                    .abs_diff(previous.channels.get(channel));
                let maximum_per_second = data.channels.get(channel).max_slew_counts_per_second;
                if u128::from(delta_counts) * 1000
                    > u128::from(maximum_per_second) * u128::from(elapsed_ms)
                {
                    return Err(CalibrationError::ChannelSlew {
                        channel,
                        delta_counts,
                        elapsed_ms,
                        maximum_per_second,
                    });
                }
            }
            let delta_thousandths = level.value().abs_diff(previous_level.value());
            if u128::from(delta_thousandths) * 1000
                > u128::from(data.max_level_slew_per_second) * u128::from(elapsed_ms)
            {
                return Err(CalibrationError::LevelSlew {
                    delta_thousandths,
                    elapsed_ms,
                    maximum_per_second: data.max_level_slew_per_second,
                });
            }
        }
        Ok((level, ratio))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(level: i32, wet_reference: i32, dry_reference: i32) -> RawChannels {
        Channels {
            level,
            wet_reference,
            dry_reference,
        }
    }

    fn data() -> CalibrationData {
        // Synthetic arithmetic fixtures only. None are physical calibration recommendations.
        let limits = ChannelLimits {
            envelope: CountsRange {
                min: -5000,
                max: 5000,
            },
            max_slew_counts_per_second: u32::MAX,
        };
        CalibrationData {
            level_empty_counts: 1000,
            low_endpoint: raw(1200, 700, 300),
            high_endpoint: raw(2500, 900, 300),
            channels: Channels {
                level: limits,
                wet_reference: limits,
                dry_reference: limits,
            },
            reference_sign: ReferenceSign::Positive,
            minimum_reference_span_counts: 100,
            minimum_endpoint_ratio_span: MinimumRatioSpan {
                numerator: 1,
                denominator: 10,
            },
            supported_level: LevelDomain {
                min: Level(0),
                max: Level(1000),
            },
            max_frame_age_ms: 100,
            max_frame_duration_ms: 50,
            max_level_slew_per_second: u32::MAX,
        }
    }

    fn stage(data: CalibrationData) -> CalibrationStage {
        CalibrationStage::new(Calibration::new(data).unwrap(), Millis(0))
    }

    fn frame(sequence: u64, start: u64, channels: RawChannels) -> RawFrame {
        RawFrame {
            channels,
            sequence,
            started_at: Millis(start),
            completed_at: Millis(start + 10),
        }
    }

    fn process(
        stage: &mut CalibrationStage,
        sequence: u64,
        start: u64,
        channels: RawChannels,
    ) -> CalibrationResult {
        stage.process(Millis(start + 10), frame(sequence, start, channels))
    }

    #[test]
    fn ti_ratio_uses_measured_empty_baseline_and_both_live_references() {
        let calibration = Calibration::new(data()).unwrap();
        assert_eq!(
            calibration.endpoint_ratios(),
            (
                Ratio {
                    numerator: 200,
                    denominator: 400
                },
                Ratio {
                    numerator: 1500,
                    denominator: 600
                }
            )
        );
        let mut stage = stage(data());
        for (sequence, channels, expected) in [
            (0, data().low_endpoint, 0),
            (1, raw(1750, 800, 300), 500),
            (2, data().high_endpoint, 1000),
        ] {
            let start = sequence * 100;
            let result = process(&mut stage, sequence, start, channels);
            assert_eq!(
                result.reading,
                Reading::Valid {
                    level: Level(expected),
                    observed_at: Millis(start)
                }
            );
            assert_eq!(result.error, None);
        }
    }

    #[test]
    fn commissioned_negative_reference_sign_preserves_level_orientation() {
        let mut values = data();
        values.reference_sign = ReferenceSign::Negative;
        values.level_empty_counts = -1000;
        values.low_endpoint = raw(-1200, -700, -300);
        values.high_endpoint = raw(-2500, -900, -300);
        assert_eq!(
            process(&mut stage(values), 0, 0, raw(-1750, -800, -300)).reading,
            Reading::Valid {
                level: Level(500),
                observed_at: Millis(0)
            }
        );
    }

    #[test]
    fn extrema_and_large_configuration_limits_do_not_overflow() {
        let mut values = data();
        let limit = CONVERTER_LIMIT_COUNTS - 1;
        values.level_empty_counts = -limit;
        values.low_endpoint = raw(-limit, limit, -limit);
        values.high_endpoint = raw(limit, limit, -limit);
        for target in [
            &mut values.channels.level,
            &mut values.channels.wet_reference,
            &mut values.channels.dry_reference,
        ] {
            target.envelope = CountsRange {
                min: -limit,
                max: limit,
            };
        }
        values.minimum_endpoint_ratio_span = MinimumRatioSpan {
            numerator: u32::MAX,
            denominator: u32::MAX,
        };
        let mut stage = stage(values);
        assert_eq!(
            process(&mut stage, 0, 0, values.low_endpoint).reading,
            Reading::Valid {
                level: Level(0),
                observed_at: Millis(0)
            }
        );
        assert_eq!(
            process(&mut stage, 1, 100, raw(0, limit, -limit)).reading,
            Reading::Valid {
                level: Level(500),
                observed_at: Millis(100)
            }
        );
        assert_eq!(
            process(&mut stage, 2, 200, values.high_endpoint).reading,
            Reading::Valid {
                level: Level(1000),
                observed_at: Millis(200)
            }
        );
    }

    #[test]
    fn malformed_calibration_is_rejected_before_any_frame_can_be_valid() {
        let mutations: [fn(&mut CalibrationData); 13] = [
            |d| d.level_empty_counts = i32::MIN,
            |d| d.channels.level.envelope.min = d.channels.level.envelope.max,
            |d| d.channels.dry_reference.envelope.max = CONVERTER_LIMIT_COUNTS,
            |d| d.channels.wet_reference.max_slew_counts_per_second = 0,
            |d| d.max_level_slew_per_second = 0,
            |d| d.minimum_reference_span_counts = 0,
            |d| d.minimum_reference_span_counts = u32::MAX,
            |d| d.minimum_endpoint_ratio_span.numerator = 0,
            |d| d.minimum_endpoint_ratio_span.denominator = 0,
            |d| d.supported_level.min = d.supported_level.max,
            |d| d.max_frame_duration_ms = 0,
            |d| d.max_frame_age_ms = d.max_frame_duration_ms - 1,
            |d| d.high_endpoint.level = 5001,
        ];
        for mutate in mutations {
            let mut values = data();
            mutate(&mut values);
            assert!(Calibration::new(values).is_err());
        }
        let mut values = data();
        values.high_endpoint = values.low_endpoint;
        assert_eq!(
            Calibration::new(values),
            Err(CalibrationConfigError::ReversedOrCollapsedEndpoints)
        );
        values.high_endpoint = raw(1100, 700, 300);
        assert_eq!(
            Calibration::new(values),
            Err(CalibrationConfigError::ReversedOrCollapsedEndpoints)
        );
        values = data();
        values.minimum_endpoint_ratio_span = MinimumRatioSpan {
            numerator: 3,
            denominator: 1,
        };
        assert_eq!(
            Calibration::new(values),
            Err(CalibrationConfigError::InsufficientEndpointRatioSpan)
        );
    }

    #[test]
    fn collapsed_and_reversed_references_are_faults_not_low_water() {
        for channels in [
            raw(1750, 300, 300),
            raw(1750, 350, 300),
            raw(1750, 100, 300),
        ] {
            let result = process(&mut stage(data()), 0, 0, channels);
            assert_eq!(result.reading, Reading::Invalid(Fault::OutOfRange));
            assert!(matches!(
                result.error,
                Some(
                    CalibrationError::ReferenceCollapsed { .. }
                        | CalibrationError::ReferencePolarity { .. }
                )
            ));
        }
    }

    #[test]
    fn every_channel_envelope_and_converter_limit_is_checked() {
        for channel in CHANNELS {
            for counts in [
                5001,
                i32::MIN,
                i32::MAX,
                -CONVERTER_LIMIT_COUNTS,
                CONVERTER_LIMIT_COUNTS,
            ] {
                let mut channels = raw(1750, 800, 300);
                match channel {
                    Channel::Level => channels.level = counts,
                    Channel::WetReference => channels.wet_reference = counts,
                    Channel::DryReference => channels.dry_reference = counts,
                }
                let result = process(&mut stage(data()), 0, 0, channels);
                assert_eq!(result.reading, Reading::Invalid(Fault::OutOfRange));
                let failed_channel = match result.error.unwrap() {
                    CalibrationError::ChannelEnvelope { channel, .. }
                    | CalibrationError::ConverterRange { channel, .. } => channel,
                    other => panic!("unexpected error: {other:?}"),
                };
                assert_eq!(failed_channel, channel);
            }
        }
    }

    #[test]
    fn exact_output_domain_is_checked_before_rounding() {
        let mut values = data();
        values.level_empty_counts = 0;
        values.low_endpoint = raw(100_000, 1_000_000, 0);
        values.high_endpoint = raw(1_100_000, 1_000_000, 0);
        for target in [
            &mut values.channels.level,
            &mut values.channels.wet_reference,
            &mut values.channels.dry_reference,
        ] {
            target.envelope = CountsRange {
                min: -2_000_000,
                max: 2_000_000,
            };
        }
        for level in [99_999, 1_100_001] {
            let result = process(&mut stage(values), 0, 0, raw(level, 1_000_000, 0));
            assert!(matches!(
                result.error,
                Some(CalibrationError::OutsideLevelDomain { .. })
            ));
        }
        values = data();
        values.supported_level = LevelDomain {
            min: Level(100),
            max: Level(900),
        };
        assert!(matches!(
            process(&mut stage(values), 0, 0, values.low_endpoint).error,
            Some(CalibrationError::OutsideLevelDomain { .. })
        ));
        assert_eq!(
            process(&mut stage(values), 0, 0, raw(1750, 800, 300)).error,
            None
        );
    }

    #[test]
    fn freshness_uses_frame_start_and_rejected_frames_cannot_be_replayed() {
        let channels = raw(1750, 800, 300);
        let mut stage = stage(data());
        let old = frame(5, 0, channels);
        assert_eq!(
            stage.process(Millis(101), old).error,
            Some(CalibrationError::StaleFrame {
                age_ms: 101,
                maximum_ms: 100
            })
        );
        assert_eq!(
            stage.process(Millis(102), old).error,
            Some(CalibrationError::SequenceNotIncreasing {
                previous: 5,
                received: 5
            })
        );
        assert_eq!(
            stage.process(Millis(103), frame(4, 90, channels)).error,
            Some(CalibrationError::SequenceNotIncreasing {
                previous: 5,
                received: 4
            })
        );
        assert_eq!(process(&mut stage, 6, 110, channels).error, None);
    }

    #[test]
    fn future_backwards_overlapping_and_excessive_duration_frames_fail_closed() {
        let channels = raw(1750, 800, 300);
        let mut stage = stage(data());
        assert!(matches!(
            stage.process(Millis(0), frame(0, 0, channels)).error,
            Some(CalibrationError::FutureFrame { .. })
        ));
        assert!(matches!(
            stage.process(Millis(10), frame(0, 0, channels)).error,
            Some(CalibrationError::SequenceNotIncreasing { .. })
        ));
        assert_eq!(process(&mut stage, 1, 100, channels).error, None);
        assert!(matches!(
            stage.process(Millis(120), frame(2, 90, channels)).error,
            Some(CalibrationError::OverlappingFrame { .. })
        ));
        assert!(matches!(
            stage.process(Millis(119), frame(3, 110, channels)).error,
            Some(CalibrationError::ClockWentBackwards { .. })
        ));
        assert_eq!(process(&mut stage, 4, 120, channels).error, None);
        let mut invalid = frame(5, 140, channels);
        invalid.completed_at = invalid.started_at;
        assert!(matches!(
            stage.process(Millis(150), invalid).error,
            Some(CalibrationError::InvalidFrameTimes { .. })
        ));
        invalid = frame(6, 160, channels);
        invalid.completed_at = Millis(211);
        assert!(matches!(
            stage.process(Millis(211), invalid).error,
            Some(CalibrationError::FrameTooLong { .. })
        ));
    }

    #[test]
    fn invalid_frames_do_not_erase_channel_slew_history() {
        for channel in CHANNELS {
            let mut values = data();
            let mut changed = raw(1750, 800, 300);
            match channel {
                Channel::Level => {
                    values.channels.level.max_slew_counts_per_second = 100;
                    changed.level += 50;
                }
                Channel::WetReference => {
                    values.channels.wet_reference.max_slew_counts_per_second = 100;
                    changed.wet_reference += 50;
                }
                Channel::DryReference => {
                    values.channels.dry_reference.max_slew_counts_per_second = 100;
                    changed.dry_reference += 50;
                }
            }
            let mut stage = stage(values);
            assert_eq!(process(&mut stage, 0, 0, raw(1750, 800, 300)).error, None);
            for (sequence, start) in [(1, 100), (2, 200)] {
                assert!(
                    matches!(process(&mut stage, sequence, start, changed).error, Some(CalibrationError::ChannelSlew { channel: observed, .. }) if observed == channel)
                );
            }
            assert_eq!(process(&mut stage, 3, 500, changed).error, None);
        }
    }

    #[test]
    fn normalized_level_slew_is_checked_separately_from_raw_slew() {
        let mut values = data();
        values.max_level_slew_per_second = 100;
        let mut stage = stage(values);
        process(&mut stage, 0, 0, raw(1750, 800, 300));
        assert_eq!(
            process(&mut stage, 1, 100, raw(1800, 800, 300)).error,
            Some(CalibrationError::LevelSlew {
                delta_thousandths: 50,
                elapsed_ms: 100,
                maximum_per_second: 100
            })
        );
        assert_eq!(process(&mut stage, 2, 500, raw(1800, 800, 300)).error, None);
    }

    #[test]
    fn invalid_calibration_output_resets_water_confirmation_before_a_later_valid_edge() {
        let mut stage = stage(data());
        let config = crate::Config::new(
            Level(200),
            Level(400),
            100,
            crate::Timing {
                low_confirmation_ms: 100,
                recovery_ms: 200,
                minimum_off_ms: 300,
            },
        )
        .unwrap();
        let mut water = crate::water::WaterMonitor::new(config, Millis(0));
        for start in (0..=250).step_by(50) {
            let result = process(&mut stage, start / 50, start, data().high_endpoint);
            assert_eq!(water.update(Millis(start + 10), result.reading), None);
        }
        assert_eq!(water.state, Some(crate::WaterState::High));
        for start in (300..600).step_by(50) {
            let channels = if start == 400 {
                raw(1200, 300, 300)
            } else {
                data().low_endpoint
            };
            let result = process(&mut stage, start / 50, start, channels);
            assert_eq!(water.update(Millis(start + 10), result.reading), None);
        }
        let result = process(&mut stage, 12, 600, data().low_endpoint);
        assert_eq!(
            water.update(Millis(610), result.reading),
            Some(crate::WaterTransition {
                from: crate::WaterState::High,
                to: crate::WaterState::Low
            })
        );
    }
}
