use crate::Error;
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

/// Never formatted, cloned, or persisted separately from the validated config.
pub struct Bearer([u8; 32]);
impl Bearer {
    pub const fn new(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }
    pub fn decode(hex: &[u8]) -> Result<Self, Error> {
        if hex.len() != 64 {
            return Err(Error::Unauthorized);
        }
        let mut token = Self([0; 32]);
        for (out, pair) in token.0.iter_mut().zip(hex.as_chunks::<2>().0.iter()) {
            *out = digit(pair[0])?.checked_mul(16).ok_or(Error::Unauthorized)? | digit(pair[1])?;
        }
        Ok(token)
    }
    pub fn matches(&self, bytes: &[u8; 32]) -> bool {
        bool::from(self.0.ct_eq(bytes))
    }
    pub const fn bytes(&self) -> &[u8; 32] {
        &self.0
    }
    pub fn encode(&self, out: &mut [u8; 64]) {
        const HEX: &[u8; 16] = b"0123456789abcdef";
        for (byte, pair) in self.0.iter().zip(out.as_chunks_mut::<2>().0.iter_mut()) {
            pair[0] = HEX[(byte >> 4) as usize];
            pair[1] = HEX[(byte & 15) as usize];
        }
    }
}
impl Drop for Bearer {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}
fn digit(b: u8) -> Result<u8, Error> {
    match b {
        b'0'..=b'9' => Ok(b - b'0'),
        b'a'..=b'f' => Ok(b - b'a' + 10),
        b'A'..=b'F' => Ok(b - b'A' + 10),
        _ => Err(Error::Unauthorized),
    }
}
