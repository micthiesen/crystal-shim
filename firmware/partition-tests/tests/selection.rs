use crystal_shim_partition_tests::{nvs_range, Error};
use embedded_storage::{ReadStorage, Storage};
use esp_bootloader_esp_idf::partitions::PARTITION_TABLE_MAX_LEN;
use md5::{Digest, Md5};

struct Flash {
    table: [u8; PARTITION_TABLE_MAX_LEN],
    capacity: usize,
}
impl ReadStorage for Flash {
    type Error = ();
    fn read(&mut self, offset: u32, out: &mut [u8]) -> Result<(), Self::Error> {
        assert_eq!(offset, 0x8000);
        assert_eq!(out.len(), PARTITION_TABLE_MAX_LEN);
        out.copy_from_slice(&self.table);
        Ok(())
    }
    fn capacity(&self) -> usize {
        self.capacity
    }
}
impl Storage for Flash {
    fn write(&mut self, _: u32, _: &[u8]) -> Result<(), Self::Error> {
        panic!("partition selection must never write or erase");
    }
}
fn entry(kind: u8, subtype: u8, start: u32, len: u32, flags: u32) -> [u8; 32] {
    let mut bytes = [0; 32];
    bytes[..2].copy_from_slice(&0x50aau16.to_le_bytes());
    bytes[2] = kind;
    bytes[3] = subtype;
    bytes[4..8].copy_from_slice(&start.to_le_bytes());
    bytes[8..12].copy_from_slice(&len.to_le_bytes());
    bytes[28..32].copy_from_slice(&flags.to_le_bytes());
    bytes
}
fn flash(entries: &[[u8; 32]]) -> Flash {
    let mut table = [0xff; PARTITION_TABLE_MAX_LEN];
    for (index, entry) in entries.iter().enumerate() {
        table[index * 32..index * 32 + 32].copy_from_slice(entry);
    }
    let end = entries.len() * 32;
    let digest = Md5::digest(&table[..end]);
    table[end..end + 2].copy_from_slice(&0xebebu16.to_le_bytes());
    table[end + 16..end + 32].copy_from_slice(&digest);
    Flash {
        table,
        capacity: 8 * 1024 * 1024,
    }
}
fn select(flash: &mut Flash) -> Result<core::ops::Range<u32>, Error> {
    // Regression: the app's scratch buffer is larger than the parser's maximum.
    nvs_range(flash, &mut [0; 4096])
}
#[test]
fn custom_type_and_unknown_subtype_before_nvs_do_not_panic() {
    let mut flash = flash(&[
        entry(0x40, 0, 0x30000, 0x1000, 0),
        entry(1, 0x80, 0x31000, 0x1000, 0),
        entry(1, 2, 0x9000, 0x6000, 0),
    ]);
    assert_eq!(select(&mut flash), Ok(0x9000..0xf000));
}
#[test]
fn first_nvs_is_chosen_and_corrupt_table_is_rejected() {
    let mut flash = flash(&[
        entry(1, 2, 0x9000, 0x6000, 0),
        entry(1, 2, 0x30000, 0x4000, 0),
    ]);
    assert_eq!(select(&mut flash), Ok(0x9000..0xf000));
    flash.table[4] ^= 1;
    assert_eq!(select(&mut flash), Err(Error::Invalid));
}
#[test]
fn unsafe_ranges_flags_overlaps_and_absence_are_rejected() {
    for entries in [
        vec![entry(1, 2, 0x9000, 0x6000, 1)], // encrypted
        vec![entry(1, 2, 0x9000, 0x6000, 2)], // read-only
        vec![entry(1, 2, 0x8000, 0x6000, 0)], // reserved region
        vec![entry(1, 2, 0x9001, 0x6000, 0)],
        vec![entry(1, 2, 0x9000, 0x6001, 0)],
        vec![entry(1, 2, 0x9000, 0x2000, 0)],
        vec![entry(1, 2, 0xfffff000, 0x6000, 0)],
        vec![entry(1, 2, 0x9000, 0x900000, 0)],
        vec![
            entry(1, 2, 0x9000, 0x6000, 0),
            entry(0x40, 0, 0xe000, 0x1000, 0),
        ],
        vec![
            entry(1, 2, 0x9000, 0x6000, 0),
            entry(1, 2, 0x9000, 0x6000, 0),
        ],
        vec![entry(0x40, 0, 0x30000, 0x1000, 0)],
    ] {
        assert_eq!(select(&mut flash(&entries)), Err(Error::Invalid));
    }
    assert_eq!(
        nvs_range(&mut flash(&[]), &mut [0; 32]),
        Err(Error::Invalid)
    );
}
