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
