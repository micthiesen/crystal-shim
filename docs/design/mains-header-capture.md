# Mains Sabre header capture basis

The current stacked board uses right-angle Molex Sabre headers. Exact source
models in [mains-headers.tsx](../../pcb/mains/design/mains-headers.tsx) preserve
both tails of every circuit, including unused blades. J1/J2 mate outward to the
left; J3/J4 mate outward from the lower edge. See [placement](mains-placement.md).

The authority is Molex **431600001-SD PSD000 A1**, released 2020-05-26,
**sheets 3/4/5** for the right-angle parts. The [official drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf)
was recovered from a [manufacturer drawing mirror](https://www.megastar.com/content/pdfs/431601102_sd.pdf).
SHA-256: `249d83521d452abfae030237405456be0e05ec06e08c629489d60fa035962fa7`.
The right-angle outline and PCB hole drawing were visually inspected. Sheets 1/2
and previous vertical-header occupancy studies do not define these body envelopes.

## Parts and circuit mapping

| Ref | Header | Cable housing | Circuits / tails | Connected circuits | Empty cable cavities |
| --- | --- | --- | --- | --- | --- |
| J1 | 43160-1102 | 44441-2002 | 2 / 4 | 1 AC_L_FUSED; 2 AC_N | none |
| J2 | 43160-1103 | 44441-2003 | 3 / 6 | 1 FILTER_LINE_L; 2 AC_N | 3 |
| J3 | 43160-1104 | 44441-2004 | 4 / 8 | 1 PUMP_L_FILTERED; 2 PUMP_N_FILTERED | 3, 4 |
| J4 | 43160-1106 | 44441-2006 | 6 / 12 | 1 PUMP_L_SW; 2 PUMP_N_FILTERED | 3, 4, 5, 6 |

Use 43375-2001 cable contacts and molded cavity numbering. F3 separates
AC_L_FUSED from FILTER_LINE_L. PE bypasses every header and remains continuous.
The selected short-tail parts have no board locks. No optional board-lock holes
are present. Different pole counts alone do not prove protection against partial
or incorrect mating.

There are 15 logical circuits and 30 plated tails: 16 connected tails and 14
unused tails. Each used blade has two same-net lands that must both be connected
and soldered. Unused metal remains subject to the primary separation rules.

## Land pattern

Local component coordinates are X right, Y down, with the origin at circuit 1's
front tail. Mating is toward positive Y. Circuit n has X=(n−1)×7.493 mm and two
identically numbered tails at Y=−3.18 and 0 mm. Source placement transforms Y once
into tscircuit's upward axis. The signed transforms are tested at all cardinal
rotations.

Finished drill is **1.78 ±0.08 mm**; row pitch is **3.18 ±0.13 mm**; circuit pitch
is **7.493 ±0.13 mm**, non-accumulative. The project uses **3.50 mm circular copper**,
which is a project land choice rather than a manufacturer-specified diameter.
Minimum annulus with a 1.86 mm finished hole is 0.82 mm. Adjacent-circuit nominal
copper clearance is 3.993 mm, or 3.863 mm at minimum pitch before process and
solder allowances. Same-circuit circles overlap 0.32 mm intentionally. PTHs have
no paste; native mask allowance and circuit-1 markings are retained.

## Body and mating allocation

| Circuits | Nominal width | Maximum width |
| --- | ---: | ---: |
| 2 | 21.08 mm | 21.41 mm |
| 3 | 28.58 mm | 28.91 mm |
| 4 | 36.07 mm | 36.40 mm |
| 6 | 51.05 mm | 51.38 mm |

Right-angle shroud depth is **14.76 ±0.10 mm**. The height allocation is
**13.67 mm**, including the 11.53 ±0.15 mm body and 1.86 ±0.13 mm latch projection.
Short solder tails are **3.81 ±0.28 mm**. Drawing sheets 3/4 bound the body pose
using 19.78 ±0.38 mm overall depth, the tail rows and 13.13 mm board-lock datum.

The source reserves local Y=**−4.25..17.25 mm**, including rear tails and assembly
allowance, with the drawing's maximum width. This conservative whole-header
allocation governs courtyard and mount checks. The mated housing has a **17 mm
height allocation**; allow **35 mm beyond the board edge** for outward mating,
latch release and wiring. Final cable construction must fit those reserves.

The native footprints and schematic fields use the exact right-angle part codes.
Source tests retain every pad, net, rotation and mounting reservation; native DRC
checks actual copper separation. Courtyards describe occupancy, not insulation.
Complete routed and assembled clearance, solder, thermal and cable checks remain
part of fabrication review and commissioning.
