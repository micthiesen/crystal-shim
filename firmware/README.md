# Firmware

Rust, bare-metal ESP32-C6, following `../stillair`: `core/` contains the `no_std`
control contract, `drivers/` contains async device drivers, `cli/` runs the control
model on the host, `matter/` contains the actual SDK command and KV adapters,
`settings/` supplies the local HTTP service/UI, and `roughtime/` verifies signed
time replies offline. `app/` is a separate workspace
targeting `riscv32imac-unknown-none-elf`. Stable Rust is declared in
`rust-toolchain.toml`; setup was verified with Rust 1.97.1. Commit each workspace's lockfile.

The ESP image is **uncommissioned**. It binds the controller capture pin map,
acquires FDC1004 frames on a separate interrupt executor, runs a 20 ms relay-output
task, services a 1,500 ms system-reset watchdog only after that task completes, and
streams bounded USB diagnostics. Boot validates saved settings/calibration and repairs
retained safety state through a relay-off flash gate. Missing or invalid settings keep
the output off. The runtime coordinator evaluates schedules, persists configuration
and suppression, and accepts bounded physical USB administration. The Matter
command and shared KV adapters, Wi-Fi/BLE commissioning and private credential
provisioning are implemented. The private switch profile follows D-22; Apple Home
pairing and behavior have not been exercised. The authenticated
[settings service](../docs/design/settings.md) includes schedule, threshold and
response timing controls; its calibration workflow and the live Pushover worker
remain work. The external coil
pull-down must establish off before application entry and during reset; a build
cannot verify that physical behavior.

The separate [FDC1004 driver](drivers/README.md) implements reset, identity/config
checks and complete sequential out-of-phase measurement frames, with host tests.
It is bound to the ESP's 100 kHz bus with finite transactions and power recovery.
The [calibration stage](../docs/design/calibration.md) applies measured tank data
without fabricated default thresholds. The [integration design](../docs/design/firmware-integration.md)
distinguishes implemented executor and storage adapters from remaining network
integration. The [runtime transaction contract](../docs/design/runtime-transactions.md)
defines configuration saves, command acknowledgements and the USB protocol.
The [Matter adapter contract](../docs/design/matter-integration.md) defines producer
ownership, cancellation, applied replies and the single shared SDK storage owner.
The [configuration](../docs/design/configuration.md),
[timezone](../docs/design/timezone.md) and [flash-storage](../docs/design/flash-storage.md)
records describe the bounded models and current evidence.

The app uses the same compatible esp-hal revision as Stillair,
`10e48dd74837bae4be663a7d1825d12875363727`, for HAL, panic/log output, bootloader,
and generated metadata. Its lockfile was seeded from Stillair's to retain the
same transitive versions. HomeKit through Stillair-style Matter over Wi-Fi is
selected; radio dependencies and the shared network adapter are linked.
Keep the esp-* dependency family on one compatible revision.

The [offline signed-time verifier](../docs/design/unattended-time.md) is a host
workspace member with a checked C6 `no_std` library build. It is not linked into
the app or accepted as UTC. Its public captures and synthetic test identity are
offline fixtures. Conservative interval scheduling is implemented and reviewed.
Signed-source agreement, interval TLS operation leases and unattended runtime
acquisition remain work.

## Control contract

Stop-low / automatic restart-after-refill is confirmed. `Supervisor` is the public
control entry point; the lower-level interlock is crate-private and cannot serve
as an unscheduled hardware entry point. The core uses injected monotonic milliseconds and
integer calibrated levels in `0..1000` thousandths of the selected sensing range.
These are calibrated fractions, not millimetres. The integer calibration stage
converts measured capacitance response into this domain.
No real stop/restart thresholds or maximum sample age are supplied by default.

- Boot starts off. Automatic restart requires valid readings at or above the configured
  restart threshold, ten seconds of stable recovery, and thirty seconds off.
- During automatic operation, a level at or below the lower stop threshold must persist for
  one second before off. Readings above that threshold reset low confirmation.
- Disconnected, uncalibrated, out-of-range, bus-failed, stale, or future-dated
  readings cause immediate off. A backwards clock or a control-loop gap longer
  than the configured sample-age deadline also forces off.
- Recovery resets on faults and readings below the restart threshold. Cached
  readings retain their acquisition timestamp and cannot establish a recovery
  interval by themselves. The caller must tick periodically even without data.
- A manual override can bypass low-level and recovery gates for a valid, fresh
  sensor. It cannot bypass faults, maintenance, hardware-forced-off, or minimum
  off time. Faults, maintenance, and hardware-forced-off cancel an override rather
  than queueing it for later. A scheduled request can recover inside its original
  remaining window.
- Maintenance stays off until an explicit exit command. The runtime persists
  maintenance and window suppression through the gated storage owner, and exits
  maintenance only after its clear record is durable. Exit then requires fresh
  stable recovery. Final-board power-cut behavior still requires measurement.
- Network state is absent from the control contract, so future network tasks
  must not be able to prevent local sampling/control ticks.

The 1 s / 10 s / 30 s values are proposed tuning values from the design brief,
not validated OASE requirements. The maximum sample age also serves as the
allowed control-loop gap in this baseline. Set it from the selected acquisition
cadence and measured failure response. `RelayCommand` describes the requested
coil state; it provides no contact feedback or protection from welded contacts.

## Scheduled operation and HomeKit

`Inputs` carries a reading, optional `ScheduledWindow`, `SwitchCommand`,
maintenance command, and `HardwarePermit`. The runtime calendar adapter supplies
only active windows with a stable, strictly increasing `WindowId` and the
original absolute monotonic `ends_at`. It must preserve identities across
repeated ticks and schedule edits. `schedule.rs` implements bounded daily entries,
injected timezone resolution and stable occurrence IDs. `retained.rs` implements
the versioned safety record and boot recovery policy. The core timezone resolver
accepts explicit POSIX rules. The app loads saved settings, repairs retained state
at boot and stores eligibility before exposing a scheduled window. USB can supply
an explicit UTC observation; it ages automatically and expires after one hour.
The [trusted UTC path](../docs/design/trusted-utc.md) can also read an
administrator-configured Matter CASE source. A usable Home hub source has not
been demonstrated; unattended time availability remains open. No hours are guessed.
The intended starting schedule is fifteen minutes a few times per day.

Every run has an absolute deadline. The initial configurable maximum duration is
`900000` ms; the scheduler's window end may make an automatic run shorter. Low
water, recovery waits, and interruptions consume the available window. Recovery
never grants time beyond that end. A replacement or overlapping window cannot
extend an active run's original deadline. At expiry the supervisor forces off;
a later distinct window remains eligible after minimum-off and fresh recovery.

HomeKit exposes an advisory switch plus a temporary override:

- Off cancels any override, immediately requests off, and suppresses the remainder
  of the current scheduled window. A later distinct window is eligible again.
- On outside a window, or when automatic operation is stopped at valid LOW,
  requests an override for the configured maximum duration. Its deadline starts
  at the **request timestamp**. Minimum-off waiting consumes part of that allowance.
- Repeated On while an override is pending/running retains its original deadline.
  On during an energized automatic run may select override mode but retains that
  run's original deadline. It does not grant a fresh fifteen minutes.
- An On arriving on the expiry tick cannot renew the active run. A subsequent
  explicit On is a new request and still observes minimum off. Off followed by
  a new explicit On is also allowed.
- An override expires to off. It does not fall back into automatic operation in
  the current window. Neither HomeKit nor a schedule can command indefinite on.

All thresholds and timers are explicit configuration. The CLI supports them at
startup; `Supervisor::reconfigure` clamps an active deadline when duration decreases
and never extends it when duration increases. The runtime's configuration-save
transaction deliberately enters maintenance, preserves deadline history and
requires an explicit durable exit. The future settings webpage must show this
consequence. No configuration UI or commissioned final Matter node exists yet.
The generated async Matter handler reports the observed relay command and waits
for control-applied replies. Source-owned tokens prevent stale replies or another
producer from consuming them. Toggle resolves inside control. The linked radio
adapter preserves this boundary and runs the attribute notification handler;
final hardware behavior remains unverified.

## Water notifications

`SupervisorStatus.water_transition` emits one confirmed HIGH-to-LOW or LOW-to-HIGH
edge for a future normal-priority Pushover adapter. Detection is independent of
relay command, schedule, manual override, and hardware permission. It uses the
same stop/restart thresholds and low/recovery confirmation delays. Initial valid
classification establishes a silent baseline. Intermediate-band readings and
invalid/stale data reset pending confirmation without inventing a water change.
Cached samples cannot prove a transition. `status()` does not replay an event.

Changing interlock configuration resets pending level confirmation and the notification baseline so calibration
or threshold edits do not masquerade as water movement. A transport adapter must
handle secure credentials, queueing, bounded retries, and deduplication without
blocking local control. The [verified HTTPS provider](../docs/design/tls-provider.md)
is implemented and cross-compiled; the Pushover queue/POST worker, credentials
and verified operation over the shared ESP network remain work. No notification
was sent.

## Verify

Run from the repository root. These are the same checks as
`.github/workflows/firmware.yml`:

```bash
sh scripts/check-tls.sh
cd firmware
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cd app
cargo fmt --check
sh ../../scripts/with-esp-toolchain.sh cargo clippy --locked --all-targets -- -D warnings
sh ../../scripts/with-esp-toolchain.sh cargo build --locked --release
cd ../..
python3 scripts/check_matter_features.py
```

Use `cargo fmt` in the appropriate workspace to apply formatting. The host tests
exercise meaningful control and parser behavior; the target build only proves
that the local-runtime image links. The separate TLS construction probe and host endpoint
checks are recorded in the provider document. Clang with a RISC-V backend is
required for its portable C dependency; on macOS the wrapper finds installed
Homebrew LLVM. No hardware or mains testing is implied.

The TLS policy harness compiles the production provider source directly and runs
offline certificate and clock tests on Linux. `scripts/check-tls.sh` uses native
Linux or the default OrbStack Linux machine on macOS. That environment needs Rust,
Clang, libclang and CMake. The script also checks production/test dependency and
crypto-feature parity; it does not silently skip TLS tests on an unsupported host.

## Host simulator

From `firmware/`, run `cargo run --locked -p crystal-shim-cli -- --help`. The CLI
accepts stop threshold, restart threshold, and maximum sample age, optionally
followed by low-confirmation, recovery, minimum-off, and maximum-run durations in
milliseconds. Omitted durations use the initial 1 s / 10 s / 30 s / 15 min seeds.
It reads one persistent simulation from stdin. Each event carries the injected
timestamp. It prints CSV control state, relay command, demand, deadline, water
classification and transitions, and exits
nonzero for malformed commands. Fault events are successful simulation inputs.

This short example uses **synthetic values**, not calibration recommendations:

```bash
printf '0 level 600\n0 window 1 900000\n100 disconnected\n200 maintenance-on\n300 level 600\n400 maintenance-off\n' |
  cargo run --locked -p crystal-shim-cli -- 200 400 500
```

Supported lines are `<ms> level <0..1000>`, `<ms> tick`, `<ms> disconnected`,
`<ms> uncalibrated`, `<ms> out-of-range`, `<ms> bus-fault`,
`<ms> maintenance-on`, `<ms> maintenance-off`, `<ms> window <id> <absolute-end-ms>`,
`<ms> no-window`, `<ms> on`, `<ms> off`, `<ms> hardware-off`, and
`<ms> hardware-on`. Blank lines and `#` comments
are ignored. `tick` reuses the last reading without renewing its timestamp.
Supply successful acquisitions frequently enough to meet the configured age
deadline. A single leap forward in time cannot simulate uninterrupted sampling.

Bind hardware drivers to reviewed GPIO/net assignments from the complete board
design. During commissioning of the final assembled boards, validate electrode
calibration on the confirmed glass/range, measured thresholds, maximum sample age
and cadence, watchdog behavior, maintenance/window-suppression persistence,
calendar scheduling, Matter/Pushover adapters, and diagnostic storage/transport
for raw capacitances, interpreted level, validity, relay command and reset reason.
Physical calibration follows fabrication; it does not block implementing the
hardware bindings.
