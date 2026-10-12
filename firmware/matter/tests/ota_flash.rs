//! Drive the real esp-lan-ota updater through the app's gated OTA flash client.
extern crate self as esp_storage;

use core::marker::PhantomData;
use embedded_storage::nor_flash::{
    ErrorType, NorFlash, NorFlashError, NorFlashErrorKind, ReadNorFlash,
};
use esp_lan_ota::otadata::{Entry, ImageState};
use esp_lan_ota::{Chip, Identity, Name, Ota, Slot};
use sha2::{Digest, Sha256};
use std::{
    cell::{Cell, RefCell},
    ops::Range,
    rc::Rc,
};

#[path = "../../app/src/ota_flash.rs"]
mod production;
use production::{Error, OtaFlash};

thread_local! {
    static HELD: Cell<bool> = const { Cell::new(false) };
    static FRESH: Cell<bool> = const { Cell::new(false) };
}

/// Each acquisition or checkpoint stands for one completed relay-off iteration.
mod flash_gate {
    use super::{FRESH, HELD};
    #[derive(Debug)]
    pub struct Error;
    pub struct Permit;
    impl Permit {
        pub fn acquire() -> Result<Self, Error> {
            if HELD.replace(true) {
                return Err(Error);
            }
            FRESH.set(true);
            Ok(Self)
        }
        pub fn checkpoint(&mut self) -> Result<(), Error> {
            assert!(HELD.get());
            assert!(!FRESH.replace(true), "acknowledgement renewed without use");
            Ok(())
        }
    }
    impl Drop for Permit {
        fn drop(&mut self) {
            assert!(HELD.replace(false));
            FRESH.set(false);
        }
    }
}

const CAPACITY: usize = 8 * 1024 * 1024;
const NVS: Range<u32> = 0x9000..0xf000;
const OTADATA: Range<u32> = 0x10000..0x12000;
const OTA_0: Range<u32> = 0x20000..0x410000;
const OTA_1: Range<u32> = 0x410000..0x800000;

struct Memory {
    bytes: Vec<u8>,
    reads: usize,
    mutations: Vec<Range<u32>>,
}

pub struct FlashStorage<'a> {
    memory: Rc<RefCell<Memory>>,
    lifetime: PhantomData<&'a ()>,
}
impl FlashStorage<'_> {
    fn access(&self, range: &Range<u32>, max_len: u32) {
        assert!(HELD.get(), "raw access outside a permit");
        assert!(
            FRESH.replace(false),
            "raw access without its own acknowledgement"
        );
        assert!(range.end - range.start <= max_len);
    }
}
#[derive(Debug)]
pub struct MockError;
impl NorFlashError for MockError {
    fn kind(&self) -> NorFlashErrorKind {
        NorFlashErrorKind::Other
    }
}
impl ErrorType for FlashStorage<'_> {
    type Error = MockError;
}
impl ReadNorFlash for FlashStorage<'_> {
    const READ_SIZE: usize = 4;
    fn read(&mut self, offset: u32, bytes: &mut [u8]) -> Result<(), MockError> {
        let range = offset..offset + bytes.len() as u32;
        self.access(&range, 256);
        let mut memory = self.memory.borrow_mut();
        memory.reads += 1;
        bytes.copy_from_slice(&memory.bytes[range.start as usize..range.end as usize]);
        Ok(())
    }
    fn capacity(&self) -> usize {
        CAPACITY
    }
}
impl NorFlash for FlashStorage<'_> {
    const WRITE_SIZE: usize = 4;
    const ERASE_SIZE: usize = 4096;
    fn write(&mut self, offset: u32, bytes: &[u8]) -> Result<(), MockError> {
        let range = offset..offset + bytes.len() as u32;
        self.access(&range, 256);
        assert!(offset as usize % 256 + bytes.len() <= 256, "crosses a page");
        let mut memory = self.memory.borrow_mut();
        for (old, new) in memory.bytes[range.start as usize..range.end as usize]
            .iter_mut()
            .zip(bytes)
        {
            assert_eq!(*old & *new, *new, "NOR programming cannot set a bit");
            *old = *new;
        }
        memory.mutations.push(range);
        Ok(())
    }
    fn erase(&mut self, from: u32, to: u32) -> Result<(), MockError> {
        self.access(&(from..to), 4096);
        assert_eq!(to - from, 4096);
        let mut memory = self.memory.borrow_mut();
        memory.bytes[from as usize..to as usize].fill(0xff);
        memory.mutations.push(from..to);
        Ok(())
    }
}

/// The shipped table from `firmware/app/partitions.csv` at 0x8000, the running
/// image in ota_0, distinct NVS bytes, and the record the rollback bootloader
/// writes when it starts ota_0 from an erased otadata.
fn device() -> Rc<RefCell<Memory>> {
    let mut bytes = vec![0xff; CAPACITY];
    let number = |text: &str| u32::from_str_radix(text.trim_start_matches("0x"), 16).unwrap();
    let rows = include_str!("../../app/partitions.csv")
        .lines()
        .filter(|line| !line.starts_with('#') && !line.trim().is_empty());
    for (index, line) in rows.enumerate() {
        let fields: Vec<&str> = line.split(',').map(str::trim).collect();
        let (kind, subtype) = match (fields[1], fields[2]) {
            ("data", "nvs") => (1, 2),
            ("data", "phy") => (1, 1),
            ("data", "ota") => (1, 0),
            ("app", "ota_0") => (0, 0x10),
            ("app", "ota_1") => (0, 0x11),
            other => panic!("unexpected partition {other:?}"),
        };
        let at = 0x8000 + index * 32;
        bytes[at..at + 2].copy_from_slice(&[0xaa, 0x50]);
        bytes[at + 2] = kind;
        bytes[at + 3] = subtype;
        bytes[at + 4..at + 8].copy_from_slice(&number(fields[3]).to_le_bytes());
        bytes[at + 8..at + 12].copy_from_slice(&number(fields[4]).to_le_bytes());
    }
    bytes[NVS.start as usize..NVS.end as usize].fill(0x5a);
    bytes[OTA_0.start as usize..OTA_0.start as usize + 0x10000].fill(0xa5);
    let record = Entry::unmarked(1, ImageState::Valid).encode();
    bytes[OTADATA.start as usize..OTADATA.start as usize + 32].copy_from_slice(&record);
    Rc::new(RefCell::new(Memory {
        bytes,
        reads: 0,
        mutations: Vec::new(),
    }))
}

fn client(memory: &Rc<RefCell<Memory>>) -> OtaFlash {
    OtaFlash::new(
        FlashStorage {
            memory: memory.clone(),
            lifetime: PhantomData,
        },
        [OTADATA, OTA_1],
    )
}

fn image(len: usize) -> Vec<u8> {
    let mut image: Vec<u8> = (0..len).map(|i| (i * 31 + 7) as u8).collect();
    image[..112].fill(0);
    image[0] = 0xe9;
    image[12..14].copy_from_slice(&Chip::Esp32c6.image_id().to_le_bytes());
    image[32..36].copy_from_slice(&0xabcd_5432u32.to_le_bytes());
    image[48..53].copy_from_slice(b"0.2.0");
    image[80..96].copy_from_slice(b"crystal-shim-app");
    image
}

#[test]
fn upload_ends_enrollment_and_touches_only_otadata_and_the_spare_slot() {
    let memory = device();
    let before = memory.borrow().bytes.clone();
    let identity = Identity {
        chip: Chip::Esp32c6,
        project: Name::new("crystal-shim-app").unwrap(),
        version: Name::new("0.1.0").unwrap(),
    };
    let mut ota = Ota::start(client(&memory), OTA_0.start, identity).unwrap();
    assert!(ota.boot_info().enrollment_window);
    assert!(!ota.is_unconfirmed());

    // Not a multiple of the 1 KiB chunk or the 4-byte word.
    let image = image(70_002);
    let sha: [u8; 32] = Sha256::digest(&image).into();
    assert_eq!(ota.begin(image.len() as u32, &sha).unwrap(), 0);
    for (index, chunk) in image.chunks(1024).enumerate() {
        ota.write_chunk(index as u32 * 1024, chunk).unwrap();
    }
    let staged = ota.finish().unwrap();
    assert_eq!(staged.slot, Slot::Ota1);
    assert_eq!(staged.version.as_str(), "0.2.0");
    assert!(!HELD.get(), "no permit outlives an operation");
    drop(ota);
    // The first upload ended the post-USB enrollment period.
    let again = Ota::start(client(&memory), OTA_0.start, identity).unwrap();
    assert!(!again.boot_info().enrollment_window);
    drop(again);

    let memory = memory.borrow();
    let start = OTA_1.start as usize;
    assert_eq!(&memory.bytes[start..start + image.len()], &image[..]);
    for range in &memory.mutations {
        assert!(
            [&OTADATA, &OTA_1]
                .iter()
                .any(|allowed| allowed.start <= range.start && range.end <= allowed.end),
            "mutation outside the writable regions: {range:x?}"
        );
    }
    for unchanged in [0x8000..0x9000, NVS, OTA_0] {
        let (from, to) = (unchanged.start as usize, unchanged.end as usize);
        assert!(memory.bytes[from..to] == before[from..to], "{unchanged:x?}");
    }
}

#[test]
fn programs_outside_otadata_and_the_spare_slot_are_denied_before_any_access() {
    let memory = device();
    let mut flash = client(&memory);
    for at in [0x8000, NVS.start, OTA_0.start, OTADATA.end] {
        assert_eq!(flash.write(at, &[0; 4]), Err(Error::Denied), "{at:x}");
        assert_eq!(flash.erase(at, at + 4096), Err(Error::Denied), "{at:x}");
    }
    // A range that starts inside a writable region but leaves it.
    assert_eq!(
        flash.erase(OTADATA.end - 4096, OTADATA.end + 4096),
        Err(Error::Denied)
    );
    assert_eq!(
        flash.write(OTA_1.start + 2, &[0; 4]),
        Err(Error::NotAligned)
    );
    assert_eq!(
        flash.erase(OTA_1.end, OTA_1.end + 4096),
        Err(Error::OutOfBounds)
    );
    assert_eq!(memory.borrow().reads, 0);
    assert!(memory.borrow().mutations.is_empty());
    assert!(!HELD.get());
}

#[test]
fn verification_reads_share_one_gated_block_until_this_client_programs_it() {
    let memory = device();
    let mut flash = client(&memory);
    let mut out = [0u8; 64];
    for offset in (0..256).step_by(64) {
        flash.read(OTA_1.start + offset, &mut out).unwrap();
    }
    assert_eq!(memory.borrow().reads, 1);
    flash.write(OTA_1.start + 64, &[1, 2, 3, 4]).unwrap();
    flash.read(OTA_1.start + 64, &mut out[..4]).unwrap();
    assert_eq!(&out[..4], &[1, 2, 3, 4]);
    assert_eq!(memory.borrow().reads, 2);
    // A long read takes one acknowledgement per 256-byte block.
    let mut long = vec![0u8; 1024];
    flash.read(OTA_0.start + 128, &mut long).unwrap();
    assert_eq!(memory.borrow().reads, 2 + 5);
    assert!(long.iter().all(|byte| *byte == 0xa5));
}

#[test]
fn a_busy_gate_refuses_access_without_touching_flash() {
    let memory = device();
    let mut flash = client(&memory);
    let held = flash_gate::Permit::acquire().unwrap();
    FRESH.set(false);
    assert_eq!(flash.read(OTA_1.start, &mut [0; 4]), Err(Error::Gate));
    assert_eq!(
        flash.erase(OTA_1.start, OTA_1.start + 4096),
        Err(Error::Gate)
    );
    drop(held);
    assert_eq!(memory.borrow().reads, 0);
    assert!(memory.borrow().mutations.is_empty());
}
