# Matter radio, command and persistence integration

The app assembles the pinned Matter-over-Wi-Fi stack, BLE commissioning, one
Embassy network runner with TCP/DNS/UDP, and the generated bounded On/Off handler.
The production radio branch depends on a private provisioning record in NVS.
Missing or invalid material keeps commissioning closed and USB/local protection
available. No identity, private key, PIN, current UTC or calibration is supplied
by this repository. Apple Home pairing and operation have not been exercised.

## Pinned interface and maintained reference

`firmware/matter` is a `no_std` host-workspace crate used by the C6 app. Both
lockfiles resolve the same `rs-matter 0.2.0`, code generator and macros. The app
uses RustCrypto through `rs-matter-embassy` revision
`f31233a6fd4530ff25ad3bcbd9abf8fe854320aa` and `rs-matter-stack 0.1.0`. Its
common ESP family revision is `10e48dd74837bae4be663a7d1825d12875363727`,
including `esp-radio 0.18.0`. Related exact resolved APIs are `embassy-net 0.9.1`,
`edge-nal-embassy 0.9.0`, `edge-nal 0.7.0`, `bt-hci 0.8.1`, `trouble-host 0.6.0`
and `sequential-storage 3.0.1`. Wi-Fi/BLE `coex` is explicitly enabled.

The maintained Stillair locations are `firmware/app/Cargo.toml`,
`firmware/app/src/matter.rs` and its main heap/executor setup. Its fan behavior,
pins, stored data and example commissioning identity are not transferred.
Primary implementation boundaries are the pinned
[Embassy network adapter](https://github.com/ivmarkov/rs-matter-embassy/blob/f31233a6fd4530ff25ad3bcbd9abf8fe854320aa/rs-matter-embassy/src/enet.rs),
[ESP Wi-Fi controller adapter](https://github.com/ivmarkov/rs-matter-embassy/blob/f31233a6fd4530ff25ad3bcbd9abf8fe854320aa/rs-matter-embassy/src/wifi/esp.rs),
and [ESP radio sources](https://github.com/esp-rs/esp-hal/tree/10e48dd74837bae4be663a7d1825d12875363727/esp-radio).

`sync-mutex`, `std`, `log` and `defmt` are absent from the app's resolved
rs-matter features. The host adapter has no crypto backend selected, and the app
selects RustCrypto. `scripts/check_matter_features.py` checks matching API identity
and rejects the mutex feature. SDK blob logging remains disabled.

## One gated storage owner

`app/src/storage.rs::Store` implements the actual `KvBlobStore` trait with gated
`load`, `store`, and `remove`. Each operation obtains a `flash_gate::Permit`;
the existing private `Access` adapter renews the relay-off acknowledgement for
each bounded driver operation. Reads and programs are at most 256 bytes;
programs stay within a 256-byte page, and erases cover exactly one 4 KiB sector.
The existing validated NVS partition remains the only allowed range.

`main.rs` opens the sole `Store` and reads boot records. `matter::run` reads the
private provisioning record and invokes SDK `startup` with that same store.
After startup returns, even on error, `stack.matter().kv(store)` owns it. A small
permanent allocation keeps the access object alive after radio return. The
separate USB service receives only a `RecordStore` trait object for application
transactions; Matter borrows the exact same KV access. Missing provisioning or
entropy uses `SharedKvBlobStore` with the same Store and a fallback 4096-byte
scratch buffer. Only one path publishes the owner per boot.

USB receives/parses and handles applied replies while preparation is pending;
it leaves storage tickets pending until access is published. A failed Store open
publishes a permanent typed failure. No network result cancels the local service.
The app never constructs another `FlashStorage`, opens another partition writer,
or re-enters storage from inside an access closure. The Matter-owned scratch
buffer is also 4096 bytes; the fallback buffer remains statically reserved.

The SDK's default blocking mutex uses its single-executor backend. It does not
disable interrupts across the storage closure. All KV access remains in the
thread-mode executor, so Priority3 control can acknowledge actual GPIO-low while
the synchronous KV caller waits. Enabling rs-matter `sync-mutex` would select a
critical-section mutex on bare metal and break this contract. The production gate
also rejects access outside interruptible thread mode.

Retained and configuration keys remain `0x4353` and `0x4346`; Matter's built-in
keys use the SDK's separate low-numbered range. Private provisioning uses `0x434D`. `remove` is idempotent for a
missing key. Failures become a generic Matter `Failure` without logging driver
details or stored bytes. The upstream sequential-map adapter is not used because
its trace logging includes blob contents.

## Command ownership and applied reporting

`runtime_ingress::Ingress` has one fixed configuration/request slot, small reserved
Off and UTC-clear reply slots, and a lossless Off flag.
Each accepted request gets a monotonically increasing internal generation plus
its producer (`Usb`, `Matter`, `Provisioning` or `Settings`). The user-visible USB ID is only a correlation
value. Tokens own replies, preventing reused IDs, stale completions, or another
producer from collecting an acknowledgement. Generation exhaustion refuses new
requests until reboot and still preserves reserved Off.

`matter::OnOff::command` submits only Off, On, or Toggle, then waits for the
matching control reply. A 250 ms monotonic deadline bounds waiting; clock
rollback also times out. An already available applied reply is consumed before
checking the deadline. USB `ACCEPTED` still means admitted, not applied or durable.
Matter success requires an `Applied` reply. Resolved On requests receive this
reply only when the final supervisor result retains override demand and its
deadline. Sensor faults, stale/future/revision-mismatched input, maintenance,
hardware exclusion and an expired lease produce `Rejected` if no override
remains. Valid low-water overrides waiting for minimum-off recovery still succeed.
The decision uses the final supervisor result rather than duplicating its gates.
Busy and rejected commands are returned as errors. Off can be admitted while a
configuration request owns the large slot and receives `Applied` after the output
iteration, even during pending storage. If its own reply slot is full or generation
is exhausted, it returns Busy while still setting the reserved revocation flag
and superseding any older queued On/Toggle or clock-setting request. A later
explicit On remains a new request governed by the usual safety checks.

Dropping or timing out a command future removes its queued request. Once control
has dispatched it, cancellation abandons only the reply and retains ownership
until completion. Cancellation never undoes an applied command. An Off's
reserved flag survives cancellation. These rules bound memory and prevent a
late completion from acknowledging another request.

The Priority3 control task resolves Toggle from its current output state, applies
the existing runtime safety policy, writes the relay GPIO, publishes its observed
state, and only then publishes command replies. Repeated On, Toggle while waiting
for minimum-off recovery, overlap, and configuration changes cannot extend the
existing lease. Sensor faults and maintenance remain authoritative. Off's reply
acknowledges immediate revocation; retained suppression durability is reported
separately by the existing storage state.

`app/src/matter.rs::LocalControl` touches only copied runtime mailboxes and status.
The USB service uses `LocalControl::begin` with its own source. The generated
`ClusterAsyncHandler` runs in the actual Matter handler chain, reads observed
output and publishes data-version changes every 20 ms when needed. It separately
tracks the last version notified, so a read cannot swallow a subscription update.
All endpoint data versions are seeded from the hardware-backed CSPRNG.

## Device-profile boundary

The generated On/Off cluster metadata exposes only Off, On and Toggle, with no
lighting, startup, timed, or scene features. Direct handlers for OffWithEffect,
OnWithTimedOff and OnWithRecallGlobalScene return `CommandNotFound` as well.

Decision [D-22](../decisions.md)
selects On/Off Plug-in Unit (`0x010A`, revision 3) as this app's private
controlled-load identity. The pinned
[CHIP v1.5.1.0 device definition](https://raw.githubusercontent.com/project-chip/connectedhomeip/v1.5.1.0/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml)
uses this revision. This describes the controlled load more closely than
the On/Off Light Switch type, which is a controller/client device. However, the
[Matter 1.3 device library, section 5.1](https://csa-iot.org/wp-content/uploads/2024/05/matter-1-3-device-library-specification.pdf)
requires additional clusters and Lighting behavior for an On/Off Plug-in Unit.
The [CHIP device definitions](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml)
also carry profile-specific requirements. The private accessory advertises only implemented metadata and makes no Matter
conformance or certification claim. Boot-off and immutable
leases remain authoritative; startup restore, scenes and timed commands will not
be added just to claim a complete profile. Actual Apple Home pairing and control
remain final-board acceptance tests.

`matter/src/profile.rs` supplies the production endpoint metadata and its host
regression. Endpoint 0 is the SDK Wi-Fi root endpoint and corresponding root
handler. Endpoint 1 contains Descriptor, Identify, Groups and the bounded On/Off
cluster. Identify advertises only its required Identify command/attributes; the
single USB/LED owner blinks GPIO20 for the requested countdown. TriggerEffect is
not advertised. Groups uses the SDK fabric/group-key machinery and the same KV
owner. Group-addressed On/Off still reaches the bounded handler; no Scenes cluster
or scene recall is exposed. The restricted On/Off surface and missing full
Lighting behavior remain explicit private-profile deviations.

## Actual radio and service lifetime

`app/src/radio.rs` owns the WIFI/BT peripherals and creates one Embassy stack.
It maps BLE construction, Wi-Fi construction and power-save configuration errors
to typed errors; `Interface::try_station` also fails instead of panicking on a
second take. `PreexistingWireless` joins the same stack's `ProjectNetStack`,
`EnetNetif`, `EspWifiController`, built-in mDNS and Trouble GATT. `run_coex` and the
Embassy runner share a cancellation scope. Radio return stops protocol work and
reports `RadioStopped`; the USB/transaction service remains alive. Reboot is the
current retry boundary after a fatal startup/run error.

The pinned stock `EnetStack` returns `None` for TCP even if the TCP feature is
enabled. Our wrapper exposes actual `TcpConnect`, `TcpBind`, UDP bind and DNS
backed by the same stack. Two TCP pool slots each reserve 2048-byte TX/RX buffers;
three UDP slots cover Matter, mDNS and a future time-acquisition socket. Seven IP
socket resources include DHCP/DNS. TCP bind/connect share the two-slot pool.
The SDK creates DHCPv4 plus MAC-derived link-local IPv6. This app does not claim
Matter TCP-server transport; Basic Information advertises `tcp_supported=false`.

The USB service lives outside `UserTask` and every network lifetime. The pinned
`run_coex` implementation starts `UserTask` alongside protocol work, despite its
interface-up-only documentation, so application network work must check readiness.
Our task checks an operational interface and IPv4 configuration and reports TLS
readiness without opening HTTPS sockets. Its [trusted UTC child](trusted-utc.md)
now makes bounded CASE reads through the same Matter exchange/UDP transport when
a trusted source is configured. A future HTTP/Pushover worker must await usable
configuration and handle loss/retry itself.

A permanent `TrngSource` owns RNG and ADC1, which the I2C sensor does not use.
Independent hardware-seeded, periodically reseeded CSPRNG streams serve Matter
and MbedTLS. A small typed adapter bridges the SDK's rand_core 0.6 RNG to
MbedTLS's rand_core 0.10 interface. Main installs the TLS timer/certificate-clock
hooks once. Control now publishes the same accepted original UTC capture to the
schedule and TLS provider. Automatic observations come from the configured CASE
peer; explicit USB UTC remains an operator authority. Cached SDK RTC, build time
and unauthenticated network time do not establish TLS trust. The root enables only
TimeSyncClient and advertises client cluster 0x0038; POSIX timezone configuration
remains project-owned. TLS engine failure does not disable Matter or local service.
Actual Home hub time-server availability and TrustedTimeSource/ACL setup remain
final-pairing evidence; this implementation does not claim the Home app configures them.

## Private provisioning boundary

`matter/src/provisioning.rs::Provisioning::decode` is the only admission path.
`matter::run` loads key `0x434D` through the gated Store into a 4096-byte buffer.
The record payload is at most 3584 bytes, leaving sequential-storage overhead.
No repository build flag supplies a deployable default. This runtime read keeps
the real transport branch in the release binary even when material is absent.
There is no public example DAC private key in the app. Unit tests use an explicitly
synthetic keypair/framing fixture that fails production certificate validation;
it is not a commissioning identity.

Version 1 byte layout, in order:

| Field | Encoding / bound |
| --- | --- |
| Magic/version | 8 bytes `CSMAT01` followed by NUL |
| VID, PID, hardware version, discriminator | Four little-endian u16 values |
| Setup PIN | Little-endian u32, Matter permitted range/patterns only |
| Vendor name, serial number, unique ID, hardware version string | Each: little-endian u16 byte length plus nonempty UTF-8; limits 32, 32, 32, 64 bytes; no control characters |
| DAC public key | 65-byte uncompressed P-256 point |
| DAC private key | 32-byte P-256 scalar |
| Certification Declaration, PAI DER, DAC DER | Each: little-endian u16 byte length plus DER; each at most 1536 bytes, total record still at most 3584 |

The decoder rejects truncation, trailing bytes, forbidden setup codes, invalid
identity fields and key mismatch. The SDK's `DacCert`/`PaiCert` parsers check X.509
structure and required certificate extensions. DAC public key, VID/PID, PAI VID
and any PAI PID, plus DAC authority/PAI subject key IDs must agree with the record.
The commissioner still verifies certificate signatures, CD and trust, including
its policy for private development identities. Provisioning is not a certification
claim. Records and key-bearing objects have no Debug/Display implementation and
are never echoed or logged.

The [offline tool and bounded USB writer](matter-provisioning.md) now create,
validate and install the record through that same Store contract without printing
private material. The writer requires explicit CONFIG, a current durable-maintenance
and relay-low acknowledgement, bounded staging, exact verified readback and a
separate explicit reboot. The host serial sender and physical delivery/activation
remain work. Actual Apple Home acceptance remains separate.
Missing/invalid material reports a generic state,
constructs no radio, and retains local settings/calibration service.

## Verification and remaining work

Evidence collected 2026-09-12 without hardware or network operations:

- Host fmt and Clippy with warnings denied passed. The host workspace passed
  117 core, 9 driver, 1 CLI, and 36 Matter tests across library and integration
  targets. New tests cover provisioning
  bounds/key consistency/closed invalid identity, actual restricted endpoint
  metadata, and service polling/cancellation after network completion.
  Root review added a complete X.509 acceptance case and mismatched VID/PID/DAC
  key rejection. Public SDK credentials are used only inside `cfg(test)`; the
  production image has no default attestation material.
- `matter/tests/gated_store.rs` compiles the actual app storage source with a
  deterministic NOR driver. It checks shared application/protocol keys,
  missing-key deletion, garbage collection, driver failures, permit release,
  and a fresh checkpoint with every bounded read/program/erase. Its fake permit
  does not prove actual interrupt priority, GPIO timing, or ROM stalls.
- `matter/tests/on_off.rs` compiles the SDK-generated async adaptor, checks its
  advertised metadata, and exercises the production command future with an
  injected control backend. It covers applied ACKs, rejection, reserved Off,
  cancellation before/after dispatch, stale completion, timeout boundary,
  monotonic rollback, and observed reporting. It does not exercise transport,
  encrypted exchanges, or full interaction-model TLV dispatch.
- `matter/tests/on_off_runtime.rs` drives the production command future through
  the real runtime. Rejections reach Matter as errors; valid low pending overrides
  succeed while reporting Off. Core regressions cover maintenance, hardware,
  calibration/revision, stale/future samples, clock rollback, and all expiry-tick
  On/Toggle resolutions. Before the fix, the safety-result and expiry-tick
  regressions both failed because `Applied` was returned without retained demand.
- Embedded fmt, Clippy `--all-targets` with warnings denied, and locked release
  build passed. Both resolved feature guards passed. The deterministic Linux TLS
  harness passed all 11 tests with production source and policy unchanged.
- Combined release ELF/static SRAM measurements are recorded below. These include
  the runtime-selected radio branch, TCP pools, root and application handlers,
  RustCrypto, provisioning checks, TLS engine/root policy, and the sensor startup
  recovery fix. They do not include a live TLS handshake worker: no connect/send
  caller exists yet, so unused handshake code may still be eliminated.

`llvm-size` on the linked C6 release with the USB writer reports text 1,906,596
bytes, data 23,836 bytes and BSS 245,392 bytes. RAM execution sections (`.trap`,
`.rwtext`, `.rwtext.wifi`) add 80,392 bytes, for 349,620 static RAM bytes before
alignment. The configured RAM ends at `0x4086E610`; `.stack` contains 102,488
bytes. BSS includes the 102,400-byte heap and a 66,440-byte
Matter allocation containing its 20,000-byte bump arena. TCP buffers, UDP buffers,
BLE/mDNS state, IP resources and task futures are also present. The release build
is below the static RAM limit; runtime radio/crypto heap peaks and stack use remain
unmeasured. The future TLS worker will add live session allocations beyond the
engine/readiness path measured here.

Commands from the repository root:

```sh
cargo fmt --manifest-path firmware/Cargo.toml --all -- --check
cargo clippy --manifest-path firmware/Cargo.toml --workspace --all-targets --locked -- -D warnings
cargo test --manifest-path firmware/Cargo.toml --workspace --locked
cargo tree --manifest-path firmware/app/Cargo.toml --locked -e features -i rs-matter
```

Run the embedded commands from `firmware/app` so its target configuration applies:

```sh
cargo fmt -- --check
sh ../../scripts/with-esp-toolchain.sh cargo clippy --locked --all-targets -- -D warnings
sh ../../scripts/with-esp-toolchain.sh cargo build --release --locked
sh ../../scripts/with-esp-toolchain.sh llvm-size target/riscv32imac-unknown-none-elf/release/crystal-shim
```

The host provisioning sender is now implemented and tested through synthetic
serial terminals on macOS and Linux; it has not opened real USB hardware.
Its host-only dependency adds no embedded code, and the release sizes above remain
unchanged. See [provisioning](matter-provisioning.md) for the explicit command.
The trusted UTC acquisition and control/TLS publication are implemented; the
configured peer and ACL must still be proven during final pairing. Remaining
integration includes the bounded Pushover worker using this TCP interface.
The [settings/schedule UI](settings.md) is now linked through the same stack. RF pairing/reconnect, real group/subscription
behavior, combined TLS handshakes, GPIO/flash/watchdog timing, peak heap and stack
high-water, and Apple Home acceptance remain final-board tests. The static RAM
margin is not a substitute for the required 48 KiB margin after measured runtime
stack use. ESP radio/RTOS internals can still panic on SDK invariants or allocation
exhaustion; the fallible wrapper covers their public Result-returning constructors,
not a general panic recovery mechanism. No live radio traffic, flashing or notification POSTs were used for this
evidence; the deterministic tests use no credentials or live endpoints.
