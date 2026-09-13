//! Host bootstrap profile; the production core remains the sole CSCF codec.
use super::{crypto, files};
use crystal_shim_core::{
    configuration::{RawDeviceConfig, ValidatedDeviceConfig, CONFIGURATION_BLOB_MAX_LEN},
    Timing,
};
use files::{Bytes, Directory, Result};
use std::{collections::BTreeMap, io::Write, path::Path};

struct Parameters<'a> {
    stop: u16,
    restart: u16,
    sample_age: u64,
    timezone: &'a str,
    duration: u32,
    timing: Timing,
}
impl<'a> Parameters<'a> {
    fn parse(bytes: &'a [u8]) -> Result<Self> {
        let text = std::str::from_utf8(bytes).map_err(|_| "parameters must be UTF-8")?;
        let mut fields = BTreeMap::new();
        let allowed = [
            "stop_level",
            "restart_level",
            "max_sample_age_ms",
            "timezone_rule",
            "run_duration_seconds",
            "low_confirmation_ms",
            "recovery_ms",
            "minimum_off_ms",
        ];
        for line in text.lines() {
            let (key, value) = line
                .split_once('=')
                .ok_or("parameters require key=value lines")?;
            if !allowed.contains(&key)
                || value.is_empty()
                || value.chars().any(|c| c.is_control() || c.is_whitespace())
                || fields.insert(key, value).is_some()
            {
                return Err("parameters have an unknown, duplicate, empty or invalid field");
            }
        }
        let required = |key| {
            fields
                .get(key)
                .copied()
                .ok_or("missing required configuration parameter")
        };
        Ok(Self {
            stop: decimal(required("stop_level")?)?,
            restart: decimal(required("restart_level")?)?,
            sample_age: decimal(required("max_sample_age_ms")?)?,
            timezone: required("timezone_rule")?,
            duration: optional(&fields, "run_duration_seconds", 900)?,
            timing: Timing {
                low_confirmation_ms: optional(
                    &fields,
                    "low_confirmation_ms",
                    Timing::PROVISIONAL.low_confirmation_ms,
                )?,
                recovery_ms: optional(&fields, "recovery_ms", Timing::PROVISIONAL.recovery_ms)?,
                minimum_off_ms: optional(
                    &fields,
                    "minimum_off_ms",
                    Timing::PROVISIONAL.minimum_off_ms,
                )?,
            },
        })
    }
    fn build(&self, token: [u8; 32]) -> Result<ValidatedDeviceConfig> {
        let raw = RawDeviceConfig::builder(
            1,
            self.stop,
            self.restart,
            self.sample_age,
            self.timing,
            self.duration,
            token,
        )
        .timezone_rule(self.timezone)
        .map_err(|_| "invalid configuration timezone")?
        .build();
        ValidatedDeviceConfig::from_raw(raw)
            .map_err(|_| "configuration rejected by production validation")
    }
}
fn decimal<T: std::str::FromStr>(text: &str) -> Result<T> {
    if text.is_empty() || !text.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("configuration numbers require unsigned decimal integers");
    }
    text.parse()
        .map_err(|_| "configuration number is out of range")
}
fn optional<T: std::str::FromStr>(
    fields: &BTreeMap<&str, &str>,
    key: &str,
    default: T,
) -> Result<T> {
    fields.get(key).map_or(Ok(default), |text| decimal(text))
}

pub fn validate(bytes: &[u8]) -> Result<ValidatedDeviceConfig> {
    let config = ValidatedDeviceConfig::decode(bytes)
        .map_err(|_| "configuration rejected by production decoder")?;
    if config.revision() != 1
        || config.calibration().is_some()
        || config.pushover().is_some()
        || !config.schedule().entries().is_empty()
    {
        return Err(
            "first configuration requires revision 1 without calibration, schedules or Pushover credentials",
        );
    }
    Ok(config)
}
pub fn load(path: &Path) -> Result<Bytes> {
    let bytes = files::read(path, true, CONFIGURATION_BLOB_MAX_LEN)?;
    validate(&bytes.0)?;
    Ok(bytes)
}
pub fn create(parameters: &Path, output: &Path) -> Result<()> {
    let input = files::read(parameters, false, 2048)?;
    let parameters = Parameters::parse(&input.0)?;
    let random = crypto::random(32)?;
    let token = random
        .0
        .as_slice()
        .try_into()
        .map_err(|_| "settings token length")?;
    let config = parameters.build(token)?; // Includes rejecting the all-zero sentinel.
    let encoded = config
        .encode()
        .map_err(|_| "configuration encoding failed")?;
    validate(encoded.as_bytes())?;
    let mut token_text = Bytes(Vec::with_capacity(65));
    for byte in config.settings_auth_token().as_bytes() {
        write!(token_text.0, "{byte:02x}").unwrap();
    }
    token_text.0.push(b'\n');
    let directory = Directory::create(output)?;
    directory.write("settings-token.txt", &token_text.0)?;
    directory.write("parameters.txt", format!(
        "stop_level={}\nrestart_level={}\nmax_sample_age_ms={}\ntimezone_rule={}\nrun_duration_seconds={}\nlow_confirmation_ms={}\nrecovery_ms={}\nminimum_off_ms={}\n",
        parameters.stop, parameters.restart, parameters.sample_age, parameters.timezone, parameters.duration,
        parameters.timing.low_confirmation_ms, parameters.timing.recovery_ms, parameters.timing.minimum_off_ms,
    ).as_bytes())?;
    directory.write("validation.txt", b"format=CSCF\nformat_version=1\nrevision=1\ncalibration=absent\nschedule_entries=0\npushover=absent\nphysical_validation=not_performed\n")?;
    directory.publish_record(encoded.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    const INPUT: &[u8] =
        b"stop_level=200\nrestart_level=800\nmax_sample_age_ms=500\ntimezone_rule=UTC0\n";
    #[test]
    fn defaults_and_precise_overrides_use_production_validation() {
        let config = Parameters::parse(INPUT).unwrap().build([0x5a; 32]).unwrap();
        assert_eq!(config.timing(), Timing::PROVISIONAL);
        assert_eq!(config.schedule().run_duration_seconds(), 900);
        assert_eq!(config.thresholds(), (200, 800));
        assert_eq!(config.max_sample_age_ms(), 500);
        let encoded = config.encode().unwrap();
        assert_eq!(encoded.len(), 96);
        assert_eq!(
            validate(encoded.as_bytes())
                .unwrap()
                .encode()
                .unwrap()
                .as_bytes(),
            encoded.as_bytes()
        );
        let extended = [INPUT, b"run_duration_seconds=1\nlow_confirmation_ms=18446744073709551615\nrecovery_ms=9007199254740993\nminimum_off_ms=7\n"].concat();
        let config = Parameters::parse(&extended)
            .unwrap()
            .build([0x5a; 32])
            .unwrap();
        assert_eq!(config.timing().low_confirmation_ms, u64::MAX);
        assert_eq!(config.timing().recovery_ms, 9_007_199_254_740_993);
        assert_eq!(config.timing().minimum_off_ms, 7);
        assert_eq!(config.schedule().run_duration_seconds(), 1);
    }
    #[test]
    fn invalid_inputs_never_produce_a_configuration() {
        for (before, after) in [
            ("stop_level=200", "stop_level=800"),
            ("stop_level=200", "stop_level=1001"),
            ("stop_level=200", "stop_level=65536"),
            ("stop_level=200", "stop_level=+200"),
            ("stop_level=200", "stop_level= 200"),
            ("restart_level=800\n", ""),
            ("max_sample_age_ms=500", "max_sample_age_ms=0"),
            (
                "max_sample_age_ms=500",
                "max_sample_age_ms=18446744073709551616",
            ),
            ("timezone_rule=UTC0", "timezone_rule=garbage"),
        ] {
            let text = std::str::from_utf8(INPUT).unwrap().replace(before, after);
            assert!(Parameters::parse(text.as_bytes())
                .and_then(|p| p.build([0x5a; 32]))
                .is_err());
        }
        for extra in [
            "stop_level=201\n",
            "token=secret\n",
            "calibration=made-up\n",
            "revision=2\n",
            "run_duration_seconds=0\n",
            "run_duration_seconds=86401\n",
            "low_confirmation_ms=0\n",
            "recovery_ms=0\n",
            "minimum_off_ms=0\n",
            "\n",
        ] {
            assert!(Parameters::parse(&[INPUT, extra.as_bytes()].concat())
                .and_then(|p| p.build([0x5a; 32]))
                .is_err());
        }
        assert!(Parameters::parse(INPUT).unwrap().build([0; 32]).is_err());
        assert!(Parameters::parse(b"\xff").is_err());
    }

    #[test]
    fn valid_calibration_and_credentials_are_outside_the_bootstrap_profile() {
        use crystal_shim_core::{
            calibration::{
                CalibrationData, ChannelLimits, Channels, CountsRange, LevelDomain,
                MinimumRatioSpan, ReferenceSign,
            },
            configuration::PushoverCredentials,
            Level,
        };
        // Existing core's synthetic arithmetic fixture, never measured tank data.
        let limits = ChannelLimits {
            envelope: CountsRange {
                min: -5000,
                max: 5000,
            },
            max_slew_counts_per_second: 70_000,
        };
        let calibration = CalibrationData {
            level_empty_counts: 1000,
            wet_reference_empty_counts: 300,
            low_endpoint: Channels {
                level: 1200,
                wet_reference: 700,
            },
            high_endpoint: Channels {
                level: 2500,
                wet_reference: 900,
            },
            channels: Channels {
                level: limits,
                wet_reference: limits,
            },
            reference_sign: ReferenceSign::Positive,
            minimum_reference_span_counts: 100,
            minimum_endpoint_ratio_span: MinimumRatioSpan {
                numerator: 1,
                denominator: 10,
            },
            supported_level: LevelDomain {
                min: Level::new(100).unwrap(),
                max: Level::new(900).unwrap(),
            },
            max_frame_age_ms: 500,
            max_frame_duration_ms: 100,
            max_level_slew_per_second: 8000,
        };
        for calibrated in [true, false] {
            let raw =
                RawDeviceConfig::builder(1, 200, 800, 500, Timing::PROVISIONAL, 900, [0x5a; 32])
                    .timezone_rule("UTC0")
                    .unwrap()
                    .calibration(calibrated.then_some(calibration))
                    .pushover((!calibrated).then(|| {
                        PushoverCredentials::new(&"A".repeat(30), &"B".repeat(30), None).unwrap()
                    }))
                    .build();
            let config = ValidatedDeviceConfig::from_raw(raw).unwrap();
            assert!(validate(config.encode().unwrap().as_bytes()).is_err());
        }
    }
}
