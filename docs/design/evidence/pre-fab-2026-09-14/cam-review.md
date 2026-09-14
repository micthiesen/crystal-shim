# Quantitative CAM and assembly-support review

2026-09-14. Reviewed the three `2026-09-14-rev1` upload ZIPs against current native
inputs and their export receipts. No native board or fabrication file was
changed. The reproducible read-only checker is
[`check-cam-2026-09-14.py`](../../../../pcb/tools/release/check-cam-2026-09-14.py).
Run it with a Python environment containing Gerbonara; it invokes the project's
KiCad Python wrapper for the native readback and prints JSON. The successful run
used `/tmp/crystal-prefab-cam-venv/bin/python`; full output is
`/tmp/crystal-prefab-cam-check.json` for inclusion in the combined release receipt.

## Quantitative results

| Board | Outline mm | Copper layers | PTH objects | NPTH objects | Vias | Front paste apertures | Identified references |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Controller | 150 × 110 | 4 | 145 | 13 | 102 | 271 | 117 |
| Sensor | 18 × 64 | 4 | 9 | 0 | 9 | 42 | 16 |
| Mains | 150 × 110 | 2 | 42 | 6 | 11 | 22 | 26 |

PTH counts include vias and routed slots, with each slot counted as one object.
Outline dimensions are taken from contour centerlines, not expanded stroke
bounding boxes. Each board has four outline segments. Every native round drill
and slot has a matching parsed Excellon object with the same plating class,
center, cutter diameter and slot span within 0.001 mm. Slot endpoint positions
and orientation also match within that tolerance. There are no extra drills.

Controller J4's four plated shell slots are 0.6 mm cutter diameter, with two
1.1 mm centerline spans and two 0.8 mm spans. Their finished overall lengths are
1.7 and 1.4 mm respectively. Mains RV1's plated slot uses a 1.3 mm cutter and
2.4 mm centerline span, giving 3.7 mm overall length. Sensor has no slots or
nonplated holes. PTH/NPTH classification comes from the explicitly separate
files; Gerbonara's generic tool `plated` property does not reliably reflect
KiCad's Excellon header attributes.

The ZIP members exactly match the byte hashes recorded by the export receipt,
and each receipt's native-board hash matches the current board. No duplicate ZIP
member names, paste files, or `.gbrjob` metadata were included in the PCB upload
ZIPs. Front paste exists separately in each stencil directory. Parsed paste
object counts equal native F.Paste pad counts. This count check is not an
independent proof of every aperture's outline or paste-transfer performance.

## Mask, silk and inner copper

All **122 vias** are natively tented on both faces. Neither exported mask layer
contains a flash centered on any via. Sensor B.Mask has **zero openings**, leaving
the sensing face covered. This verifies intended tenting and aperture omission;
it does not promise that a fabricator's tenting process hermetically seals holes,
or independently recompute every neighboring mask intersection.

All **159 board references** are identified. Controller has 109 visible reference
fields plus eight existing combined connector labels: J1, J2, J3 and J5-J9.
Sensor and mains have all 16/26 reference fields visible. The checker tests exact
reference tokens in the replacement labels. It does not claim 159 visible
native reference fields or perform OCR on Gerber strokes. The export receipt
binds that text state to the plotted file; the six top/bottom CAM visual reviews
were performed by the coordinating reviewer.

All native board-level silk segments match Gerber line endpoint coordinates.
These include the shared eight-segment diamond/two-water-line logo on every
board and the sensor divider line. Their presence was checked geometrically,
not inferred from a file being nonempty.

Independently rendered and visually inspected the four inner-copper Gerbers:
controller In1/In2 and sensor In1/In2. Controller In1 retains broad continuous
reference copper around clearances; In2 contains the routed distribution rather
than an unexpected plane. Sensor In1 remains broad ground; In2 retains the paired
shield columns, central separation and narrow reference-lead shield finger.
No unexpected full-ground plane or missing shield column appeared. Images are
`/tmp/crystal-prefab-{controller,sensor}-inner_{1,2}.png`, rendered directly from
the ZIP's parsed Gerber layers. These views are planar geometry evidence, not
proof of the supplier's finished dielectric stack or capacitance response.

## Exact upload identities

| Board | ZIP SHA-256 |
| --- | --- |
| Controller | `804b3c8fc526c1c6a5d57c95cb46d5e76911f7c1bd52f473ecd13885a3fc301d` |
| Sensor | `5594c00a55ad7cedcf84e4552d71ecffc16600900cc74a81a4a8ddac892a4ea4` |
| Mains | `ce6496a41e2401418cb742586c0c3a9a9f5433573e280e27c2118ff0b2d8ad80` |

## Scope and disposition

No CAM export mismatch or additional special manufacturing feature was found.
The files describe conventional multilayer copper, soldermask, silkscreen,
through drills and routed plated slots. They contain no instruction requiring
blind/buried vias, filling, capping, castellations or paid impedance control.
The standard JLC order selections and resulting online DFM preview remain the
order-interface review, not something a Gerber parser can guarantee.

Schematics and native fabrication/reference drawings are present in each release's
assembly folder; separate stencil Gerbers support hand assembly. This review did
not independently prove every physical component-body/cable envelope or decode
every plotted glyph. The combined mechanical/assembly inspection covers those.
Copper and mask polygons were parsed and inspected, but were not independently
Boolean-compared point-for-point to every native polygon. Archive/native export
identity, drill correspondence, visible inner geometry and current source/native
checks provide complementary evidence.

This is not a claim that all historically ignored native DRC categories were
enabled. Their specific analytical audit and API limitation remain recorded in
[strict-drc-review.md](strict-drc-review.md). No order was placed and no hardware
was energized.
