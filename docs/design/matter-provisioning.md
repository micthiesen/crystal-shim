# Private Matter provisioning

The host-only `matter-provision` tool creates or imports private device material,
serializes the exact record consumed by the app, and validates it offline. It
does not open a serial port, flash hardware, pair an accessory or contact a
network. The app still needs the USB writer described below before this record
can be installed through its single gated Store.

## Identity and trust choices

The preferred personal-development path is a freshly generated device DAC key and
certificate under an explicitly supplied development PAI and CD. The maintained
Stillair app uses the SDK's shared development device credentials; this tool
preserves compatibility with that public development trust chain while generating
an independent private device key. No example device key, issuer key, PIN or
certificate is selected by default.

`issue-dev` requires an explicit development VID in `0xFFF1` through `0xFFF4`, a
matching PAI certificate and signing key, and a Development and Test CD. These VIDs
are development identifiers, not a claim that Crystal Shim owns a vendor
allocation. The tool also accepts an owner's private issuer with compatible
explicit inputs. It does not create a new PAA or CD signer automatically.

`import` accepts an already issued DAC certificate/private key with matching
PAI/CD material. It does not issue or assert a certified VID, product identity or
CD. It creates fresh setup PIN, discriminator and unique ID, just like `issue-dev`.
An imported device key remains the same; its commissioning codes are new.

The explicitly supplied PAA and CD signer are the host validation trust boundary.
Successful validation proves consistency and signatures against those inputs.
It does not establish that a commissioner trusts them, that the product is
certified, or that Apple Home will accept it. D-22's private endpoint identity and
restricted metadata remain authoritative. Actual Apple Home pairing is G-05.

Primary references:

- [CHIP certificate tool, v1.5.1.0](https://github.com/project-chip/connectedhomeip/blob/v1.5.1.0/src/tools/chip-cert/README.md)
  defines development attestation issuance and CD certification type 0.
- [CHIP default verifier](https://github.com/project-chip/connectedhomeip/blob/v1.5.1.0/src/credentials/attestation_verifier/DefaultDeviceAttestationVerifier.cpp)
  checks CD format/type, identity, origin and authorized PAA. It logs the CD device
  type but does not compare it to endpoint Descriptor data.
- [CHIP controller guide](https://github.com/project-chip/connectedhomeip/blob/v1.5.1.0/docs/development_controllers/chip-tool/chip_tool_guide.md)
  documents explicit PAA/CD trust stores for development controllers. This is not
  evidence that arbitrary private authorities are trusted by Apple Home.

## Explicit common development inputs

The following matching public materials are in the upstream tag `v1.5.1.0`:

| Purpose | Path below `connectedhomeip/credentials/` |
| --- | --- |
| PAI certificate | `development/attestation/Matter-Development-PAI-FFF1-noPID-Cert.pem` |
| Public TEST issuer key | `development/attestation/Matter-Development-PAI-FFF1-noPID-Key.pem` |
| Matching PAA | `development/paa-root-certs/Chip-Test-PAA-FFF1-Cert.pem` |
| Matching common CD signer | `development/cd-certs/CSA_Matter_CD_Signing_Key_001.cert.pem` |

The common FFF1 CD is `kCdForAllExamples` in
[the example attestation provider](https://github.com/project-chip/connectedhomeip/blob/v1.5.1.0/src/credentials/examples/DeviceAttestationCredsExample.cpp).
It is byte-identical to the pinned rs-matter 0.2.0 CD. It covers PIDs `0x8000` through
`0x8063`, declares device type `0x0016`, and has certification type 0. The host
records that declared type without rewriting signed content or asserting that it
certifies endpoint `0x010A`. The private-profile deviation remains documented in
[matter-integration.md](matter-integration.md).

These common materials have similar names to incompatible alternatives. This PAI
is not signed by `Chip-Development-PAA` or the NoVID PAA. Its CD is not signed by
either of the similarly named test CD signing certificates. Use the exact pairings
above. The checked-in [test fixtures](../../firmware/matter/tests/fixtures/development-authority/README.md)
record provenance; the only fixture key is the intentionally public TEST issuer.
They are test inputs, never production defaults.

## Tool and private artifacts

Requires stable Rust and OpenSSL 3 on macOS or Linux. No new Cargo dependency,
workspace or lockfile is needed. Build from the repository root:

```sh
cargo build --manifest-path firmware/Cargo.toml -p crystal-shim-matter --bin matter-provision --locked
firmware/target/debug/matter-provision --help
```

Create a UTF-8 metadata file with exactly these six `key=value` fields. The values
below illustrate private development syntax; set the serial and hardware fields
for the actual unit. They contain no calibration or measured sensor data.

```text
vendor_id=0xFFF1
product_id=0x8000
hardware_version=1
vendor_name=Crystal Shim private development
serial_number=CHOOSE-UNIQUE-UNIT-LABEL
hardware_version_string=UNRELEASED
```

Creation commands take file paths rather than key bytes or PINs. Replace every
`/private/material/...` path with explicitly chosen local material. The output
parent must already exist; the final directory must be new and outside every git
working tree. Private input keys must be regular files with no group/other
permissions, for example mode 0600. Unencrypted P-256 PEM keys are supported;
encrypted-key prompts are disabled instead of hanging a batch command.

```sh
firmware/target/debug/matter-provision issue-dev \
  --metadata /private/material/metadata.txt \
  --pai-cert /private/material/pai.pem \
  --pai-key /private/material/issuer-key.pem \
  --cd /private/material/cd.der \
  --paa-cert /private/material/paa.pem \
  --cd-signer /private/material/cd-signer.pem \
  --out /private/material/new-device
```

To import issued device material, use `import`, replace `--pai-key` with both
`--dac-cert /private/material/dac.der` and
`--dac-key /private/material/device-key.pem`, and use a new output directory.
Certificates accept PEM or DER; the CD must be DER.

The tool creates its output directory with mode 0700 and every file with mode
0600. It refuses existing output directories/files and input symlinks. Child
process output is captured; errors never echo OpenSSL stderr or credential data.
The issuer key is passed through a private stdin pipe and is not copied into the
output directory. No command argument contains a key or PIN value.

Output includes normalized public certificates/CD/trust inputs, the private
`device-key.pem`, private `pairing.txt`, metadata and a validation report. The
pairing file contains the SDK's manual pairing code and QR payload, plus the new
PIN/discriminator. It is never printed by the tool. The completed record is synced
as `record.pending`, then published last as `record.bin` with an atomic hard link
that refuses overwrite. `record.bin` never exposes a partial write. A failed
operation can leave an incomplete private directory or, if the final directory
sync/cleanup fails, an already complete record with an error result. Revalidate
such output before use; a pending file is never a completion acknowledgement.
The tool never overwrites it. The output filesystem must support hard links and
directory syncing.

```sh
firmware/target/debug/matter-provision validate \
  --record /private/material/new-device/record.bin \
  --paa-cert /private/material/paa.pem \
  --cd-signer /private/material/cd-signer.pem
```

Validation checks the production decoder, P-256 key correspondence, DAC/PAI
identity and key IDs, Matter PAA structure and optional VID, certificate-chain
signatures/validity against the explicit PAA using the host clock with default
CA directories/stores disabled, and the CD CMS
signature against the selected P-256 signer.
The narrow CMS parser requires one v3 SKID signer, SHA-256/ECDSA-SHA256 and the
Matter embedded-content form, without embedded certificates or signed attributes.
CD payload checks cover mandatory fields, duplicate tags, VID/PID applicability,
optional origin IDs and authorized PAA IDs. CD signing-certificate trust is the
explicit selected key; the tool does not fetch a CSA trust list or infer trust
from certificate names. Issued DAC lifetime is ten years, limited operationally
by its issuer chain's validity.

The library encoder reuses the production decoder as its acceptance check and
clears its caller buffer on every error. The record remains version `CSMAT01`, at
most 3584 bytes, stored under key `0x434D`. The wire layout is unchanged from
[matter-integration.md](matter-integration.md).

## Required application writer transaction

This is a contract for the next app integration, not an implemented USB command.
It must use the live `Matter::kv` access or the existing local fallback access,
never a second `FlashStorage`, independent NVS writer or partition-image flash.

1. Require explicit local provisioning intent while maintenance is durably active.
   Confirm the actual relay-low control acknowledgement. Keep the reserved Off
   ingress and control task available throughout the transfer.
2. Admit one bounded transfer with a fresh owner token, total length no greater
   than 3584 bytes and a whole-record integrity value. Receive bounded chunks with
   exact offsets and a finite monotonic timeout. Never echo bytes, PINs, keys or
   pairing strings. A duplicate/stale token cannot complete another transfer.
3. On cancellation, timeout, bad offset/length or malformed final record, clear the
   transfer buffer, release its ownership and retain the prior durable record.
   Validate the complete bytes with `Provisioning::decode` before storage. The
   host's stronger chain/CD checks complement, not replace, this app check.
4. For the initial writer, require provisioning to be absent. Identical existing
   bytes can be acknowledged idempotently after verification; different existing
   material must require a separately reviewed replacement/factory-reset flow.
   Do not silently overwrite the identity of an already commissioned node.
5. Store key `0x434D` through the existing KV closure and relay-off gate. Preserve
   each at-most-256-byte read/program checkpoint and single-4-KiB erase checkpoint.
   Read back and compare the exact completed record before the durable success
   reply. A receipt/transfer acknowledgement is not a durability acknowledgement.
6. Report only token/result/integrity status. Keep local service available after
   failure. After durable success, require an explicit reboot to activate the new
   identity; the current app consumes radio peripherals and static cells once per
   boot. Do not auto-reboot, erase fabrics or make calibration/configuration changes
   as a side effect of provisioning.

No app writer, activation, live pairing or hardware installation occurred in this
unit. Final-unit records belong outside git and require owner-controlled custody.

## Verification

The offline end-to-end tests issue fresh DACs, validate, import, and decode the
actual record. They verify fresh device keys across issuance, private file modes,
no key/PIN output, altered DAC/CD signatures, wrong PAA/CD signer, PID outside the
CD, symlink/read-permission rejection, git/output refusal and no overwrite.
The library test covers canonical round-trip, every short output capacity and
clearing on rejected metadata. Tests use public authority fixtures; newly
generated device credentials remain private scratch and are removed afterwards.

```sh
cargo test --manifest-path firmware/Cargo.toml -p crystal-shim-matter --locked
cargo clippy --manifest-path firmware/Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo fmt --manifest-path firmware/Cargo.toml --all -- --check
```

The full project gate also checks the unchanged app's C6 fmt, Clippy and release
build. Tool success does not satisfy G-05, prove attestation acceptance in Apple
Home, or measure radio/TLS memory and interrupt timing.
