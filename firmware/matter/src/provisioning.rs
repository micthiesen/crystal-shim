//! Private commissioning record, loaded through the same gated KV owner.
//!
//! This format carries no defaults. Passing validation is a local consistency
//! check, not an attestation-chain or certification claim. The commissioner must
//! validate CD/PAI/DAC trust. Provisioning tools must never print this record.
use p256::elliptic_curve::sec1::ToEncodedPoint;
use rs_matter::crypto::{CanonPkcPublicKeyRef, CanonPkcSecretKeyRef};
use rs_matter::dm::clusters::dev_att::DeviceAttestation;

pub const STORAGE_KEY: u16 = 0x434d;
pub const MAX_BYTES: usize = 3584;
const MAGIC: &[u8; 8] = b"CSMAT01\0";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    Format,
    Identity,
    Passcode,
    Key,
}

/// Borrowed private data. Deliberately does not implement Debug or Display.
pub struct Provisioning<'a> {
    pub vendor_id: u16,
    pub product_id: u16,
    pub hardware_version: u16,
    pub discriminator: u16,
    pub passcode: u32,
    pub vendor_name: &'a str,
    pub serial_number: &'a str,
    pub unique_id: &'a str,
    pub hardware_version_string: &'a str,
    public_key: &'a [u8; 65],
    private_key: &'a [u8; 32],
    declaration: &'a [u8],
    pai: &'a [u8],
    dac: &'a [u8],
}

impl<'a> Provisioning<'a> {
    /// Validate record bounds, setup parameters, keypair and attestation identity.
    /// Certificate trust/signatures and CD validity are checked by the commissioner.
    pub fn decode(bytes: &'a [u8]) -> Result<Self, Error> {
        use rs_matter::cert::x509::cert::{DacCert, PaiCert};
        let record = Self::decode_record(bytes)?;
        let dac = DacCert::new(record.dac).map_err(|_| Error::Identity)?;
        let pai = PaiCert::new(record.pai).map_err(|_| Error::Identity)?;
        if dac.public_key().map_err(|_| Error::Key)? != record.public_key
            || dac.vendor_id().map_err(|_| Error::Identity)? != record.vendor_id
            || dac.product_id().map_err(|_| Error::Identity)? != record.product_id
            || pai.vendor_id().map_err(|_| Error::Identity)? != record.vendor_id
            || pai.product_id().is_ok_and(|pid| pid != record.product_id)
            || dac.authority_key_id().map_err(|_| Error::Identity)?
                != pai.subject_key_id().map_err(|_| Error::Identity)?
        {
            return Err(Error::Identity);
        }
        Ok(record)
    }

    fn decode_record(bytes: &'a [u8]) -> Result<Self, Error> {
        if bytes.len() > MAX_BYTES {
            return Err(Error::Format);
        }
        let mut cursor = Cursor(bytes);
        if cursor.take(8)? != MAGIC {
            return Err(Error::Format);
        }
        let vendor_id = cursor.u16()?;
        let product_id = cursor.u16()?;
        let hardware_version = cursor.u16()?;
        let discriminator = cursor.u16()?;
        let passcode = u32::from_le_bytes(cursor.take(4)?.try_into().map_err(|_| Error::Format)?);
        if vendor_id == 0 || vendor_id == 0xffff || product_id == 0 || discriminator > 4095 {
            return Err(Error::Identity);
        }
        // Matter setup PIN constraints, including repeated-digit and ordered PINs.
        if !(1..=99_999_998).contains(&passcode)
            || passcode.is_multiple_of(11_111_111)
            || matches!(passcode, 12_345_678 | 87_654_321)
        {
            return Err(Error::Passcode);
        }
        let vendor_name = cursor.text(32)?;
        let serial_number = cursor.text(32)?;
        let unique_id = cursor.text(32)?;
        let hardware_version_string = cursor.text(64)?;
        let public_key: &[u8; 65] = cursor.take(65)?.try_into().map_err(|_| Error::Format)?;
        let private_key: &[u8; 32] = cursor.take(32)?.try_into().map_err(|_| Error::Format)?;
        let key = p256::SecretKey::from_slice(private_key).map_err(|_| Error::Key)?;
        if key.public_key().to_encoded_point(false).as_bytes() != public_key {
            return Err(Error::Key);
        }
        let declaration = cursor.der()?;
        let pai = cursor.der()?;
        let dac = cursor.der()?;
        if !cursor.0.is_empty() {
            return Err(Error::Format);
        }
        Ok(Self {
            vendor_id,
            product_id,
            hardware_version,
            discriminator,
            passcode,
            vendor_name,
            serial_number,
            unique_id,
            hardware_version_string,
            public_key,
            private_key,
            declaration,
            pai,
            dac,
        })
    }
}

impl rs_matter::utils::sync::DynBase for Provisioning<'_> {}

impl DeviceAttestation for Provisioning<'_> {
    fn cert_declaration(&self) -> &[u8] {
        self.declaration
    }
    fn pai(&self) -> &[u8] {
        self.pai
    }
    fn dac(&self) -> &[u8] {
        self.dac
    }
    fn dac_pub_key(&self) -> CanonPkcPublicKeyRef<'_> {
        CanonPkcPublicKeyRef::new(self.public_key)
    }
    fn dac_priv_key(&self) -> CanonPkcSecretKeyRef<'_> {
        CanonPkcSecretKeyRef::new(self.private_key)
    }
}

struct Cursor<'a>(&'a [u8]);
impl<'a> Cursor<'a> {
    fn take(&mut self, len: usize) -> Result<&'a [u8], Error> {
        let (value, rest) = self.0.split_at_checked(len).ok_or(Error::Format)?;
        self.0 = rest;
        Ok(value)
    }
    fn u16(&mut self) -> Result<u16, Error> {
        Ok(u16::from_le_bytes(
            self.take(2)?.try_into().map_err(|_| Error::Format)?,
        ))
    }
    fn blob(&mut self, max: usize) -> Result<&'a [u8], Error> {
        let len = usize::from(self.u16()?);
        if len == 0 || len > max {
            return Err(Error::Format);
        }
        self.take(len)
    }
    fn text(&mut self, max: usize) -> Result<&'a str, Error> {
        let text = core::str::from_utf8(self.blob(max)?).map_err(|_| Error::Identity)?;
        if text.chars().any(char::is_control) {
            return Err(Error::Identity);
        }
        Ok(text)
    }
    fn der(&mut self) -> Result<&'a [u8], Error> {
        let bytes = self.blob(1536)?;
        if bytes.first() != Some(&0x30) {
            return Err(Error::Format);
        }
        let (header, len) = match bytes.get(1) {
            Some(len @ 0..=127) => (2, usize::from(*len)),
            Some(0x81) => (3, usize::from(*bytes.get(2).ok_or(Error::Format)?)),
            Some(0x82) => (
                4,
                usize::from(u16::from_be_bytes(
                    bytes
                        .get(2..4)
                        .ok_or(Error::Format)?
                        .try_into()
                        .map_err(|_| Error::Format)?,
                )),
            ),
            _ => return Err(Error::Format),
        };
        if header + len != bytes.len() {
            return Err(Error::Format);
        }
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use std::vec::Vec;
    fn blob(bytes: &mut Vec<u8>, value: &[u8]) {
        bytes.extend_from_slice(&(value.len() as u16).to_le_bytes());
        bytes.extend_from_slice(value);
    }
    fn synthetic_record() -> Vec<u8> {
        // Synthetic codec fixture only: neither a signed DAC nor a deployable CD.
        let key = p256::SecretKey::from_slice(&[1; 32]).unwrap();
        let public = key.public_key().to_encoded_point(false);
        let mut bytes = MAGIC.to_vec();
        for value in [0xfff1_u16, 0x8000, 1, 3840] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&20_202_021_u32.to_le_bytes());
        for text in [
            b"fixture".as_slice(),
            b"synthetic",
            b"synthetic-id",
            b"fixture-v1",
        ] {
            blob(&mut bytes, text);
        }
        bytes.extend_from_slice(public.as_bytes());
        bytes.extend_from_slice(&key.to_bytes());
        blob(&mut bytes, &[0x30, 0]);
        blob(&mut bytes, &[0x30, 0]);
        let mut fake_dac = std::vec![0x30, 65];
        fake_dac.extend_from_slice(public.as_bytes());
        blob(&mut bytes, &fake_dac);
        bytes
    }
    #[test]
    fn bounded_private_record_checks_complete_length_and_key_consistency() {
        let bytes = synthetic_record();
        assert_eq!(
            Provisioning::decode_record(&bytes).unwrap().serial_number,
            "synthetic"
        );
        for end in 0..bytes.len() {
            assert!(Provisioning::decode(&bytes[..end]).is_err());
        }
        let mut extra = bytes.clone();
        extra.push(0);
        assert!(Provisioning::decode(&extra).is_err());
        // The synthetic framing fixture cannot open commissioning: it lacks
        // real X.509 DAC/PAI certificates, even though its keypair is consistent.
        assert!(matches!(Provisioning::decode(&bytes), Err(Error::Identity)));
        let mut damaged = bytes.clone();
        let key_at = 20
            + ["fixture", "synthetic", "synthetic-id", "fixture-v1"]
                .iter()
                .map(|text| 2 + text.len())
                .sum::<usize>()
            + 65;
        damaged[key_at] ^= 1;
        assert!(matches!(Provisioning::decode(&damaged), Err(Error::Key)));
        assert!(Provisioning::decode(&[0; MAX_BYTES + 1]).is_err());
    }
    #[test]
    fn forbidden_setup_codes_and_missing_material_do_not_open_commissioning() {
        assert!(Provisioning::decode(&[]).is_err());
        for pin in [0_u32, 11_111_111, 99_999_999, 12_345_678, 87_654_321] {
            let mut bytes = synthetic_record();
            bytes[16..20].copy_from_slice(&pin.to_le_bytes());
            assert!(matches!(Provisioning::decode(&bytes), Err(Error::Passcode)));
        }
        let mut bytes = synthetic_record();
        bytes[14..16].copy_from_slice(&4096_u16.to_le_bytes());
        assert!(matches!(Provisioning::decode(&bytes), Err(Error::Identity)));
    }

    #[test]
    fn complete_x509_record_accepts_matching_identity_and_rejects_substitution() {
        // Public SDK fixtures are referenced only in this cfg(test) module.
        // Production has no default credentials or link to TEST_DEV_ATT.
        use rs_matter::dm::devices::test::{TEST_DEV_ATT, TEST_PID, TEST_VID};
        let mut bytes = MAGIC.to_vec();
        for value in [TEST_VID, TEST_PID, 1, 3840] {
            bytes.extend_from_slice(&value.to_le_bytes());
        }
        bytes.extend_from_slice(&20_202_021_u32.to_le_bytes());
        for text in ["fixture", "unit-test", "test-only-id", "1"] {
            blob(&mut bytes, text.as_bytes());
        }
        let key_at = bytes.len();
        bytes.extend_from_slice(TEST_DEV_ATT.dac_pub_key().access());
        bytes.extend_from_slice(TEST_DEV_ATT.dac_priv_key().access());
        blob(&mut bytes, TEST_DEV_ATT.cert_declaration());
        blob(&mut bytes, TEST_DEV_ATT.pai());
        blob(&mut bytes, TEST_DEV_ATT.dac());
        let record = Provisioning::decode(&bytes).unwrap();
        assert_eq!(record.vendor_id, TEST_VID);
        assert_eq!(record.product_id, TEST_PID);
        assert_eq!(record.serial_number, "unit-test");
        for identity_at in [8, 10] {
            let mut changed = bytes.clone();
            changed[identity_at] ^= 1;
            assert!(matches!(
                Provisioning::decode(&changed),
                Err(Error::Identity)
            ));
        }
        // A different internally consistent keypair still must match the DAC.
        let key = p256::SecretKey::from_slice(&[2; 32]).unwrap();
        let mut changed = bytes.clone();
        changed[key_at..key_at + 65]
            .copy_from_slice(key.public_key().to_encoded_point(false).as_bytes());
        changed[key_at + 65..key_at + 97].copy_from_slice(&key.to_bytes());
        assert!(matches!(
            Provisioning::decode(&changed),
            Err(Error::Identity)
        ));
    }
}
