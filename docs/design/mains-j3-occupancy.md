# J3 mated housing bound

Historical vertical-J3/old-enclosure occupancy study, superseded by the
two-position Phoenix Contact 1868076 fixed J3 terminal and
[stacked mechanical layout](../mechanical.md). Numeric bounds
below must not be applied to the current board.

The manufacturer drawings support a **conditional housing-plastic south bound
of floor Y45.805 mm**, giving an **8.695 mm Y-only gap** to the J5 portal with
the stated allowances. This narrows the [enclosure study](mains-enclosure-fit.md).
Complete mated primary occupancy remains open: the header-to-tail datum and
installed contact, crimp and wire geometry still need evidence.

## Parts and coordinate basis

Use the exact four-circuit combination:

| Part | Order code | Manufacturer drawing |
| --- | --- | --- |
| Header, short tails without board locks | 43160-0104 | [431600001-SD A1](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf), sheets 1/2 |
| Black PA66 housing | 44441-2004 | [444410000-SD A1](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/444/44441/444412006_sd.pdf?inline=), sheets 1/2 |
| Female contact with TPA | 43375-2001 | [SD-43375-301 A1](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/433/43375/433752001_sd.pdf) |

Cavities 1/2 carry filtered line/neutral. Housing cavities 3/4 stay empty, while
all four header blades and eight tails remain. PE bypasses J3.

The source origin is PCB (36.2605, 0.62), rotation 0, at circuit 1's lower tail.
The enclosure transform `X = 77 + pcbX`, `Y = 41.5 - pcbY` gives floor
(113.2605, 40.88). The four circuit X positions are 113.2605, 120.7535, 128.2465
and 135.7395; each has tails at Y37.70 and Y40.88. These are source hole centres,
not measured metal extents. PCB top is Z28. The existing fixed envelope is
X106.30..142.70, Y31.165..44.835. Its shroud-to-tail placement remains qualified
as an inference in [the header capture](mains-header-capture.md).

## Dimensioned plastic calculation

The vertical mated view places the latch north, away from J5. Wire openings face
upward; later wire bends and latch/tool motion are not prescribed. Housing
cross-sections permit both terminal orientations and are explicitly unscaled.

| Dimension | Value | Datum |
| --- | ---: | --- |
| C | 16.05 ±0.64 mm | Four-circuit housing depth, including latch-side extent |
| E | 4.47 ±0.13 mm | Housing north face to main-shroud north face in mated view |
| D | 11.53 ±0.15 mm | Header main-shroud depth |

E's tolerance comes from the header drawing's general two-decimal millimetre
tolerance. Name the main-shroud north face `Hn`, with south face `Hs = Hn + D`.
Then housing north `Rn = Hn - E`, and south `Rs = Hs + C - E - D`.
This uses the dimensioned face offset without assuming shared centres.

```text
Nominal south overhang = 16.05 - 4.47 - 11.53 = 0.050 mm
Maximum south overhang = 16.69 - 4.34 - 11.38 = 0.970 mm
Conditional Rs maximum = 44.835 + 0.970 = 45.805 mm
Residual to Y46.5      = 0.695 mm
Portal gap            = 55 - 0.30 - 0.20 - 45.805 = 8.695 mm
```

The full overhang interval is -0.870..+0.970 mm. The portal calculation includes
its 0.30 mm adverse edge allowance and a 0.20 mm southward primary-position
allowance. Full J5 service-volume Y clearance is 8.795 mm with opposing
0.20 mm assembly offsets. The moving housing's Y clearance is 10.745 mm with
those offsets. These conservative projections do not require an X registration
**for occupancy that satisfies the conditional Y bound**.

The plastic result assumes Y44.835 is a valid maximum for the header main
shroud. That input still depends on the source's inferred mounting datum.
Mating play, incomplete seating and unbounded contact/wire projections are not
included. No complete electrical-clearance or placement acceptance follows.

## Evidence still needed

- Register the exact header shroud and all four blade/shoulder/tail-root shapes
  to both PCB hole rows. The drawing's latch-side keepout is not that datum.
- Locate the housing along X. Its 30.82 ±0.25 mm width and 22.48 ±0.20 mm
  circuit span do not establish an end-face offset from the first PCB tail.
- Locate both fitted contacts, seating stops, float, activated/unactivated TPA
  tabs, cutoff residuals and finished crimps in both permitted orientations.
  A standalone terminal length does not supply the installed transform.
- Bound exposed conductor, insulation-crimp pose, wire exit, strain relief and
  bending. The existing 15 mm wire-headroom box is an allocation.

Root and the researcher visually checked the header mated view and housing
drawing. The contact PDF's primary text was readable; local byte retrieval and
web screenshot retrieval failed. Its dimensions are not assigned to floor axes
without visual confirmation. No unavailable assembly CAD was replaced by an
assumed centred block.

Independent review confirmed the exact part rows and dimension directions,
then enumerated all eight tolerance corners using decimal arithmetic. It
reproduced the 0.970 mm overhang and 8.695 mm conditional portal gap. A negative
control adding 0.70 mm of unaccounted header-position error reduces the gap to
7.995 mm, demonstrating why the unresolved mounting datum remains material.
No actionable defect was found within this conditional scope.

[Calculations and provenance](evidence/mains-j3-occupancy/provenance.json) retain
the numeric result, drawing hashes and source locations. The full research
report and download diagnostics remain at
`/tmp/crystal-shim-mains-j3-mated-occupancy`. No board placement, BOM selection,
purchase or physical commissioning evidence changed.
