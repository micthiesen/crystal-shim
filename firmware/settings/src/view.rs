use crate::Error;
use core::fmt::{self, Write};
use crystal_shim_core::{configuration::ValidatedDeviceConfig, State};

#[derive(Clone, Copy)]
pub struct Status {
    pub relay_on: bool,
    pub durable_maintenance: bool,
    pub storage_failed: bool,
    pub clock_available: bool,
    pub state: State,
}
impl Status {
    pub const EMPTY: Self = Self {
        relay_on: false,
        durable_maintenance: false,
        storage_failed: false,
        clock_available: false,
        state: State::Boot,
    };
}
impl Default for Status {
    fn default() -> Self {
        Self::EMPTY
    }
}
#[derive(Clone, Copy)]
pub struct Snapshot {
    pub configuration: ValidatedDeviceConfig,
    pub status: Status,
}

pub(crate) struct Json<'a> {
    bytes: &'a mut [u8],
    len: usize,
}
impl<'a> Json<'a> {
    pub fn new(bytes: &'a mut [u8]) -> Self {
        Self { bytes, len: 0 }
    }
    pub fn len(&self) -> usize {
        self.len
    }
    pub fn string(&mut self, text: &str) -> fmt::Result {
        self.write_str("\"")?;
        for c in text.chars() {
            match c {
                '"' => self.write_str("\\\"")?,
                '\\' => self.write_str("\\\\")?,
                c if c < ' ' => write!(self, "\\u{:04x}", c as u32)?,
                c => self.write_char(c)?,
            }
        }
        self.write_str("\"")
    }
}
impl Write for Json<'_> {
    fn write_str(&mut self, text: &str) -> fmt::Result {
        let end = self
            .len
            .checked_add(text.len())
            .filter(|n| *n <= self.bytes.len())
            .ok_or(fmt::Error)?;
        self.bytes[self.len..end].copy_from_slice(text.as_bytes());
        self.len = end;
        Ok(())
    }
}
impl Snapshot {
    pub fn config_json(&self, bytes: &mut [u8]) -> Result<usize, Error> {
        let c = self.configuration;
        let mut out = Json::new(bytes);
        let (stop, restart) = c.thresholds();
        write!(out,"{{\"revision\":{},\"stop_level\":{stop},\"restart_level\":{restart},\"duration_seconds\":{},\"calibrated\":{},\"pushover_configured\":{},\"timezone\":",c.revision(),c.schedule().run_duration_seconds(),c.calibration().is_some(),c.pushover().is_some()).map_err(|_|Error::TooLarge)?;
        out.string(c.timezone_rule()).map_err(|_| Error::TooLarge)?;
        out.write_str(",\"entries\":[")
            .map_err(|_| Error::TooLarge)?;
        for (i, e) in c.schedule().entries().iter().enumerate() {
            if i > 0 {
                out.write_str(",").map_err(|_| Error::TooLarge)?;
            }
            write!(
                out,
                "{{\"id\":{},\"days\":{},\"start_second\":{}}}",
                e.id(),
                e.days().bits(),
                e.start_second()
            )
            .map_err(|_| Error::TooLarge)?;
        }
        out.write_str("]}").map_err(|_| Error::TooLarge)?;
        Ok(out.len())
    }
    pub fn status_json(&self, bytes: &mut [u8]) -> Result<usize, Error> {
        let mut out = Json::new(bytes);
        let s = self.status;
        let name = match s.state {
            State::Boot => "boot",
            State::Idle => "idle",
            State::Low => "low",
            State::Recovering => "recovering",
            State::Running => "running",
            State::Maintenance => "maintenance",
            State::Fault(_) => "fault",
        };
        write!(out,"{{\"revision\":{},\"relay_on\":{},\"maintenance\":{},\"durable_maintenance\":{},\"storage_failed\":{},\"clock_available\":{},\"state\":\"{name}\"}}",self.configuration.revision(),s.relay_on,matches!(s.state,State::Maintenance),s.durable_maintenance,s.storage_failed,s.clock_available).map_err(|_|Error::TooLarge)?;
        Ok(out.len())
    }
}
