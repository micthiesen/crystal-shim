# Manufacturing output profile

This is the export and order profile for the accepted native boards. Complete
owner routing, then run the checks below and export. No additional native board
preparation is deferred. Do not export the current unrouted state as a release.

## Board and assembly selection

All boards use ENIG, green mask, white silkscreen and front-side SMT assembly.
Use the saved apertures and tenting; do not add via filling, capping or ink plugging.
Nominal order thickness is 1.6 mm. Native stack metadata is not a substitute for
supplier construction and finished-tolerance acceptance.

| Board | Outline / copper layers | Order construction / stencil | Hand assembly | No physical part, exclude from BOM/CPL |
| --- | --- | --- | --- | --- |
| controller | 150 × 110 mm / 4 | JLC04161H-7628; 81–99 Ω USB acceptance; 0.100 mm laser-cut stencil | J1–J3, J5–J9, SW1–SW3, D4; J4 shell joints after SMT signal reflow | H1–H4, TP1–TP14 |
| sensor | 18 × 64 mm / 4 | 35 µm outer / 15.2 µm inner copper; 0.2104 / 1.065 / 0.2104 mm dielectrics, 1.6062 mm physical total; 0.100 mm stencil | Six-wire pigtail soldered to J1 after SMT | E1, J1 |
| mains | 150 × 110 mm / 2 | 1 oz outer copper, 1.51 mm FR4 core, nominal 1.6 mm total; 0.100 mm stencil | U1, K1, J1–J6, F3, D1, R1, C1, RV1 | H1–H4 |

There are no intentionally DNP physical parts. All other physical references are
SMT assembly items. On mains this is exactly U2, L1, F2 and C2–C7. Schematic-only
power flags and all board-only geometry are never procurement or placement rows.
Hand-solder parts stay in the procurement BOM and separate hand-assembly list,
but leave the machine-assembly BOM/CPL. Keep J4 in the controller SMT list despite
its through-hole shell; do not use a blanket “exclude footprints with through
holes” filter. J4's native shell and duplicate pad paste suppression is deliberate.

Use exact `manufacturer_part_number` values from each accepted
`pcb/<board>/design/handoff.lock.json` manifest, verified against native `MPN`
fields. [bom/bom.csv](../../bom/bom.csv) records purchase status and offboard parts;
it is not a substitute for per-board reference/quantity reconciliation. Source
parts through the assembler only when its catalog matches the exact MPN;
otherwise use owner-supplied exact parts. Do not silently substitute values,
packages or connector variants. Sensor `PCB-COPPER-OOP-50` and
`PCB-SENSOR-PIGTAIL-6` identify board features, not purchasable parts.

Sensor stencil thickness is now selected as 0.100 mm. The smallest native
apertures are U1's 1.45 × 0.30 mm rounded rectangles (0.05 mm corner radius):
area 0.432854 mm², perimeter 3.414159 mm, area ratio 1.26782 at this thickness,
above the 0.66 process screen. All 42 paste apertures have zero effective margin;
E1/J1 have no paste. This is an engineering process selection, not measured
paste-transfer performance. Supplier process and final CAM acceptance remain
checks for all three stencils.

## Final checks and output path

Run `sh scripts/check-routing.sh <board> --final` for all three boards. This
checks native PCB DRC/connectivity, PCB-to-schematic parity and the routing
supplement; it does not run strict ERC or source parity. Run the separate
`verify-schematic-cleanup` and `snapshot-kicad` commands below for those gates.
Require zero unconnected items. The sensor's six exact item-bound inner-pad
warnings are the only declared finding exclusions; the routing checker verifies
their identities. Initial ignored DRC categories are not release waivers: enable
applicable fabrication checks in the final check configuration and inspect the
all-severity report rather than silently retaining ignored categories.
Preserve the accepted stack, pours, fixed sensor copper, plane connections and
prepared breakout segments. Perform the routed review in the
[PCB skill](../../.agents/skills/pcb/SKILL.md), including insulation and USB/rail
constraints. Save and refill before the final reports and exports.

Use `pcb/<board>/fabrication/<release-id>/` for release outputs, with `gerbers/`,
`drills/`, `assembly/` and `evidence/` subdirectories. Run from the repository root.
The following is the KiCad 10 export path, after the checks pass; set `board` and
`release_id` explicitly for each board:

```sh
set -eu
board=controller
release_id=YYYYMMDD-reviewed-head
native="pcb/$board/kicad/$board"
out="pcb/$board/fabrication/$release_id"
mkdir -p "$out/gerbers" "$out/drills" "$out/assembly" "$out/evidence"
manifest="pcb/dist/$board/design/design-manifest.json"
augmentation="pcb/$board/design/kicad-augment.json"
(
  cd pcb
  bun run "render:$board"
)
python3 pcb/tools/tscircuit_handoff.py verify-schematic-cleanup "$manifest" \
  --augmentation "$augmentation" --schematic "$native.kicad_sch" \
  -o "$out/evidence/schematic-cleanup.json"
kicad-cli sch export netlist --format kicadxml \
  --output "$out/evidence/schematic.xml" "$native.kicad_sch"
sh pcb/tools/kicad_python.sh pcb/tools/tscircuit_handoff.py snapshot-kicad \
  "$native.kicad_pcb" "$manifest" --augmentation "$augmentation" \
  --schematic-netlist "$out/evidence/schematic.xml" \
  --rules "$native.kicad_pro" --rules "$native.kicad_dru" \
  -o "$out/evidence/routed-snapshot.json"
sh scripts/check-routing.sh "$board" --final
case "$board" in
  controller|sensor) copper=F.Cu,In1.Cu,In2.Cu,B.Cu ;;
  mains) copper=F.Cu,B.Cu ;;
  *) exit 1 ;;
esac
kicad-cli pcb export gerbers --check-zones \
  --layers "$copper,F.Mask,B.Mask,F.SilkS,B.SilkS,F.Paste,B.Paste,Edge.Cuts" \
  --output "$out/gerbers/" "$native.kicad_pcb"
kicad-cli pcb export drill --format excellon --excellon-units mm \
  --drill-origin absolute --excellon-separate-th --excellon-oval-format route \
  --generate-map --map-format pdf --generate-report \
  --output "$out/drills/" "$native.kicad_pcb"
kicad-cli pcb export pos --format csv --units mm --side front --exclude-dnp \
  --output "$out/assembly/positions-raw.csv" "$native.kicad_pcb"
kicad-cli sch export bom --exclude-dnp \
  --fields Reference,Value,MPN,Footprint,QUANTITY \
  --labels Reference,Value,MPN,Footprint,Quantity \
  --output "$out/assembly/bom-raw.csv" "$native.kicad_sch"
kicad-cli sch export pdf --output "$out/assembly/schematic.pdf" "$native.kicad_sch"
```

Raw BOM/CPL files are reconciliation inputs, not upload-ready assembler files.
Apply the exact reference sets above to produce `smt-bom.csv`, `smt-cpl.csv` and
`hand-assembly.csv`; retain all physical parts in `procurement-bom.csv`. Match
assembler column names and units explicitly, preserving KiCad coordinates and
verified rotations. Do not use `--smd-only` or infer exclusions from missing MPNs.
Check each SMT reference appears exactly once in CPL and in the grouped BOM,
with counts matching the accepted manifest minus the listed exclusions.

Inspect the complete Gerber and drill sets: four/two copper files as applicable,
closed outline, separate PTH/NPTH, RV1 plated slot, mask and paste unions, sensor
covered electrodes and via tenting. Review stencil apertures at the chosen
thickness, controller U1's nine ground windows and J4 suppression. Review every
assembled reference, pin 1 and polarity in the supplier placement preview.
Record exact stack/process selections, source revision, native/output checksums,
check receipts and CAM renders in `evidence/release-manifest.json`; package only
that reviewed release directory. Include the matching harness and enclosure
interface drawings. Supplier quote/DFM and returned CAM acceptance are export
checks; paid ordering and physical commissioning remain separate actions.
