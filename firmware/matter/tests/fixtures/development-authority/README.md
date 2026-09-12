# Public upstream development issuer fixtures

These are public test trust/issuer materials from Project CHIP tag `v1.5.1.0`.
They are used only by the offline host integration test, with explicit file
arguments. The test generates a fresh DAC/device private key for each run in a
0700 scratch directory. No device private key is present in these fixtures, and
production code has no default issuer, CD, trust certificate or device key.

Base source: <https://github.com/project-chip/connectedhomeip/tree/v1.5.1.0/credentials>

| Local file | Upstream path |
| --- | --- |
| `pai.pem` | `development/attestation/Matter-Development-PAI-FFF1-noPID-Cert.pem` |
| `PUBLIC-TEST-ISSUER-key.pem` | `development/attestation/Matter-Development-PAI-FFF1-noPID-Key.pem` |
| `paa.pem` | `development/paa-root-certs/Chip-Test-PAA-FFF1-Cert.pem` |
| `cd-signer.pem` | `development/cd-certs/CSA_Matter_CD_Signing_Key_001.cert.pem` |
| `cd.der` | FFF1 `kCdForAllExamples` in `src/credentials/examples/DeviceAttestationCredsExample.cpp`; byte-identical to rs-matter 0.2.0's public CD |

The intentionally public TEST issuer key is not a device credential and is not a
commercial issuance key. It appears in neither the C6 production image nor a host
tool default. The matching PAA is the FFF1 PAA, not `Chip-Development-PAA` or the
NoVID PAA. The CD signer is CSA Signing Key001, not either similarly named test CD
signer. The test checks both signatures offline and never prints generated keys
or setup codes. Upstream source is licensed under Apache-2.0.
