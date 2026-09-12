//! Strict fixed-capacity form schema. Decode in the caller's wiped body buffer.
use crate::{Bearer, Error};
use core::fmt::Write;
use crystal_shim_core::configuration::{
    PushoverCredentials, RawDeviceConfig, RawScheduleEntry, ValidatedDeviceConfig,
};
use crystal_shim_core::Timing;
use heapless::{String, Vec};

pub struct Form<'a> {
    fields: Vec<(&'a str, &'a str, bool), 64>,
}
impl<'a> Form<'a> {
    pub fn parse(bytes: &'a mut [u8]) -> Result<Self, Error> {
        let mut fields = Vec::new();
        for part in bytes.split_mut(|byte| *byte == b'&') {
            let equals = part
                .iter()
                .position(|b| *b == b'=')
                .ok_or(Error::BadRequest)?;
            let (key, value) = part.split_at_mut(equals);
            let key = decode(key)?;
            let value = decode(&mut value[1..])?;
            if key.is_empty() || fields.iter().any(|(old, _, _)| *old == key) {
                return Err(Error::BadRequest);
            }
            fields
                .push((key, value, false))
                .map_err(|_| Error::TooLarge)?;
        }
        Ok(Self { fields })
    }
    pub fn take(&mut self, name: &str) -> Result<&'a str, Error> {
        let entry = self
            .fields
            .iter_mut()
            .find(|(key, _, _)| *key == name)
            .ok_or(Error::BadRequest)?;
        if entry.2 {
            return Err(Error::BadRequest);
        }
        entry.2 = true;
        Ok(entry.1)
    }
    pub fn number(&mut self, name: &str) -> Result<u32, Error> {
        number(self.take(name)?.as_bytes())
    }
    pub fn millis(&mut self, name: &str) -> Result<u64, Error> {
        let value = number_u64(self.take(name)?.as_bytes())?;
        if value == 0 {
            return Err(Error::BadRequest);
        }
        Ok(value)
    }
    pub fn finish(&self) -> Result<(), Error> {
        if self.fields.iter().all(|(_, _, used)| *used) {
            Ok(())
        } else {
            Err(Error::BadRequest)
        }
    }
}
fn decode(bytes: &mut [u8]) -> Result<&str, Error> {
    let mut at = 0;
    let mut out = 0;
    while at < bytes.len() {
        let byte = match bytes[at] {
            b'+' => b' ',
            b'%' => {
                if at + 2 >= bytes.len() {
                    return Err(Error::BadRequest);
                }
                let a = hex(bytes[at + 1])?;
                let b = hex(bytes[at + 2])?;
                at += 2;
                a * 16 + b
            }
            b => b,
        };
        if !byte.is_ascii() || byte < 0x20 || byte == 0x7f {
            return Err(Error::BadRequest);
        }
        bytes[out] = byte;
        out += 1;
        at += 1;
    }
    core::str::from_utf8(&bytes[..out]).map_err(|_| Error::BadRequest)
}
fn hex(b: u8) -> Result<u8, Error> {
    match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err(Error::BadRequest),
    }
}
pub(crate) fn number(bytes: &[u8]) -> Result<u32, Error> {
    number_u64(bytes)?.try_into().map_err(|_| Error::BadRequest)
}
fn number_u64(bytes: &[u8]) -> Result<u64, Error> {
    if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
        return Err(Error::BadRequest);
    }
    bytes
        .iter()
        .try_fold(0u64, |value, b| {
            value.checked_mul(10)?.checked_add(u64::from(b - b'0'))
        })
        .ok_or(Error::BadRequest)
}

pub fn edit(
    base: ValidatedDeviceConfig,
    form: &mut Form<'_>,
) -> Result<ValidatedDeviceConfig, Error> {
    if form.number("revision")? != base.revision() {
        return Err(Error::Conflict);
    }
    let stop = form
        .number("stop_level")?
        .try_into()
        .map_err(|_| Error::BadRequest)?;
    let restart = form
        .number("restart_level")?
        .try_into()
        .map_err(|_| Error::BadRequest)?;
    let duration = form.number("duration_seconds")?;
    let max_sample_age_ms = form.millis("max_sample_age_ms")?;
    let timing = Timing {
        low_confirmation_ms: form.millis("low_confirmation_ms")?,
        recovery_ms: form.millis("recovery_ms")?,
        minimum_off_ms: form.millis("minimum_off_ms")?,
    };
    // Freshness is one setting shared by the interlock and calibrated frame
    // validator. Preserve every measured coefficient and other sensor limit.
    let calibration = base.calibration().map(|c| {
        let mut data = *c.data();
        data.max_frame_age_ms = max_sample_age_ms;
        data
    });
    let timezone = form.take("timezone")?;
    let count = form.number("entry_count")?;
    if count > 16 {
        return Err(Error::BadRequest);
    }
    let mut entries = Vec::<RawScheduleEntry, 16>::new();
    for i in 0..count {
        let mut key = String::<32>::new();
        write!(key, "entry{i}_id").map_err(|_| Error::BadRequest)?;
        let id = form
            .number(&key)?
            .try_into()
            .map_err(|_| Error::BadRequest)?;
        key.clear();
        write!(key, "entry{i}_days").map_err(|_| Error::BadRequest)?;
        let days = form
            .number(&key)?
            .try_into()
            .map_err(|_| Error::BadRequest)?;
        key.clear();
        write!(key, "entry{i}_start_second").map_err(|_| Error::BadRequest)?;
        let start = form.number(&key)?;
        entries
            .push(RawScheduleEntry::new(id, days, start))
            .map_err(|_| Error::BadRequest)?;
    }
    let pushover = match form.take("pushover_action")? {
        "keep" => base.pushover().copied(),
        "clear" => None,
        "replace" => {
            let application = form.take("pushover_application_token")?;
            let user = form.take("pushover_user_key")?;
            let device = form.take("pushover_device")?;
            Some(
                PushoverCredentials::new(
                    application,
                    user,
                    if device.is_empty() {
                        None
                    } else {
                        Some(device)
                    },
                )
                .map_err(|_| Error::BadRequest)?,
            )
        }
        _ => return Err(Error::BadRequest),
    };
    form.finish()?;
    let raw = RawDeviceConfig::builder(
        next_revision(base)?,
        stop,
        restart,
        max_sample_age_ms,
        timing,
        duration,
        *base.settings_auth_token().as_bytes(),
    )
    .schedule_entries(&entries)
    .map_err(|_| Error::BadRequest)?
    .timezone_rule(timezone)
    .map_err(|_| Error::BadRequest)?
    .calibration(calibration)
    .pushover(pushover)
    .build();
    ValidatedDeviceConfig::from_raw(raw).map_err(|_| Error::BadRequest)
}
fn next_revision(base: ValidatedDeviceConfig) -> Result<u32, Error> {
    base.revision().checked_add(1).ok_or(Error::Conflict)
}
pub fn rotate(
    base: ValidatedDeviceConfig,
    bearer: &Bearer,
) -> Result<ValidatedDeviceConfig, Error> {
    if bearer.matches(base.settings_auth_token().as_bytes()) {
        return Err(Error::BadRequest);
    }
    let entries: Vec<RawScheduleEntry, 16> = base
        .schedule()
        .entries()
        .iter()
        .map(|e| RawScheduleEntry::new(e.id(), e.days().bits(), e.start_second()))
        .collect();
    let (stop, restart) = base.thresholds();
    let raw = RawDeviceConfig::builder(
        next_revision(base)?,
        stop,
        restart,
        base.max_sample_age_ms(),
        base.timing(),
        base.schedule().run_duration_seconds(),
        *bearer.bytes(),
    )
    .schedule_entries(&entries)
    .map_err(|_| Error::BadRequest)?
    .timezone_rule(base.timezone_rule())
    .map_err(|_| Error::BadRequest)?
    .calibration(base.calibration().map(|c| *c.data()))
    .pushover(base.pushover().copied())
    .build();
    ValidatedDeviceConfig::from_raw(raw).map_err(|_| Error::BadRequest)
}
