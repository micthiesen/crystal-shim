//! Public SDK test identity only. This module is never referenced by production.
extern crate std;
use crystal_shim_matter::provisioning::{encode, Attestation, Metadata, MAX_BYTES};
use crystal_shim_matter::sdk::dm::{
    clusters::dev_att::DeviceAttestation,
    devices::test::{TEST_DEV_ATT, TEST_PID, TEST_VID},
};
use std::vec::Vec;

pub fn record() -> Vec<u8> {
    let mut out = [0; MAX_BYTES];
    let len = encode(
        Metadata {
            vendor_id: TEST_VID,
            product_id: TEST_PID,
            hardware_version: 1,
            discriminator: 3840,
            passcode: 20_202_021,
            vendor_name: "fixture",
            serial_number: "unit-test",
            unique_id: "test-only-id",
            hardware_version_string: "1",
        },
        Attestation {
            public_key: TEST_DEV_ATT.dac_pub_key().access(),
            private_key: TEST_DEV_ATT.dac_priv_key().access(),
            declaration: TEST_DEV_ATT.cert_declaration(),
            pai: TEST_DEV_ATT.pai(),
            dac: TEST_DEV_ATT.dac(),
        },
        &mut out,
    )
    .unwrap();
    out[..len].to_vec()
}
