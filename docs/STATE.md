# Current state

Last updated: 2026-09-14

## Now

The compact visual designs are implemented in canonical specifications, source,
BOM, mechanical allocations and native KiCad projects. Controller and mains share
150 × 110 mm outlines and four M3 holes inset 7 mm. The controller sits above
mains with 45 mm clear board-face separation. The sensor is 18 × 64 mm, mounted
with thin adhesive film entirely below the rim and a left-exiting pigtail.

The temporary target documents are integrated into [mechanical](mechanical.md),
[sensor](sensor.md) and their design bases, then removed. Both visual reference
PNGs remain. Native dimensions and copper geometry govern implementation.

The accepted circuits and firmware behavior remain: isolated 12 V/5 V supply,
controller 3.3 V buck, three future pump drivers, two sensor ports, service diode
OR, and two FDC1004 measurements with stored dry baselines. No protection bank,
refill firmware or additional board was added. Mains J1–J4 now use Phoenix 1868076
two-position side-entry screw terminals, with both positions used. Controller J2
uses JST S2B-XH-A/XHP-2 for 5 V service, distinct from the 12 V Micro-Fit ports.
The sensor electrode/pigtail changes remain implemented.

## Routing handoff

Open the production projects directly with their adjacent rules and libraries.
Never export a fresh source seed over these native projects.

| Board | Project | Saved placement | Expected unrouted connections |
| --- | --- | --- | --- |
| Controller | [controller.kicad_pro](../pcb/controller/kicad/controller.kicad_pro) | 150 × 110 mm, 4 layers, 117 footprints | 0 (routing reviewed) |
| Sensor | [sensor.kicad_pro](../pcb/sensor/kicad/sensor.kicad_pro) | 18 × 64 mm, 4 layers, 16 footprints | 0 (routing accepted) |
| Mains | [mains.kicad_pro](../pcb/mains/kicad/mains.kicad_pro) | 150 × 110 mm, 2 layers, 26 footprints | 0 (routing accepted) |

Filled ground pours, reference/shield layers, ground/thermal vias, netclasses and
native DRC rules are installed. Mains routing is accepted with zero DRC/parity
findings and zero unconnected items. Sensor routing is accepted with 117 track segments and nine tented vias; its
final routing check reports zero findings and zero unconnected items. The four-layer
sensor keeps electronics behind driven shielding while preserving the slim face.

Trunk widths remain the router defaults even when starting at small pads. Narrow
escapes are permitted only inside bounded named regions; ordinary KiCad DRC
rejects long narrow tracks crossing those regions. USB pair recognition and outer-layer enforcement, mains clearances and fixed
sensor copper checks are retained. See
the [routing guide](design/routing-guardrails.md) and
[interactive routing cheat sheet](https://mcp.syas.ca/boris/artifacts/art_e9fv40epjxmu078n9c).

Strict ERC and source/schematic parity pass. Six exact UUID-bound sensor padstack
warnings are excluded for intentional In2-only driven-shield pads; independent
geometry/net checks verify those pads and all other padstack warnings stay enabled.
The five initial ignored DRC categories were reviewed item-by-item in the final
[strict-category audit](design/evidence/pre-fab-2026-09-14/strict-drc-review.md).
Their analytical review is distinct from a strict-severity native DRC pass.

## Evidence

- [Connector ECO](design/evidence/connector-eco/): controller and mains accepted
  after strict ERC, source/native parity, DRC, complete preparation and independent
  electrical/preservation review. Seven unused mains pins and obsolete NC labels
  removed; connector pad escapes updated. All unrelated copper and rules preserved.
  `sh scripts/check.sh` passes; routing counts remain 166/31/21.
- [Controller compact ECO](../pcb/controller/kicad/evidence/stacked-layout/) and
  [separator contract](../pcb/controller/kicad/evidence/dielectric-separator/);
  [final preparation](../pcb/controller/kicad/evidence/pre-routing-preparation/) closes paste, labels and order metadata.
- [Mains compact ECO](../pcb/mains/kicad/evidence/stacked-layout/): exact track
  deletion authorization, right-angle footprints, field/pad parity and native rules;
  [final preparation](../pcb/mains/kicad/evidence/final-preparation/) closes silk/process metadata.
- [Sensor redesign evidence](../pcb/sensor/design/evidence/visual-redesign/):
  electrode geometry, preserved circuit, native routing and exact padstack exceptions;
  [final preparation](../pcb/sensor/design/evidence/final-preparation/) records outward labels;
  [stencil acceptance](../pcb/sensor/design/evidence/stencil-process/) fixes the 100 µm process.
- [Shared enclosure receipt](../cad/shared-enclosure/README.md): intact dielectric
  separator, 35 mm connector/wiring access reservations, 5.40 mm nominal and
  4.00 mm sensitivity minimum envelope clearances. This is allocated-envelope fit,
  not measured cable or assembled RF/thermal performance.
- [Compact redesign validation](design/evidence/compact-redesign/validation.json)
  records full project checks, native checks and focused adversarial review.

Generic handoff preservation now binds exact track additions/deletions to their
before snapshot, rejects stale/tampered authorization and cross-category UUID
collisions. The two shared tooling files were synced to Stillair in `51efeaf`;
57 handoff tests pass in both repositories.

## Workflow hardening

The [retrospective](design/pcb-workflow-retrospective.md) records what worked,
the avoidable GUI/script work and the confirmed tool limitations. The
[checked workflow](../pcb/tools/README.md) now provides baseline capture, planning,
explicit native transactions, full preparation audits, review and final acceptance.
Content-addressed evidence binds source dependencies, native inputs, canonical
contracts and checker code. Stale evidence cannot advance the comparison lock.

Native edits are preflighted on copied projects, compared against the requested
result, saved, reopened and checked before publication. A guarded Konnect batch
wrapper replaces existing schematic fields without duplicating properties or
accepting partial success. The historical one-off pour writer is retired.

All three boards have project-owned preparation profiles. Sensor source placement
retains one exact-output limitation because tscircuit models copper-only E1 as a
component body; native DRC and layer-aware preparation checks remain required.
The GUI's saved local width preference is reported separately from the verified
netclasses and rule widths. An in-memory board setting does not prove the GUI
preference persisted. Physical stack, custom-rule installation and interactive
router-preference writes still use the documented verified fallback.

Generic helpers, tests and skill guidance are shared with Stillair through the
reciprocal sync maps. Its board profiles and production files remain its own.
This tooling work did not alter the accepted Crystal Shim native boards or locks.
The [validation receipt](design/evidence/pcb-workflow/validation.json) records the
full project gate, 151 focused test executions, three actual-board preparation
passes, copied-board mutation/rejection probes and an accepted temporary-copy
workflow rehearsal. No routing or fabrication acceptance was advanced.

## Sensor routing accepted

The owner-approved sensor board, C3 source placement and exact glass-side paths
are now retained in the [routing acceptance](design/evidence/sensor-routing-acceptance/README.md)
and updated handoff lock. Source/native parity, strict ERC, native preparation,
independent copper review and `sh scripts/check-routing.sh sensor --final` pass.
The full development gate `sh scripts/check.sh` passes. All 13 ground pads connect
to one F.Cu fill and five GND vias join it to continuous In1 ground. U1/C3's local
power path is 3.0708 mm. The two reviewed glass-side additions need no rework.
This accepts routing, not fabrication release; prior review notes retain their
historical findings and the new receipt records closure.

## Fabrication release accepted

The [Rev 1.0 release](design/evidence/pre-fab-2026-09-14/README.md) contains the
reviewed Gerber/drill ZIPs, top-only100 µm stencils, owner assembly drawings,
exact JLCPCB form settings and 103-line consolidated purchase BOM. All three
handoff locks now point to current accepted release evidence. The controller USB
rules and note match the agreed full-speed F.Cu/B.Cu/via routing without paid
impedance control. Routed copper is preserved.

All 159 board references are identified, with hand-tailored silk and a shared logo.
Independent electrical, manufacturing, CAM and mechanical reviews found no further
PCB change required. Native final checks report zero unconnected items and no
unwaived findings. The full project gate passes; actual native regression probes
also pass. The mechanical support model specifies stock insulating supports and
an intact separator without changing PCB holes or elevations.

## Next

[DigiKey order 101602605](../bom/purchases/101602605/README.md) has 72 lines
on the way, recorded from the owner's actual CSV. USB connectors, six-pin
housings and cable-tie bases were increased to 10 each. The enclosure and existing
mains input cord are in stock and have no shipment tracking. The current
[inventory ledger](../bom/inventory.csv) supersedes purchase statuses in dated
cart/fabrication exports. Six PCB part types and the listed remaining assembly
supplies still need sourcing. Native boards and fabrication outputs are unchanged.

Open the [interactive order guide](https://mcp.syas.ca/boris/artifacts/art_ex30qrfnee6mu1033yz),
or use the [order settings](design/manufacturing-output.md) and
[purchase list](../bom/order-2026-09-14/README.md) to order bare boards, stencils
and parts. Check the supplier upload preview against the retained CAM before paying.
PCB assembly service is No; no custom JLCPCB communication or process is required.
No hardware has been flashed or mains energized by this work.

Physical calibration, adhesive response, temperatures, pump startup, EMI, USB,
RF and HomeKit behavior remain commissioning stages. All physical test rows remain
Not run. The broader [delivery goal](goal.md) continues through assembly and
commissioning of the final boards.
