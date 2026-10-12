//! The OTA updater's flash client: the same relay-off permit protocol as the NVS
//! store, restricted to programming `otadata` and the slot that is not running.
//! Every 256-byte read, page-contained program and 4 KiB sector erase is preceded
//! by its own completed control iteration. No stored bytes are logged.
use crate::flash_gate::Permit;
use core::ops::Range;
use embedded_storage::nor_flash::{
    ErrorType, NorFlash, NorFlashError, NorFlashErrorKind, ReadNorFlash,
};
use esp_storage::FlashStorage;

const CHUNK: u32 = 256;
const SECTOR: u32 = 4096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    NotAligned,
    OutOfBounds,
    /// A program or erase outside `otadata` and the spare slot.
    Denied,
    Gate,
    Flash,
}
impl NorFlashError for Error {
    fn kind(&self) -> NorFlashErrorKind {
        match self {
            Error::NotAligned => NorFlashErrorKind::NotAligned,
            Error::OutOfBounds | Error::Denied => NorFlashErrorKind::OutOfBounds,
            Error::Gate | Error::Flash => NorFlashErrorKind::Other,
        }
    }
}

pub struct OtaFlash {
    flash: FlashStorage<'static>,
    writable: [Range<u32>; 2],
    /// One aligned 256-byte block, so 64-byte verification reads cost one
    /// gated access per block. Any program or erase through this client drops it;
    /// the NVS store never writes these ranges.
    cache: Option<(u32, [u8; CHUNK as usize])>,
}

impl OtaFlash {
    pub fn new(flash: FlashStorage<'static>, writable: [Range<u32>; 2]) -> Self {
        Self {
            flash,
            writable,
            cache: None,
        }
    }

    fn check(&self, offset: u32, len: usize, align: u32) -> Result<u32, Error> {
        if !offset.is_multiple_of(align) || !len.is_multiple_of(align as usize) {
            return Err(Error::NotAligned);
        }
        let len = u32::try_from(len).map_err(|_| Error::OutOfBounds)?;
        let end = offset.checked_add(len).ok_or(Error::OutOfBounds)?;
        if end as usize > self.flash.capacity() {
            return Err(Error::OutOfBounds);
        }
        Ok(end)
    }

    fn check_writable(&self, offset: u32, end: u32) -> Result<(), Error> {
        if self
            .writable
            .iter()
            .any(|range| range.start <= offset && end <= range.end)
        {
            Ok(())
        } else {
            Err(Error::Denied)
        }
    }
}

/// Acquires on the first chunk; renews the acknowledgement before each later one.
fn next_access(permit: &mut Option<Permit>) -> Result<(), Error> {
    match permit {
        None => *permit = Some(Permit::acquire().map_err(|_| Error::Gate)?),
        Some(permit) => permit.checkpoint().map_err(|_| Error::Gate)?,
    }
    Ok(())
}

impl ErrorType for OtaFlash {
    type Error = Error;
}

impl ReadNorFlash for OtaFlash {
    const READ_SIZE: usize = 4;

    fn read(&mut self, offset: u32, bytes: &mut [u8]) -> Result<(), Error> {
        self.check(offset, bytes.len(), 4)?;
        let mut permit = None;
        let mut done = 0;
        while done < bytes.len() {
            let at = offset + done as u32;
            let block = at - at % CHUNK;
            let cached = match self.cache {
                Some((start, data)) if start == block => data,
                _ => {
                    // Capacity is a whole number of sectors, so a block never crosses it.
                    let mut data = [0u8; CHUNK as usize];
                    next_access(&mut permit)?;
                    self.flash
                        .read(block, &mut data)
                        .map_err(|_| Error::Flash)?;
                    self.cache = Some((block, data));
                    data
                }
            };
            let from = (at - block) as usize;
            let count = (CHUNK as usize - from).min(bytes.len() - done);
            bytes[done..done + count].copy_from_slice(&cached[from..from + count]);
            done += count;
        }
        Ok(())
    }

    fn capacity(&self) -> usize {
        self.flash.capacity()
    }
}

impl NorFlash for OtaFlash {
    const WRITE_SIZE: usize = 4;
    const ERASE_SIZE: usize = SECTOR as usize;

    fn write(&mut self, offset: u32, bytes: &[u8]) -> Result<(), Error> {
        let end = self.check(offset, bytes.len(), 4)?;
        self.check_writable(offset, end)?;
        self.cache = None;
        let mut permit = None;
        let mut done = 0;
        while done < bytes.len() {
            // Never cross a 256-byte program page in one ROM call.
            let at = offset + done as u32;
            let count = ((CHUNK - at % CHUNK) as usize).min(bytes.len() - done);
            next_access(&mut permit)?;
            self.flash
                .write(at, &bytes[done..done + count])
                .map_err(|_| Error::Flash)?;
            done += count;
        }
        Ok(())
    }

    fn erase(&mut self, from: u32, to: u32) -> Result<(), Error> {
        let len = to.checked_sub(from).ok_or(Error::OutOfBounds)?;
        self.check(from, len as usize, SECTOR)?;
        self.check_writable(from, to)?;
        self.cache = None;
        let mut permit = None;
        for sector in (from..to).step_by(SECTOR as usize) {
            next_access(&mut permit)?;
            // One sector per call: never esp-storage's 64 KiB block-erase path.
            self.flash
                .erase(sector, sector + SECTOR)
                .map_err(|_| Error::Flash)?;
        }
        Ok(())
    }
}
