# Enclosure, mounting and assembly

Use one flame-rated, splash-resistant enclosure for the controller and mains
board with physical separation between sections. The manufactured filter sits
in the mains section. Candidates for size, material/rating, partition and
mounting geometry are now specified in the
[mains/enclosure basis](design/mains-design-basis.md). The final placed model,
wire bends and cutouts remain to be checked; a generic printed enclosure is not
automatically an acceptable substitute.

All hardware except the sensor board sits on a flat surface behind the tank,
within at most 8 inches of the sensor, with ample space available. Do not optimize
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
access, fuse service access while de-energized, insulated mounting and ventilation
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
No enclosure CAD or fabricated mechanical part exists at setup.
