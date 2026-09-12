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
  the shared TCP/DNS/UDP stack, restricted switch handlers and one gated Store.
  Offline private credential issuance/import and bounded USB provisioning exist.
  [Trusted UTC](design/trusted-utc.md) now shares one original control-accepted
  capture between schedule and TLS, with bounded CASE reads and operator USB input.
  Deadline, response-path and clear-command ordering fixes pass the full gate.
  The settings webpage and live Pushover worker remain implementation work;
  unattended authenticated time-source compatibility is still unresolved. Actual
  USB, pairing, hub time-source configuration and TLS have not been exercised on hardware.
- The complete [controller source](../pcb/controller/design/README.md) has 95
  electrical parts, four mounting holes and a checked 70 x 110 mm four-layer
  placement. Its guarded native handoff preserves all 99 footprints, 274 logical
  pins, 51 nets and nine NPTHs. Initial cleanup adds all 20 NC markers and repairs
  two redundant wire overlaps with identical native XML connectivity. The
  [fabrication contract](design/controller-stackup.md) and nominal
  [enclosure allocation](design/controller-enclosure-fit.md) are documented.
  Grid/library/power-source cleanup, final legibility, mechanical fit, remaining
  augmentation and routing still precede acceptance. No production board or lock
  has been adopted.
- [Mains source](../pcb/mains/design/README.md) captures the IRM-10-5 and relay,
  the 13-part protected secondary circuit and three suppression parts. Independent
  review corrected the relay's staggered contact geometry and verified exact
  parts, pin maps, physical bounds and circuit nets. Complete mains integration,
  MOV/primary headers, inlet-fuse wiring, isolation placement and native handoff
  remain work. The [BOM](../bom/bom.csv) is not ready for ordering.
- Shared handoff resources remain aligned with Stillair and project-specific
  differences declared. Physical sensor/calibration, supply/transient/thermal,
  installed interference and every operating acceptance gate remain unmeasured.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete development gate passed after the final UTC authority corrections:
128 core, nine driver, one CLI, 58 Matter/provisioning, three partition and 12 Linux
TLS tests; host/embedded fmt and Clippy; C6 release; resolved Matter feature guards;
98 Bun tests with 15,915 assertions and 35 shared handoff tests. That log is
`/tmp/crystal-shim-full-check-utc-mains-final.log`. Documentation checks
cover 63 documents and two CSV tables.

The final controller declaration-bound stage is
`/private/tmp/crystal-shim-controller-handoff/stillair-controller.board.main-handoff-f77a7_6_`.
Strict PCB/schematic parity and native parse checks pass. ERC fell from 655 to
637: 538 off-grid, 95 library and four undriven power pins remain. DRC has zero
violations and 216 expected unrouted items. Resolved unconnected-pin and wire
warnings are no longer allowed by the stage declaration. This is an initial
stage result, not clean release ERC/DRC. See [review evidence](design/review-log.md).

The final release ELF is text 1,948,678 / data 23,884 / BSS 245,560
bytes, with 80,392 bytes of RAM execution sections and a 102,272-byte linker
stack region. The SDK example device private key is absent from this ELF.
Static SRAM excluding the stack is 349,836 bytes, 216 more than before UTC.
Static figures do not establish the
48 KiB runtime-margin gate and exclude the future active HTTP/Pushover workloads.
Every [physical commissioning row](../testing/test-matrix.csv) remains Not run.
No parts were purchased, hardware flashed, mains energized or live notifications sent.

## Next

Continue the controller's project symbol library, power annotations and
grid/legibility cleanup before routing. This advances G-02/G-04 without hardware
or the pending rim datum; the main risk is preserving native connectivity and
placement through cleanup, and the work is a bounded exporter/native integration.

In parallel, capture the verified [primary mains headers](design/mains-header-capture.md)
and MOV, integrate all mains sections and review isolation/assembly placement.
This larger G-02/G-03 task needs reference and mechanical evidence, not hardware.
Firmware continues with unattended authenticated time-source compatibility,
the settings/schedule page and bounded Pushover worker using the existing network
and flash owners. Recheck runtime memory when those workloads are linked.

## Candidates not chosen

- **Freeze complete sensor geometry:** needs the pending normal-full rim datum;
  sensor regulation/interface capture can proceed. Calibration uses final boards.
- **Route or release fabrication now:** complete augmentation, reviewed mechanical
  fit and strict clean schematic checks precede routing; all three boards must
  satisfy the fabrication gates together.
- **Repeat provisioning implementation:** source/device/host paths now exist;
  physical USB and pairing await the final assembly. Continue network integration.

## Learned recently

- Original UTC capture, source authority, command ordering and remaining live
  acceptance: [trusted UTC](design/trusted-utc.md).
- Corrected relay geometry, exact component models and mains circuit capture:
  [mains source](../pcb/mains/design/README.md) and
  [Sabre header capture basis](design/mains-header-capture.md).
- Native NC/wire cleanup and independent review scopes:
  [review log](design/review-log.md).
- Stackup/USB/thermal process and remaining assembly fit:
  [fabrication contract](design/controller-stackup.md) and
  [enclosure allocation](design/controller-enclosure-fit.md).
