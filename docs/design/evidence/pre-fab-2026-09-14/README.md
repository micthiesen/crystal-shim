# Rev 1.0 pre-fabrication release

All three routed boards are ready for a standard JLCPCB bare-board order.
No further PCB change was identified by the combined review. The owner assembles
all parts; no paid impedance control, filled/capped vias, custom stackup or special
supplier instructions are required. No order has been placed.

## Downloads and purchasing

- [Controller fabrication package](../../../../pcb/controller/fabrication/2026-09-14-rev1/README.md), four layers, 150 × 110 mm.
- [Sensor fabrication package](../../../../pcb/sensor/fabrication/2026-09-14-rev1/README.md), four layers, 18 × 64 mm.
- [Mains fabrication package](../../../../pcb/mains/fabrication/2026-09-14-rev1/README.md), two layers, 150 × 110 mm.
- [JLCPCB order settings](../../manufacturing-output.md).
- [Complete purchase BOM](../../../../bom/order-2026-09-14/README.md):103 purchasing lines; 135 physical PCB components in 50 exact MPN groups for one set, plus offboard items and separately listed spares.
- [Mounting and enclosure drawings](../../../../cad/shared-enclosure/README.md).

## Changes and evidence

The controller's legacy USB and service-via rules now match the accepted routing.
USB remains full speed 12 Mbps, with F.Cu/B.Cu routes and ordinary through vias.
Both inner layers remain disallowed for USB tracks; independent negative DRC probes
prove that boundary. No impedance guarantee is claimed. The exact added V5_LOGIC
pour is declared, and the legacy fabrication note is corrected.

All three boards have hand-tailored reference and service labels, revision text
and the same diamond/water-line logo. The coordinating reviewer inspected the
actual exported front/back CAM views, including the covered sensor glass face.
The [CAM review](cam-review.md) accounts for all 159 references, exact logo segments,
all 122 tented vias, drill positions and ordinary plated slot geometry. The four
inner-copper layers were independently rendered and inspected.

- [Electrical/integration review](electrical-review.md): critical IC/power/relay/sensor
  pin maps, hot-only switching, inter-board harness maps, service power isolation
  and power budget; no additional circuit blocker.
- [Manufacturing review](manufacturing-review.md): standard form construction,
  actual dimensions, via/slot processes and no-impedance stack selection.
- [Strict-category review](strict-drc-review.md): exact analytical treatment of five
  saved ignored categories. This is not claimed as strict-severity native DRC.
- [CAM quantitative receipt](cam-check.json): archive/native identity, every drill
  and slot, layer sets, mask, paste counts and reference/logo coverage.
- [Mechanical construction](mechanical-closure.md) and
  [CAD checks](../../../../cad/shared-enclosure/support-fit.json): stock FR-4/nylon
  supports preserve board heights and the intact separator; selected base fixing
  and PE bracket positions clear retained enclosure/component/harness volumes.
- [Full project gate](project-check.json):`sh scripts/check.sh`, exit 0. Host-native
  skips are not treated as native checks; actual native validation and the
  [14 negative rule probes](native-rule-regression.json) passed separately.

## Current acceptance

Current source checks, strict ERC, exact native/schematic parity, preparation,
all-severity DRC with only declared sensor exclusions and zero unconnected items
pass for every board. The sensor retains the one exact source-placement-model
limitation for copper-only E1; native layer-aware checks pass. It is not reported
as a clean source-placement result.

| Board | Current accepted run |
| --- | --- |
| Controller | [release-acceptance/run.json](controller/release-acceptance/run.json) |
| Sensor | [release-acceptance/run.json](sensor/release-acceptance/run.json) |
| Mains | [release-acceptance/run.json](mains/release-acceptance/run.json) |

The outer run directories retain the original before-work snapshots/plans and
native-publication receipts proving unrelated copper, pads and placement were
preserved. Final source/rule refinements invalidated the interim validations.
A fresh read-only release-acceptance lifecycle binds the finished state and updated
contracts; all three comparison locks now point to those accepted results. No
stale validation or earlier plan was used to advance a lock.

## Checks after delivery

The supplier upload preview/quote/DFM has not been run. Compare its dimensions,
layer count and preview with the retained CAM before payment. Physical sensor
calibration, rail/load/temperature/EMI/RF tests, USB operation, PE continuity,
isolation and completed enclosure assembly remain the commissioning matrix.
Those checks require the final hardware; no simulated result is substituted.
