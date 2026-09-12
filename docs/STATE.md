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
  records the private profile's boot-off/bounded behavior. The provisioning writer,
  trusted UTC, settings webpage and Pushover request/queue integration remain work.
  No actual HomeKit pairing or live TLS session has been exercised.
- [Controller source](../pcb/controller/design/README.md) now joins all seven
  sections as one 95-component, seven-sheet schematic: 84 purchased parts and
  eleven test pads. Combined native readback matches all 254 connected pins and
  20 unused pins across 51 nets. The initial PCB has 291 numbered physical pads
  with exactly the known 14 repeated-pad net omissions awaiting shared native
  augmentation. `pcbRelative` prevents automatic group packing/rotation; preserved
  section placements still overlap and must be replaced by the full layout.
  Electrical integration tests do not pass the separate placement gate.
- The [sensor RC/PGFB refinement](design/sensor-power-refinement.md) is adopted in
  the BOM and circuit contracts. Controller capture includes the 6.8 ohm feed,
  local 1+10 uF bypass/bleeder and cable-side TVS. Sensor capture must include its
  own input bleed and 1N4148W-7-F PGFB isolation diode. The complete input budget is
  30 uF; modeled minimum sensor input is 3.7986 V with 114.6 mV LDO headroom.
  The repository calculator reproduces all 147 reviewed numerical values.
- [Physical footprint declarations](design/footprint-audit.md) now cover seven
  exact model IDs, with body/envelope/height, +0.05 mm NSMD and an explicit
  hand-assembly courtyard policy. Four-angle source/native tests preserve copper,
  body/courtyard vertices and mask. Remaining models, stencil/thermal choices,
  pin electrical metadata, placement, antenna/enclosure fit and all three board
  manifests still need completion. No product handoff has been accepted.
- The [mains](design/mains-design-basis.md), [controller](design/controller-design-basis.md),
  [sensor](design/sensor-design-basis.md), [secondary protection](design/power-protection-review.md)
  and [service input](design/service-input.md) bases retain exact selections and
  explicit limits. Source transients, return paths, enclosure fit and final-unit
  behavior still need their declared evidence. The BOM remains incomplete for ordering.
- Shared KiCad tooling's repeated-pad correction remains synced with Stillair.
  Exact resources are aligned; project-specific skill differences are declared.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete `sh scripts/check.sh` gate passes: 115 core tests, nine driver tests,
one CLI test, 15 Matter tests, three production partition tests, 11 offline TLS
cases on Linux, host/embedded fmt and Clippy, C6 release build, resolved Matter
feature checks, PCB checks, 40 Bun tests with 4,166 assertions and 30 handoff tests.
Documentation checks cover 55 documents and two CSV tables.

Root inspected the sensor source/native schematic and native physical preview,
complementing the six previously inspected sections. Bounded electrical review
accepted the RC/PGFB design; a separate adoption check reconciled source and BOM.
Combined disposable exports use KiCad 10.0.5 and preserve all schematic nets.
Full source placement, physical declarations, ERC/DRC and final native augmentation
remain open. Read-only independent review of the new radio assembly found no
actionable defect in service lifetime, shared storage, commissioning material,
metadata or command restrictions. Actual radio failures and flash timing remain
unmeasured.

The linked release ELF is text 1,901,488 / data 23,692 / BSS 238,696 bytes.
RAM execution sections add 80,392 bytes; 109,328 bytes remain in the configured
stack region. BSS includes a 100 KiB heap and 66,440-byte Matter allocation.
These are static limits, not measured runtime stack/heap margins. A live TLS
worker is not linked yet. The SDK public fixture private-key byte sequence is
absent from the release ELF. Every [physical commissioning row](../testing/test-matrix.csv)
remains Not run. No parts were bought, hardware flashed, mains energized or live
notifications sent.

## Next

Complete the controller's remaining physical footprint and pin-type declarations,
then place the complete board against the antenna, connector and enclosure limits
and build its source manifest/augmentation contract. This advances G-02/G-04 now
that all electrical sections integrate. It is substantial source/CAD work; the
largest risks are the module's asymmetric origin, connector overhang, return-path
layout and native parity. It needs no purchased hardware or sensor rim datum.

Continue firmware with private-material provisioning and trusted UTC ownership,
then the authenticated local settings/schedule page and bounded Pushover delivery
on the shared TCP stack. These are repository work; live provisioning, pairing and
installed tests stay separate. Static RAM and flash/control ownership must be
rechecked when the real TLS/UI workloads are linked.

## Candidates not chosen

- **Freeze complete sensor geometry:** still needs the normal-full rim datum;
  sensor regulation/interface capture remains startable. Physical calibration uses
  final boards after fabrication, not a separate prototype.
- **Route or release fabrication now:** complete placement, physical metadata,
  source manifests and declared native augmentation must precede G-04. Current
  schematic/native review outputs are not fabrication inputs.
- **Build the settings page before its integration contracts:** useful, but trusted
  time and private provisioning establish its authorization and persistence paths.
  The local-page contract remains required; visual polish is not the current gate.

## Learned recently

- [Review record](design/review-log.md): RC/backfeed and PGFB findings, native
  electrical-label loss, full schematic integration and bounded runtime review.
- [Matter integration](design/matter-integration.md): fallible radio assembly,
  shared KV, private record format, metadata and memory evidence.
- [Runtime transactions](design/runtime-transactions.md): durable settings,
  suppression, configuration-save behavior and immediate versus durable replies.
- [Footprint audit](design/footprint-audit.md): checked copper/physical declarations
  and source/native/assembly work still owed.
- [Flash storage](design/flash-storage.md): interruptible thread-mode owner,
  resolved mutex-feature guard and actual-device timing still owed.
