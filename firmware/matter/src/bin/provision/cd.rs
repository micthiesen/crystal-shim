//! CD signature is verified by OpenSSL before these payload checks.
use crystal_shim_matter::provisioning::Provisioning;
use crystal_shim_matter::sdk::{
    cert::x509::cert::{PaaCert, PaiCert},
    dm::clusters::dev_att::DeviceAttestation,
    error::{Error, ErrorCode},
    tlv::TLVElement,
};

pub struct Declaration {
    pub device_type: u32,
    pub certification_type: u8,
}
pub fn check(payload: &[u8], record: &Provisioning<'_>, paa: &[u8]) -> Result<Declaration, Error> {
    let root = PaaCert::new(paa)?;
    if root.vendor_id().is_ok_and(|vid| vid != record.vendor_id)
        || PaiCert::new(record.pai())?.authority_key_id()? != root.subject_key_id()?
    {
        return Err(ErrorCode::InvalidData.into());
    }
    let seq = TLVElement::new(payload).structure()?;
    let mut seen = 0_u16;
    for element in seq.iter() {
        let tag = element?.try_ctx()?.ok_or(ErrorCode::InvalidData)?;
        if tag > 11 || seen & (1 << tag) != 0 {
            return Err(ErrorCode::InvalidData.into());
        }
        seen |= 1 << tag;
    }
    if seen & 0x1ff != 0x1ff
        || seq.ctx(0)?.u16()? != 1
        || seq.ctx(1)?.u16()? != record.vendor_id
        || seq.ctx(5)?.u8()? != 0
        || seq.ctx(6)?.u16()? != 0
        || seq.ctx(4)?.utf8()?.len() != 19
    {
        return Err(ErrorCode::InvalidData.into());
    }
    let mut found = false;
    let mut count = 0;
    for product in seq.ctx(2)?.array()?.iter() {
        let product = product?;
        if product.try_ctx()?.is_some() {
            return Err(ErrorCode::InvalidData.into());
        }
        found |= product.u16()? == record.product_id;
        count += 1;
    }
    if !found || count > 100 {
        return Err(ErrorCode::InvalidData.into());
    }
    let device_type = seq.ctx(3)?.u32()?;
    let _version = seq.ctx(7)?.u16()?;
    let certification_type = seq.ctx(8)?.u8()?;
    if certification_type > 2 || device_type == 0 {
        return Err(ErrorCode::InvalidData.into());
    }
    for (tag, expected) in [(9, record.vendor_id), (10, record.product_id)] {
        let origin = seq.find_ctx(tag)?;
        if !origin.is_empty() && origin.u16()? != expected {
            return Err(ErrorCode::InvalidData.into());
        }
    }
    // Origin IDs are a pair; this app currently requires them equal Basic Info.
    if (seen & (1 << 9) != 0) != (seen & (1 << 10) != 0) {
        return Err(ErrorCode::InvalidData.into());
    }
    let authorized = seq.find_ctx(11)?;
    if !authorized.is_empty() {
        let skid = root.subject_key_id()?;
        let mut found = false;
        let mut count = 0;
        for entry in authorized.array()?.iter() {
            let entry = entry?;
            if entry.str()?.len() != 20 {
                return Err(ErrorCode::InvalidData.into());
            }
            found |= entry.str()? == skid;
            count += 1;
        }
        if !found || count > 10 {
            return Err(ErrorCode::InvalidData.into());
        }
    }
    Ok(Declaration {
        device_type,
        certification_type,
    })
}
