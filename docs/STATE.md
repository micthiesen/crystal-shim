# Current state

Last updated: 2026-09-13

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
refill firmware or additional board was added. Necessary right-angle mains
connector substitutions and the sensor electrode/pigtail changes are implemented.

## Routing handoff

Open the production projects directly with their adjacent rules and libraries.
Never export a fresh source seed over these native projects.

| Board | Project | Saved placement | Expected unrouted connections |
| --- | --- | --- | --- |
| Controller | [controller.kicad_pro](../pcb/controller/kicad/controller.kicad_pro) | 150 × 110 mm, 4 layers, 117 footprints | 166 |
| Sensor | [sensor.kicad_pro](../pcb/sensor/kicad/sensor.kicad_pro) | 18 × 64 mm, 4 layers, 16 footprints | 21 |
| Mains | [mains.kicad_pro](../pcb/mains/kicad/mains.kicad_pro) | 150 × 110 mm, 2 layers, 26 footprints | 31 |

Filled ground pours, reference/shield layers, ground/thermal vias, netclasses and
native DRC rules are installed. The mains board's 106 owner-routed tracks were
cleared as authorized. Sensor CIN/shield breakouts are already connected; route
its remaining local power, decoupling and digital connections. The four-layer
sensor keeps electronics behind driven shielding while preserving the slim face.

Trunk widths remain the router defaults even when starting at small pads. Narrow
escapes are permitted only inside bounded named regions; ordinary KiCad DRC
rejects long narrow tracks crossing those regions. USB pair recognition, layer
restrictions, mains clearances and fixed sensor copper checks are retained. See
the [routing guide](design/routing-guardrails.md) and
[interactive routing cheat sheet](https://mcp.syas.ca/boris/artifacts/art_e9fv40epjxmu078n9c).

Strict ERC and source/schematic parity pass. Six exact UUID-bound sensor padstack
warnings are excluded for intentional In2-only driven-shield pads; independent
geometry/net checks verify those pads and all other padstack warnings stay enabled.
The previously recorded five initial DRC categories retain their explicit default
settings. Final routed fabrication checks still apply; no blanket new waiver was added.

## Evidence

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

## Next

The owner routes the remaining connections. Use `sh scripts/check-routing.sh`
during routing; after routing, refill/save and add `--final` to require zero
unconnected items. Finish routed copper/mask/paste/silk and fabrication checks,
then use the [manufacturing output profile](design/manufacturing-output.md) to
export manufacturing files. Source placement and native preparation are
complete; routing-dependent verification is not fabrication acceptance.

Physical calibration, adhesive response, temperatures, pump startup, EMI, PC sleep
and HomeKit behavior remain commissioning stages. All physical test rows remain
Not run. No parts were ordered, hardware flashed or mains energized. The broader
[delivery goal](goal.md) continues beyond this routing-preparation milestone.
