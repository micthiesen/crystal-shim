# Mains placement feasibility

A complete 23-part allocation fits the planned **135 x 75 mm** board in a
conditional two-dimensional screen. This is a source-coordinate proposal, not
accepted placement or routing. All 23 parts are now captured in the complete
mains source, including the [MOV](mov-capture.md) with a project-owned installed
acceptance contract and 28 x 28 mm reserve. Its missing manufacturer body datum
is not replaced by an asserted manufacturer envelope.

The isolated supply and relay bridge the primary/secondary boundary. All other
primary bodies, including unused Sabre contacts, remain on the mains side.
J2 and J3 occupy opposite left/right board edges to separate the filter LINE and
LOAD wiring. The MOV is beside J1; the RC network is beside J4. PE stays off-board.

## Measured proposal geometry

The independent script checks axis-aligned bounds conservatively around actual
copper, source envelopes and proposed mounting hardware. It does not compute
routed creepage, solder fillets, fabrication tolerance or three-dimensional access.
Root inspected the generated placement image.

| Check | Proposal result |
| --- | ---: |
| Parts / numbered copper lands / NPTHs | 23 / 81 / 5 |
| Different primary-net copper gap | 3.40 mm, MOV pads |
| Primary-to-isolated copper gap | 15.62 mm |
| Whole primary-to-isolated envelope gap | 10.69 mm |
| Primary to proposed mounting hardware | 9.295 mm |
| Smallest courtyard pair gap | 0.75 mm |
| Courtyard overlap / off-board courtyard | None |
| Copper-free horizontal strip | Board Y = 44..54 mm |

The strip is clear of source pad copper. Primary bodies extend into parts of it;
it is not a universal metal-free boundary. Routing must also preserve the full
primary-body separation requirements.

The script independently compares all **79 existing-model pad centres** with an
actual tscircuit compile, within 0.000001 mm. The complete source now includes the
two MOV pads, with independent integration tests for all 81 physical lands and
the authored placement datums. Four 3.2 mm corner mounting holes are centred
5 mm from the edges,
with an assumed 8 mm diameter hardware/tool reserve. J5 contributes the fifth
NPTH. Board/filter floor allocation keeps the specified board size and a nominal
10 mm gap; full enclosure fit is still required.

## Integrated source coordinates

These are tscircuit coordinates in millimetres, relative to the board centre,
with positive Y upward and source rotations. Each origin is the existing model's
source origin, not its body centre; several datums are project choices. Keep all
parts on the top side.

| Ref | pcbX | pcbY | pcbRotation |
| --- | ---: | ---: | ---: |
| U1 | -13.2 | -27.35 | 90 |
| K1 | 24.75 | 1.9 | 270 |
| J1 | -42.2465 | 24.62 | 0 |
| J2 | -53.12 | -3.993 | 90 |
| J3 | 36.2605 | 0.62 | 0 |
| J4 | 4.7675 | 24.62 | 0 |
| R1 | 16.08 | 14.5 | 0 |
| C1 | 38.5 | 15.5 | 0 |
| D1 | 26.08 | -28.5 | 180 |
| J5 | 53.5 | -17.5 | 270 |
| U2 | -21 | -27 | 0 |
| D2 | -27 | -32 | 0 |
| R2 | -25 | -21.5 | 0 |
| R3 | -25 | -24.5 | 0 |
| R4 | -29 | -21.5 | 0 |
| R5 | -29 | -24.5 | 0 |
| R6 | -20.5 | -32.5 | 0 |
| R7 | 37.5 | -28.5 | 0 |
| C2 | -17 | -21 | 0 |
| C3 | -17 | -24 | 0 |
| C4 | -12 | -31.5 | 0 |
| C5 | -16.8 | -28 | 0 |
| RV1 | -36.25 | 4.5 | 0 |

## Obligations before placement acceptance

- Apply the MOV's project-owned installed acceptance volume, with its measured
  final-unit fit and controlled assembly process. Its source reserve is an
  allocation, not a guarantee that every supplied part will fit.
- Resolve the qualified Sabre body-to-tail poses, mating face numbering, latch
  access and adjacent plug cross-mating; retain every unused blade and tail.
  The housing table requires at least 16.88 mm mated depth at J1 and 17.69 mm
  at J2-J4 with 0.50 mm edge margins. The current header-only proposal does not
  prove those deeper, still-unlocated envelopes fit.
- Check J5's mated housing, cable bend/withdrawal and partition opening. Its
  right-facing orientation alone does not establish enclosure clearance.
- Retain the supply and relay's internal isolation qualifications and keep primary
  routes out of the isolated region and bridge component output/coil sides.
- Recheck the 3.2 mm primary-net and 8 mm primary/secondary rules using complete
  copper, solder, hardware, fabrication tolerances and routed native geometry.
  The MOV's nominal 3.40 mm gap has only 0.20 mm above the primary-net rule.
- Complete source/native origin and mask/paste adapters, electrical metadata,
  guarded handoff and native review before routing. No fabrication, assembly
  or operating gate is passed by this feasibility result.

The source-derived models, distance calculation, compiled-coordinate comparison,
CSV and inspected SVG/PNG are in
`/tmp/crystal-shim-mains-placement-independent`. The checked result identities are:

- `placement-results.json` SHA-256 `20095478bc1e45c4a5cc6177ea42c6e86412086cdc3cd9b91e3c948f6ae4228a`.
- `source-geometry-check.json` SHA-256 `cf2b38bfa36b92342269525ac8ecf1b186e19b9148893d249c6b2cfb0d231460`.
