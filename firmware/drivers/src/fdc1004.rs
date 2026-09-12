//! FDC1004 out-of-phase acquisition, SNOSCY5C sections 6.5.3 and 6.6.
//!
//! Each frame consists of three single conversions: CIN1-CIN4, CIN2-CIN4,
//! CIN3-CIN4. CIN4 is physically open. This selects opposite-phase SHLD2 without
//! CAPDAC. Repeated mode is deliberately disabled so results cannot be overwritten
//! between the required MSB and LSB reads.
//!
//! The HAL must bound each I2C transaction independently (5 ms integration limit).
//! Run this future in the acquisition task, never in the relay-control task.
//! Cancellation or any acquisition error requires initialization before reuse.

use embedded_hal_async::{delay::DelayNs, i2c::I2c};

const ADDRESS: u8 = 0x50;
const FDC_CONF: u8 = 0x0c;
const RESET: u16 = 0x8000;
const RATE_100: u16 = 0x0400;
const CONFIGS: [u16; 3] = [0x0c00, 0x2c00, 0x4c00];
const CONVERSION_TIMEOUT_MS: u64 = 40;
const FRAME_TIMEOUT_MS: u64 = 100;
const RAW_LIMIT: i32 = 15 * (1 << 19);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error<E> {
    Bus(E),
    NotInitialized,
    WrongDevice { manufacturer: u16, device: u16 },
    ConfigurationChanged { register: u8, actual: u16 },
    Timeout,
    ClockWentBackwards,
    MalformedResult,
    OutsideConverterRange,
}

/// Integer capacitance in units of 2^-19 pF, before tank calibration.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RawCapacitance(i32);

impl RawCapacitance {
    pub const fn counts(self) -> i32 {
        self.0
    }
}

/// One complete ordered set. `started_ms` is the conservative freshness timestamp:
/// the three electrodes are sampled sequentially, not simultaneously.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Frame {
    pub level: RawCapacitance,
    pub wet_reference: RawCapacitance,
    pub dry_reference: RawCapacitance,
    pub started_ms: u64,
    pub completed_ms: u64,
}

pub struct Fdc1004<I> {
    bus: I,
    initialized: bool,
    last_time: Option<u64>,
}

impl<I: I2c> Fdc1004<I> {
    pub const fn new(bus: I) -> Self {
        Self {
            bus,
            initialized: false,
            last_time: None,
        }
    }

    /// Return peripheral ownership for HAL recovery. Construct and initialize a new
    /// driver afterward; recovery cannot leave a previous frame marked valid.
    pub fn into_inner(self) -> I {
        self.bus
    }

    /// Recover/reset the bus peripheral separately before calling this after a
    /// cancelled or failed I2C transaction. Reset also restores gain/offset defaults.
    pub async fn initialize<D: DelayNs>(
        &mut self,
        delay: &mut D,
        now: impl Fn() -> u64,
    ) -> Result<(), Error<I::Error>> {
        self.initialized = false;
        // Initialization is also the explicit recovery boundary after a clock fault.
        self.last_time = None;
        let started = self.time(&now)?;
        let manufacturer = self.read(0xfe).await?;
        let device = self.read(0xff).await?;
        if manufacturer != 0x5449 || device != 0x1004 {
            return Err(Error::WrongDevice {
                manufacturer,
                device,
            });
        }
        self.write(FDC_CONF, RESET).await?;
        for attempt in 0..40 {
            let status = self.read(FDC_CONF).await?;
            self.deadline(&now, started, CONVERSION_TIMEOUT_MS)?;
            if status & RESET == 0 {
                break;
            }
            if attempt == 39 {
                return Err(Error::Timeout);
            }
            delay.delay_ms(1).await;
        }
        for (index, config) in CONFIGS.into_iter().enumerate() {
            self.write(0x08 + index as u8, config).await?;
        }
        self.verify_configuration().await?;
        self.deadline(&now, started, FRAME_TIMEOUT_MS)?;
        self.initialized = true;
        Ok(())
    }

    /// Acquire a complete frame or return an error without publishing partial data.
    /// Even cancellation between awaits invalidates the driver until reinitialized.
    pub async fn acquire<D: DelayNs>(
        &mut self,
        delay: &mut D,
        now: impl Fn() -> u64,
    ) -> Result<Frame, Error<I::Error>> {
        if !self.initialized {
            return Err(Error::NotInitialized);
        }
        self.initialized = false;
        let started_ms = self.time(&now)?;
        self.verify_configuration().await?;
        let mut values = [RawCapacitance(0); 3];
        for (index, value) in values.iter_mut().enumerate() {
            // Section 6.5.3.2 permits only one MEAS bit for a single trigger.
            // REPEAT=0; the example 0x0540 in that section contradicts its own
            // bit definition. Table 6-5 is authoritative: use 0x0440 for MEAS2.
            self.write(FDC_CONF, RATE_100 | (0x80 >> index)).await?;
            let conversion_started = self.time(&now)?;
            for attempt in 0..40 {
                let status = self.read(FDC_CONF).await?;
                self.deadline(&now, conversion_started, CONVERSION_TIMEOUT_MS)?;
                self.deadline(&now, started_ms, FRAME_TIMEOUT_MS)?;
                if status & (RESET | 0x0100) != 0 {
                    return Err(Error::ConfigurationChanged {
                        register: FDC_CONF,
                        actual: status,
                    });
                }
                if status & (0x08 >> index) != 0 {
                    break;
                }
                if attempt == 39 {
                    return Err(Error::Timeout);
                }
                delay.delay_ms(1).await;
            }
            let register = 2 * index as u8;
            let msb = self.read(register).await?;
            let lsb = self.read(register + 1).await?;
            *value = decode(msb, lsb)?;
        }
        // A brownout partway through the frame must not pass as three valid zeros.
        self.verify_configuration().await?;
        let completed_ms = self.deadline(&now, started_ms, FRAME_TIMEOUT_MS)?;
        self.initialized = true;
        Ok(Frame {
            level: values[0],
            wet_reference: values[1],
            dry_reference: values[2],
            started_ms,
            completed_ms,
        })
    }

    async fn verify_configuration(&mut self) -> Result<(), Error<I::Error>> {
        for (index, expected) in CONFIGS.into_iter().enumerate() {
            let register = 0x08 + index as u8;
            let actual = self.read(register).await?;
            if actual != expected {
                return Err(Error::ConfigurationChanged { register, actual });
            }
        }
        Ok(())
    }

    fn time(&mut self, now: &impl Fn() -> u64) -> Result<u64, Error<I::Error>> {
        let value = now();
        if self.last_time.is_some_and(|previous| value < previous) {
            return Err(Error::ClockWentBackwards);
        }
        self.last_time = Some(value);
        Ok(value)
    }

    fn deadline(
        &mut self,
        now: &impl Fn() -> u64,
        started: u64,
        maximum_ms: u64,
    ) -> Result<u64, Error<I::Error>> {
        let value = self.time(now)?;
        if value - started >= maximum_ms {
            Err(Error::Timeout)
        } else {
            Ok(value)
        }
    }

    async fn read(&mut self, register: u8) -> Result<u16, Error<I::Error>> {
        let mut bytes = [0; 2];
        self.bus
            .write_read(ADDRESS, &[register], &mut bytes)
            .await
            .map_err(Error::Bus)?;
        Ok(u16::from_be_bytes(bytes))
    }

    async fn write(&mut self, register: u8, value: u16) -> Result<(), Error<I::Error>> {
        let [high, low] = value.to_be_bytes();
        self.bus
            .write(ADDRESS, &[register, high, low])
            .await
            .map_err(Error::Bus)
    }
}

fn decode<E>(msb: u16, lsb: u16) -> Result<RawCapacitance, Error<E>> {
    if lsb & 0xff != 0 {
        return Err(Error::MalformedResult);
    }
    let signed = ((u32::from(msb) << 16 | u32::from(lsb)) as i32) >> 8;
    if signed <= -RAW_LIMIT || signed >= RAW_LIMIT {
        return Err(Error::OutsideConverterRange);
    }
    Ok(RawCapacitance(signed))
}

#[cfg(test)]
mod tests;
