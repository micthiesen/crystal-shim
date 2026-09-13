# Mains placement allocation

The shared-power revision uses **180 ×110 mm**, two layers, 1.6 mm FR4,
22 electrical parts and four corner mounts. This supersedes the previous
135 ×75 mm/IRM-10-5 placement and its numeric enclosure/isolation screens.
Those old measurements must not be presented as results for this allocation.

U1 occupies the upper-left 87 ×52 mm module area, with primary pins at the left
and 12 V output pins toward the board centre. K1 retains the right-side coil/
left-side contact orientation in the lower half. J1 and J2 serve the input and
filter LINE at the left; J3/J4 occupy the lower edge. F3 sits between U1 and the
primary connector row. R1/C1 sit left of K1 to keep primary snubber copper away from its isolated coil.
RV1 remains beside the inlet path. Keep filter LINE and
LOAD harnesses apart. J5/J6 leave the isolated right edge through the partition.

The authoritative positions are
[`placements.ts`](../../pcb/mains/design/placements.ts), component datums in
millimetres, +X right/+Y up. U1's datum is the module drawing origin, not body
centre; relay datum is contact pin 3. The integration test independently checks
every position and numbered-pin geometry. `placement-check.ts` additionally
requires conservative pad-copper lower bounds of 8 mm primary-to-isolated and
3.2 mm different-primary-net separation, including unused Sabre blades. It
rejects the former R1 position that placed snubber copper too near K1 coil. Board mounts are (±85,±50), 3.2 mm
NPTH, with an initial 4 mm radius mounting hardware allocation. J5/J6 add their
own locator holes. All parts mount on top.

Native routing must establish the **8 mm primary-to-isolated** barrier around
all source copper and occupied primary metal, including unused Sabre contacts,
and **3.2 mm between different primary nets**. A fixed full-width horizontal
strip is no longer an adequate description: the larger module bridges a boundary
that turns toward K1. Keep copper away from the primary side of the module,
connector metal, board mounts and wiring. Soldermask does not count as insulation.

The buck cluster is placed to the right of U1 secondary terminals. Tighten the
VIN bypass/GND loop and SW–L1–output-capacitor path during routing, with FB sensing
after L1 and a quiet return. Route the separately fused 12 V feed above the buck
cluster to J6. Motor return should join near U1 return rather than through the
logic/sensing ground path. Leave the buck SW copper small and remote from sensors.

This is a source skeleton for native routing, not accepted fabrication placement.
The larger supply body, 30.5 mm maximum height and 195 g mass require the revised
shared enclosure. Earlier `mains-enclosure-fit` and placement evidence files are
historical for the smaller board. Recompute mated-body, mounting-metal, tool-access
and complete enclosure fit for this source before fabrication.


The four mounts use M3 insulating screws, washers and standoffs. No metal screw,
washer or threaded insert may occupy the board-side mounting allocation. Maximum
occupied hardware diameter is 8 mm, matching the existing 4 mm radius allocation;
the selected insulating enclosure support carries the module mass. Native 8×8 mm
copper-free squares centered on H1–H4 reserve that envelope, with tracks, vias and
fills prohibited on both layers. KiCad's pad prohibition also rejects mechanical
NPTH pads, so these four areas allow pads; the source-locked placement contains
only its NPTH mounting pad inside each area and cannot gain other pads without
a source/parity change. Existing NPTH mounting holes remain present. This is the routing hardware choice, not a later metal-fastener
clearance decision; replacing it with metal would change the insulation design.

J1 is at (-73,-42) mm after moving it 3 mm right to clear H3's full hardware
allocation. Its maximum shroud/latch envelope begins at X=-79.958 mm, leaving
1.042 mm to the H3 reservation edge at -81 mm. J4's maximum envelope ends near
X=79.42 mm, leaving over 1.5 mm to H4's reservation; U1's body starts at X=-77.5 mm,
clear of H1's -81 mm reservation edge. H2 is clear of the J6/secondary cluster.
