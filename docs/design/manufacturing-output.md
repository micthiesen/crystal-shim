# Manufacturing output profile

**Order placed:** [W2026091502305469](../../bom/purchases/W2026091502305469/README.md).
That record holds the owner’s actual colours, via covering and final form selections;
the profile below remains the reviewed release baseline.

This is the bare-board export and order profile for all three routed native boards.
The 2026-09-14 release uses the checked outputs under each board’s
`fabrication/2026-09-14-rev1/` directory. See the release evidence before ordering.

The mains MOV ECO has a separate output directory,
`pcb/mains/fabrication/2026-09-14-mov-bulk/`. Once its current ECO review passes,
use that mains ZIP instead of the earlier rev1 mains ZIP. Controller and sensor
outputs remain in their original release directories. The MOV slot remains an
ordinary plated routed slot; no additional order-form feature is required.

## Board and assembly selection

All boards use ENIG, green mask and white silkscreen. Order bare PCBs only:
**PCB assembly: No** and **Impedance control: No**. The owner assembles all components; no assembler BOM/CPL
upload, parts consignment or custom supplier communication is required.
Use the saved apertures and tenting; do not add via filling, capping or ink plugging.
Nominal order thickness is 1.6 mm. Native stack metadata is not a substitute for
supplier construction and finished-tolerance acceptance.

| Board | Outline / copper layers | Order construction / stencil | Through-hole/pigtail hand soldering | No physical part, exclude from purchase BOM |
| --- | --- | --- | --- | --- |
| controller | 150 × 110 mm / 4 | standard four-layer No requirement stack (same nominal geometry as JLC04161H-7628); no paid USB impedance control; 0.100 mm laser-cut stencil | J1–J3, J5–J9, SW1–SW3, D4; J4 shell joints after SMT signal reflow | H1–H4, TP1–TP14 |
| sensor | 18 × 64 mm / 4 | 35 µm outer / 15.2 µm inner copper; 0.2104 / 1.065 / 0.2104 mm dielectrics, 1.6062 mm physical total; 0.100 mm stencil | Six-wire pigtail soldered to J1 after SMT | E1, J1 |
| mains | 150 × 110 mm / 2 | 1 oz outer copper, 1.51 mm FR4 core, nominal 1.6 mm total; 0.100 mm stencil | U1, K1, J1–J6, F3, D1, R1, C1, RV1 | H1–H4 |

There are no intentionally DNP physical parts. All other physical references are
SMT parts for owner assembly. On mains this is exactly U2, L1, F2 and C2–C7. Schematic-only
power flags and all board-only geometry are never procurement or placement rows.
All physical parts stay in the procurement BOM. No machine-assembly BOM/CPL
is supplied or required for this order. Keep J4 in the controller SMT list despite
its through-hole shell; do not use a blanket “exclude footprints with through
holes” filter. J4's native shell and duplicate pad paste suppression is deliberate.

Use exact `manufacturer_part_number` values from each accepted
`pcb/<board>/design/handoff.lock.json` manifest, verified against native `MPN`
fields. [bom/bom.csv](../../bom/bom.csv) records purchase status and offboard parts;
it is not a substitute for per-board reference/quantity reconciliation. Purchase
exact parts from component distributors for owner assembly. Do not silently substitute values,
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
their identities. Initial ignored DRC categories are not blanket release waivers. The final
[strict-category audit](evidence/pre-fab-2026-09-14/strict-drc-review.md) checks
the five saved ignored categories analytically, with exact affected items and
limitations. Native DRC severity changes were unavailable through the exposed
API; that audit is not described as a strict-severity native DRC pass.
Preserve the accepted stack, pours, fixed sensor copper, plane connections and
prepared breakout segments. Perform the routed review in the
[PCB skill](../../.agents/skills/pcb/SKILL.md), including insulation and USB/rail
constraints. Save and refill before the final reports and exports.

## Release files and order form

Generate the release with `python3 pcb/tools/release/export-2026-09-14.py` only
after current validation. The script uses KiCad CLI, checks filled zones, verifies
that native bytes remain unchanged and writes hashes and command results.

Each `pcb/<board>/fabrication/2026-09-14-rev1/` contains:

- `crystal-shim-<board>-rev1-jlcpcb.zip`: the only PCB fabrication upload.
  Four/two copper layers, both mask and silk layers, Edge.Cuts, separate PTH/NPTH
  Excellon drills. No paste layers or Gerber-job stack metadata in this ZIP.
- `stencil/`: the separate F.Paste Gerber for a 0.10 mm top-only laser-cut stencil.
- `assembly/`: schematic PDF and native fabrication/silk/mask drawing for owner assembly.
- `evidence/`: native/output checksums, commands and CAM views parsed from the ZIP.

Use one order line per board, with these normal selections on the
[JLCPCB form](https://cart.jlcpcb.com/quote), checked 2026-09-14:

| Setting | Controller | Sensor | Mains |
| --- | --- | --- | --- |
| Material | FR-4 | FR-4 | FR-4 |
| Product type / Different designs | Industrial/Consumer / 1 | Industrial/Consumer / 1 | Industrial/Consumer / 1 |
| Layers | 4 | 4 | 2 |
| Dimensions | 150 × 110 mm | 18 × 64 mm | 150 × 110 mm |
| Quantity | 5 | 5 | 5 |
| Delivery format | Single PCB | Single PCB | Single PCB |
| Thickness | 1.6 mm | 1.6 mm | 1.6 mm |
| Outer copper | 1 oz | 1 oz | 1 oz |
| Inner copper | 0.5 oz | 0.5 oz | Not applicable |
| Mask / silkscreen | Green / White | Green / White | Green / White |
| Surface finish | ENIG | ENIG | ENIG |
| Impedance control | No | No | No |
| Stackup | No requirement | No requirement | Standard 2-layer |
| Via covering | Tented | Tented | Tented |
| PCB assembly | No | No | No |
| Gold fingers / castellations / edge plating | No | No | No |
| Electrical test | Flying probe | Flying probe | Flying probe |
| Marking | Remove order number | Remove order number | Remove order number |

Five bare boards each is the suggested standard minimum batch; the parts list
populates **one set**, with optional spares shown separately. Additional assembled
sets need multiplied part quantities. Keep other advanced process options at their
ordinary defaults. Select no via filling, plugging, capping, blind/buried vias,
controlled depth, countersinks or custom stackup. The plated slots are ordinary
Excellon routed slots, not a special process. Leave special instructions empty.

The four-layer No requirement construction currently has the same published
nominal geometry as the historical JLC04161H-7628 basis; do not request that named
impedance template or upload an impedance requirement. See the
[manufacturing review](evidence/pre-fab-2026-09-14/manufacturing-review.md).
The native dielectric loss/mask defaults are nonbinding CAD metadata.

Order one **top-only, 0.10 mm, laser-cut stainless stencil** per board for owner
paste/reflow. A standard non-framework stencil with ordinary size/electropolishing
options suffices; upload the corresponding F.Paste file. No custom aperture edits
or bottom stencil are needed. Follow the saved nine-window U1 ground pattern and
USB shell/duplicate-contact suppression. The stencil is separate from PCB assembly.

Use [the consolidated purchase list](../../bom/order-2026-09-14/README.md), whose
exact MPNs, references and quantities reconcile to all physical native components.
No-part mounting holes, test pads, sensor electrodes and pigtail lands are excluded.
The harness and mounting stock are included separately from PCB component counts.

Inspect the upload preview for the stated dimensions/layer count and check it
against these CAM views. The supplier’s live quote/DFM must accept these standard
settings; no quote, paid order or returned supplier CAM has been approved here.
If the fabricator requests a material change, compare it with this release before
accepting it. Physical assembly, sensor calibration, USB operation, isolation and
loaded commissioning remain the checks in the project test matrix.
