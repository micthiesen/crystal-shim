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
#[path = "support/provision_record.rs"]
mod provision_record;
use crystal_shim_matter::{
    provisioning::STORAGE_KEY as PROVISIONING_KEY,
    storage::{install_provisioning, InstallError, InstallOutcome},
};

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

#[derive(Clone)]
struct Memory {
    bytes: Vec<u8>,
    operations: Vec<Range<u32>>,
    fail_next: bool,
    fail_at: Option<usize>,
    mutations: usize,
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
        let boundary_failure = memory.fail_at == Some(memory.operations.len());
        if boundary_failure {
            memory.fail_at = None;
        }
        if std::mem::take(&mut memory.fail_next) || boundary_failure {
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
        self.memory.borrow_mut().mutations += 1;
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
        self.memory.borrow_mut().mutations += 1;
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
        fail_at: None,
        mutations: 0,
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
        fail_at: None,
        mutations: 0,
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

fn with_store<R>(
    memory: Rc<RefCell<Memory>>,
    f: impl FnOnce(&SharedKvBlobStore<'_, production::Store, { production::SCRATCH_BYTES }>) -> R,
) -> R {
    let mut scratch = [0; production::SCRATCH_BYTES];
    let store =
        production::Store::open(peripherals::FLASH(memory, PhantomData), &mut scratch).unwrap();
    let buffer = Mutex::new(MatterCell::new(scratch));
    f(&SharedKvBlobStore::new(store, &buffer))
}

fn empty_memory() -> Rc<RefCell<Memory>> {
    Rc::new(RefCell::new(Memory {
        bytes: vec![0xff; 16_384],
        operations: Vec::new(),
        fail_next: false,
        fail_at: None,
        mutations: 0,
    }))
}

#[test]
fn initial_provisioning_is_verified_idempotent_and_never_replaces_other_identity() {
    let memory = empty_memory();
    let bytes = provision_record::record();
    with_store(memory.clone(), |kv| {
        assert_eq!(
            install_provisioning(kv, &bytes),
            Ok(InstallOutcome::StoredVerified)
        );
        let mutations = memory.borrow().mutations;
        assert_eq!(
            install_provisioning(kv, &bytes),
            Ok(InstallOutcome::AlreadyPresentVerified)
        );
        assert_eq!(memory.borrow().mutations, mutations);
        kv.access(|_, scratch| assert!(scratch.iter().all(|byte| *byte == 0)));
    });
    with_store(memory.clone(), |kv| {
        assert_eq!(
            install_provisioning(kv, &bytes),
            Ok(InstallOutcome::AlreadyPresentVerified)
        );
    });
    let memory = empty_memory();
    with_store(memory.clone(), |kv| {
        kv.access(|store, scratch| {
            store.store(PROVISIONING_KEY, b"invalid existing identity", scratch)
        })
        .unwrap();
        let mutations = memory.borrow().mutations;
        assert_eq!(
            install_provisioning(kv, &bytes),
            Err(InstallError::Conflict)
        );
        assert_eq!(memory.borrow().mutations, mutations);
        kv.access(|store, scratch| {
            assert_eq!(
                store.load(PROVISIONING_KEY, scratch).unwrap().unwrap(),
                b"invalid existing identity"
            )
        });
    });
}

#[test]
fn every_raw_installation_boundary_can_fail_without_losing_other_keys_and_retry_recovers() {
    let initial = empty_memory();
    // Deliberate raw map sentinels, not claimed valid boot configurations.
    let sentinels = [
        (
            production::CONFIGURATION_STORAGE_KEY,
            b"configuration sentinel".as_slice(),
        ),
        (RETAINED_STORAGE_KEY, b"retained sentinel"),
        (NETWORKS_KEY, b"network sentinel"),
    ];
    with_store(initial.clone(), |kv| {
        for (key, value) in sentinels {
            kv.access(|store, scratch| store.store(key, value, scratch))
                .unwrap();
        }
        // Leave insufficient append space so installing the larger identity
        // also exercises page advancement/erase checkpoints.
        for _ in 0..20 {
            kv.access(|store, scratch| store.store(0x5350, &[0xcc; 512], scratch))
                .unwrap();
        }
    });
    let baseline = initial.borrow().clone();
    let bytes = provision_record::record();
    with_store(initial.clone(), |kv| {
        assert_eq!(
            install_provisioning(kv, &bytes),
            Ok(InstallOutcome::StoredVerified)
        );
    });
    let operation_count = initial.borrow().operations.len() - baseline.operations.len();
    assert!(operation_count > 20);
    assert!(initial.borrow().operations[baseline.operations.len()..]
        .iter()
        .any(|range| range.end - range.start == 4096));
    for boundary in 0..operation_count {
        let memory = Rc::new(RefCell::new(baseline.clone()));
        memory.borrow_mut().fail_at = Some(baseline.operations.len() + boundary);
        with_store(memory.clone(), |kv| {
            assert!(
                install_provisioning(kv, &bytes).is_err(),
                "boundary {boundary}"
            );
            kv.access(|_, scratch| assert!(scratch.iter().all(|byte| *byte == 0)));
        });
        assert!(!PERMIT.get());
        // Reopen without volatile map state, recovering an interrupted record or
        // discovering a commit whose final readback/receipt was interrupted.
        with_store(memory.clone(), |kv| {
            for (key, value) in sentinels {
                kv.access(|store, scratch| {
                    assert_eq!(store.load(key, scratch).unwrap().unwrap(), value)
                });
            }
            assert!(
                install_provisioning(kv, &bytes).is_ok(),
                "retry boundary {boundary}"
            );
            assert_eq!(
                install_provisioning(kv, &bytes),
                Ok(InstallOutcome::AlreadyPresentVerified)
            );
        });
    }
    with_store(initial, |kv| {
        assert_eq!(
            install_provisioning(kv, &bytes),
            Ok(InstallOutcome::AlreadyPresentVerified)
        );
    });
}
