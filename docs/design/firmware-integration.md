# Firmware integration design

Status: implementation basis. This document records the APIs that exist in the
current Crystal Shim and Stillair trees and the remaining compatibility gates. It
does not claim hardware commissioning, Apple certification, HTTPS compatibility,
or final GPIO release.

## Reference baseline

The maintained reference is Stillair commit
[`19bde05`](https://github.com/micthiesen/stillair/tree/19bde05dd7bfd38363eb1eefd94aec2df7062c0f).
Crystal Shim should port Stillair's executor, Matter, NVS, and USB patterns. It must
not port Stillair's fan cluster, motor-controller driver, pin assignments, product
credentials, or commissioning evidence.

The embedded application remains a separate stable-Rust workspace targeting
`riscv32imac-unknown-none-elf`. The safety behavior remains in `crystal-shim-core`,
which has no `esp-*` dependencies. The application supplies monotonic time, decoded
sensor readings, persistent records, local civil-time resolution, and thin hardware
bindings.

## Execution and data ownership

Use three executor levels, following Stillair's task split. Priority protects
against lower-priority task work, not globally masked interrupts or flash access:

| Executor | Priority | Tasks | Rule |
| --- | ---: | --- | --- |
| `CONTROL_EXECUTOR: InterruptExecutor<1>` | `Priority3` | `control_task`, watchdog service | Owns the runtime coordinator, bounded schedule evaluation, `Supervisor`, relay GPIO and authoritative status. It never awaits flash, I2C, USB, Matter, DNS, HTTP, or TLS. |
| `SENSOR_EXECUTOR: InterruptExecutor<2>` | `Priority2` | `sensor_task` | Owns the FDC1004 instance and bounded acquisition state machine. It publishes calibrated or invalid readings through a latest-value cell. Priority3 can preempt every I2C transaction. |
| thread-mode Embassy executor | normal | storage, clock acquisition, Matter/Wi-Fi/BLE, HTTP, Pushover, USB, LED | No network or storage await belongs to control. Flash additionally requires the output-off handshake below. |

Initialize `RELAY_REQUEST` as a push-pull low output before starting any task. The
provisional controller map is GPIO10 for `RELAY_REQUEST`, GPIO18/19 for I2C,
GPIO11 for `MAINTENANCE_N`, GPIO20 for the status LED, and GPIO21 for `PSU_GOOD`.
GPIO12/13 remain assigned to native USB Serial/JTAG. These capture assignments
are bound in `board.rs`; no physical pin or board acceptance is implied.
GPIO0 separately enables the sensor bus, GPIO22 enables sensor power, and GPIO23
reads its active-low current-limit fault. Boot drives relay, bus enable and power
enable low before setting up I2C, USB or executors.
An interrupt-backed GPIO23 monitor at Priority3 latches each falling edge with
a monotonic fault epoch. Polling alone misses short TPS2553 fault assertions.
Only a full newly acquired frame following the power-recovery sequence may
clear that latch, provided the epoch has not changed and FAULT is high. Calibration
history is evaluated on a candidate copy and committed under that same epoch
check, so an interrupted acquisition cannot become the next slew baseline.

The current image implements those bindings, the 20 ms Priority3 output task,
Priority2 acquisition/recovery and bounded thread-mode USB administration. `main`
loads validated settings/calibration and repairs retained state before publishing
boot configuration. The [runtime coordinator](runtime-transactions.md) evaluates
schedules and consumes USB command/configuration requests. A valid calibration
and matching sensor revision are required before a run request can energize output.
TIMG1 has a 1,500 ms system-reset watchdog; only a completed output iteration feeds
it. The [flash adapter](flash-storage.md) holds the output off across each transaction,
uses at most one sector erase per chunk and requires another control acknowledgement
between chunks. Physical timing remains unverified.

`control_task` runs on a fixed monotonic cadence and consumes snapshots only:

1. Read the latest sensor result. If it is absent, stale, or invalid, pass the
   corresponding invalid `Reading` to `Supervisor`.
2. Read `PSU_GOOD` and the maintenance input every tick. `!PSU_GOOD` maps to
   `HardwarePermit::ForcedOff`, consumes any pending manual request, and therefore
   cannot restart when power returns. The existing supervisor freshness and minimum
   off interval must elapse before a later request can energize the output.
3. Take at most one command and storage completion from bounded nonblocking
   mailboxes. The reserved Off flag survives a full ordinary command slot.
4. Run the coordinator's bounded schedule/transaction step and publish its next
   immutable write request. Only matching durable settings and sensor revisions
   reach `Supervisor::update`. Set the relay GPIO from `status.control.relay`,
   constrained by the flash inhibit, then publish status and command replies.
5. Feed the watchdog only after that complete iteration, then acknowledge the
   matching relay-off flash ticket. No flash call occurs in this task.

The FDC1004 driver crate owns register encoding, reset/configuration, conversion-ready
polling, raw samples, I2C errors, and conversion/frame deadlines. The app-level
`sensor_task` supplies a 5 ms transaction timeout and owns
cadence, stale-age measurement, calibration application, and
translation to `crystal_shim_core::Reading`. Its only cross-priority output is a
copyable snapshot including configuration revision, `Reading` and diagnostics.
No driver future or I2C mutex enters `control_task`.
The pinned HAL's cancellation path can spend up to another 50 ms clearing the
bus synchronously. The sensor publishes each transfer deadline before awaiting
it; Priority3 independently invalidates an expired transfer while cleanup runs
below it. Clear the deadline together with a failed reading after timeout. The
5 ms bound is transfer acceptance, not total cancellation latency. The runtime
allows at most three startup/recovery attempts in a sliding 60-second interval.
After a failed frame, the sensor task follows the controller's bounded
TPS2553 power-cycle policy, isolates the cable with SENSOR_BUS_EN before removing
power, and reinitializes the converter after startup. It publishes invalid
input before recovery and cannot reuse a partial frame or cached calibration
result as a fresh observation.

## Module plan

| Path | Concrete responsibility and API boundary |
| --- | --- |
| `firmware/core/src/policy.rs` | Existing relay supervisor, `ScheduledWindow`, `WindowId`, interlock, manual override, and monotonic deadlines. |
| `firmware/core/src/schedule.rs` | Implemented bounded daily schedule evaluation. `Scheduler::evaluate` consumes injected UTC/civil time, a `LocalTimeResolver`, and the retained occurrence watermark. It returns `Inactive`, `PersistBeforeRun`, `Suppressed`, or an existing `ScheduledWindow`. |
| `firmware/core/src/retained.rs` | Implemented versioned 32-byte safety record, CRC validation, configured versus never-configured boot lifecycle, maintenance recovery, and interrupted-window suppression. It is independent of any flash driver. |
| `firmware/core/src/calibration.rs` | Implemented measured TI response normalization, calibrated raw envelopes, denominator/domain, sequence/freshness and slew validation. No physical coefficients are invented. |
| `firmware/core/src/runtime.rs` | Implemented coordinator for durable configuration/retained transactions, bounded schedule evaluation, command handling, aged UTC and sensor revision acceptance. |
| `firmware/core/src/runtime_ingress.rs` | Implemented source-owned generation tokens, bounded request slot, reserved Off flag, cancellation and physical USB line/configuration decoder. |
| `firmware/drivers/` | Separate no-std FDC1004 crate. It returns raw acquisition results and never imports schedule, storage, Matter, or the relay supervisor. |
| `firmware/app/src/board.rs` | Implemented controller capture pin bindings and safe initial levels; final-board acceptance remains open. |
| `firmware/app/src/control.rs` | Priority3 task, control mailbox, force-off flag, latest `SupervisorStatus`, relay write, and watchdog service. |
| `firmware/app/src/sensor.rs` | Priority2 owner of the FDC1004 driver, finite transaction timeout, sample freshness, and calibrated `Reading` publication. |
| `firmware/app/src/storage.rs` | Implemented sole gated owner for boot and runtime writes, including the actual Matter `KvBlobStore` load/store/remove trait. Notification records must use this owner. |
| `firmware/app/src/runtime.rs` | Implemented copied command/reply/write/completion mailboxes. No I/O or waits while holding their critical sections. |
| `firmware/app/src/clock.rs` | Implemented bounded CASE time acquisition, source/generation mailbox and control-only publication of the original UTC capture to TLS. Shared checked anchors live in `core/src/utc.rs`; POSIX timezone conversion remains in core. See [trusted UTC](trusted-utc.md). |
| `firmware/core/src/runtime.rs` schedule path | Already calls the scheduler from control, persists `PersistBeforeRun` before exposing a window and preserves the supervisor across writes/configuration. No separate app schedule task is needed. |
| `firmware/matter/` | Implemented SDK-generated async On/Off handler, applied acknowledgements, observed reporting and shared KV transaction helper, with host tests. |
| `firmware/app/src/matter.rs` | Implemented `LocalControl`, private Matter node/descriptor tree, generated bounded On/Off and reporting handlers, provisioning admission, entropy/allocator integration and the `Application` network task. Actual Apple Home pairing/subscriptions remain final-board acceptance. |
| `firmware/app/src/matter.rs::Application` / `radio.rs` | Implemented fallible single-owner BLE/Wi-Fi/TCP assembly and `UserTask` with bounded CASE UTC acquisition and TLS readiness. The settings HTTP child is linked; the Pushover child remains work. Interface loss cannot block local service. |
| `firmware/app/src/settings.rs`, `firmware/settings/` | Shared-stack HTTP adapter, fixed-capacity parser/renderer, authenticated configuration reads/writes and correlated storage acknowledgments. |
| Planned `firmware/app/src/pushover.rs` | Persistent transition queue, DNS/TCP/TLS transaction, retry policy, and acknowledgement removal. It cannot call or await control APIs. |
| `firmware/app/src/service.rs` USB loop | Implemented bounded status/configuration/command/UTC protocol using core ingress. UTC is captured before queuing; a correlated clock-clear slot bypasses CONFIG storage. Physical settings-token read/rotation is implemented; factory reset/recovery remains work. |
| `firmware/app/src/output.rs` | One bounded async USB/log writer. No logging from interrupts or critical sections. |
| `firmware/app/src/main.rs` | Implemented safe boot, allocator/executor startup and parallel local-service/Matter ownership. USB/storage live in `service.rs` and remain available after radio startup/runtime return. |

## Schedule and retained safety state

`schedule.rs` uses stable local occurrence identity:

```text
WindowId = local_day << 29 | local_start_second << 12 | stable_entry_id
```

Entry IDs are 1 through 4095, start seconds are 0 through 86399, schedules contain
at most 16 entries, and the shared duration is 1 through 86400 seconds. Identity is
therefore independent of a clock correction, reboot, timezone offset, or duration
edit. Moving an entry creates a distinct occurrence. The supervisor still clamps an
already active run across overlapping or adjacent occurrence IDs.

The application must not synthesize an IANA timezone implementation in core.
`LocalTimeResolver::resolve(day, second)` explicitly returns `Missing`, `Unique`, or
`Ambiguous { earlier, later }`. A nonexistent spring-forward start is skipped. A
fallback start uses the earlier UTC occurrence only. The app stores a complete,
validated timezone rule that it can actually resolve, such as a POSIX TZ rule plus an
optional display label. Storing only an IANA name is invalid unless a compatible IANA
resolver and data set are included in the final image.

`Scheduler::evaluate` derives candidate local dates from the UTC duration horizon and
the resolver's supported offset range. This bounded search covers a 24-hour run across
two local midnights on a 23-hour spring-forward day. It validates the civil snapshot
and every resolved start. When it first sees a new occurrence it returns `PersistBeforeRun`. The
schedule adapter writes an `Eligible` `RetainedWindow` with its original UTC end,
waits for storage acknowledgement, and evaluates again before exposing the monotonic
`ScheduledWindow`. The same ID always clamps to the saved end. A lower ID is a clock
replay and remains suppressed. The payload-free `Suppressed` decision never requests
a storage write: preserve the existing watermark, including when the clock moves
back to an older occurrence. Only `PersistBeforeRun` may replace it with a newer
occurrence. HomeKit Off immediately revokes output and requests `Suppressed`
for the current saved disposition. Its command response does not claim the write
is durable; storage completion has a separate acknowledgement. Reset before that
acknowledgement suppresses the previously eligible record through the boot policy.
Never copy an older clock-derived ID into storage.

The retained blob is key `0x4353`, 32 bytes, magic `CSRT`, format version 1, and an
IEEE CRC-32. Decode validates the occurrence ID's reserved bits, nonzero entry and
local-second range even when the CRC is valid. Its configuration revision must match
the current configuration record.
Storage lifecycle is explicit:

| Configuration record | Retained record | Boot behavior |
| --- | --- | --- |
| Never configured | absent | Provisioning remains reachable; absent calibration, schedule, and credentials keep the relay off. |
| Never configured | present | Treat as inconsistent storage. Keep the relay off and expose USB erase/recovery; do not silently accept the record. |
| Configured | valid, matching revision | Restore maintenance and the suppression watermark. |
| Configured | eligible active record | Convert it to `Suppressed` and persist before control can use schedules. A reset or power loss cannot renew the run. |
| Configured | missing, corrupt, or wrong revision | Create a valid matching recovery record with maintenance latched, persist it, and permit authenticated configuration repair or factory reset. |

This boot policy fails closed but keeps a deterministic recovery path. Factory reset
erases both the Crystal records and Matter fabrics, then returns to the first row.
Maintenance cannot be cleared until the replacement record is durably acknowledged.

The implemented selector validates the partition table and scans raw type/subtype
tags for the first writable NVS region, avoiding typed-decoder panics on legal
custom entries. See the [partition and flash contract](flash-storage.md).
Stillair's reference store construction is
`SeqMapKvBlobStore::new(BlockingAsync::new(flash), range)`, followed by
`stack.startup(&crypto, &mut store).await` and `let kv = stack.matter().kv(store)`.
Crystal uses its own gated `Store` implementation because the upstream adapter
logs blob contents. Application writes already use `SharedKvBlobStore` access;
radio assembly must move that same owner through startup and `Matter::kv`.
Crystal keys are outside rs-matter's built-in range and documented in the flash
contract. All Crystal state updates use encode-to-new-value then acknowledged KV
replacement. Relay control never waits for that writer; a write required to allow a
run simply withholds the run until it succeeds.

## Flash and relay exclusion

The [implemented boot/runtime and Matter KV adapter](flash-storage.md) follows this
requirement. Radio assembly must preserve the same owner. Do not copy Stillair's
flash feature flags unchanged.
At the pinned revision, `BlockingAsync` calls `FlashStorage` synchronously, and
only the ROM-call shims are in RAM. The Embassy interrupt handler, task poll and
supervisor remain in flash-backed code. Espressif documents that
[C6 flash access disables caches](https://docs.espressif.com/projects/esp-idf/en/v5.1.2/esp32c6/api-reference/peripherals/spi_flash/spi_flash_concurrency.html);
every reachable function and datum must be in internal RAM for an interrupt to
run during that interval. A priority or single `#[ram]` task annotation is insufficient.

Enable `esp-storage/critical-section` and wrap **every** runtime flash operation
in the output-off gate. Storage raises the inhibit, waits for an epoch acknowledgement
published by control after writing the relay GPIO low, and keeps the inhibit
asserted until the operation ends. Cancellation must release ownership safely;
an acknowledgement from an older request cannot authorize a later write. Control
maps the inhibit to forced off and withholds re-energization until the gate clears,
fresh sensor/permit inputs arrive and the existing minimum-off interval permits it.
Defer ordinary persistence until off where possible. Boot scans happen before
run eligibility; factory erase requires the same off condition. Neither network
nor Matter persistence may bypass the gate or create a second raw flash handle.

A 4 KiB sector erase has a published C6 planning maximum of 500 ms, compared
with 70 ms typical; 64 KiB block erase can take 3 s. A ROM write spanning a
4 KiB page may include sixteen flash-program pages.
[ESP32-C6 flash timing table](https://documentation.espressif.com/esp32-c6_datasheet_en.html).
Confirm the WROOM-N8's actual
JEDEC flash part and its maximum timings before final timing acceptance. These
operations mask Priority3 when the supported critical-section feature is enabled.
No flash operation may occur while the relay is energized. The watchdog must not
be fed or disabled by storage to disguise a stalled control loop. This policy
preserves the durable-before-run and durable-before-maintenance-exit contracts.

## Matter endpoint behavior

The proposed load endpoint is a Matter **On/Off Plug-in Unit** (`0x010A`), an actuator
with an On/Off server. Light-switch and generic-switch types describe controller/input
devices. The [implemented adapter](matter-integration.md) currently advertises only
the basic Off/On/Toggle cluster metadata and no device profile. Plug-in-unit conformance
requires additional clusters and Lighting behavior; the exact device-library revision,
cluster set and required command semantics matter for a conformance claim. For this
personal build, [D-22](../decisions.md) selects the controlled-load identity with
explicit profile deviations and only implemented command metadata. Apple lists
`0x010A` as supported, but pairing this restricted implementation remains an actual
final-board test. Do not claim full profile conformance or add stock startup,
timed or scene behavior that bypasses boot-off or the configured lease limit.

Follow Stillair's generated-cluster handler pattern, replacing its fan handler:

- Implement `rs_matter::dm::clusters::decl::on_off::ClusterAsyncHandler` and adapt it with
  `on_off::HandlerAdaptor`.
- Define `CLUSTER` from `on_off::FULL_CLUSTER`, with required attributes and commands
  only. Do not use the convenience `app::on_off::OnOffHandler`: its hook cannot report
  a full control mailbox and its private target state is not the device truth.
- `on_off()` reads the observed Priority3 relay command. The implemented command
  future submits through a bounded mailbox and waits at most 250 ms for its
  source-owned applied reply. Return Matter Busy when full. Toggle resolves inside
  control from its current output, rather than from a transport-side snapshot.
- Off sets the lossless force-off flag before queueing ordinary work, so a full queue
  cannot delay relay revocation. The control task then requests durable suppression.
  A reset before that write completes still loads the previously `Eligible` occurrence
  as `Suppressed`, closing the flash race. The async handler acknowledges actual
  GPIO application without waiting for suppression storage.
- A notification task watches the authoritative status snapshot. On a relay change it
  calls `dataver.changed()` and `notifier.notify_cluster_changed(endpoint,
  on_off_cluster_id)`. Matter never caches a requested On as the reported value.

The reported value is the commanded relay output after all software and hardware
permits. It is not welded-contact feedback; the hardware has no auxiliary contact.
Use private commissioning material for this one-off device; no shared public
example private key belongs in its firmware. Missing material must leave local
control available with commissioning closed. Expect an uncertified-device warning
in Apple Home. Production certification is outside this one-off build.

Matter startup follows the currently working Stillair path:

```rust
stack
    .run_coex(
        EmbassyWifi::new(EspWifiDriver::new(wifi, bt), weak_rand, true, stack),
        &crypto,
        (NODE, handler),
        kv,
        user_task,
    )
    .await
```

`run_coex` preserves BLE commissioning while Wi-Fi runs. The snippet is the reference
shape, not the final Crystal adapter: the pinned `EspWifiDriver` unwraps setup
errors, and its `EnetStack::tcp_connect` returns `None`. Extra socket capacity alone
does not provide TCP for TLS. Build one project-owned Embassy network stack with
fallible radio setup and a TCP-capable `NetStack`, using the public preexisting-
interface adapters. A Matter startup or runtime error must return without stopping
the independent USB/storage service or local control. Network-only services may
restart with the interface; durable queue state must survive that cancellation.

## Shared Wi-Fi services

The fifth `run_coex` argument is implemented in `matter.rs` as an
`rs_matter_embassy::stack::UserTask`. Its `run` method receives the generic network
stack plus diagnostics/change notifications and can start before IP is usable.
It runs TLS readiness, bounded CASE time acquisition and the
[local settings service](settings.md). The future Pushover worker must handle
readiness and cancellation. None owns a second
radio stack or hard-coded Wi-Fi credentials.

Use `edge-http 0.8.0` for the local settings server. It matches Rust 1.88,
`edge-nal 0.7`, `embedded-io-async 0.7`, and `embassy-time 0.5` in Stillair's lock.
The actual path uses `edge_nal::TcpBind` with one outstanding connection and
`edge_http::io::server::Connection`. Raw-header preflight avoids the SDK's
Content-Length panic before constructor entry. The limits are 2048-byte headers,
24 header slots and a 2048-byte body, with one original 10-second request deadline
and shorter phase/I/O bounds. See the [implemented contract](settings.md).

The settings page uses plain HTTP on the trusted local LAN because no compatible,
verified server-TLS design has been established. Mutating requests require a random
bearer/CSRF token generated at first configuration and retrievable or rotatable over
USB. Do not place it in a URL, HTML log, or normal status output. A write is handled as:

1. Parse into a fixed-capacity candidate and validate thresholds, calibration,
   duration, entry count, entry IDs, local times, timezone rule, and Pushover fields.
2. Submit the next nonzero configuration revision to the runtime coordinator.
   It enters maintenance and stores the matching maintenance-retained record
   before the new configuration, through the sole storage owner.
3. Return success only after the coordinator's `Durable` acknowledgement. On
   failure, the old configuration remains published but output stays inhibited.
4. Show that saving stops an active run and requires an explicit maintenance exit.
   That exit also needs a durable acknowledgement. The existing supervisor and
   retained occurrence end prevent edits or persistence from renewing a deadline.

Time now comes from bounded CASE-authenticated reads of the administrator-configured
Matter TrustedTimeSource, or explicit physical USB UTC. Control accepts one original
monotonic capture for schedule/TLS and expires it at one hour. Source/fabric changes
and operator commands invalidate older in-flight reads; clock loss bypasses storage
admission and suppresses automatic occurrences. Manual override deadlines remain
monotonic. The [trusted UTC contract](trusted-utc.md) excludes cached SDK RTC, a
persisted anchor, build time and unauthenticated SNTP as current TLS trust. No
periodic UTC flash writes or extra UDP owner are added. A usable Home hub source
and ACL are pending actual pairing; no Home app setup behavior is assumed.

## Pushover delivery

Pushover requires `POST https://api.pushover.net/1/messages.json` with certificate
verification. The implemented [TLS provider](tls-provider.md) uses
`edge-nal-tls 0.2.0` and `mbedtls-rs 0.2.0`, with a fixed DigiCert Global Root G2
trust anchor, `api.pushover.net` name verification and required trusted UTC.
It builds for C6 and passed a live public-endpoint handshake plus unknown-time,
invalid-date and wrong-host rejection checks. It brings portable Mbed TLS C source
into the build, using `scripts/with-esp-toolchain.sh`; it does not use ESP-IDF.
The reqwless embedded-tls path lacks server-certificate verification and is not
selected. Do not weaken verification to accommodate a dependency or CA change.

Keep one TLS session in the normal-priority task. Configured records alone need
10,240 bytes of heap, with additional dynamic session allocations. Bound DNS,
connect, handshake, writes, reads and shutdown; drop the complete session after
a timeout because the async handshake cannot safely resume after cancellation.
The actual Matter-owned network integration, peak heap and control-cadence tests
remain work. The provider alone does not implement notification delivery.

`pushover.rs` will own a four-entry persistent FIFO. Each
confirmed `WaterTransition` is offered with `try_send`; the producer never awaits the
network. The storage worker assigns a monotonic event ID and persists the event before
delivery. On a full FIFO it preserves the oldest unsent event and records an overflow
counter plus the latest observed classification for diagnostics. Use normal priority,
include the event ID in the message, and remove an event only after HTTP success and a
Pushover JSON response with `status: 1`. Retry DNS/connect/TLS/HTTP failures after 5 s,
30 s, then 5 min, capped at one attempt per 5 min while the record remains queued.
An ambiguous timeout can duplicate a message, so the event ID makes that visible;
there is no Pushover idempotency key and the firmware must not claim exactly-once
delivery. An acknowledged event is removed durably and is not resent after reboot.

## USB setup, commissioning, and recovery

Use Stillair's native API exactly:

```rust
let (console_rx, console_tx) =
    UsbSerialJtag::new(peripherals.USB_DEVICE).into_async().split();
```

The [controller design](controller-design-basis.md) selects a self-powered USB
data interface and separate isolated 5 V service input. ESP32-C6 enables native USB
function by default, and its ROM supports USB download and logging before the user
application. The pinned `UsbSerialJtag` API exposes no VBUS sensing or attach control;
its C6 constructor leaves the pull-up state alone. The peripheral registers expose
`PAD_PULL_OVERRIDE`, `DP_PULLUP`, and `USB_PAD_ENABLE`, but application writes happen
too late to guarantee detach during ROM/reset, and the C6 USB Serial/JTAG block has no
dedicated VBUS input. Therefore a strictly self-powered data port must sense connector
VBUS in hardware and gate both D+ and D- with a USB 2.0 data switch. Connector VBUS is
only a high-impedance presence signal, while the separate isolated 5 V service input
powers the board. The switch must default disconnected, have powered-off I/O isolation,
and meet USB 2.0 full-speed signal requirements. Do not release a direct D+/D-
connection on the assumption that firmware can suppress the pull-up before boot.

The reader accepts newline-delimited fixed-capacity commands and rejects an entire
overlong or malformed line. The writer is the only USB/log output owner. Supported
operations are versioned and bounded: `status`, `config get`, `config set <record>`,
`settings-token rotate`, `maintenance set|clear`, `commissioning open`, and
`factory-reset <challenge>`. Configuration and maintenance mutations use the same
storage request/ack path as HTTP. Live Wi-Fi, Matter, or Pushover secrets are never
printed in `status` or logs.

First boot remains recoverable without a network. USB can install calibration,
schedule, timezone rule, notification credentials, and the local settings token.
Matter Wi-Fi credentials are still provisioned through BLE commissioning; the USB
command may open the commissioning window and print the stack-generated manual/QR
payload, but it does not invent or persist a second Wi-Fi credential format. Factory
reset requires a boot-scoped random challenge printed over USB, forces the relay off,
erases Crystal records and Matter fabrics, and reboots into never-configured state.

Commissioning and calibration happen on the assembled final boards. This architecture
does not add an evaluation-board or prototype-board phase.

## Dependency and resource gates

Stillair's tested dependency family must move as one unit:

| Component | Current Stillair selection | Crystal decision |
| --- | --- | --- |
| `rs-matter-embassy` | git `f31233a6fd4530ff25ad3bcbd9abf8fe854320aa`, features `esp`, `log`, `embassy-net` | Reuse exact lock revision initially. |
| `rs-matter` / `rs-matter-stack` | `0.2.0` / `0.1.0` through the lock | Reuse; implement custom On/Off server and verify plug-in-unit conformance. |
| `esp-hal`, `esp-rtos`, `esp-alloc`, `esp-radio`, `esp-storage`, bootloader and metadata | crates.io versions patched together to esp-hal git `10e48dd74837bae4be663a7d1825d12875363727` | Copy the complete patch table. Never update one crate alone. |
| Embassy | executor 0.10, time 0.5, sync 0.8, net 0.9 | Reuse. |
| edge APIs | edge-nal 0.7, embedded-io-async 0.7 | Reuse; add edge-http 0.8.0. |
| Trusted UTC | rs-matter 0.2.0 CASE/generated TimeSynchronization client | Implemented against the pinned SDK; no SNTP dependency or periodic UTC persistence. |
| HTTPS client | edge-nal-tls 0.2.0 / mbedtls-rs 0.2.0 | Provider builds and verifies the public endpoint; combined runtime/heap evidence remains required. |

Stillair's measured release image is 1,973,536 bytes, or 47.80% of a 4,128,768-byte
application region. Its ELF allocates approximately 2,440 bytes `.rwtext`, 75,768
bytes `.rwtext.wifi`, 29,844 bytes `.data`, 528 bytes `.data.wifi`, 220,704 bytes
`.bss`, plus 1,596 bytes trap data, leaving a linker-reported 121,224-byte stack
region. It uses a 100 KiB heap for Wi-Fi, BLE, Matter, and x509, plus a 20 KiB Matter
bump buffer; the Matter task is documented around 35 to 50 KiB of stack.

The controller's 8 MiB ESP32-C6-WROOM-1-N8 gives comfortable flash margin relative to
that image, but it does not add internal SRAM. Crystal must reserve fixed buffers for
FDC1004 acquisition, two HTTP connections, configuration parsing, four notification
events, TLS, and the priority task stacks. Before freezing dependencies, produce a
release map and `espflash save-image` measurement and pass all of these gates:

- no task stack overlaps or high-water warning under concurrent BLE commissioning,
  HTTP requests, CASE UTC reads, and a Pushover attempt;
- at least 48 KiB unallocated SRAM after static allocations and configured task stacks;
- no allocator exhaustion during Matter attestation plus one HTTP connection;
- final image fits the selected partition table with at least 20% application-partition
  headroom;
- Priority3 cadence remains within its deadline while thread mode is saturated and
  while the Priority2 sensor task times out an I2C transaction.

Static image, SRAM allocation and stack/buffer budget analysis precede fabrication.
Measured heap/stack high-water, concurrent-task cadence, RF commissioning, sensor
calibration, relay verification and Apple pairing use the final assembled boards.
Do not turn those physical results into an evaluation-board or prototype gate.

## Required verification

The next app implementation should be accepted only with:

1. Host tests for schedule replay, DST gaps/folds, midnight crossing, overlap, duration
   edits, corrupted storage, revision mismatch, reset during a window, mailbox-full
   command behavior, and notification queue recovery.
2. Embedded fmt, clippy, and release build at the pinned target and dependency graph.
3. A release image and SRAM/stack map recorded against the limits above.
4. A host-side Matter handler test showing On, Off, Toggle, Busy, and actual-state
   notifications; then Apple Home pairing on a final board.
5. HTTP parser tests for partial reads, oversized bodies, invalid token, invalid
   timezone rules, write failure, and concurrent updates.
6. TLS tests showing DNS failure, expired/untrusted certificate rejection, timeout
   cancellation, `status: 1` acknowledgement, non-success JSON, and reboot recovery.
7. Hardware commissioning evidence for PSU loss, sensor staleness, I2C timeout,
   maintenance, reset, minimum off time, relay command low at boot, and control cadence
   during radio load.

## Sources

- [Stillair firmware application](https://github.com/micthiesen/stillair/tree/19bde05dd7bfd38363eb1eefd94aec2df7062c0f/firmware/app)
- [`rs-matter-embassy` pinned source](https://github.com/ivmarkov/rs-matter-embassy/tree/f31233a6fd4530ff25ad3bcbd9abf8fe854320aa)
- [`rs-matter` 0.2.0 API documentation](https://docs.rs/rs-matter/0.2.0/rs_matter/)
- [Matter device type registry and On/Off Plug-in Unit definition](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/matter-devices.xml)
- [Apple Matter device-type support](https://github.com/project-chip/connectedhomeip/blob/master/docs/guides/darwin.md#supported-device-types-in-apple-home)
- [`edge-http` 0.8.0](https://docs.rs/edge-http/0.8.0/edge_http/)
- [`edge-net` source used to verify the server API](https://github.com/sysgrok/edge-net/tree/c1f0db549735a6604d35b56b5f401d6a520be4a9)
- [`sntpc` source](https://github.com/vpetrigo/sntpc/tree/2292647a7d216964b082d5683e586836b0fcf170)
- [Pushover message API](https://pushover.net/api)
- [`reqwless` current source and MSRV](https://github.com/drogue-iot/reqwless/tree/b7617057284ab9528b459cc1614610a03271df3f)
- [`edge-nal-tls` 0.2.0](https://docs.rs/edge-nal-tls/0.2.0/edge_nal_tls/)
- [ESP32-C6 USB Serial/JTAG register definition](https://documentation.espressif.com/esp32-c6_technical_reference_manual_en.pdf#usbserialjtag)
- [ESP32-C6 USB hardware guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html#usb)
- [USB 2.0 self-powered pull-up requirement](https://www.usb.org/sites/default/files/USB-IFTestProc1_3.pdf)
