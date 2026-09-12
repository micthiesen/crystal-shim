//! Compile the actual app owner/adapter against a deterministic NOR backend.
extern crate self as esp_hal;
extern crate self as esp_storage;

use core::marker::PhantomData;
use crystal_shim_core::{runtime::Record, RetainedState, RETAINED_STORAGE_KEY};
use crystal_shim_matter::sdk::utils::{cell::RefCell as MatterCell, sync::blocking::Mutex};
use crystal_shim_matter::{
    sdk::persist::{KvBlobStoreAccess, SharedKvBlobStore, NETWORKS_KEY},
    storage::apply,
};
use embedded_storage::nor_flash::{
    ErrorType, NorFlash, NorFlashError, NorFlashErrorKind, ReadNorFlash,
};
use std::{
    cell::{Cell, RefCell},
    ops::Range,
    rc::Rc,
};

#[path = "../../app/src/storage.rs"]
mod production;

thread_local! {
    static PERMIT: Cell<bool> = const { Cell::new(false) };
    static CHECKPOINT: Cell<bool> = const { Cell::new(false) };
}

mod flash_gate {
    #[derive(Clone, Copy, Debug)]
    pub struct Error;
    pub struct Permit;
    impl Permit {
        pub fn acquire() -> Result<Self, Error> {
            if super::PERMIT.replace(true) {
                return Err(Error);
            }
            super::CHECKPOINT.set(false);
            Ok(Self)
        }
        pub fn checkpoint(&mut self) -> Result<(), Error> {
            assert!(super::PERMIT.get());
            assert!(!super::CHECKPOINT.replace(true));
            Ok(())
        }
    }
    impl Drop for Permit {
        fn drop(&mut self) {
            assert!(super::PERMIT.replace(false));
            super::CHECKPOINT.set(false);
        }
    }
}

mod partition {
    pub fn nvs_range(
        _flash: &mut crate::FlashStorage<'_>,
        _buffer: &mut [u8],
    ) -> Result<core::ops::Range<u32>, ()> {
        assert!(crate::PERMIT.get());
        Ok(0..16_384)
    }
}

pub mod peripherals {
    pub struct FLASH<'a>(
        pub(super) std::rc::Rc<std::cell::RefCell<super::Memory>>,
        pub(super) core::marker::PhantomData<&'a ()>,
    );
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FlashStorageError {
    NotAligned,
    OutOfBounds,
    Other(u32),
}
impl NorFlashError for FlashStorageError {
    fn kind(&self) -> NorFlashErrorKind {
        NorFlashErrorKind::Other
    }
}

struct Memory {
    bytes: Vec<u8>,
    operations: Vec<Range<u32>>,
    fail_next: bool,
}
pub struct FlashStorage<'a> {
    memory: Rc<RefCell<Memory>>,
    lifetime: PhantomData<&'a ()>,
}
impl FlashStorage<'_> {
    pub fn new(flash: peripherals::FLASH<'_>) -> Self {
        Self {
            memory: flash.0,
            lifetime: PhantomData,
        }
    }
    fn access(&self, range: Range<u32>, max_len: u32) -> Result<(), FlashStorageError> {
        assert!(PERMIT.get(), "raw operation outside the owner permit");
        assert!(
            CHECKPOINT.replace(false),
            "raw operation without a fresh checkpoint"
        );
        assert!(range.end - range.start <= max_len);
        let mut memory = self.memory.borrow_mut();
        if std::mem::take(&mut memory.fail_next) {
            return Err(FlashStorageError::Other(1));
        }
        memory.operations.push(range);
        Ok(())
    }
}
impl ErrorType for FlashStorage<'_> {
    type Error = FlashStorageError;
}
impl ReadNorFlash for FlashStorage<'_> {
    const READ_SIZE: usize = 4;
    fn read(&mut self, offset: u32, bytes: &mut [u8]) -> Result<(), Self::Error> {
        self.access(offset..offset + bytes.len() as u32, 256)?;
        bytes.copy_from_slice(
            &self.memory.borrow().bytes[offset as usize..offset as usize + bytes.len()],
        );
        Ok(())
    }
    fn capacity(&self) -> usize {
        self.memory.borrow().bytes.len()
    }
}
impl NorFlash for FlashStorage<'_> {
    const WRITE_SIZE: usize = 4;
    const ERASE_SIZE: usize = 4096;
    fn write(&mut self, offset: u32, bytes: &[u8]) -> Result<(), Self::Error> {
        self.access(offset..offset + bytes.len() as u32, 256)?;
        assert!(offset as usize % 256 + bytes.len() <= 256);
        for (old, new) in self.memory.borrow_mut().bytes
            [offset as usize..offset as usize + bytes.len()]
            .iter_mut()
            .zip(bytes)
        {
            assert_eq!(
                *old & *new,
                *new,
                "NOR programming cannot restore a zero bit"
            );
            *old = *new;
        }
        Ok(())
    }
    fn erase(&mut self, from: u32, to: u32) -> Result<(), Self::Error> {
        self.access(from..to, 4096)?;
        assert_eq!(to - from, 4096);
        self.memory.borrow_mut().bytes[from as usize..to as usize].fill(0xff);
        Ok(())
    }
}

#[test]
fn real_owner_shares_matter_and_application_records_through_gated_load_store_remove() {
    let memory = Rc::new(RefCell::new(Memory {
        bytes: vec![0xff; 16_384],
        operations: Vec::new(),
        fail_next: false,
    }));
    let mut scratch = [0; production::SCRATCH_BYTES];
    let mut store = production::Store::open(
        peripherals::FLASH(memory.clone(), PhantomData),
        &mut scratch,
    )
    .unwrap();
    let boot = store.load_boot(&mut scratch).unwrap();
    assert!(boot.configuration.is_none());
    assert!(boot.retained.is_none());
    let buffer = Mutex::new(MatterCell::new(scratch));
    let kv = SharedKvBlobStore::new(store, &buffer);
    kv.access(|store, buf| store.store(NETWORKS_KEY, b"public fixture", buf))
        .unwrap();
    let state = RetainedState::new(1).unwrap();
    apply(&kv, Record::Retained(state)).unwrap();
    kv.access(|store, buf| {
        assert_eq!(
            store.load(NETWORKS_KEY, buf).unwrap().unwrap(),
            b"public fixture"
        );
        store.remove(NETWORKS_KEY, buf).unwrap();
        store.remove(NETWORKS_KEY, buf).unwrap();
        assert!(store.load(NETWORKS_KEY, buf).unwrap().is_none());
        assert_eq!(
            store.load(RETAINED_STORAGE_KEY, buf).unwrap().unwrap(),
            state.encode().unwrap()
        );
    });
    assert!(!PERMIT.get());
    assert!(!memory.borrow().operations.is_empty());
    // Trigger map migration/garbage collection while retaining the safety key.
    for value in 0..40u8 {
        kv.access(|store, buf| store.store(NETWORKS_KEY, &[value; 512], buf))
            .unwrap();
    }
    kv.access(|store, buf| {
        assert_eq!(
            store.load(RETAINED_STORAGE_KEY, buf).unwrap().unwrap(),
            state.encode().unwrap()
        )
    });
    assert!(!PERMIT.get());
}

#[test]
fn every_protocol_operation_returns_failure_and_releases_its_permit_after_driver_error() {
    let memory = Rc::new(RefCell::new(Memory {
        bytes: vec![0xff; 16_384],
        operations: Vec::new(),
        fail_next: false,
    }));
    let mut scratch = [0; production::SCRATCH_BYTES];
    let store = production::Store::open(
        peripherals::FLASH(memory.clone(), PhantomData),
        &mut scratch,
    )
    .unwrap();
    let buffer = Mutex::new(MatterCell::new(scratch));
    let kv = SharedKvBlobStore::new(store, &buffer);
    for operation in 0..3 {
        memory.borrow_mut().fail_next = true;
        kv.access(|store, buf| {
            let result = match operation {
                0 => store.load(NETWORKS_KEY, buf).map(|_| ()),
                1 => store.store(NETWORKS_KEY, b"fixture", buf),
                _ => store.remove(NETWORKS_KEY, buf),
            };
            assert!(result.is_err());
        });
        assert!(!PERMIT.get());
        kv.access(|store, buf| store.store(NETWORKS_KEY, b"fixture", buf))
            .unwrap();
    }
}
