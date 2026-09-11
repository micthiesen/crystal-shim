# Enclosure, mounting and assembly

Use one flame-rated, splash-resistant enclosure for the controller and mains
board with physical separation between sections. The manufactured filter sits
in the mains section. Size, material/rating, partition and mounting geometry are
open; a generic printed enclosure is not automatically an acceptable substitute.

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

Mount the active sensor outside **5 mm glass** with a thin, uniform adhesive layer. The
electrodes face the glass and components face outward. Electronics near the top
reduce intrusion into the sensing area. Protect the daughterboard and cable from
splashes and mechanical loads without adding an untested sensing gap. Record
adhesive and reference margins before setting its outline. The owner specified a
**50 mm detection span down from the top of the tank rim**, with padding allowed at
both ends and **no board clip over the rim**. Total board height may exceed 50 mm;
keep the rim datum distinct from the board edge. Confirm the rim profile if it
obstructs the proposed upper electrode/reference placement.

Favor through-hole power parts, accessible low-voltage test points and larger
passives over minimum area. Record test point orientation and ground domain in a
board-specific probing guide once a real board exists. Stillair's fan probing
map must never be used here. Follow one power-off hookup at a time for later
guided bench work; no exposed-mains measurement procedure is supplied by setup.

`cad/` holds reviewed STEP/DXF/drawing exports and their provenance when available.
No enclosure CAD or fabricated mechanical part exists at setup.
