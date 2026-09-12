//! One shared Matter KV access object owns all application and protocol records.
use crystal_shim_core::runtime::Record;
use crystal_shim_core::RETAINED_STORAGE_KEY;
use p256::elliptic_curve::zeroize::Zeroize;
use rs_matter::error::{Error, ErrorCode};
use rs_matter::persist::KvBlobStoreAccess;

use crate::provisioning::{Provisioning, STORAGE_KEY};

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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InstallOutcome {
    StoredVerified,
    AlreadyPresentVerified,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum InstallError {
    InvalidRecord,
    Conflict,
    Storage,
    Verification,
}

/// The app's erased local service interface and host tests use the same operation.
pub trait ProvisionStore {
    fn install(&self, bytes: &[u8]) -> Result<InstallOutcome, InstallError>;
}

impl<K: KvBlobStoreAccess> ProvisionStore for K {
    fn install(&self, bytes: &[u8]) -> Result<InstallOutcome, InstallError> {
        install_provisioning(self, bytes)
    }
}

/// A failure after mutation may still have committed the identity. Never erase
/// it as rollback: a fresh identical retry resolves an uncertain final result.
pub fn install_provisioning(
    kv: &impl KvBlobStoreAccess,
    bytes: &[u8],
) -> Result<InstallOutcome, InstallError> {
    Provisioning::decode(bytes).map_err(|_| InstallError::InvalidRecord)?;
    kv.access(|store, scratch| {
        let result = (|| {
            if let Some(existing) = store
                .load(STORAGE_KEY, scratch)
                .map_err(|_| InstallError::Storage)?
            {
                return if existing == bytes {
                    Ok(InstallOutcome::AlreadyPresentVerified)
                } else {
                    Err(InstallError::Conflict)
                };
            }
            store
                .store(STORAGE_KEY, bytes, scratch)
                .map_err(|_| InstallError::Storage)?;
            let readback = store
                .load(STORAGE_KEY, scratch)
                .map_err(|_| InstallError::Storage)?;
            if readback != Some(bytes) {
                return Err(InstallError::Verification);
            }
            Ok(InstallOutcome::StoredVerified)
        })();
        scratch.zeroize();
        result
    })
}
