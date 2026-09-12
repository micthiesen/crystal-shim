//! One owner of the first NVS partition, matching Stillair's sequential-storage format.
//! Every operation holds a relay-off permit; no stored bytes are logged.
use crate::flash_gate::{self, Permit};
use core::ops::Range;
use crystal_shim_core::{
    configuration::ValidatedDeviceConfig, load_retained, ConfigurationLifecycle,
    LoadedRetainedState, RETAINED_STORAGE_KEY,
};
use crystal_shim_matter::sdk::error::{Error as MatterError, ErrorCode};
use crystal_shim_matter::sdk::persist::KvBlobStore;
use embedded_storage::nor_flash::{NorFlash as _, ReadNorFlash as _};
use embedded_storage_async::nor_flash::{ErrorType, MultiwriteNorFlash, NorFlash, ReadNorFlash};
use esp_hal::peripherals::FLASH;
use esp_storage::{FlashStorage, FlashStorageError};
use sequential_storage::cache::NoCache;

pub use crystal_shim_matter::storage::CONFIGURATION_STORAGE_KEY;
pub const SCRATCH_BYTES: usize = 4096;

#[derive(Clone, Copy, Debug)]
pub enum Error {
    Gate,
    Partition,
    Flash,
    Configuration,
    Retained,
}
impl From<flash_gate::Error> for Error {
    fn from(_: flash_gate::Error) -> Self {
        Self::Gate
    }
}

pub struct BootState {
    pub configuration: Option<ValidatedDeviceConfig>,
    pub retained: Option<LoadedRetainedState>,
}

pub struct Store {
    flash: FlashStorage<'static>,
    range: Range<u32>,
    cache: NoCache,
}

impl Store {
    pub fn open(flash: FLASH<'static>, table_buffer: &mut [u8]) -> Result<Self, Error> {
        let _permit = Permit::acquire()?;
        let mut flash = FlashStorage::new(flash);
        let range =
            crate::partition::nvs_range(&mut flash, table_buffer).map_err(|_| Error::Partition)?;
        Ok(Self {
            flash,
            range,
            cache: NoCache::new(),
        })
    }

    pub fn load<'a>(&mut self, key: u16, buf: &'a mut [u8]) -> Result<Option<&'a [u8]>, Error> {
        let mut permit = Permit::acquire()?;
        let mut flash = Access {
            flash: &mut self.flash,
            permit: &mut permit,
        };
        embassy_futures::block_on(sequential_storage::map::fetch_item(
            &mut flash,
            self.range.clone(),
            &mut self.cache,
            buf,
            &key,
        ))
        .map_err(|_| Error::Flash)
    }

    pub fn store(&mut self, key: u16, value: &[u8], buf: &mut [u8]) -> Result<(), Error> {
        let mut permit = Permit::acquire()?;
        let mut flash = Access {
            flash: &mut self.flash,
            permit: &mut permit,
        };
        embassy_futures::block_on(sequential_storage::map::store_item(
            &mut flash,
            self.range.clone(),
            &mut self.cache,
            buf,
            &key,
            &value,
        ))
        .map_err(|_| Error::Flash)
    }

    fn remove(&mut self, key: u16, buf: &mut [u8]) -> Result<(), Error> {
        let mut permit = Permit::acquire()?;
        let mut flash = Access {
            flash: &mut self.flash,
            permit: &mut permit,
        };
        embassy_futures::block_on(sequential_storage::map::remove_item(
            &mut flash,
            self.range.clone(),
            &mut self.cache,
            buf,
            &key,
        ))
        .map_err(|_| Error::Flash)
    }

    pub fn load_boot(&mut self, buf: &mut [u8]) -> Result<BootState, Error> {
        let configuration = self
            .load(CONFIGURATION_STORAGE_KEY, buf)?
            .map(ValidatedDeviceConfig::decode)
            .transpose()
            .map_err(|_| Error::Configuration)?;
        let lifecycle =
            configuration
                .as_ref()
                .map_or(ConfigurationLifecycle::NeverConfigured, |config| {
                    ConfigurationLifecycle::Configured {
                        revision: config.revision(),
                    }
                });
        let mut retained = load_retained(self.load(RETAINED_STORAGE_KEY, buf)?, lifecycle)
            .map_err(|_| Error::Retained)?;
        if let Some(loaded) = retained.as_mut().filter(|loaded| loaded.must_store) {
            // A reset during this repair still sees the old record and applies the same
            // safe recovery. No runtime settings are published until this succeeds.
            let bytes = loaded.state.encode().map_err(|_| Error::Retained)?;
            self.store(RETAINED_STORAGE_KEY, &bytes, buf)?;
            loaded.must_store = false;
        }
        Ok(BootState {
            configuration,
            retained,
        })
    }
}

impl KvBlobStore for Store {
    fn load<'a>(&mut self, key: u16, buf: &'a mut [u8]) -> Result<Option<&'a [u8]>, MatterError> {
        Store::load(self, key, buf).map_err(matter_error)
    }
    fn store(&mut self, key: u16, data: &[u8], buf: &mut [u8]) -> Result<(), MatterError> {
        Store::store(self, key, data, buf).map_err(matter_error)
    }
    fn remove(&mut self, key: u16, buf: &mut [u8]) -> Result<(), MatterError> {
        Store::remove(self, key, buf).map_err(matter_error)
    }
}
fn matter_error(_error: Error) -> MatterError {
    // Do not include raw driver details or stored bytes in protocol errors.
    ErrorCode::Failure.into()
}

/// Private borrowed driver cannot outlive the transaction's output exclusion.
struct Access<'a> {
    flash: &'a mut FlashStorage<'static>,
    permit: &'a mut Permit,
}
impl ErrorType for Access<'_> {
    type Error = FlashStorageError;
}
impl ReadNorFlash for Access<'_> {
    const READ_SIZE: usize = 4;
    async fn read(&mut self, offset: u32, bytes: &mut [u8]) -> Result<(), Self::Error> {
        // Validate the complete range before performing a partial access.
        check_range(offset, bytes.len(), self.flash.capacity(), 4)?;
        for (index, chunk) in bytes.chunks_mut(256).enumerate() {
            self.permit
                .checkpoint()
                .map_err(|_| FlashStorageError::Other(0))?;
            self.flash.read(offset + index as u32 * 256, chunk)?;
        }
        Ok(())
    }
    fn capacity(&self) -> usize {
        self.flash.capacity()
    }
}
impl NorFlash for Access<'_> {
    const WRITE_SIZE: usize = 4;
    const ERASE_SIZE: usize = 4096;
    async fn write(&mut self, offset: u32, bytes: &[u8]) -> Result<(), Self::Error> {
        check_range(offset, bytes.len(), self.flash.capacity(), 4)?;
        let mut completed = 0;
        while completed < bytes.len() {
            // Never cross a hardware page in one ROM call, even at an unaligned offset.
            let at = offset + completed as u32;
            let count = (256 - at as usize % 256).min(bytes.len() - completed);
            self.permit
                .checkpoint()
                .map_err(|_| FlashStorageError::Other(0))?;
            self.flash.write(at, &bytes[completed..completed + count])?;
            completed += count;
        }
        Ok(())
    }
    async fn erase(&mut self, from: u32, to: u32) -> Result<(), Self::Error> {
        let length = to.checked_sub(from).ok_or(FlashStorageError::OutOfBounds)?;
        check_range(from, length as usize, self.flash.capacity(), 4096)?;
        for address in (from..to).step_by(4096) {
            self.permit
                .checkpoint()
                .map_err(|_| FlashStorageError::Other(0))?;
            // Avoid esp-storage's 64 KiB block erase path (up to 3 seconds).
            self.flash.erase(address, address + 4096)?;
        }
        Ok(())
    }
}
impl MultiwriteNorFlash for Access<'_> {}

fn check_range(
    offset: u32,
    len: usize,
    capacity: usize,
    alignment: usize,
) -> Result<(), FlashStorageError> {
    if !(offset as usize).is_multiple_of(alignment) || !len.is_multiple_of(alignment) {
        return Err(FlashStorageError::NotAligned);
    }
    if len > capacity || offset as usize > capacity - len {
        return Err(FlashStorageError::OutOfBounds);
    }
    Ok(())
}
