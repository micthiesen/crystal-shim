//! One shared Matter KV access object owns all application and protocol records.
use crystal_shim_core::runtime::Record;
use crystal_shim_core::RETAINED_STORAGE_KEY;
use rs_matter::error::{Error, ErrorCode};
use rs_matter::persist::KvBlobStoreAccess;

pub const CONFIGURATION_STORAGE_KEY: u16 = 0x4346;

pub fn apply(kv: &impl KvBlobStoreAccess, record: Record) -> Result<(), Error> {
    kv.access(|store, scratch| match record {
        Record::Retained(state) => {
            let bytes = state.encode().map_err(|_| ErrorCode::InvalidData)?;
            store.store(RETAINED_STORAGE_KEY, &bytes, scratch)
        }
        Record::Configuration(config) => {
            let bytes = config.encode().map_err(|_| ErrorCode::InvalidData)?;
            store.store(CONFIGURATION_STORAGE_KEY, bytes.as_bytes(), scratch)
        }
    })
}
