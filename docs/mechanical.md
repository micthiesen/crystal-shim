# Enclosure, mounting and assembly

Use one **Hammond 1590ZGRP243** enclosure for the controller and mains board,
with a straight insulating partition and the manufactured filter on the mains
side. Its glass-reinforced polyester body is UL94 V-0 and its unmodified gasketed
assembly is IP66. Nominal outside dimensions are 400 × 250 × 120 mm; the drawing
specifies 384.85 × 235.26 × 109.20 mm inside. Cable entries must use suitable
strain-relief glands. The enclosure rating does not qualify unfinished cutouts.
[Manufacturer](https://www.hammfg.com/part/1590ZGRP243),
[retained drawing](../cad/shared-enclosure/source/1590ZGRP243.pdf).

The [current fit screen](../cad/shared-enclosure/README.md) replaces the smaller
1554V2GY arrangement. Using inside-floor coordinates X east, Y south, Z up:

| Allocation | Position in mm |
| --- | --- |
| 180 × 110 mains PCB | X25..205, Y25..135; PCB top Z28 |
| 110 × 110 controller | X245..355, Y25..135; PCB top Z28 |
| 3 mm insulating partition | X225..228, Y10..225, Z5..100 |
| Filter, terminals and wire bends | X25..155, Y150..225, Z5..45 |

Rotate the controller 90 degrees clockwise within the enclosure so its sensor
connector and antenna face the east wall beside the tank. This installation
rotation does not change board source coordinates. Reserve at most 60 mm of the
203.2 mm complete sensor harness inside/through the enclosure, leaving at most
143.2 mm outside. Position the case close enough to the clip to satisfy that
actual cable length. The future reservoir sensor can sit equally close.

Use the existing board holes with ordinary M3 insulating standoffs and simple
insulating mounting brackets/carriers secured to enclosure mounting points.
PCB top Z28 leaves room for solder tails below and the supply/connector bodies
above. No common steel inner panel is selected. The partition is a wiring
separator, not an independently touchproof live-service compartment; disconnect
the single mains plug before opening or servicing. Only isolated power/control
wires cross to the controller. Mechanical mounting and gland drilling follow the
final connector and enclosure hardware, without changing the PCB outlines.

The enclosure sits on the available flat surface behind the tank. Its sensor
connector side must be within the complete 8-inch sensor-harness reach; the
400 mm case length itself need not fit inside that radius. Do not optimize
the enclosure for minimum size at the expense of separation or service access.
Arrange connector positions and cable routing to meet the existing 8-inch maximum
sensor harness length, including the routing needed for strain relief.

Protect mains terminations against access, provide cable strain relief and drip
loops, use GFCI protection, and maintain the protective-earth connections required
by the inlet, filter case, output and any conductive enclosure parts. PE remains
continuous during ordinary connector or board service and is never relay-switched.
Review the actual bonding/service arrangement before release.

Route the filter's dirty input and clean output apart. Keep pump/mains wiring away
from the ESP antenna and the sensor cable. Include antenna keepout, USB/button
access, fuse service access while de-energized, insulated mounting and thermal headroom
in the enclosure review. Do not choose mains separation dimensions without the
applicable insulation review.

Hold the active sensor snug against the outside of the freshwater tank's **5 mm
glass**. The owner will separately model a simple 3D-printed clip that extends
over the glass and is retained by gravity and friction. Designing or printing that
mount is outside this project. Adhesive is no longer the mounting assumption.

The project owns the PCB attachment interface: provide a reasonably compact board
with a practical retention feature or clamp region, a flat glass-facing area,
and a dimensioned interface showing thickness, rim datum, contact/keepout regions
and component/connector clearance. The owner can design the clip around that
interface. Exact features follow electrode/shield design; width is available and
there is no owner-imposed numerical maximum.

Electrodes face the glass and components face outward, with electronics near the
top. The PCB itself does not wrap over the rim. The **50 mm sensing span down
from the top of the rim** is unchanged, and board padding at both ends is allowed.
Total height may exceed 50 mm; keep the rim datum distinct from the board edge.
Protect the daughterboard and cable from splashes and mechanical loads. Validate
contact repeatability, any protective interface, and clip removal/reseating as
part of calibration; a snug mount is not evidence that gaps have no effect.

Favor through-hole power parts, accessible low-voltage test points and larger
passives over minimum area. Record test point orientation and ground domain in a
board-specific probing guide once a real board exists. Stillair's fan probing
map must never be used here. Follow one power-off hookup at a time for later
guided bench work; no exposed-mains measurement procedure is supplied by setup.

`cad/` holds reviewed enclosure and PCB-interface drawings/exports and their
provenance when available. The owner's separate clip CAD is outside scope.
The [current shared-enclosure CAD screen](../cad/shared-enclosure/README.md)
imports the fresh manufacturer model and tests six declared board/assembly,
filter/wire and partition envelopes. All nominal intersections are zero; the
closest enclosure gap is 3.2 mm. Enlarging each allocation by 1 mm while lowering
the lid assembly 1 mm still leaves 2.2 mm minimum clearance. The lowered-lid
check covers the discrepancy between the old manufacturer STEP's 121.25 mm
outside height and the current drawing's 120.25 mm height. It is a fit sensitivity,
not a claimed manufacturer tolerance. Collision negative controls and independent
STEP reload pass.

The earlier [controller](design/controller-enclosure-fit.md) and
[mains/J5](design/mains-enclosure-fit.md) studies remain historical evidence for
the old enclosure and board sizes. Their carrier positions, service portal and
mated-distance results do not apply to this arrangement.

Gross enclosure fit is established for board placement. Exact connector mates,
crimps, carriers/partition fixings, gland machining and finished harness lengths
remain assembly-detail work. Full load temperature and actual skimmer switching
interference remain final-unit commissioning checks. The CAD screen does not
claim those measurements or release machining files.
