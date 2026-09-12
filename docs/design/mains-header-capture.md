# Mains Sabre header capture basis

The four selected vertical Molex Sabre headers use two plated tails per circuit.
Their [source models](../../pcb/mains/design/mains-headers.tsx) retain every unused
blade and both tails. They are not adopted native footprints, placement or harness
fit approval.

The primary authority is Molex **431600001-SD PSD000 A1**, released 2020-05-26,
sheets 1, 2 and 5. The [official drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf)
was recovered as [manufacturer PDF bytes on a mirror](https://www.megastar.com/content/pdfs/431601102_sd.pdf),
SHA-256 `249d83521d452abfae030237405456be0e05ec06e08c629489d60fa035962fa7`.
The mirror filename names another family member; the actual five-page drawing
includes all selected order codes. Root inspected the vertical outline and PCB
hole drawing. Do not use sheets 3/4, which describe right-angle headers.

## Circuit and hole mapping

Coordinates use the component-side mating-face view, latch toward negative Y,
positive X right and positive Y down. Circuit 1 is the leftmost marked cavity.
The origin is its lower tail. For circuit `n`, use `x = (n - 1) * 7.493 mm`
and **two identically numbered pads at y = -3.18 and 0 mm**. The generic layout
has the same latch orientation as the mating-face drawing, although its caption
does not explicitly say top view; installed native candidates agree. Flip Y
once for tscircuit's coordinates and preserve the component-side orientation.

| Ref | Header | Cable housing | Circuits / PTHs | Connected circuits | Source NCs / empty cable cavities |
| --- | --- | --- | --- | --- | --- |
| J1 | 43160-0102 | 44441-2002 | 2 / 4 | 1 `AC_L_FUSED`; 2 `AC_N` | none |
| J2 | 43160-0103 | 44441-2003 | 3 / 6 | 1 `AC_L_FUSED`; 2 `AC_N` | 3 |
| J3 | 43160-0104 | 44441-2004 | 4 / 8 | 1 `PUMP_L_FILTERED`; 2 `PUMP_N_FILTERED` | 3, 4 |
| J4 | 43160-0106 | 44441-2006 | 6 / 12 | 1 `PUMP_L_SW`; 2 `PUMP_N_FILTERED` | 3, 4, 5, 6 |

J2's harness labels `FILTER_LINE_L/N` refer to the same fused-line and neutral
nodes, not two new disconnected circuit nets. Cable contacts are `43375-2001`;
use only cavities 1/2 for black line and white neutral. PE bypasses these headers.
There are 15 logical circuits and 30 PTHs: 16 connected tails and 14 unused tails.
Selected `-010n` headers have no board locks; omit the optional 3 mm lock holes
and the unrelated installed `_ThermalVias` alternatives.

The drawing specifies finished holes **1.78 ±0.08 mm**, row spacing
**3.18 ±0.13 mm**, and circuit pitch **7.493 ±0.13 mm, non-accumulative**.
Use those displayed PCB dimensions consistently. Adopt project **3.50 mm circular
copper**, which the manufacturer does not specify. Minimum annulus with a 1.86 mm
finished hole is 0.82 mm. Adjacent-circuit nominal copper clearance is 3.993 mm,
or 3.863 mm at pitch minus 0.13 mm, before etch/solder allowances. These are not
final creepage or solder-fillet clearance results.

Same-circuit circles overlap 0.32 mm along Y intentionally; nominal drill-edge
separation is 1.40 mm. Both tails need the same native net and must be soldered.
Use no stencil paste. Mark circuit 1 on Fab/silk without changing copper solely
for orientation. Complete source/native tests must retain duplicated pad numbers,
all unused physical metal and the exact eight connected logical endpoints.

## Body, mating and remaining fit evidence

| Circuits | Nominal A ±0.33 mm | Maximum A | Nominal latch width |
| ---: | ---: | ---: | ---: |
| 2 | 21.08 | 21.41 | 3.05 |
| 3 | 28.58 | 28.91 | 3.05 |
| 4 | 36.07 | 36.40 | 10.54 |
| 6 | 51.05 | 51.38 | 10.54 |

All selected parts have main-shroud depth **11.53 ±0.15 mm**, seated height
**14.76 ±0.10 mm**, and short tails **3.81 ±0.51 mm** below the seating plane.
Mated height is **30.05 ±0.64 mm**, excluding wire bend and service access.
Latch projection is nominally 1.86 mm beyond the main body, with the drawing's
general two-decimal tolerance ±0.13 mm. Maximum main depth plus latch projection
is 13.67 mm. This bounding size does not establish its pose relative to the holes.

The drawing gives a 6.80 mm reference from body end to circuit-1 mating centre,
and a 4.72 mm minimum keepout from the upper tail row toward the latch-side
body edge. It does not fully dimension the body-to-tail Y pose, complete keepout
polygon or latch-release space. Installed KiCad body Y bounds -7.65 to +3.88 mm
and centre -1.885 mm are provisional inferences. Centring A over the circuit row
matches the 6.80 reference approximately, but is not a newly proven datum.

Reserve at least 0.50 mm outside the maximum occupied envelope plus separate
latch and wire access. Preliminary width lower bounds are 22.41, 29.91, 37.40
and 52.38 mm. The 14.67 mm depth lower bound covers the header alone. The
subsequently recovered primary indexed housing table requires larger mated-depth
allocations below. Final fit must account for the qualified body pose. Courtyard
spacing does not replace mains insulation rules. Opposite-face numbering and
partial/cross mating remain unverified. Use molded circuit numbers; different
pole counts alone do not prove that wrong mating is impossible.

A bounded follow-up found Molex **444410000-SD PSD000 A1**, released 2018-09-13,
in the [official indexed housing drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/444/44441/444412008_sd.pdf).
Its chart explicitly includes the four selected housings and their 43375 terminals
and 43160 mates. This evidence is parsed primary text; actual PDF/CAD bytes were
not recovered, so no housing file hash or visually verified mating pose is claimed.

| Housing | A maximum, mm | C maximum, mm | Minimum depth allocation with 0.50 mm each side |
| --- | ---: | ---: | ---: |
| 44441-2002 | 16.07 | 15.88 | 16.88 |
| 44441-2003 | 23.57 | 16.69 | 17.69 |
| 44441-2004 | 31.07 | 16.69 | 17.69 |
| 44441-2006 | 46.05 | 16.69 | 17.69 |

C is 15.24±0.64 mm for two circuits and 16.05±0.64 mm for the others. These
mated-envelope lower bounds exceed the existing header-only depth. Housing height
27.38±0.38 mm must not be added to the header height: the header drawing already
specifies the combined 30.69 mm maximum mated height. Latch release, cable bend
and withdrawal space remain additional. The exact housing-to-contact and
header-to-tail transforms remain unresolved; do not centre the deeper housing
on the current header box by convenience. Evidence and arithmetic are in
`/tmp/crystal-shim-mains-fit-closure`.

Native KiCad 10.0.5 candidates have correct paired tails and drills but use
7.49 mm pitch, 3.78 x 3.43 mm copper and nominal-body courtyards. Their tiny pitch
difference is within the drawing tolerance; it is not the reason to reject them.
Use a custom Crystal Shim ID for the exact-pitch, 3.50 mm source adaptation and
qualified maximum body bounds. No native footprint has been modified or adopted.

## Source capture checks

The four exact part models compile to 15 logical pins and 30 plated holes,
including seven intentional NC pins and all 14 unused tails. Parsed initial
native output preserves both same-number pads and the same net on every connected
pair. Five source/native tests check all four cardinal rotations with signed
pin vectors, finished drills, copper, eight connected logical endpoints and
absence of optional board-lock holes. Body/latch bounds preserve the qualified
pose and separate seated height from the mated assembly envelope.

`cd pcb && bun run render:mains-headers` creates the component-only review images;
root inspected the actual land and schematic renders. The renderer uses provisional
component-review positions. Native origin normalization, mask/paste, circuit-1
marking, full manufacturer body pose and opposite-face harness fit remain work.
Passing the source checks does not approve mains insulation or placement.

Read-only native inventories, source images, a 30-pad CSV and compilable coordinate
data are in `/tmp/crystal-shim-mains-sabre-capture-research`. The formulas, part
map, primary source identity and remaining limitations above are the durable
capture contract. Follow [the mains design basis](mains-design-basis.md) and
[PCB workflow](../../.agents/skills/pcb/SKILL.md) for implementation and review.
