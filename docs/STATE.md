# Current state

Last updated: 2026-09-12

## Now

- The [full delivery goal](goal.md) remains active: three final-use boards, actual
  ESP firmware, independent adversarial review, manufacturing delivery and final-unit
  commissioning support. No separate prototype or planned respin. No fabrication
  or operating release gate has passed.
- Requirements remain freshwater, 5 mm glass, a 50 mm physical span below the rim,
  the owner's separate snug clip and a sensor harness no longer than 203.2 mm.
  Scheduled runs, low stop/recovery, bounded HomeKit overrides, local settings
  and Pushover transitions remain the [control contract](controls.md).
- The actual [Matter application](design/matter-integration.md) links Wi-Fi/BLE,
  the shared Embassy TCP/DNS/UDP stack, restricted switch handlers and one gated
  Store. Offline private credential issuance/import, the bounded USB device writer
  and explicit host serial sender are implemented. The sender validates the same
  bytes before opening the requested port, preserves maintenance, recovers lost
  acknowledgements within fixed deadlines and reports uncertain commits honestly.
  Both macOS and Linux PTY tests pass. Trusted UTC, the settings webpage and live
  Pushover request/queue integration remain work; actual USB, pairing and TLS have
  not been exercised. See [provisioning](design/matter-provisioning.md).
- The complete [controller source](../pcb/controller/design/README.md) has 95
  electrical parts, four mounting holes and a checked 70 x 110 mm, four-layer
  placement. Its manifest now covers 99 PCB items, 274 logical pins, 51 nets and
  nine NPTHs. Fresh initial adapters provide H1..H4 identity and exact schematic
  fields. The per-reference native library preserves all source geometry through
  save/load and 396 rotation comparisons. Actual shared augmentation fixes every
  repeated physical-pad net, and strict PCB plus schematic XML parity passes.
  No production board or handoff lock has been adopted. Complete augmentation,
  clean ERC/DRC, routing and all three fabrication packages remain work.
- The [nominal enclosure allocation](design/controller-enclosure-fit.md) establishes
  the controller shift, covered J2/USB opening and retained carrier envelope.
  Exact cover/support/strain-relief parts, tight mould/board tolerances, actuator
  access and full assembly fit remain open. The [sensor refinement](design/sensor-power-refinement.md)
  is adopted in source/BOM; controller, sensor and mains design bases retain exact
  selections and unresolved evidence. The BOM is not complete for ordering.
- Shared native handoff tooling now avoids a reproduced KiCad 10 SWIG lifetime
  failure during footprint replacement and supports an export-created library
  inside its fresh stage without stock fallback. The 35 shared tests pass in both
  projects; exact resources are aligned and project-specific differences declared.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete `sh scripts/check.sh` gate passes: 117 core, nine driver, one CLI and
48 Matter tests, three production partition tests, 11 offline TLS cases on Linux,
host/embedded fmt and Clippy, C6 release build, resolved Matter feature checks,
PCB source checks, 62 Bun tests with 14,522 assertions and 35 handoff tests.
The full log is `/tmp/crystal-shim-full-check-geometry-sender.log` (exit 0).
Subsequent sender checks also pass on macOS and Linux after correcting a test-only
EINTR handling failure, with the original fixed exchange deadline preserved.
Documentation checks cover 59 documents and two CSV tables.

Actual native evidence is in
`/tmp/crystal-shim-native-library-plan/geometry-stage-gtJYOj/final-production-parity.json`:
99 independent library readbacks, no strict source parity errors, no intrinsic
geometry drift and no physical-pad net drift. C22/R35 each retain a -1 IU Y
translation from shared `FromMM`, within parity tolerance. Initial ERC still
requires NC markers, power flags, connection-grid and library cleanup. Current
source/native geometry preservation is not a clean ERC/DRC or manufacturing result.
The [review log](design/review-log.md) records bounded reviews and their limits.

The release ELF remains text 1,906,596 / data 23,836 / BSS 245,392 bytes;
RAM execution sections add 80,392 bytes and the configured stack region is
102,488 bytes. The SDK public device private-key byte sequence is absent.
These static figures exclude a live TLS worker and do not measure runtime margins.
Every [physical commissioning row](../testing/test-matrix.csv) remains Not run.
No parts were purchased, hardware flashed, mains energized or live notifications sent.

## Next

Complete the controller augmentation declaration and guarded initial-export command,
then resolve native schematic cleanup before routing. The source manifest and
native preservation proof now advance G-02/G-04; the next substantial risks are
fabricated stackup/USB dimensions, thermal/paste details, exact mechanical fit and
clean electrical checks. This work needs no purchased hardware or sensor rim datum.

Continue firmware with trusted UTC ownership, then the authenticated settings and
schedule page and bounded Pushover worker on the shared TCP stack. Recheck RAM and
flash/control timing when those actual workloads are linked. Live provisioning,
pairing and installed tests remain separate final-board commissioning work.

## Candidates not chosen

- **Freeze complete sensor geometry:** needs the pending normal-full rim datum;
  sensor regulation/interface capture can proceed. Calibration uses final boards.
- **Route or release fabrication now:** complete augmentation, reviewed mechanical
  fit and strict clean schematic checks precede routing; all three boards must
  satisfy the fabrication gates together.
- **Repeat provisioning implementation:** source/device/host paths now exist;
  physical USB and pairing await the final assembly. Continue network integration.

## Learned recently

- Exact per-reference library preservation, initial schematic fields, stable mount
  identity and native round-trip limits: [controller source](../pcb/controller/design/README.md).
- Bounded USB protocol, same-byte host validation and explicit activation:
  [provisioning](design/matter-provisioning.md).
- Nominal fit, tight margins, mating sweeps and unfinished mechanical parts:
  [enclosure allocation](design/controller-enclosure-fit.md).
- Independent review scope and actual evidence: [review log](design/review-log.md).
