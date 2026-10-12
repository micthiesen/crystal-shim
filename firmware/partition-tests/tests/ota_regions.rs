use crystal_shim_partition_tests::{nvs_range, ota_regions, Error, OtaRegions};
use embedded_storage::{ReadStorage, Storage};
use esp_bootloader_esp_idf::partitions::PARTITION_TABLE_MAX_LEN;
use md5::{Digest, Md5};

struct Flash([u8; PARTITION_TABLE_MAX_LEN]);
impl ReadStorage for Flash {
    type Error = ();
    fn read(&mut self, offset: u32, out: &mut [u8]) -> Result<(), Self::Error> {
        assert_eq!(offset, 0x8000);
        out.copy_from_slice(&self.0[..out.len()]);
        Ok(())
    }
    fn capacity(&self) -> usize {
        8 * 1024 * 1024
    }
}
impl Storage for Flash {
    fn write(&mut self, _: u32, _: &[u8]) -> Result<(), Self::Error> {
        panic!("OTA region selection must never write or erase");
    }
}
fn entry(kind: u8, subtype: u8, start: u32, len: u32) -> [u8; 32] {
    let mut bytes = [0; 32];
    bytes[..2].copy_from_slice(&0x50aau16.to_le_bytes());
    bytes[2] = kind;
    bytes[3] = subtype;
    bytes[4..8].copy_from_slice(&start.to_le_bytes());
    bytes[8..12].copy_from_slice(&len.to_le_bytes());
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
    Flash(table)
}

/// The table actually flashed, parsed from `firmware/app/partitions.csv`.
fn shipped() -> Vec<[u8; 32]> {
    let number = |text: &str| u32::from_str_radix(text.trim_start_matches("0x"), 16).unwrap();
    include_str!("../../app/partitions.csv")
        .lines()
        .filter(|line| !line.starts_with('#') && !line.trim().is_empty())
        .map(|line| {
            let fields: Vec<&str> = line.split(',').map(str::trim).collect();
            let (kind, subtype) = match (fields[1], fields[2]) {
                ("data", "nvs") => (1, 2),
                ("data", "phy") => (1, 1),
                ("data", "ota") => (1, 0),
                ("app", "ota_0") => (0, 0x10),
                ("app", "ota_1") => (0, 0x11),
                other => panic!("unexpected partition {other:?}"),
            };
            entry(kind, subtype, number(fields[3]), number(fields[4]))
        })
        .collect()
}
fn regions(entries: &[[u8; 32]], booted: u32) -> Result<OtaRegions, Error> {
    ota_regions(&mut flash(entries), &mut [0; 4096], booted)
}

#[test]
fn shipped_layout_keeps_nvs_and_allows_only_otadata_and_the_spare_slot() {
    let entries = shipped();
    assert_eq!(
        nvs_range(&mut flash(&entries), &mut [0; 4096]),
        Ok(0x9000..0xf000)
    );
    assert_eq!(
        regions(&entries, 0x20000),
        Ok(OtaRegions {
            otadata: 0x10000..0x12000,
            spare: 0x410000..0x800000,
        })
    );
    assert_eq!(
        regions(&entries, 0x410000).map(|r| r.spare),
        Ok(0x20000..0x410000)
    );
}

#[test]
fn image_outside_an_ota_slot_is_refused() {
    let entries = shipped();
    for booted in [0x10000, 0x30000, 0x9000] {
        assert_eq!(regions(&entries, booted), Err(Error::Invalid));
    }
}

#[test]
fn factory_missing_duplicate_or_misshapen_layouts_are_refused() {
    let base = shipped();
    let mut cases = Vec::new();
    // Factory app present.
    let mut factory = base.clone();
    factory.push(entry(0, 0, 0x7f0000, 0x10000));
    cases.push(factory);
    // Missing otadata / ota_1.
    cases.push(base.iter().copied().filter(|e| e[2..4] != [1, 0]).collect());
    cases.push(base[..4].to_vec());
    // Duplicate otadata.
    let mut duplicate = base.clone();
    duplicate.push(entry(1, 0, 0x12000, 0x2000));
    cases.push(duplicate);
    // otadata not exactly two sectors.
    let mut otadata = base.clone();
    otadata[2] = entry(1, 0, 0x10000, 0x3000);
    cases.push(otadata);
    // Unequal or unaligned slots.
    let mut unequal = base.clone();
    unequal[4] = entry(0, 0x11, 0x410000, 0x3e0000);
    cases.push(unequal);
    let mut unaligned = base.clone();
    unaligned[3] = entry(0, 0x10, 0x18000, 0x3f8000);
    cases.push(unaligned);
    // otadata overlapping NVS, slot past the end of flash.
    let mut over_nvs = base.clone();
    over_nvs[2] = entry(1, 0, 0xe000, 0x2000);
    cases.push(over_nvs);
    let mut past_end = base.clone();
    past_end[4] = entry(0, 0x11, 0x410000, 0x400000);
    past_end[3] = entry(0, 0x10, 0x10000, 0x400000);
    cases.push(past_end);
    for entries in cases {
        assert_eq!(
            regions(&entries, 0x20000),
            Err(Error::Invalid),
            "{entries:x?}"
        );
    }
}
