# Shared stacked-board size proposal

2026-09-13: recommended planning target for owner discussion. No outlines,
footprints, connectors or component positions have been changed. The controller's
four-layer stack is retained, as confirmed by the owner. The sensor has its
separate [accepted visual target](sensor-visual-target.md).

## Recommended geometry

Use **150 × 110 mm for both boards**, with mains/power below and controller above.
Keep mains at two copper layers and controller at four. This reduces mains width
from 180 mm by 30 mm. The controller grows from 110 × 110 mm to share the outline;
compaction comes from stacking and mains re-placement, not shrinking each board.
The bare-board stack occupies 16,500 mm² versus 31,900 mm² combined board area
today, a 48.3% reduction. These figures exclude connectors, cable bends, antenna
overhang, the separate mains filter, enclosure walls and service access.

Both boards use four **3.2 mm non-plated holes** for M3 insulating hardware.
Measured from the upper-left corner in component-side plan, X right/Y down:

| Hole | X mm | Y mm |
| --- | ---: | ---: |
| H1 | 7 | 7 |
| H2 | 143 | 7 |
| H3 | 7 | 103 |
| H4 | 143 | 103 |

Hole-centre spacing is **136 × 96 mm**. Reserve at least a 4 mm radius around
each centre for the maximum 8 mm hardware envelope, with no component, track,
via or pour there. Retain insulating screws, washers and standoffs on the mains
board; this mounting reserve does not independently establish electrical
clearance or creepage. Check final board flex and support with the 195 g supply.

Start with **45 mm clear board-to-board spacing**, defined from the top face of
the lower PCB to the underside of the upper PCB. Match effective spacer length
after any washers or separator supports. Reserve about **75–80 mm overall
assembly height**, including floor standoffs and upper component/access space;
the final enclosure and mated connectors decide the exact height.

## Why this size

The power board sets the common outline. Its retained parts include:

| Item | Known plan/height constraint |
| --- | --- |
| IRM-45-12 supply | 87 × 52 mm nominal, 88 × 53 mm source envelope, 30.5 mm maximum allocated height |
| TMOV surge suppressor | 29 × 29 mm courtyard, 26.5 mm high placement reserve |
| G5RL relay | 29 × 12.7 mm envelope, 15.7 mm height |
| Four Sabre headers | Nominal widths 21.08, 28.58, 36.07 and 51.05 mm, each with ±0.33 mm width tolerance |
| Branch fuse | 32.98 × 5.8 mm formed-lead/copper envelope |
| Remaining power parts | Buck, inductor, capacitors, secondary fuse/connectors, flyback and primary RC network |

The initial allocation is supply in the upper central area, inlet/filter-line
connectors along the left, filter-load/pump connectors along the lower edge,
surge/fuse/snubber parts toward primary, and buck/secondary harnesses toward the
right. Put relay contacts toward primary and coil toward secondary. Reserve
routing channels around the module rather than packing bodies edge to edge.
This is a block allocation, not checked component coordinates.

A 140 × 110 mm candidate looks plausible but leaves less comfortable room around
the surge suppressor, side-facing connectors and isolation boundary. Choose the
extra 10 mm for the requested high-confidence routing target. The controller is
not density-limited at 150 × 110 mm: it currently fits 113 electrical components
plus four holes on 110 × 110 mm. New hole positions, antenna and connector banks
still require re-placement review.

## Connectors and stack constraints

Use candidate right-angle equivalents on the lower mains board:

| Ref | Current vertical | Candidate right-angle |
| --- | --- | --- |
| J1 | 43160-0102 | 43160-1102 |
| J2 | 43160-0103 | 43160-1103 |
| J3 | 43160-0104 | 43160-1104 |
| J4 | 43160-0106 | 43160-1106 |

The manufacturer lists these short-tail, no-board-lock variants for the same
Sabre family and mating housing series. They are candidates pending exact
footprint, polarization, installed-metal, latch and mated-envelope verification;
do not implement the change by merely rotating the vertical footprint. Retain
the existing distinct circuit counts and deliberate unused contacts. Lower
secondary Micro-Fit connections are already right-angle; turn them toward an
accessible edge. The controller also already uses right-angle edge connectors.
Allow cable and withdrawal space beyond the PCB outline.

Controller on top gives access to its buttons, test points and service connectors,
and keeps tall mains components from sitting above its antenna. Preserve the
antenna overhang and its 15 mm three-dimensional reserve across the entire stack,
including lower-board parts, wires, hardware and enclosure. Do not locate the
antenna above the supply's tallest corner without checking that reserve.

The 45 mm gap leaves 14.5 mm above the allocated 30.5 mm supply body before upper
underside projections, tolerances or a separator. Preserve the mains/SELV barrier
in three dimensions, including solder tails, primary connectors and wiring.
Retain an insulating partition/guard between mains and controller; its horizontal
stack implementation, edges and supports need design review. The old side-by-side
enclosure partition and fit receipt do not validate this stack. A spacer length
alone is not insulation acceptance. Preserve 8 mm primary-to-SELV and 3.2 mm
different-primary-net requirements throughout the later layout.

Stacking changes airflow and puts the controller above a heat source. Leave
ventilation paths and verify the existing temperature limits in the new assembly.
Keep the external filter allocation and separated LINE/LOAD wiring; the board
footprint is not the footprint of the entire mains assembly.

## Confidence and next step

This is a conservative engineering target based on retained component dimensions,
available connector variants and current controller density. It is the preferred
size for a high-confidence first placement attempt, not a measured 90% success
probability. No packing solver, exact new placement, routing trial, stacked CAD
collision check or thermal test has passed for this proposal.

Discuss the visual arrangement next. Before accepting final geometry, place the
actual footprints, validate all mated service envelopes and mounting hardware,
review three-dimensional insulation/antenna/thermal constraints, and confirm
routing channels. Then apply the normal source-to-native ECO workflow.

## Evidence

- [Current mains placement](mains-placement.md) and [design basis](mains-design-basis.md).
- [Mains physical source](../../pcb/mains/design/power-components.tsx),
  [MOV reserve](../../pcb/mains/design/mov-component.tsx) and
  [header models](../../pcb/mains/design/mains-headers.tsx).
- [Controller placement](controller-placement.md) and
  [connector envelopes](../../pcb/controller/design/connector-physical-models.ts).
- [Mean Well IRM-45 drawing](https://www.meanwell.com/Upload/PDF/IRM-45/IRM-45-SPEC.PDF).
- [Molex header drawing, sheets 3–4](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf)
  and [series chart](https://www.molex.com/en-us/products/series-chart/43160), checked 2026-09-13.
