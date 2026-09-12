# Current state

Last updated: 2026-09-12

## Now

- The [full delivery goal](goal.md) remains active: three final-use boards, actual
  ESP firmware, independent adversarial review, manufacturing delivery and final-unit
  commissioning support. No separate prototype or planned respin. No fabrication
  or operating release gate has passed.
- Requirements remain freshwater, 5 mm glass, a 50 mm physical span below the rim,
  the owner's separate snug clip and a sensor harness no longer than 203.2 mm.
  Schedules, automatic low stop/recovery, bounded HomeKit overrides, local settings
  and Pushover transitions remain the [control contract](controls.md).
- The actual [Matter application](design/matter-integration.md) now links Wi-Fi/BLE
  commissioning, one Embassy TCP/DNS/UDP stack, SDK root and restricted accessory
  handlers, and one gated Store shared through `Matter::kv`. USB/LED/storage
  service remains alive after radio startup failure or return. Missing private
  commissioning material leaves radio closed and local service available. D-22
  records the private profile's boot-off/bounded behavior. Trusted UTC, the settings
  webpage and Pushover request/queue integration remain work.
  No actual HomeKit pairing or live TLS session has been exercised.
- The offline [provisioning tool](design/matter-provisioning.md) can import or
  freshly issue private per-device material, validate its explicit authority/CD
  and publish a bounded record outside git. Public TEST issuer fixtures remain
  host-test inputs only. The actual bounded USB writer now requires explicit CONFIG,
  owned durable-maintenance/GPIO-low admission and exact readback through the same
  Store. Activation requires a separate explicit reboot. The host serial sender,
  physical installation and pairing remain work. Independent writer review found
  no actionable defect; host sender implementation is next.
- [Controller source](../pcb/controller/design/README.md) now joins all seven
  sections as one 95-component, seven-sheet schematic: 84 purchased parts and
  eleven test pads. Combined native readback matches all 254 connected pins and
  20 unused pins across 51 nets. The initial PCB has 291 numbered physical pads
  with exactly the known 14 repeated-pad net omissions awaiting shared native
  augmentation. `pcbRelative` prevents automatic group packing/rotation. The complete
  [placement](design/controller-placement.md) now has explicit positions for all
  95 parts, four 3.2 mm mounting holes, four copper layers and 1.6 mm FR4.
  Compiled courtyards, 4 mm mounting reserves and 8 mm test-pad spacing pass.
  Actual native readback verifies every pose, 99 footprints and nine NPTHs.
  The [nominal enclosure screen](design/controller-enclosure-fit.md) now establishes
  a 0.5 mm westward mounting shift, Z20 underside, covered J2/USB opening and
  retained carrier allocation. Antenna clearance is 16.104 mm, but board/corner
  and partition gaps are tight; exact cover/support parts, tolerances and routing
  review remain open.
- The [sensor RC/PGFB refinement](design/sensor-power-refinement.md) is adopted in
  the BOM and circuit contracts. Controller capture includes the 6.8 ohm feed,
  local 1+10 uF bypass/bleeder and cable-side TVS. Sensor capture must include its
  own input bleed and 1N4148W-7-F PGFB isolation diode. The complete input budget is
  30 uF; modeled minimum sensor input is 3.7986 V with 114.6 mV LDO headroom.
  The repository calculator reproduces all 147 reviewed numerical values.
- [Physical footprint declarations](design/footprint-audit.md) now cover all 27
  exact model IDs, with body/envelope/height, +0.05 mm NSMD and an explicit
  hand-assembly courtyard policy. Four-angle source/native tests preserve copper,
  body/courtyard vertices and mask. Initial graph adapters restore PTH mask growth,
  rounded Micro-Fit pin-one copper and exact-MPN electrical pin types. Thirteen
  review-section parts were spaced to retain strict courtyard checks. Complete
  stencil/thermal choices,
  antenna/enclosure fit and all three board manifests still need completion.
  No product handoff has been accepted.
- Manufacturer-origin normalization now covers the WROOM, all asymmetric THT
  models and USB. Five additional source/native tests pass; actual pcbnew readback
  verifies all nine corrected origins with no absolute pad movement. The complete
  initial graph builder now composes the adapters and refreshes all eight schematic
  files. Independent origin/composition review found no actionable defect.
  Guarded manifest/export integration remains to implement.
- The [mains](design/mains-design-basis.md), [controller](design/controller-design-basis.md),
  [sensor](design/sensor-design-basis.md), [secondary protection](design/power-protection-review.md)
  and [service input](design/service-input.md) bases retain exact selections and
  explicit limits. Source transients, return paths, enclosure fit and final-unit
  behavior still need their declared evidence. The BOM remains incomplete for ordering.
- Shared KiCad tooling's repeated-pad correction and support for multiple distinct
  NPTH locators within one footprint remain synced with Stillair (`e0f2359`).
  Exact resources are aligned; project-specific skill differences are declared.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete `sh scripts/check.sh` gate passes: 117 core tests, nine driver tests,
one CLI test, 36 Matter tests, three production partition tests, 11 offline TLS
cases on Linux, host/embedded fmt and Clippy, C6 release build, resolved Matter
feature checks, PCB checks, 59 Bun tests with 13,864 assertions and 31 handoff tests.
The full run covered 58 documents; the subsequent enclosure document sweep passes
59 documents and two CSV tables. The complete log is
`/tmp/crystal-shim-full-check-placement-writer.log` (exit 0).

Root inspected the sensor source/native schematic and native physical preview,
complementing the six previously inspected sections. Bounded electrical review
accepted the RC/PGFB design; a separate adoption check reconciled source and BOM.
Combined disposable exports use KiCad 10.0.5 and preserve all schematic nets.
The latest initial-stage native readback also retains 336 body edges, 95 courtyards
and 291 numbered-pad mask overrides. Root inspected the native connector gallery;
independent reviews checked physical models, adapter mutation boundaries and pin
roles, correcting two converter omissions and the eFuse AUXOFF output type.
Diagnostic ERC now reports 16 intended-unused pins needing NC markers and four
undriven power nets needing flags. Grid/library/footprint cleanup and two wire
endpoints also remain. Final enclosure fit, clean ERC/DRC and final native
augmentation remain open. Read-only independent review of the new radio assembly found no
actionable defect in service lifetime, shared storage, commissioning material,
metadata or command restrictions. Actual radio failures and flash timing remain
unmeasured.

The linked release ELF is text 1,906,596 / data 23,836 / BSS 245,392 bytes.
RAM execution sections add 80,392 bytes; 102,488 bytes remain in the configured
stack region. BSS includes a 100 KiB heap and 66,440-byte Matter allocation.
These are static limits, not measured runtime stack/heap margins. A live TLS
worker is not linked yet. The SDK public fixture private-key byte sequence is
absent from the release ELF. Every [physical commissioning row](../testing/test-matrix.csv)
remains Not run. No parts were bought, hardware flashed, mains energized or live
notifications sent.

## Next

Finish the controller's enclosure mating/support contract and build its source
manifest/augmentation contract. This advances G-02/G-04 now that the complete source
placement and native origin/parity checks pass. It is substantial source/CAD work;
remaining risks include connector insertion/cable bends, housing tolerances,
source-owned native footprint preservation and return-path layout. It needs no
purchased hardware or sensor rim datum.

Continue firmware with the host sender and trusted UTC ownership,
then the authenticated local settings/schedule page and bounded Pushover delivery
on the shared TCP stack. These are repository work; live provisioning, pairing and
installed tests stay separate. Static RAM and flash/control ownership must be
rechecked when the real TLS/UI workloads are linked.

## Candidates not chosen

- **Freeze complete sensor geometry:** still needs the normal-full rim datum;
  sensor regulation/interface capture remains startable. Physical calibration uses
  final boards after fabrication, not a separate prototype.
- **Route or release fabrication now:** final enclosure fit, source manifests and
  declared native augmentation must precede G-04. Current
  schematic/native review outputs are not fabrication inputs.
- **Build the settings page before its integration contracts:** useful, but trusted
  time and private provisioning establish its authorization and persistence paths.
  The local-page contract remains required; visual polish is not the current gate.

## Learned recently

- [Review record](design/review-log.md): RC/backfeed and PGFB findings, native
  electrical-label loss, full schematic integration and bounded runtime review.
- [Matter integration](design/matter-integration.md): fallible radio assembly,
  shared KV, private record format, metadata and memory evidence.
- [Private provisioning](design/matter-provisioning.md): offline issuance/import,
  explicit trust, private output publication and the implemented bounded USB transaction.
- [Runtime transactions](design/runtime-transactions.md): durable settings,
  suppression, configuration-save behavior and immediate versus durable replies.
- [Footprint audit](design/footprint-audit.md): checked copper/physical declarations
  and source/native/assembly work still owed.
- [Flash storage](design/flash-storage.md): interruptible thread-mode owner,
  resolved mutex-feature guard and actual-device timing still owed.
