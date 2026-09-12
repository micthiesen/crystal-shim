# Matter command and persistence adapter

The app now uses the real rs-matter persistence interface for configuration and
retained writes, and shares its bounded command ingress with a generated async
On/Off cluster handler. This is an integration boundary for the next radio unit.
There is no commissioned Matter node, radio, advertised device profile, or usable
HomeKit accessory in this build.

## Pinned interface and maintained reference

`firmware/matter` is a `no_std` host-workspace crate used by the C6 app. Its direct
dependency is exactly `rs-matter = 0.2.0`, with default features disabled. Both
lockfiles resolve the same version, code generator, and macros. The resolved
rs-matter feature set is empty. In particular, `sync-mutex`, `std`, and `log` are
absent. Radio and crypto implementations are intentionally not selected by this
adapter crate.

The maintained Stillair reference resolves these interfaces through
`rs-matter-embassy` revision
`f31233a6fd4530ff25ad3bcbd9abf8fe854320aa`, `rs-matter-stack 0.1.0`, and
`rs-matter 0.2.0`, using RustCrypto. The future radio assembly should use that
revision and the existing common ESP family revision
`10e48dd74837bae4be663a7d1825d12875363727`, including `esp-radio 0.18.0`, with
`embassy-net 0.9.1`. Those radio dependencies are not yet part of this app.
Sequential storage currently resolves to `3.0.1` in both test and app workspaces.

Relevant reference locations are Stillair's `firmware/app/Cargo.toml`,
`firmware/app/src/matter.rs`, and its storage adapter. Its fan command behavior,
pin map, and stored data are not transferred here.

## One gated storage owner

`app/src/storage.rs::Store` implements the actual `KvBlobStore` trait with gated
`load`, `store`, and `remove`. Each operation obtains a `flash_gate::Permit`;
the existing private `Access` adapter renews the relay-off acknowledgement for
each bounded driver operation. Reads and programs are at most 256 bytes;
programs stay within a 256-byte page, and erases cover exactly one 4 KiB sector.
The existing validated NVS partition remains the only allowed range.

`main.rs` opens the sole `Store`, reads boot records, then moves that same owner
into `SharedKvBlobStore`, with one 4096-byte scratch buffer. Application writes
call `matter::storage::apply` through `KvBlobStoreAccess`, the same interface
returned by `Matter::kv`. A future stack must receive this owner and give its
shared access back to application transactions. It must not create an alternate
`FlashStorage`, use a second partition writer, or re-enter storage from inside an
access closure.

The SDK's default blocking mutex uses its single-executor backend. It does not
disable interrupts across the storage closure. All KV access remains in the
thread-mode executor, so Priority3 control can acknowledge actual GPIO-low while
the synchronous KV caller waits. Enabling rs-matter `sync-mutex` would select a
critical-section mutex on bare metal and break this contract. The production gate
also rejects access outside interruptible thread mode.

Retained and configuration keys remain `0x4353` and `0x4346`; Matter's built-in
keys use the SDK's separate low-numbered range. `remove` is idempotent for a
missing key. Failures become a generic Matter `Failure` without logging driver
details or stored bytes. The upstream sequential-map adapter is not used because
its trace logging includes blob contents.

## Command ownership and applied reporting

`runtime_ingress::Ingress` has one fixed request slot and a reserved Off flag.
Each accepted request gets a monotonically increasing internal generation plus
its producer (`Usb` or `Matter`). The user-visible USB ID is only a correlation
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
Busy and rejected commands are returned as errors. An Off received while the slot is full returns Busy but still
sets the reserved revocation flag.

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
The main loop uses the same `OnOff` object's producer entry point for USB commands
and samples observed output to refresh the cluster data version. The generated
`ClusterAsyncHandler` reads that observed state. Its `run` method separately tracks
the last version notified, so sampling in the app cannot swallow a subscription
notification. A radio assembly must run the handler and seed its initial data
version from the TRNG; the current non-networked object starts at zero.

## Device-profile boundary

The generated On/Off cluster metadata exposes only Off, On and Toggle, with no
lighting, startup, timed, or scene features. Direct handlers for OffWithEffect,
OnWithTimedOff and OnWithRecallGlobalScene return `CommandNotFound` as well.

Decision [D-22](../decisions.md)
selects On/Off Plug-in Unit (`0x010A`, revision 3) as the next radio slice's private
controlled-load identity. The pinned
[CHIP v1.5.1.0 device definition](https://raw.githubusercontent.com/project-chip/connectedhomeip/v1.5.1.0/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml)
uses this revision. This describes the controlled load more closely than
the On/Off Light Switch type, which is a controller/client device. However, the
[Matter 1.3 device library, section 5.1](https://csa-iot.org/wp-content/uploads/2024/05/matter-1-3-device-library-specification.pdf)
requires additional clusters and Lighting behavior for an On/Off Plug-in Unit.
The [CHIP device definitions](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml)
also carry profile-specific requirements. The private accessory will advertise
only implemented metadata and document its deviations from those requirements.
It will not claim Matter conformance or certification. Boot-off and immutable
leases remain authoritative; startup restore, scenes and timed commands will not
be added just to claim a complete profile. Actual Apple Home pairing and control
remain final-board acceptance tests. The present build still advertises no node.

## Next radio assembly boundary

The next unit will use the exact Embassy/ESP pins above and one project-owned,
fallible Wi-Fi/BLE network stack. Its thread-mode network work must leave the USB
transaction service running if startup fails, the interface is down, or Matter
returns. The existing service must borrow the same `Matter::kv` access as the
protocol. `UserTask` is unsuitable for that service because the SDK cancels it
when the operational network interface goes down.

The pinned Embassy `enet.rs::EnetStack` currently uses `NoopNet` for TCP and
returns `None` from `tcp_connect`. Enabling TCP features or extra sockets alone
does not make TLS usable. Construct one `embassy_net::Stack` and its runner in
project code, wrap that same stack with TCP/DNS/UDP access, and use the public
`PreexistingWireless`/`run_coex` boundary. Reuse `EnetNetif`,
`EspWifiController` and Trouble GATT rather than opening another radio or flash
handle. The precise assembly still needs a compile probe before implementation.

The stock ESP driver unwraps BLE construction, Wi-Fi construction and power-save
configuration. A local wrapper must return those errors. Retain RNG, ADC1, WIFI
and BT ownership in the board adapter; ADC1 is free here because the sensor uses
I2C. Keep `TrngSource` alive and seed separate CSPRNG streams for Matter and the
static RNG required by MbedTLS. Never substitute Matter's monotonic epoch for
trusted certificate UTC. Network-only TLS work can use `UserTask` once TCP exists,
with one session and cancellation-safe buffers. Commissioning identity and keys
must come from explicit provisioning, and absent material leaves the app local.

## Verification and remaining work

Evidence collected 2026-09-12 without hardware or network operations:

- Host fmt and Clippy with warnings denied passed. The host workspace passed
  115 core, 9 driver, 1 CLI, and 9 Matter adapter tests.
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
  build passed. The current release ELF, including the concurrent sensor startup
  recovery change, reports text 621,272, data 9,052, BSS 16,980 bytes
  using `llvm-size`. This measures the current app, whose unused transport handler
  paths can be removed by the linker; it is not a combined Matter-radio or TLS
  memory measurement.

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

The next integration needs recoverable radio initialization, Wi-Fi/BLE transport
and coexistence, TRNG/crypto, commissioning material, root endpoint handlers,
the documented private profile, handler execution/subscriptions, and shared KV ownership
through `Matter::kv`. The Stillair Embassy driver currently unwraps some radio
setup failures; carry a local fallible wrapper so failed networking cannot reset
or disable local protection. Combined flash/RAM and allocator high-water checks,
the 48 KiB free-SRAM gate, real GPIO/flash/watchdog timing, authenticated HomeKit
behavior, and final-board commissioning remain required. No current time,
calibration, credentials, or commissioning identity is invented by this unit.
