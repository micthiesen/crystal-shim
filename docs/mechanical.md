# Enclosure, mounting and assembly

## Shared controller and mains stack

Use matching **150 × 110 mm** boards, with the four-layer controller above the
two-layer mains/power board. Both are nominal 1.6 mm FR4 with components upward.
This is the accepted compact layout: the mains board shrinks from 180 mm wide,
while the controller grows from 110 mm to share its outline. The stacked bare
PCB footprint is 16,500 mm², approximately 48% below the former combined board
area. Connectors, cables, antenna, external filter and enclosure add space.

![Accepted stacked-board appearance](design/stacked-board-visual-target.png)

The generated visual reference is illustrative. Component appearances, connector
counts and relay markings do not change the BOM. The selected 5 V relay and
power architecture remain authoritative; no extra rendered capacitors or parts
are added. Source placement and native checks govern exact geometry.

| Mounting feature | Requirement |
| --- | --- |
| Holes on both boards | Four aligned 3.2 mm NPTH holes |
| Centres from upper-left, X right/Y down | (7,7), (143,7), (7,103), (143,103) mm |
| Source-centred coordinates | X=±68 mm, Y=±48 mm |
| Centre spacing | 136 × 96 mm |
| Hardware | M3 insulating screws, washers and standoffs |
| Hardware reservation | At least 4 mm radius per hole, no component/copper occupancy |
| Clear separation | 45 mm from lower PCB top face to upper PCB underside |

Match effective spacer length after washers and separator supports. Reserve
approximately 75–80 mm overall assembly height including floor standoffs and
upper access, subject to final enclosure geometry. Support the 195 g supply
without excessive board flex. Keep exactly four aligned mounting columns.

The retained IRM-45-12 sets the minimum practical stack volume: 87 × 52 mm nominal
body, 88 × 53 mm source allocation and 30.5 mm maximum allocated height. The
45 mm gap leaves 14.5 mm before upper underside projections, separator and
tolerances. The MOV has a 29 × 29 mm courtyard and 26.5 mm height reserve; the
relay has a 29 × 12.7 mm envelope and 15.7 mm height. These allocations explain
the common board size; they do not establish thermal or physical assembly tests.

Use right-angle Sabre headers on lower-board J1–J4: **43160-1102, -1103, -1104,
-1106**, retaining the corresponding 44441-200n housings, 43375-2001 contacts and
unused-contact assignments. Use their actual right-angle footprint and mating
geometry, not a rotated vertical header. Lower J5/J6 already use right-angle
Micro-Fit interfaces. Keep mating, latch release and withdrawal paths outward
from accessible edges. Separate filter LINE/LOAD wiring. Controller buttons,
USB and test points remain accessible from above or an edge.

Preserve the controller antenna overhang and 15 mm three-dimensional reserve
from lower components, copper, wiring, conductive hardware and enclosure walls.
The intact dielectric separator has a separately recorded 11.1 mm antenna gap;
its RF influence remains unmeasured. Keep the inner controller
ground reference and USB geometry in [the stack contract](design/controller-stackup.md).
Retain an insulating separator between mains and controller with mechanically
secured supports and edges. Check primary wires, solder tails and unused metal
as well as board copper against the existing 8 mm primary-to-SELV and 3.2 mm
different-primary-net requirements. Spacer length alone is not insulation
acceptance. Keep ventilation and final-unit temperature checks for the stack.

## Enclosure and wiring

The retained enclosure candidate is **Hammond 1590ZGRP243**: 400 × 250 × 120 mm
nominal outside, 384.85 × 235.26 × 109.20 mm inside per drawing. Its unmodified
glass-reinforced polyester assembly is UL94 V-0/IP66; cutouts and glands require
their own suitable installation. [Manufacturer](https://www.hammfg.com/part/1590ZGRP243),
[retained drawing](../cad/shared-enclosure/source/1590ZGRP243.pdf).

The [current shared CAD screen](../cad/shared-enclosure/README.md) verifies the
stack against retained manufacturer enclosure solids. Matching boards occupy
X100..250, Y65..175 mm. Lower board top is Z16.6 mm and upper underside Z61.6 mm.
The intact 158 × 118 × 2 mm separator sits at Z50.1..52.1 mm, above the allocated
supply body. Outward connector/wiring reserves extend 35 mm. The separate filter
reserve clears the enclosure by 5.40 mm nominally and 4.00 mm with the recorded
fit allowance. These are occupied-volume checks, not measured thermal or RF
performance. Final supports, glands and cable construction use this stack;
former side-by-side evidence is superseded.

The manufactured filter remains beside the stack with separate dirty LINE and
clean LOAD routing, away from sensor wiring and the ESP antenna. Preserve its
terminal and wire-bend allocation; board size is not the complete mains assembly
footprint. Use insulating carriers rather than a common steel panel. Keep mains
terminations inaccessible, provide strain relief and drip management, use GFCI
protection, and retain continuous PE to the filter case, output and any conductive
parts requiring bonding. Disconnect mains before opening or servicing.

Place the enclosure on the available flat surface behind the tank with its sensor
connection within the **203.2 mm complete harness limit**, including internal
routing. No old enclosure rotation, gland coordinate or 60 mm internal allowance
is an accepted measurement for this stack. Final strain relief and cable geometry
must establish reach without pulling the sensor off the glass.

## Sensor adhesive interface

Use the **18 × 64 mm** four-layer sensor entirely below the rim on the outside of
5 mm freshwater aquarium glass. Top edge is 2 mm below the rim; water is at least
10 mm below it. The mask-covered B.Cu sensing face adheres to glass with thin,
uniform mounting tape or transfer film. No clip, rail, bracket or mounting plate
sits between PCB and glass. Avoid foam and trapped air; the owner selects tape
and its installed thickness becomes part of final calibration.

Electronics and six pigtail solder lands face outward. The cable exits left when
viewed from outside, with outward-side strain relief. Preserve a flat glass-facing
surface without exposed solder, through-hole connector tails or mounting holes.
The [sensor specification](sensor.md) defines the 50 mm physical electrode span
and lower wet reference. The accepted image remains a visual reference, not a
claim of measured sensitivity, adhesive durability or usable travel.

Protect the board from splashes and cable loads. Measure gap/adhesive effects,
replacement repeatability and final calibration on the assembled unit. No owner
clip CAD is required. This project owns its board/adhesive/pigtail interface.

## Verification boundary

Use current source/native placement, planes, routing rules and rendered geometry
before routing. Final routed ERC/DRC and manufacturing checks remain mandatory;
actual temperature, skimmer interference, sensor calibration and mounting durability
remain commissioning tests. A source or CAD screen cannot pass those measurements.
