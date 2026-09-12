//! Validated, bounded device configuration and its canonical persistent representation.
//!
//! This module owns format validation, not storage. The application must atomically commit a
//! newly incremented configuration revision with the matching retained safety record before it
//! publishes the replacement configuration.

use core::{fmt, str};

use crate::calibration::{
    Calibration, CalibrationConfigError, CalibrationData, ChannelLimits, Channels, CountsRange,
    LevelDomain, MinimumRatioSpan, RawChannels, ReferenceSign,
};
use crate::timezone::{PosixTimeZone, TimeZoneError, MAX_POSIX_TZ_BYTES};
use crate::{
    Config, ConfigError, DailyEntry, DayMask, Level, Schedule, ScheduleError, SupervisorConfig,
    Timing, MAX_DAILY_ENTRIES, MAX_WINDOW_SECONDS,
};

pub const CONFIGURATION_MAGIC: [u8; 4] = *b"CSCF";
pub const CONFIGURATION_FORMAT_VERSION: u8 = 1;
pub const CONFIGURATION_BLOB_MAX_LEN: usize = 2048;
pub const SETTINGS_AUTH_TOKEN_LEN: usize = 32;
pub const PUSHOVER_KEY_LEN: usize = 30;
pub const PUSHOVER_DEVICE_MAX_LEN: usize = 25;

const HEADER_LEN: usize = 16;
const CHECKSUM_LEN: usize = 4;
const FLAG_CALIBRATION: u8 = 1 << 0;
const FLAG_PUSHOVER: u8 = 1 << 1;
const KNOWN_FLAGS: u8 = FLAG_CALIBRATION | FLAG_PUSHOVER;

#[derive(Clone, Copy, Eq, PartialEq)]
pub struct SettingsAuthToken([u8; SETTINGS_AUTH_TOKEN_LEN]);

impl SettingsAuthToken {
    pub const fn new(bytes: [u8; SETTINGS_AUTH_TOKEN_LEN]) -> Result<Self, ConfigurationError> {
        let mut index = 0;
        while index < bytes.len() {
            if bytes[index] != 0 {
                return Ok(Self(bytes));
            }
            index += 1;
        }
        Err(ConfigurationError::ZeroSettingsAuthToken)
    }

    pub const fn as_bytes(&self) -> &[u8; SETTINGS_AUTH_TOKEN_LEN] {
        &self.0
    }
}

impl fmt::Debug for SettingsAuthToken {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("SettingsAuthToken([REDACTED])")
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
pub struct PushoverCredentials {
    application_token: [u8; PUSHOVER_KEY_LEN],
    user_key: [u8; PUSHOVER_KEY_LEN],
    device: [u8; PUSHOVER_DEVICE_MAX_LEN],
    device_len: u8,
}

impl PushoverCredentials {
    pub fn new(
        application_token: &str,
        user_key: &str,
        device: Option<&str>,
    ) -> Result<Self, ConfigurationError> {
        let application_token = pushover_key(application_token, PushoverField::ApplicationToken)?;
        let user_key = pushover_key(user_key, PushoverField::UserKey)?;
        let mut device_bytes = [0; PUSHOVER_DEVICE_MAX_LEN];
        let device_len = if let Some(device) = device {
            if device.is_empty() || device.len() > PUSHOVER_DEVICE_MAX_LEN {
                return Err(ConfigurationError::InvalidPushoverField(
                    PushoverField::Device,
                ));
            }
            if !device
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
            {
                return Err(ConfigurationError::InvalidPushoverField(
                    PushoverField::Device,
                ));
            }
            device_bytes[..device.len()].copy_from_slice(device.as_bytes());
            device.len() as u8
        } else {
            0
        };
        Ok(Self {
            application_token,
            user_key,
            device: device_bytes,
            device_len,
        })
    }

    pub fn application_token(&self) -> &str {
        // Construction and decoding accept ASCII only.
        str::from_utf8(&self.application_token).unwrap_or("")
    }

    pub fn user_key(&self) -> &str {
        str::from_utf8(&self.user_key).unwrap_or("")
    }

    pub fn device(&self) -> Option<&str> {
        (self.device_len != 0)
            .then(|| str::from_utf8(&self.device[..usize::from(self.device_len)]).unwrap_or(""))
    }
}

impl fmt::Debug for PushoverCredentials {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("PushoverCredentials([REDACTED])")
    }
}

fn pushover_key(
    value: &str,
    field: PushoverField,
) -> Result<[u8; PUSHOVER_KEY_LEN], ConfigurationError> {
    if value.len() != PUSHOVER_KEY_LEN || !value.bytes().all(|byte| byte.is_ascii_alphanumeric()) {
        return Err(ConfigurationError::InvalidPushoverField(field));
    }
    let mut bytes = [0; PUSHOVER_KEY_LEN];
    bytes.copy_from_slice(value.as_bytes());
    Ok(bytes)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PushoverField {
    ApplicationToken,
    UserKey,
    Device,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RawScheduleEntry {
    pub id: u16,
    pub day_mask: u8,
    pub start_second: u32,
}

impl RawScheduleEntry {
    const EMPTY: Self = Self {
        id: 0,
        day_mask: 0,
        start_second: 0,
    };

    pub const fn new(id: u16, day_mask: u8, start_second: u32) -> Self {
        Self {
            id,
            day_mask,
            start_second,
        }
    }
}

#[derive(Clone, Copy)]
struct RawTimeZone {
    bytes: [u8; MAX_POSIX_TZ_BYTES],
    len: u16,
}

impl RawTimeZone {
    const EMPTY: Self = Self {
        bytes: [0; MAX_POSIX_TZ_BYTES],
        len: 0,
    };

    fn from_str(rule: &str) -> Result<Self, ConfigurationError> {
        if rule.is_empty() || rule.len() > MAX_POSIX_TZ_BYTES || !rule.is_ascii() {
            return Err(ConfigurationError::InvalidTimeZoneEncoding);
        }
        let mut bytes = [0; MAX_POSIX_TZ_BYTES];
        bytes[..rule.len()].copy_from_slice(rule.as_bytes());
        Ok(Self {
            bytes,
            len: rule.len() as u16,
        })
    }

    fn as_str(&self) -> Result<&str, ConfigurationError> {
        let len = usize::from(self.len);
        if len == 0 || len > MAX_POSIX_TZ_BYTES || !self.bytes[len..].iter().all(|byte| *byte == 0)
        {
            return Err(ConfigurationError::InvalidTimeZoneEncoding);
        }
        let rule = str::from_utf8(&self.bytes[..len])
            .map_err(|_| ConfigurationError::InvalidTimeZoneEncoding)?;
        if !rule.is_ascii() {
            return Err(ConfigurationError::InvalidTimeZoneEncoding);
        }
        Ok(rule)
    }
}

#[derive(Clone, Copy)]
pub struct RawDeviceConfig {
    revision: u32,
    stop_level: u16,
    restart_level: u16,
    max_sample_age_ms: u64,
    timing: Timing,
    run_duration_seconds: u32,
    entries: [RawScheduleEntry; MAX_DAILY_ENTRIES],
    entry_count: u8,
    timezone: RawTimeZone,
    calibration: Option<CalibrationData>,
    settings_auth_token: [u8; SETTINGS_AUTH_TOKEN_LEN],
    pushover: Option<PushoverCredentials>,
}

impl RawDeviceConfig {
    pub const fn builder(
        revision: u32,
        stop_level: u16,
        restart_level: u16,
        max_sample_age_ms: u64,
        timing: Timing,
        run_duration_seconds: u32,
        settings_auth_token: [u8; SETTINGS_AUTH_TOKEN_LEN],
    ) -> RawConfigBuilder {
        RawConfigBuilder {
            raw: Self {
                revision,
                stop_level,
                restart_level,
                max_sample_age_ms,
                timing,
                run_duration_seconds,
                entries: [RawScheduleEntry::EMPTY; MAX_DAILY_ENTRIES],
                entry_count: 0,
                timezone: RawTimeZone::EMPTY,
                calibration: None,
                settings_auth_token,
                pushover: None,
            },
        }
    }
}

pub struct RawConfigBuilder {
    raw: RawDeviceConfig,
}

impl RawConfigBuilder {
    pub fn schedule_entries(
        mut self,
        entries: &[RawScheduleEntry],
    ) -> Result<Self, ConfigurationError> {
        if entries.len() > MAX_DAILY_ENTRIES {
            return Err(ConfigurationError::TooManyScheduleEntries);
        }
        self.raw.entries = [RawScheduleEntry::EMPTY; MAX_DAILY_ENTRIES];
        self.raw.entries[..entries.len()].copy_from_slice(entries);
        self.raw.entry_count = entries.len() as u8;
        Ok(self)
    }

    pub fn timezone_rule(mut self, rule: &str) -> Result<Self, ConfigurationError> {
        self.raw.timezone = RawTimeZone::from_str(rule)?;
        Ok(self)
    }

    pub const fn calibration(mut self, calibration: Option<CalibrationData>) -> Self {
        self.raw.calibration = calibration;
        self
    }

    pub const fn pushover(mut self, credentials: Option<PushoverCredentials>) -> Self {
        self.raw.pushover = credentials;
        self
    }

    pub const fn build(self) -> RawDeviceConfig {
        self.raw
    }
}

#[derive(Clone, Copy)]
pub struct ValidatedDeviceConfig {
    revision: u32,
    supervisor: SupervisorConfig,
    stop: Level,
    restart: Level,
    max_sample_age_ms: u64,
    timing: Timing,
    run_duration_seconds: u32,
    entries: [DailyEntry; MAX_DAILY_ENTRIES],
    entry_count: u8,
    timezone: PosixTimeZone,
    timezone_rule: RawTimeZone,
    calibration: Option<Calibration>,
    settings_auth_token: SettingsAuthToken,
    pushover: Option<PushoverCredentials>,
}

impl fmt::Debug for ValidatedDeviceConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("ValidatedDeviceConfig")
            .field("revision", &self.revision)
            .field("credentials", &"[REDACTED]")
            .finish_non_exhaustive()
    }
}

impl ValidatedDeviceConfig {
    pub fn from_raw(raw: RawDeviceConfig) -> Result<Self, ConfigurationError> {
        if raw.revision == 0 {
            return Err(ConfigurationError::ZeroRevision);
        }
        let stop = Level::new(raw.stop_level).ok_or(ConfigurationError::InvalidLevel)?;
        let restart = Level::new(raw.restart_level).ok_or(ConfigurationError::InvalidLevel)?;
        let interlock = Config::new(stop, restart, raw.max_sample_age_ms, raw.timing)
            .map_err(ConfigurationError::Interlock)?;
        if raw.run_duration_seconds == 0 || raw.run_duration_seconds > MAX_WINDOW_SECONDS {
            return Err(ConfigurationError::InvalidRunDuration);
        }
        let supervisor =
            SupervisorConfig::new(interlock, u64::from(raw.run_duration_seconds) * 1000)
                .map_err(ConfigurationError::Interlock)?;

        let entry_count = usize::from(raw.entry_count);
        if entry_count > MAX_DAILY_ENTRIES {
            return Err(ConfigurationError::TooManyScheduleEntries);
        }
        let filler = DailyEntry::new(1, DayMask::EVERY_DAY, 0)
            .ok_or(ConfigurationError::InvalidScheduleEntry(0))?;
        let mut entries = [filler; MAX_DAILY_ENTRIES];
        for (index, raw_entry) in raw.entries[..entry_count].iter().enumerate() {
            let days = DayMask::new(raw_entry.day_mask)
                .ok_or(ConfigurationError::InvalidScheduleEntry(index))?;
            entries[index] = DailyEntry::new(raw_entry.id, days, raw_entry.start_second)
                .ok_or(ConfigurationError::InvalidScheduleEntry(index))?;
        }
        entries[..entry_count].sort_unstable_by_key(|entry| entry.id());
        Schedule::new(&entries[..entry_count], raw.run_duration_seconds)
            .map_err(ConfigurationError::Schedule)?;

        let timezone_rule = raw.timezone;
        let timezone =
            PosixTimeZone::parse(timezone_rule.as_str()?).map_err(ConfigurationError::TimeZone)?;
        let settings_auth_token = SettingsAuthToken::new(raw.settings_auth_token)?;
        let calibration = match raw.calibration {
            Some(data) => {
                let calibration =
                    Calibration::new(data).map_err(ConfigurationError::Calibration)?;
                if stop < data.supported_level.min || restart > data.supported_level.max {
                    return Err(ConfigurationError::ThresholdOutsideCalibrationDomain);
                }
                if raw.max_sample_age_ms != data.max_frame_age_ms {
                    return Err(ConfigurationError::SampleAgeMismatch);
                }
                Some(calibration)
            }
            None => None,
        };

        Ok(Self {
            revision: raw.revision,
            supervisor,
            stop,
            restart,
            max_sample_age_ms: raw.max_sample_age_ms,
            timing: raw.timing,
            run_duration_seconds: raw.run_duration_seconds,
            entries,
            entry_count: raw.entry_count,
            timezone,
            timezone_rule,
            calibration,
            settings_auth_token,
            pushover: raw.pushover,
        })
    }

    pub const fn revision(&self) -> u32 {
        self.revision
    }

    pub const fn supervisor_config(&self) -> SupervisorConfig {
        self.supervisor
    }

    pub const fn calibration(&self) -> Option<Calibration> {
        self.calibration
    }

    pub fn schedule(&self) -> Schedule<'_> {
        // Validated in `from_raw`; this cannot fail unless Schedule's invariants change.
        Schedule::new(
            &self.entries[..usize::from(self.entry_count)],
            self.run_duration_seconds,
        )
        .unwrap_or_else(|_| unreachable!())
    }

    pub const fn timezone(&self) -> PosixTimeZone {
        self.timezone
    }

    pub fn timezone_rule(&self) -> &str {
        self.timezone_rule.as_str().unwrap_or("")
    }

    pub const fn settings_auth_token(&self) -> &SettingsAuthToken {
        &self.settings_auth_token
    }

    pub const fn pushover(&self) -> Option<&PushoverCredentials> {
        self.pushover.as_ref()
    }

    pub fn encode(&self) -> Result<EncodedConfiguration, ConfigurationError> {
        let mut writer = Writer::new();
        writer.bytes(&CONFIGURATION_MAGIC)?;
        writer.byte(CONFIGURATION_FORMAT_VERSION)?;
        let mut flags = 0;
        if self.calibration.is_some() {
            flags |= FLAG_CALIBRATION;
        }
        if self.pushover.is_some() {
            flags |= FLAG_PUSHOVER;
        }
        writer.byte(flags)?;
        writer.u16(0)?;
        writer.u32(self.revision)?;
        writer.byte(self.entry_count)?;
        writer.byte(0)?;
        writer.u16(self.timezone_rule.len)?;
        writer.u32(self.run_duration_seconds)?;
        writer.u16(self.stop.value())?;
        writer.u16(self.restart.value())?;
        writer.u64(self.max_sample_age_ms)?;
        writer.u64(self.timing.low_confirmation_ms)?;
        writer.u64(self.timing.recovery_ms)?;
        writer.u64(self.timing.minimum_off_ms)?;
        writer.bytes(self.settings_auth_token.as_bytes())?;
        for entry in &self.entries[..usize::from(self.entry_count)] {
            writer.u16(entry.id())?;
            writer.byte(entry.days().bits())?;
            writer.byte(0)?;
            writer.u32(entry.start_second())?;
        }
        writer.bytes(self.timezone_rule.as_str()?.as_bytes())?;
        if let Some(calibration) = self.calibration {
            encode_calibration(&mut writer, calibration.data())?;
        }
        if let Some(pushover) = self.pushover {
            writer.bytes(&pushover.application_token)?;
            writer.bytes(&pushover.user_key)?;
            writer.byte(pushover.device_len)?;
            writer.bytes(&[0; 3])?;
            writer.bytes(&pushover.device)?;
        }
        let total_len = writer
            .position
            .checked_add(CHECKSUM_LEN)
            .ok_or(ConfigurationError::BlobTooLarge)?;
        if total_len > CONFIGURATION_BLOB_MAX_LEN || total_len > usize::from(u16::MAX) {
            return Err(ConfigurationError::BlobTooLarge);
        }
        writer.buffer[6..8].copy_from_slice(&(total_len as u16).to_le_bytes());
        let checksum = crc32(&writer.buffer[..writer.position]);
        writer.u32(checksum)?;
        Ok(EncodedConfiguration {
            bytes: writer.buffer,
            len: total_len as u16,
        })
    }

    pub fn decode(blob: &[u8]) -> Result<Self, ConfigurationError> {
        if blob.len() > CONFIGURATION_BLOB_MAX_LEN {
            return Err(ConfigurationError::BlobTooLarge);
        }
        if blob.len() < HEADER_LEN + CHECKSUM_LEN {
            return Err(ConfigurationError::BlobLength);
        }
        if blob[..4] != CONFIGURATION_MAGIC {
            return Err(ConfigurationError::BlobMagic);
        }
        if blob[4] != CONFIGURATION_FORMAT_VERSION {
            return Err(ConfigurationError::BlobVersion);
        }
        let declared_len = usize::from(u16::from_le_bytes([blob[6], blob[7]]));
        if declared_len != blob.len() {
            return Err(ConfigurationError::BlobLength);
        }
        let checksum_offset = blob.len() - CHECKSUM_LEN;
        let expected = u32::from_le_bytes(
            blob[checksum_offset..]
                .try_into()
                .map_err(|_| ConfigurationError::BlobLength)?,
        );
        if crc32(&blob[..checksum_offset]) != expected {
            return Err(ConfigurationError::BlobChecksum);
        }
        let flags = blob[5];
        if flags & !KNOWN_FLAGS != 0 || blob[13] != 0 {
            return Err(ConfigurationError::NonCanonical);
        }

        let mut reader = Reader::new(&blob[..checksum_offset], HEADER_LEN);
        let revision = u32::from_le_bytes(blob[8..12].try_into().unwrap_or([0; 4]));
        let entry_count = blob[12];
        if usize::from(entry_count) > MAX_DAILY_ENTRIES {
            return Err(ConfigurationError::TooManyScheduleEntries);
        }
        let timezone_len = usize::from(u16::from_le_bytes([blob[14], blob[15]]));
        if timezone_len == 0 || timezone_len > MAX_POSIX_TZ_BYTES {
            return Err(ConfigurationError::InvalidTimeZoneEncoding);
        }
        let run_duration_seconds = reader.u32()?;
        let stop_level = reader.u16()?;
        let restart_level = reader.u16()?;
        let max_sample_age_ms = reader.u64()?;
        let timing = Timing {
            low_confirmation_ms: reader.u64()?,
            recovery_ms: reader.u64()?,
            minimum_off_ms: reader.u64()?,
        };
        let settings_auth_token = reader.array::<SETTINGS_AUTH_TOKEN_LEN>()?;
        let mut entries = [RawScheduleEntry::EMPTY; MAX_DAILY_ENTRIES];
        for index in 0..usize::from(entry_count) {
            let id = reader.u16()?;
            let day_mask = reader.byte()?;
            if reader.byte()? != 0 {
                return Err(ConfigurationError::NonCanonical);
            }
            let start_second = reader.u32()?;
            if index != 0 && id <= entries[index - 1].id {
                return Err(ConfigurationError::NonCanonical);
            }
            entries[index] = RawScheduleEntry::new(id, day_mask, start_second);
        }
        let timezone_bytes = reader.take(timezone_len)?;
        let timezone_text = str::from_utf8(timezone_bytes)
            .map_err(|_| ConfigurationError::InvalidTimeZoneEncoding)?;
        let timezone = RawTimeZone::from_str(timezone_text)?;
        let calibration = if flags & FLAG_CALIBRATION != 0 {
            Some(decode_calibration(&mut reader)?)
        } else {
            None
        };
        let pushover = if flags & FLAG_PUSHOVER != 0 {
            let application_token = reader.array::<PUSHOVER_KEY_LEN>()?;
            let user_key = reader.array::<PUSHOVER_KEY_LEN>()?;
            let device_len = reader.byte()?;
            if reader.take(3)? != [0; 3] {
                return Err(ConfigurationError::NonCanonical);
            }
            if usize::from(device_len) > PUSHOVER_DEVICE_MAX_LEN {
                return Err(ConfigurationError::InvalidPushoverField(
                    PushoverField::Device,
                ));
            }
            let device = reader.array::<PUSHOVER_DEVICE_MAX_LEN>()?;
            if !device[usize::from(device_len)..]
                .iter()
                .all(|byte| *byte == 0)
            {
                return Err(ConfigurationError::NonCanonical);
            }
            let application_token = str::from_utf8(&application_token).map_err(|_| {
                ConfigurationError::InvalidPushoverField(PushoverField::ApplicationToken)
            })?;
            let user_key = str::from_utf8(&user_key)
                .map_err(|_| ConfigurationError::InvalidPushoverField(PushoverField::UserKey))?;
            let device_text = if device_len == 0 {
                None
            } else {
                Some(
                    str::from_utf8(&device[..usize::from(device_len)]).map_err(|_| {
                        ConfigurationError::InvalidPushoverField(PushoverField::Device)
                    })?,
                )
            };
            Some(PushoverCredentials::new(
                application_token,
                user_key,
                device_text,
            )?)
        } else {
            None
        };
        if reader.position != checksum_offset {
            return Err(ConfigurationError::NonCanonical);
        }
        Self::from_raw(RawDeviceConfig {
            revision,
            stop_level,
            restart_level,
            max_sample_age_ms,
            timing,
            run_duration_seconds,
            entries,
            entry_count,
            timezone,
            calibration,
            settings_auth_token,
            pushover,
        })
    }
}

pub struct EncodedConfiguration {
    bytes: [u8; CONFIGURATION_BLOB_MAX_LEN],
    len: u16,
}

impl EncodedConfiguration {
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..usize::from(self.len)]
    }

    pub const fn len(&self) -> usize {
        self.len as usize
    }

    pub const fn is_empty(&self) -> bool {
        false
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigurationError {
    ZeroRevision,
    InvalidLevel,
    Interlock(ConfigError),
    InvalidRunDuration,
    TooManyScheduleEntries,
    InvalidScheduleEntry(usize),
    Schedule(ScheduleError),
    InvalidTimeZoneEncoding,
    TimeZone(TimeZoneError),
    ZeroSettingsAuthToken,
    InvalidPushoverField(PushoverField),
    Calibration(CalibrationConfigError),
    ThresholdOutsideCalibrationDomain,
    SampleAgeMismatch,
    BlobTooLarge,
    BlobLength,
    BlobMagic,
    BlobVersion,
    BlobChecksum,
    NonCanonical,
}

fn encode_calibration(
    writer: &mut Writer,
    data: &CalibrationData,
) -> Result<(), ConfigurationError> {
    writer.i32(data.level_empty_counts)?;
    encode_raw_channels(writer, data.low_endpoint)?;
    encode_raw_channels(writer, data.high_endpoint)?;
    for limits in [
        data.channels.level,
        data.channels.wet_reference,
        data.channels.dry_reference,
    ] {
        writer.i32(limits.envelope.min)?;
        writer.i32(limits.envelope.max)?;
        writer.u32(limits.max_slew_counts_per_second)?;
    }
    writer.byte(match data.reference_sign {
        ReferenceSign::Positive => 0,
        ReferenceSign::Negative => 1,
    })?;
    writer.bytes(&[0; 3])?;
    writer.u32(data.minimum_reference_span_counts)?;
    writer.u32(data.minimum_endpoint_ratio_span.numerator)?;
    writer.u32(data.minimum_endpoint_ratio_span.denominator)?;
    writer.u16(data.supported_level.min.value())?;
    writer.u16(data.supported_level.max.value())?;
    writer.u64(data.max_frame_age_ms)?;
    writer.u64(data.max_frame_duration_ms)?;
    writer.u32(data.max_level_slew_per_second)
}

fn encode_raw_channels(
    writer: &mut Writer,
    channels: RawChannels,
) -> Result<(), ConfigurationError> {
    writer.i32(channels.level)?;
    writer.i32(channels.wet_reference)?;
    writer.i32(channels.dry_reference)
}

fn decode_calibration(reader: &mut Reader<'_>) -> Result<CalibrationData, ConfigurationError> {
    let level_empty_counts = reader.i32()?;
    let low_endpoint = decode_raw_channels(reader)?;
    let high_endpoint = decode_raw_channels(reader)?;
    let level = decode_channel_limits(reader)?;
    let wet_reference = decode_channel_limits(reader)?;
    let dry_reference = decode_channel_limits(reader)?;
    let reference_sign = match reader.byte()? {
        0 => ReferenceSign::Positive,
        1 => ReferenceSign::Negative,
        _ => return Err(ConfigurationError::NonCanonical),
    };
    if reader.take(3)? != [0; 3] {
        return Err(ConfigurationError::NonCanonical);
    }
    let minimum_reference_span_counts = reader.u32()?;
    let minimum_endpoint_ratio_span = MinimumRatioSpan {
        numerator: reader.u32()?,
        denominator: reader.u32()?,
    };
    let supported_level = LevelDomain {
        min: Level::new(reader.u16()?).ok_or(ConfigurationError::InvalidLevel)?,
        max: Level::new(reader.u16()?).ok_or(ConfigurationError::InvalidLevel)?,
    };
    Ok(CalibrationData {
        level_empty_counts,
        low_endpoint,
        high_endpoint,
        channels: Channels {
            level,
            wet_reference,
            dry_reference,
        },
        reference_sign,
        minimum_reference_span_counts,
        minimum_endpoint_ratio_span,
        supported_level,
        max_frame_age_ms: reader.u64()?,
        max_frame_duration_ms: reader.u64()?,
        max_level_slew_per_second: reader.u32()?,
    })
}

fn decode_raw_channels(reader: &mut Reader<'_>) -> Result<RawChannels, ConfigurationError> {
    Ok(Channels {
        level: reader.i32()?,
        wet_reference: reader.i32()?,
        dry_reference: reader.i32()?,
    })
}

fn decode_channel_limits(reader: &mut Reader<'_>) -> Result<ChannelLimits, ConfigurationError> {
    Ok(ChannelLimits {
        envelope: CountsRange {
            min: reader.i32()?,
            max: reader.i32()?,
        },
        max_slew_counts_per_second: reader.u32()?,
    })
}

struct Writer {
    buffer: [u8; CONFIGURATION_BLOB_MAX_LEN],
    position: usize,
}

impl Writer {
    const fn new() -> Self {
        Self {
            buffer: [0; CONFIGURATION_BLOB_MAX_LEN],
            position: 0,
        }
    }

    fn bytes(&mut self, bytes: &[u8]) -> Result<(), ConfigurationError> {
        let end = self
            .position
            .checked_add(bytes.len())
            .ok_or(ConfigurationError::BlobTooLarge)?;
        let destination = self
            .buffer
            .get_mut(self.position..end)
            .ok_or(ConfigurationError::BlobTooLarge)?;
        destination.copy_from_slice(bytes);
        self.position = end;
        Ok(())
    }

    fn byte(&mut self, value: u8) -> Result<(), ConfigurationError> {
        self.bytes(&[value])
    }

    fn u16(&mut self, value: u16) -> Result<(), ConfigurationError> {
        self.bytes(&value.to_le_bytes())
    }

    fn u32(&mut self, value: u32) -> Result<(), ConfigurationError> {
        self.bytes(&value.to_le_bytes())
    }

    fn i32(&mut self, value: i32) -> Result<(), ConfigurationError> {
        self.bytes(&value.to_le_bytes())
    }

    fn u64(&mut self, value: u64) -> Result<(), ConfigurationError> {
        self.bytes(&value.to_le_bytes())
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> Reader<'a> {
    const fn new(bytes: &'a [u8], position: usize) -> Self {
        Self { bytes, position }
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8], ConfigurationError> {
        let end = self
            .position
            .checked_add(len)
            .ok_or(ConfigurationError::BlobLength)?;
        let value = self
            .bytes
            .get(self.position..end)
            .ok_or(ConfigurationError::BlobLength)?;
        self.position = end;
        Ok(value)
    }

    fn array<const N: usize>(&mut self) -> Result<[u8; N], ConfigurationError> {
        self.take(N)?
            .try_into()
            .map_err(|_| ConfigurationError::BlobLength)
    }

    fn byte(&mut self) -> Result<u8, ConfigurationError> {
        Ok(self.array::<1>()?[0])
    }

    fn u16(&mut self) -> Result<u16, ConfigurationError> {
        Ok(u16::from_le_bytes(self.array()?))
    }

    fn u32(&mut self) -> Result<u32, ConfigurationError> {
        Ok(u32::from_le_bytes(self.array()?))
    }

    fn i32(&mut self) -> Result<i32, ConfigurationError> {
        Ok(i32::from_le_bytes(self.array()?))
    }

    fn u64(&mut self) -> Result<u64, ConfigurationError> {
        Ok(u64::from_le_bytes(self.array()?))
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;
    extern crate std;

    const APP_TOKEN: &str = "A12345678901234567890123456789";
    const USER_KEY: &str = "B12345678901234567890123456789";

    fn raw_channels(level: i32, wet_reference: i32, dry_reference: i32) -> RawChannels {
        Channels {
            level,
            wet_reference,
            dry_reference,
        }
    }

    fn calibration() -> CalibrationData {
        // Synthetic arithmetic fixture only; these are not commissioned settings.
        let limits = ChannelLimits {
            envelope: CountsRange {
                min: -5_000,
                max: 5_000,
            },
            max_slew_counts_per_second: 70_000,
        };
        CalibrationData {
            level_empty_counts: 1_000,
            low_endpoint: raw_channels(1_200, 700, 300),
            high_endpoint: raw_channels(2_500, 900, 300),
            channels: Channels {
                level: limits,
                wet_reference: ChannelLimits {
                    max_slew_counts_per_second: 60_000,
                    ..limits
                },
                dry_reference: ChannelLimits {
                    max_slew_counts_per_second: 50_000,
                    ..limits
                },
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
            max_level_slew_per_second: 8_000,
        }
    }

    fn timing() -> Timing {
        Timing {
            low_confirmation_ms: 1_111,
            recovery_ms: 2_222,
            minimum_off_ms: 3_333,
        }
    }

    fn build_raw(entries: &[RawScheduleEntry]) -> RawDeviceConfig {
        RawDeviceConfig::builder(17, 200, 800, 500, timing(), 86_400, [0x5a; 32])
            .schedule_entries(entries)
            .unwrap()
            .timezone_rule("PST8PDT,M3.2.0/2,M11.1.0/2")
            .unwrap()
            .calibration(Some(calibration()))
            .pushover(Some(
                PushoverCredentials::new(APP_TOKEN, USER_KEY, Some("tank_device-1")).unwrap(),
            ))
            .build()
    }

    fn rewrite_checksum(blob: &mut [u8]) {
        let checksum_offset = blob.len() - CHECKSUM_LEN;
        let checksum = crc32(&blob[..checksum_offset]);
        blob[checksum_offset..].copy_from_slice(&checksum.to_le_bytes());
    }

    #[test]
    fn all_fields_and_maximum_schedule_round_trip_canonically() {
        let mut entries = [RawScheduleEntry::EMPTY; MAX_DAILY_ENTRIES];
        for (index, entry) in entries.iter_mut().enumerate() {
            *entry = RawScheduleEntry::new(
                (MAX_DAILY_ENTRIES - index) as u16,
                1 << (index % 7),
                (index as u32) * 3_600,
            );
        }
        let config = ValidatedDeviceConfig::from_raw(build_raw(&entries)).unwrap();
        let encoded = config.encode().unwrap();
        assert!(encoded.len() <= CONFIGURATION_BLOB_MAX_LEN);
        let decoded = ValidatedDeviceConfig::decode(encoded.as_bytes()).unwrap();

        assert_eq!(decoded.revision(), 17);
        assert_eq!(
            decoded.supervisor_config(),
            SupervisorConfig::new(
                Config::new(
                    Level::new(200).unwrap(),
                    Level::new(800).unwrap(),
                    500,
                    timing(),
                )
                .unwrap(),
                86_400_000,
            )
            .unwrap()
        );
        assert_eq!(decoded.calibration().unwrap().data(), &calibration());
        assert_eq!(decoded.timezone_rule(), "PST8PDT,M3.2.0/2,M11.1.0/2");
        assert_eq!(decoded.timezone(), config.timezone());
        assert_eq!(decoded.settings_auth_token().as_bytes(), &[0x5a; 32]);
        assert_eq!(decoded.pushover().unwrap().application_token(), APP_TOKEN);
        assert_eq!(decoded.pushover().unwrap().user_key(), USER_KEY);
        assert_eq!(decoded.pushover().unwrap().device(), Some("tank_device-1"));
        assert_eq!(decoded.schedule().entries().len(), MAX_DAILY_ENTRIES);
        for (index, entry) in decoded.schedule().entries().iter().enumerate() {
            assert_eq!(entry.id(), index as u16 + 1);
        }
        assert_eq!(decoded.schedule().run_duration_seconds(), 86_400);
        assert_eq!(decoded.encode().unwrap().as_bytes(), encoded.as_bytes());
    }

    #[test]
    fn absent_optional_fields_remain_absent_and_uncommissioned() {
        let raw = RawDeviceConfig::builder(1, 200, 400, 500, timing(), 900, [1; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .build();
        let config = ValidatedDeviceConfig::from_raw(raw).unwrap();
        assert_eq!(config.calibration(), None);
        assert!(config.pushover().is_none());
        assert!(config.schedule().entries().is_empty());
        let decoded = ValidatedDeviceConfig::decode(config.encode().unwrap().as_bytes()).unwrap();
        assert_eq!(decoded.calibration(), None);
        assert!(decoded.pushover().is_none());
    }

    #[test]
    fn corrupt_truncated_oversized_wrong_version_and_wrong_endian_are_rejected() {
        let encoded = ValidatedDeviceConfig::from_raw(build_raw(&[]))
            .unwrap()
            .encode()
            .unwrap();
        let bytes = encoded.as_bytes();
        assert_eq!(
            ValidatedDeviceConfig::decode(&bytes[..bytes.len() - 1]).unwrap_err(),
            ConfigurationError::BlobLength
        );

        let mut appended = [0u8; CONFIGURATION_BLOB_MAX_LEN];
        appended[..bytes.len()].copy_from_slice(bytes);
        assert_eq!(
            ValidatedDeviceConfig::decode(&appended[..bytes.len() + 1]).unwrap_err(),
            ConfigurationError::BlobLength
        );

        let oversized = [0u8; CONFIGURATION_BLOB_MAX_LEN + 1];
        assert_eq!(
            ValidatedDeviceConfig::decode(&oversized).unwrap_err(),
            ConfigurationError::BlobTooLarge
        );

        let mut corrupt = [0u8; CONFIGURATION_BLOB_MAX_LEN];
        corrupt[..bytes.len()].copy_from_slice(bytes);
        corrupt[20] ^= 1;
        assert_eq!(
            ValidatedDeviceConfig::decode(&corrupt[..bytes.len()]).unwrap_err(),
            ConfigurationError::BlobChecksum
        );

        let mut unknown_version = [0u8; CONFIGURATION_BLOB_MAX_LEN];
        unknown_version[..bytes.len()].copy_from_slice(bytes);
        unknown_version[4] = CONFIGURATION_FORMAT_VERSION + 1;
        assert_eq!(
            ValidatedDeviceConfig::decode(&unknown_version[..bytes.len()]).unwrap_err(),
            ConfigurationError::BlobVersion
        );

        let mut wrong_endian = [0u8; CONFIGURATION_BLOB_MAX_LEN];
        wrong_endian[..bytes.len()].copy_from_slice(bytes);
        wrong_endian.swap(6, 7);
        assert_eq!(
            ValidatedDeviceConfig::decode(&wrong_endian[..bytes.len()]).unwrap_err(),
            ConfigurationError::BlobLength
        );
    }

    #[test]
    fn valid_crc_does_not_bypass_canonical_or_cross_field_validation() {
        let encoded = ValidatedDeviceConfig::from_raw(build_raw(&[]))
            .unwrap()
            .encode()
            .unwrap();
        let bytes = encoded.as_bytes();
        let mut blob = [0u8; CONFIGURATION_BLOB_MAX_LEN];
        blob[..bytes.len()].copy_from_slice(bytes);

        blob[13] = 1;
        rewrite_checksum(&mut blob[..bytes.len()]);
        assert_eq!(
            ValidatedDeviceConfig::decode(&blob[..bytes.len()]).unwrap_err(),
            ConfigurationError::NonCanonical
        );

        blob[..bytes.len()].copy_from_slice(bytes);
        blob[20..22].copy_from_slice(&800u16.to_le_bytes());
        blob[22..24].copy_from_slice(&200u16.to_le_bytes());
        rewrite_checksum(&mut blob[..bytes.len()]);
        assert_eq!(
            ValidatedDeviceConfig::decode(&blob[..bytes.len()]).unwrap_err(),
            ConfigurationError::Interlock(ConfigError::ThresholdOrder)
        );

        blob[..bytes.len()].copy_from_slice(bytes);
        blob[5] |= 0x80;
        rewrite_checksum(&mut blob[..bytes.len()]);
        assert_eq!(
            ValidatedDeviceConfig::decode(&blob[..bytes.len()]).unwrap_err(),
            ConfigurationError::NonCanonical
        );

        let one_entry = [RawScheduleEntry::new(1, DayMask::EVERY_DAY.bits(), 0)];
        let entry_encoded = ValidatedDeviceConfig::from_raw(build_raw(&one_entry))
            .unwrap()
            .encode()
            .unwrap();
        let entry_bytes = entry_encoded.as_bytes();
        blob[..entry_bytes.len()].copy_from_slice(entry_bytes);
        blob[91] = 1;
        rewrite_checksum(&mut blob[..entry_bytes.len()]);
        assert_eq!(
            ValidatedDeviceConfig::decode(&blob[..entry_bytes.len()]).unwrap_err(),
            ConfigurationError::NonCanonical
        );
    }

    #[test]
    fn cross_field_and_external_credential_limits_are_enforced() {
        let outside = RawDeviceConfig::builder(1, 50, 800, 500, timing(), 900, [1; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .calibration(Some(calibration()))
            .build();
        assert_eq!(
            ValidatedDeviceConfig::from_raw(outside).unwrap_err(),
            ConfigurationError::ThresholdOutsideCalibrationDomain
        );

        let age_mismatch = RawDeviceConfig::builder(1, 200, 800, 501, timing(), 900, [1; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .calibration(Some(calibration()))
            .build();
        assert_eq!(
            ValidatedDeviceConfig::from_raw(age_mismatch).unwrap_err(),
            ConfigurationError::SampleAgeMismatch
        );

        let zero_secret = RawDeviceConfig::builder(1, 200, 800, 500, timing(), 900, [0; 32])
            .timezone_rule("UTC0")
            .unwrap()
            .build();
        assert_eq!(
            ValidatedDeviceConfig::from_raw(zero_secret).unwrap_err(),
            ConfigurationError::ZeroSettingsAuthToken
        );

        assert_eq!(
            PushoverCredentials::new("short", USER_KEY, None).unwrap_err(),
            ConfigurationError::InvalidPushoverField(PushoverField::ApplicationToken)
        );
        assert_eq!(
            PushoverCredentials::new(APP_TOKEN, USER_KEY, Some("bad device")).unwrap_err(),
            ConfigurationError::InvalidPushoverField(PushoverField::Device)
        );
        assert!(
            PushoverCredentials::new(APP_TOKEN, USER_KEY, Some("abcdefghijklmnopqrstuvwxy"))
                .is_ok()
        );
    }

    #[test]
    fn debug_output_redacts_every_secret() {
        let settings = SettingsAuthToken::new(*b"settings-auth-token-must-secret!").unwrap();
        let pushover =
            PushoverCredentials::new(APP_TOKEN, USER_KEY, Some("tank_device-1")).unwrap();
        let settings_debug = std::format!("{settings:?}");
        let pushover_debug = std::format!("{pushover:?}");
        let config_debug = std::format!(
            "{:?}",
            ValidatedDeviceConfig::from_raw(build_raw(&[])).unwrap()
        );
        assert!(!settings_debug.contains("settings-auth"));
        assert!(!pushover_debug.contains(APP_TOKEN));
        assert!(!pushover_debug.contains(USER_KEY));
        assert!(!config_debug.contains(APP_TOKEN));
        assert!(!config_debug.contains(USER_KEY));
        assert!(settings_debug.contains("REDACTED"));
        assert!(pushover_debug.contains("REDACTED"));
        assert!(config_debug.contains("REDACTED"));
    }
}
