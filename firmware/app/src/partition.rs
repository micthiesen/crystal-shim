//! Partition selection shared by the ESP adapter and host regression tests.
use core::ops::Range;
use embedded_storage::Storage;
use esp_bootloader_esp_idf::partitions::{
    read_partition_table, DataPartitionSubType, RawPartitionType, PARTITION_TABLE_MAX_LEN,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Invalid,
}

/// Caller must own the output-off flash permit before this read.
pub fn nvs_range(flash: &mut impl Storage, table_buffer: &mut [u8]) -> Result<Range<u32>, Error> {
    let table_buffer = table_buffer
        .get_mut(..PARTITION_TABLE_MAX_LEN)
        .ok_or(Error::Invalid)?;
    let table = read_partition_table(flash, table_buffer).map_err(|_| Error::Invalid)?;
    // The upstream typed decoder panics on legal custom types and unknown
    // subtypes. Inspect raw tags so a preceding custom partition is harmless.
    let nvs = table
        .iter()
        .find(|entry| {
            entry.raw_type() == RawPartitionType::Data as u8
                && entry.raw_subtype() == DataPartitionSubType::Nvs as u8
        })
        .ok_or(Error::Invalid)?;
    let end = nvs.offset().checked_add(nvs.len()).ok_or(Error::Invalid)?;
    let range = nvs.offset()..end;
    // No guessed addresses, encrypted/read-only regions or overlapping partitions.
    if nvs.is_encrypted()
        || nvs.is_read_only()
        || range.start < 0x9000
        || nvs.len() < 3 * 4096
        || !range.start.is_multiple_of(4096)
        || !nvs.len().is_multiple_of(4096)
        || end as usize > flash.capacity()
    {
        return Err(Error::Invalid);
    }
    let mut matches = 0;
    for entry in table.iter() {
        let entry_end = entry
            .offset()
            .checked_add(entry.len())
            .ok_or(Error::Invalid)?;
        if entry.offset() < range.end && range.start < entry_end {
            matches += 1;
            if entry.offset() != range.start || entry_end != range.end {
                return Err(Error::Invalid);
            }
        }
    }
    if matches != 1 {
        return Err(Error::Invalid);
    }
    Ok(range)
}

/// Flash ranges the OTA client may program: `otadata` and the slot that is not running.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OtaRegions {
    pub otadata: Range<u32>,
    pub spare: Range<u32>,
}

const APP: u8 = 0x00;
const APP_FACTORY: u8 = 0x00;
const APP_OTA_0: u8 = 0x10;
const APP_OTA_1: u8 = 0x11;
const DATA_OTA: u8 = 0x00;
const OTADATA_LEN: u32 = 0x2000;
const APP_ALIGN: u32 = 0x1_0000;

/// Validates the OTA layout and returns the only ranges the update client may write.
/// `booted` is the running app partition's offset (from the MMU mapping).
/// Caller must own the output-off flash permit before this read.
pub fn ota_regions(
    flash: &mut impl Storage,
    table_buffer: &mut [u8],
    booted: u32,
) -> Result<OtaRegions, Error> {
    let table_buffer = table_buffer
        .get_mut(..PARTITION_TABLE_MAX_LEN)
        .ok_or(Error::Invalid)?;
    let table = read_partition_table(flash, table_buffer).map_err(|_| Error::Invalid)?;
    let mut otadata = None;
    let mut slots = [None, None];
    for entry in table.iter() {
        let end = entry
            .offset()
            .checked_add(entry.len())
            .ok_or(Error::Invalid)?;
        let range = entry.offset()..end;
        let found = match (entry.raw_type(), entry.raw_subtype()) {
            // A factory app would be what the bootloader falls back to; no OTA layout has one.
            (APP, APP_FACTORY) => return Err(Error::Invalid),
            (APP, APP_OTA_0) => &mut slots[0],
            (APP, APP_OTA_1) => &mut slots[1],
            (t, DATA_OTA) if t == RawPartitionType::Data as u8 => &mut otadata,
            _ => continue,
        };
        if found.replace(range).is_some() || entry.is_encrypted() || entry.is_read_only() {
            return Err(Error::Invalid);
        }
    }
    let (Some(otadata), [Some(ota_0), Some(ota_1)]) = (otadata, slots) else {
        return Err(Error::Invalid);
    };
    if otadata.end - otadata.start != OTADATA_LEN
        || !otadata.start.is_multiple_of(4096)
        || ota_0.end - ota_0.start != ota_1.end - ota_1.start
        || ota_0.is_empty()
    {
        return Err(Error::Invalid);
    }
    for slot in [&ota_0, &ota_1] {
        if !slot.start.is_multiple_of(APP_ALIGN) || !slot.end.is_multiple_of(4096) {
            return Err(Error::Invalid);
        }
    }
    // Writable ranges never overlap NVS, the table or any other entry.
    for range in [&otadata, &ota_0, &ota_1] {
        if range.start < 0x9000 || range.end as usize > flash.capacity() {
            return Err(Error::Invalid);
        }
        let mut overlaps = 0;
        for entry in table.iter() {
            let entry_end = entry
                .offset()
                .checked_add(entry.len())
                .ok_or(Error::Invalid)?;
            if entry.offset() < range.end && range.start < entry_end {
                overlaps += 1;
            }
        }
        if overlaps != 1 {
            return Err(Error::Invalid);
        }
    }
    let spare = if booted == ota_0.start {
        ota_1
    } else if booted == ota_1.start {
        ota_0
    } else {
        return Err(Error::Invalid);
    };
    Ok(OtaRegions { otadata, spare })
}
