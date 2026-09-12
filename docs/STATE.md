# Current state

Last updated: 2026-09-12

## Now

- The [full delivery goal](goal.md) remains active: three final-use boards, actual
  ESP firmware, adversarial review, manufacturing delivery and final-unit
  commissioning support. No separate prototype or planned respin. No fabrication
  or operating release gate has passed.
- Requirements remain freshwater, 5 mm glass, a 50 mm physical span below the rim,
  the owner's separate snug clip and a sensor harness no longer than 203.2 mm.
  Scheduled runs, low stop/recovery, bounded HomeKit overrides, local settings
  and Pushover transitions remain the [control contract](controls.md).
- The actual [Matter application](design/matter-integration.md) links Wi-Fi/BLE,
  the shared TCP/DNS/UDP stack, restricted switch handlers and one gated Store.
  Offline private credential issuance/import and bounded USB provisioning exist.
  [Trusted UTC](design/trusted-utc.md) shares one original control-accepted capture
  between schedule and TLS, from bounded CASE reads or operator USB input.
  The new [offline signed-time verifier](design/unattended-time.md) has independent
  review, 18 host tests and a C6 `no_std` library build. It is not linked into the
  app. Interval agreement, drift, schedule/TLS integration, the settings webpage
  and live Pushover worker remain implementation work. Actual USB, Apple Home
  pairing, hub time-source configuration and TLS remain untested on hardware.
- The complete [controller source](../pcb/controller/design/README.md) has 95
  electrical parts, four mounting holes and a checked 70 x 110 mm four-layer
  placement. Guarded handoff preserves all 99 footprints, 274 logical pins,
  51 nets and nine NPTHs. NC/wire cleanup, exact project symbol libraries and
  four power annotations are implemented and independently reviewed. Library
  defaults now preserve reference prefixes, parts and test-pad exclusions.
  Grid conversion, page layout, remaining ignored checks, mechanical fit,
  native augmentation and routing remain work. No board or lock is adopted.
- [Mains source](../pcb/mains/design/README.md) captures the IRM-10-5, relay,
  13-part protected secondary circuit, three suppression parts and four Sabre
  headers. Review corrected the relay geometry and
  [MOV lead-form/fit proposal](design/mov-capture.md). A complete conditional
  [placement proposal](design/mains-placement.md) fits 23 parts within 135 x 75 mm,
  including a reserved MOV region. Exact MOV body datum, connector mating,
  enclosure access, full schematic integration and native handoff remain work.
  The [BOM](../bom/bom.csv) is not ready for ordering.
- Shared handoff resources remain aligned with Stillair and project-specific
  differences declared. Physical sensing, calibration, supply/transient/thermal
  and installed interference behavior remain unmeasured.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The final development gate passed after the library-default and signed-time
parser corrections: 128 core, nine driver, one CLI, 58 Matter/provisioning,
18 Roughtime, three partition and 12 Linux TLS tests; host/embedded fmt and
Clippy; C6 release; resolved Matter feature guards; 107 Bun tests with 18,177
assertions and 35 shared handoff tests. Log:
`/tmp/crystal-shim-full-check-symbols-time-reviewed.log`. Subsequent document
updates pass checks for 66 documents and two CSV tables. The offline verifier
also passes a separate C6 `no_std` release-library build and Clippy.

The final declaration-bound controller stage is
`/private/tmp/crystal-shim-controller-handoff/stillair-controller.board.main-handoff-g0fkkd9o`.
Strict PCB/schematic parity and native parse pass. ERC is 542 off-grid findings;
DRC is zero violations plus 216 unrouted items. Both global library tables are
unchanged. All eight final native SVGs match the inspected flag stage except for
generated title timestamps. The footprint-filter check remains explicitly ignored,
alongside three other declared initial checks; exact filters do not mean that
check passed. This is initial-stage evidence, not release ERC/DRC.
See [review scopes and evidence](design/review-log.md).

The application ELF remains SHA-256
`ba5c276f5b123bbde73ce32fabb34e3a1180912523f5ce4197f93c085264d043`:
text 1,948,678 / data 23,884 / BSS 245,560 bytes, with 80,392 bytes of RAM execution
sections and a 102,272-byte linker stack region. Static SRAM excluding the stack
is 349,836 bytes. The previously checked absence of the SDK example private key
still applies to this identical ELF. These figures do not establish the 48 KiB
runtime-margin gate and exclude active HTTP/Pushover/signed-time workloads.
All 34 [commissioning rows](../testing/test-matrix.csv) remain Not run.
No parts were purchased, hardware flashed, mains energized or notifications sent.

## Next

Continue controller grid and page cleanup before routing. A scratch-only trial
is testing strictly monotone coordinate mapping after ordinary grid rounding
collapsed distinct anchors. This advances G-02/G-04 without hardware or the rim
input; its main risk is preserving native connectivity and readable symbols.

In parallel, integrate the complete mains circuit and reviewed placement proposal,
resolving MOV body and mated connector/partition fit before acceptance. This larger
G-02/G-03 task has a concrete coordinate seed but retains mechanical assumptions.
Firmware continues with interval-aware clock/TLS integration and the local
settings/schedule page, followed by the bounded Pushover worker. A settings
integration research pass is active against the existing network/flash owners;
root's offline TLS callback probe identifies a viable restriction-only wrapper
seam. Recheck linked memory and execution budgets as these workloads are added.

## Candidates not chosen

- **Freeze complete sensor geometry:** needs the pending normal-full rim datum;
  sensor regulation/interface capture can proceed. Calibration uses final boards.
- **Route or release fabrication now:** complete augmentation, reviewed fit and
  strict clean schematic checks precede routing; all boards share the release gate.
- **Repeat provisioning or offline verification:** source paths and bounded review
  now exist. Continue application integration; physical USB/pairing await assembly.
