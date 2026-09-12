# Private Matter provisioning

The host-only `matter-provision` tool creates or imports private device material,
serializes the exact record consumed by the app, and validates it offline. Its
explicit `send` command transfers a validated record through the app's bounded USB
writer and single gated Store. Other commands never open serial ports. The tool
does not flash a firmware/partition image, pair an accessory or contact a network.

Offline issuance/import/validation requires OpenSSL 3 on PATH. On macOS, check
`openssl version` in the shell running the tool; the system LibreSSL executable
does not satisfy that dependency.

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

Requires stable Rust and OpenSSL 3 on macOS or Linux. The existing host workspace
pins `libc` for Unix serial access; it is absent from the ESP target graph.
Build from the repository root:

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

## Explicit host USB sender

On macOS or Linux, close other terminal programs and select the actual physical
USB device path. The tool never enumerates or opens candidate ports. The record
must be a regular file with no group/other permissions, normally mode 0600.
Final-path symlinks are rejected for both the record and port; use the actual
device node rather than a `/dev/serial/by-id` symlink on Linux.

```sh
firmware/target/debug/matter-provision send \
  --record /private/material/new-device/record.bin \
  --paa-cert /private/material/paa.pem \
  --cd-signer /private/material/cd-signer.pem \
  --serial /dev/cu.usbmodemACTUAL_DEVICE
```

`send` loads the record once with bounded, nonblocking, no-follow file access,
checks descriptor identity and private permissions, and completes the same
production-decoder, PAA-chain and CD-signer validation described above. It removes
validation scratch and generates a fresh 128-bit OpenSSL nonce before opening
the port. The exact validated bytes supply the SHA-256 digest and every chunk;
replacing the file during transfer cannot substitute unvalidated credentials.
OpenSSL 3 must be on PATH in the shell running the command, including tests.

The port uses nonblocking 115200 8N1 raw mode, no echo, no software/hardware flow
control, bounded poll/read/write calls, an advisory lock and kernel terminal
exclusivity. An already-open reader cannot be evicted by that exclusivity; close
it first. No-echo, 8N1 and disabled flow-control flags are read back before any
transmission; a driver that does not retain them is rejected. USB Serial/JTAG
does not depend on the nominal baud rate. The sender
does not request DTR/RTS changes, breaks or flashing/reset operations. It restores
terminal processing on normal close but leaves HUPCL disabled to avoid requesting
a hangup at close. OS/driver behavior at device open is not a physical reset test.

BEGIN must receive the matching nonce/generation's `Ready(0)` after durable
maintenance and relay-off admission. A lost initial Ready cannot be guessed from
diagnostic text; it times out. Chunks are sequential and at most 256 bytes. Each
acknowledgement must have the exact request ID, full owner token and expected next
offset. A missing ACK triggers STATUS: an advanced offset or verified receipt
resolves the lost response, and only STATUS proving the unchanged offset allows
one bounded retransmission. A chunk already acknowledged by STATUS is never
replayed. An owned cancellation is attempted on a pre-commit rejection/timeout;
a partial I/O failure receives no appended command because framing is uncertain.
The writer's own expiry clears abandoned staging. Cancellation never exits
maintenance.

Host deadlines are fixed: 1 second for each write/chunk ACK/STATUS, up to 5.25
seconds for admission, a 59-second staging/commit exchange limit, and up to 5.25
additional seconds only for explicitly requested reboot admission. Commit ACK
wait is bounded to 2 seconds before STATUS recovery. The device independently
retains its 5-second idle, 60-second total and 120-second receipt limits. There are
no CLI timeout overrides. Long storage stalls or disconnects can therefore yield
an uncertain result even when storage ultimately succeeds.
Interrupting the host process never exits maintenance. Before commit, abandoned
staging expires; an interruption during commit must be treated as uncertain and
resolved with the same private record.

Success requires exactly `Complete(StoredVerified)` or
`Complete(AlreadyPresentVerified)` for the current owner. It leaves the device in
maintenance with no reboot. The sender reports a different-record conflict
without replacement. A missing final receipt, reboot during commit or storage
verification failure is reported as uncertain, never as success. Keep the same
private record and retry it with a fresh invocation/nonce: the installer either
performs verified identical readback or rejects a conflict. Do not generate a
replacement identity to resolve an uncertain result.

Append `--reboot` only when activation is intended. This flag first requires a
verified commit result, then issues a separate REBOOT with its own request ID and
requires the writer's fresh durable maintenance/GPIO acknowledgement followed by
`Rebooting`. The success message confirms receipt of that acknowledgement, not
completion of a physical reset or Matter commissioning. If the acknowledgement
is lost, installation remains verified but activation is reported unconfirmed;
an identical retry with `--reboot` obtains a new verified receipt and request.

The physical USB connection is trusted. Owner tokens provide correlation, not
authentication against a malicious local reader/writer. Received lines are bounded
and discarded after strict parsing; diagnostics are never printed or captured as
a transcript. Record/chunk/read buffers are cleared on release. Neither keys,
PINs, record bytes, digest nor transfer token are supplied as CLI arguments or
printed in success/error messages. No serial hardware was opened during sender
development or its tests; only explicitly created pseudo terminals were used.

## Application USB writer

The actual `service::run` loop uses `provision_transfer::Transfer` and the shared
`RecordStore` interface. Both the live `Matter::kv` and the local fallback access
implement `ProvisionStore` through the same generic installer. There is no second
`FlashStorage`, NVS owner, radio handle or partition-image writer. Radio failure or
return leaves this service running.

An explicit valid CONFIG must have completed first. Calibration may remain absent.
Provisioning never invents configuration, calibration or UTC. A never-configured
runtime can acknowledge maintenance only as Applied; the writer rejects it as
`Unconfigured`, because no durable maintenance record exists. The ordinary CONFIG
command accepts the canonical CSCF hex record; a convenient host configuration
encoder remains separate work. The [settings webpage](settings.md) can edit an
already configured device after network provisioning.

`PROVISION_BEGIN` submits an owned `EnterMaintenance` through the existing ingress.
It accepts no chunks until that exact request replies Durable and the control task
publishes current configured/durable-maintenance/relay-low status after its GPIO
write. Admission is not a durability acknowledgement. The extra internal source
prevents the generic USB reply drain from consuming this ACK. Cancelling an
in-flight request abandons its reply without releasing its ingress generation
until completion, so a late reply cannot authorize another transfer.

While preparing or receiving, the service admits only ordinary OFF and provisioning
commands. The existing reserved Off flag still works when the normal request slot
is occupied. Other USB commands return BUSY; Matter On remains subject to the
supervisor's maintenance rejection. HTTP settings now participate atomically in
the same reservation before they can change configuration or exit maintenance.
Both USB and HTTP preserve the independent Off path. No supervisor lease policy was changed.

The line protocol below uses a nonzero decimal request `id`. Each line ends with
LF; CRLF also works. A nonce is exactly 32 hex characters, chosen freshly by the
host for every attempt and across boots, and cannot be all zero. A token is the
device's nonwrapping decimal generation, a colon, and that nonce. Tokens provide
correlation for this trusted physical USB boundary, not authentication.

| Request | Meaning |
| --- | --- |
| `id PROVISION_BEGIN nonce length sha256` | Length is 1 through 3584; SHA-256 is 64 hex characters over the exact record. Returns `Ok(Pending)` with the token, followed by `Ok(Ready(0))` only after the owned durable-maintenance/GPIO ACK. |
| `id PROVISION_CHUNK token offset hex` | 1 through 256 decoded bytes at the exact next offset. Returns `Ok(Next(offset))` with the new next offset. This acknowledges staging only. |
| `id PROVISION_STATUS token` | Returns Pending, the next offset, or the last verified completion. It does not refresh transfer deadlines or repeat a write. |
| `id PROVISION_COMMIT token` | Requires complete length, matching SHA-256 and successful production `Provisioning::decode`, then performs verified KV installation. |
| `id PROVISION_CANCEL token` | Clears staging and releases pre-commit ownership. It never issues EXIT; maintenance stays latched if it was already applied. |
| `id PROVISION_REBOOT token` | Requires the last verified receipt, then a new owned durable-maintenance/GPIO-low ACK. Only the resulting `Ok(Rebooting)` invokes `esp_hal::system::software_reset()`. |

Replies are `PROVISION id token result`, with `-` when no token was assigned.
Results use the typed names above, `Ok(Complete(StoredVerified))`,
`Ok(Complete(AlreadyPresentVerified))`, or `Err(...)`. This stream coexists with
ordinary REPLY, STORAGE and diagnostic lines. No bytes, PINs, keys, digest values
or pairing strings are echoed. Do not paste provisioning records into an echoing
terminal or save a plaintext command transcript; an eventual host sender must
configure its explicit serial device without echo and retain secret-safe file
handling and offline validation on the same loaded bytes.

One transfer owns a statically allocated 3584-byte staging buffer. Admission and
reboot handshakes each expire at 5 seconds. Receiving expires at 5 seconds without
a valid chunk or 60 seconds from BEGIN, whichever comes first. STATUS, wrong-token
traffic and rejected commands never renew either limit. Lines have a separate
5-second whole-line deadline and a 4128-byte cap. Polling without USB input clears
expired partial lines while draining through their newline so a suffix cannot
become a command. A backwards monotonic observation aborts an active transfer.
The last successful receipt expires after 120 seconds and holds no transfer
reservation. A new admitted transfer invalidates that receipt. Tokens cannot wrap.

Wrong tokens cannot cancel or complete the current owner's transfer. An attributable
malformed request, bad offset, duplicate or oversized chunk, invalid final record or
failed integrity check aborts and wipes that owner's staging. Unattributable syntax
errors do not acquire or cancel ownership. After a lost chunk ACK, use STATUS and
the reported next offset instead of replaying a chunk. Raw input, framing/decode
buffers and owned chunks are cleared; staging is cleared on all terminal paths.
Compiler-resistant stores preserve these clears, without claiming erasure of
historical flash, prior compiler copies or registers.

`storage::install_provisioning` validates before mutation and holds one KV access
closure across the existing-record check, store and exact readback. Only absence
allows a write. Exact existing bytes return verified idempotence without a write;
different bytes, including an invalid old identity, return Conflict. A load error
is never treated as absence. Configuration, retained, network and fabric keys are
not changed by this installer. Each raw read/program remains at most 256 bytes,
and every single 4 KiB erase retains its fresh relay-off gate checkpoint. Scratch
used by the KV closure is cleared when that closure returns.

Before KV mutation begins, cancellation or validation failure retains the prior
record. KV is synchronous, so USB cannot cancel it midway; it can temporarily stall
thread-mode USB/radio polling while Priority3 control remains independent. A store
or readback failure may occur after bytes became durable. It produces no success
receipt and does not attempt rollback or remove a possibly committed identity.
A new identical transfer can resolve that uncertainty through verified idempotence.
Power loss before the first write leaves the old record/absence. Interrupted NOR
records use existing map recovery; loss after commit but before ACK is idempotent.

Successful installation does not reboot or start commissioning. The current app
consumes its provisioning bytes, radio peripherals and static cells once per boot.
An explicit reboot is required for the new identity to be consumed. No fabric erase
or identity replacement workflow is provided. Final-unit records remain outside
git. No physical USB transfer, activation, live pairing or hardware installation
has been performed by these software checks.

## Verification

The offline end-to-end tests issue fresh DACs, validate, import, and decode the
actual record. They verify fresh device keys across issuance, private file modes,
no key/PIN output, altered DAC/CD signatures, wrong PAA/CD signer, PID outside the
CD, symlink/read-permission rejection, git/output refusal and no overwrite.
The library test covers canonical round-trip, every short output capacity and
clearing on rejected metadata. Tests use public authority fixtures; newly
generated device credentials remain private scratch and are removed afterwards.

Sender tests run the real production `Transfer` through a deterministic stream,
including stale tokens, lost requests/ACKs and STATUS resolution, corrupt offsets,
storage errors, idempotent retry after an uncertain commit, missing Ready, bounded
diagnostic floods and separate reboot admission. Pseudo-terminal tests check raw
no-echo mode, bounded I/O, fragmented replies, validation before terminal mutation,
and a full CLI transfer whose file is replaced after validation while the original
validated bytes still arrive. All 16 sender/CLI tests and scoped Clippy pass on
macOS and OrbStack Linux. The test emulator retries interrupted polls against
one absolute exchange deadline. These are host checks; USB HAL, physical reset and
live flash behavior remain untested.

```sh
cargo test --manifest-path firmware/Cargo.toml -p crystal-shim-matter --locked
cargo clippy --manifest-path firmware/Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo fmt --manifest-path firmware/Cargo.toml --all -- --check
```

Production transfer tests exercise actual Runtime/Ingress ownership, CONFIG-first
admission without calibration, durable versus Applied ACKs, GPIO readiness,
reserved Off, stale/cancelled replies, exact bounds/timeouts, buffer clearing,
integrity/record rejection, receipt expiry and separate reboot authorization.
The production app Store is compiled over deterministic NOR in `gated_store.rs`.
It tests same-owner installation, idempotence, conflicts and failure at every raw
operation boundary during an installation that triggers page cleanup, then reopens
the Store and verifies retry and preservation of other keys. Adapter tests separately
exercise missing/different/error readback and uncertain store completion.

The full gate also checks C6 fmt, Clippy, release and resolved Matter feature identity.
The writer release measured text 1,906,596, data 23,836 and BSS 245,392 bytes; relative
to the preceding release this is +5,108 text and +6,840 static SRAM (data + BSS).
The transfer static itself is 3,752 bytes; the remainder includes additional async
service and snapshot state. The 100 KiB heap allocation is unchanged. The installer
is present in the linked ELF through `SharedKvBlobStore<Store, 4096>`, the concrete
access used by both live Matter KV and fallback. These are linked build measurements,
not measured stack peaks or radio/TLS/USB concurrency headroom. Tool success does not
satisfy G-05, prove Apple Home attestation acceptance, or measure physical interrupt,
USB, flash-stall or reset behavior.
