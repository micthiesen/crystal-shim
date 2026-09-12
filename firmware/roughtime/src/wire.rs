//! Bounded, borrowed draft-19 messages. Unknown canonical tags are opaque.

use crate::Error;

pub(crate) const fn tag(value: &[u8; 4]) -> u32 {
    u32::from_le_bytes(*value)
}

pub(crate) fn word(bytes: &[u8]) -> Result<u32, Error> {
    Ok(u32::from_le_bytes(
        bytes.try_into().map_err(|_| Error::Length)?,
    ))
}

pub(crate) fn wide(bytes: &[u8]) -> Result<u64, Error> {
    Ok(u64::from_le_bytes(
        bytes.try_into().map_err(|_| Error::Length)?,
    ))
}

pub(crate) struct Message<'a> {
    bytes: &'a [u8],
    count: usize,
}

impl<'a> Message<'a> {
    pub(crate) fn parse(bytes: &'a [u8]) -> Result<Self, Error> {
        if bytes.len() < 8 {
            return Err(Error::Length);
        }
        let count = word(&bytes[..4])? as usize;
        // Bounds multiplication and every subsequent index, including on 32-bit targets.
        if count == 0 || count > bytes.len() / 8 {
            return Err(Error::Length);
        }
        let result = Self { bytes, count };
        let mut previous_tag = 0;
        let mut previous_offset = 0;
        for index in 0..count {
            let key = result.key(index);
            if key <= previous_tag || !valid_tag(key.to_le_bytes()) {
                return Err(Error::Tags);
            }
            previous_tag = key;
            let end = result.end(index);
            // Draft 19 section 4.2 aligns encoded offsets, not the final
            // implicit end. An unknown last value may contain any byte count.
            if (index + 1 < count && !end.is_multiple_of(4))
                || end < previous_offset
                || end > bytes.len() - 8 * count
            {
                return Err(Error::Offsets);
            }
            previous_offset = end;
        }
        Ok(result)
    }

    fn key(&self, index: usize) -> u32 {
        let offset = 4 * (self.count + index);
        // parse established these four bytes are inside the header.
        u32::from_le_bytes(self.bytes[offset..offset + 4].try_into().unwrap())
    }

    fn end(&self, index: usize) -> usize {
        if index + 1 == self.count {
            self.bytes.len() - 8 * self.count
        } else {
            let offset = 4 * (index + 1);
            u32::from_le_bytes(self.bytes[offset..offset + 4].try_into().unwrap()) as usize
        }
    }

    pub(crate) fn get(&self, key: u32) -> Result<&'a [u8], Error> {
        let mut start = 0;
        for index in 0..self.count {
            let end = self.end(index);
            if self.key(index) == key {
                return Ok(&self.bytes[8 * self.count + start..8 * self.count + end]);
            }
            start = end;
        }
        Err(Error::MissingTag)
    }
}

fn valid_tag(bytes: [u8; 4]) -> bool {
    let mut padding = false;
    for (index, byte) in bytes.into_iter().enumerate() {
        if byte == 0 && index != 0 {
            padding = true;
        } else if padding || !byte.is_ascii_uppercase() {
            return false;
        }
    }
    true
}
