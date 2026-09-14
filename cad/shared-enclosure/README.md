# Shared enclosure fit

The retained **Hammond 1590ZGRP243** accommodates the matching **150 × 110 mm**
boards as a stack, controller above mains, with **45 mm clear board-face spacing**.
The separate mains filter remains beside the stack. This screen uses actual
manufacturer enclosure solids and declared rectangular assembly/access reserves;
it does not establish exact component, cable, insulation or thermal acceptance.

- [Fit results](fit-results.json): dimensions, clearances, sensitivity and negative controls.
- [CAD screen](fit-screen.step): enclosure and current stacked reserve solids.
- [Manufacturer drawing](source/1590ZGRP243.pdf) and original STEP ZIP are retained.
- [Reproduction script](check_fit.py): requires CadQuery; run
  `python cad/shared-enclosure/check_fit.py`.
- [Old side-by-side plan](fit-plan.svg): historical, superseded by this stack.

Both board outlines occupy X100..250, Y65..175 mm in enclosure-floor coordinates.
Mains PCB bottom/top are Z15/16.6; controller bottom/top are Z61.6/63.2.
Four aligned mounting columns have centres **(107,72), (243,72), (107,168),
(243,168)**. Use insulating M3 hardware within the 8 mm maximum reserved diameter.
The selected support construction below fixes spacer, washer and carrier geometry;
board-load and fastening performance remain physical checks.

An **intact 158 × 118 × 2 mm insulating separator** occupies X96..254,
Y61..179, Z50.1..52.1. Its lower face is 3 mm above the allocated 30.5 mm supply
height; it leaves 6.5 mm to the upper assembly's underside reserve at Z58.6.
The support construction below selects FR-4 and edge retention without separator
penetrations. Wire routing and as-built electrical insulation still need inspection.
No RF notch is selected.

Allow **35 mm outward mating/wiring depth** at each used edge. Lower primary
fixed terminals exit left and south; lower isolated headers exit right. Upper sensor
headers exit north, service connectors south and pump outputs right. The north
reserve stays left of the antenna. These are space allocations, not measured
housing withdrawal distances, cable bend radii or exact crimp models. Mains
J1–J4 now use 21.5 mm-high Phoenix Contact 1868076 terminals, within the existing
30.5 mm lower assembly height reserve. Their top screws require removal of the
controller and separator with mains disconnected. The gross reserve geometry
is unchanged; the historical fit receipt is not an exact terminal assembly model.

The filter/wiring reserve is rotated to **75 × 130 × 40 mm**, at X292..367,
Y40..170, Z10..50. Its nominal enclosure clearance is **5.40 mm**; expanding the
reserve by 1 mm and lowering the lid/hardware 1 mm leaves **4.00 mm**. Keep LINE
and LOAD wiring separate. This reserve contains the retained external filter and
its cable allowance, not an added component or a final mounting drawing.

The module's actual antenna envelope remains beyond the upper board's north
edge. Its minimum distance to the lower assembly reserve is **16.1 mm**. The
screen checks at least 15 mm to the enclosure, lower components, filter and
external harness reserves. The intact dielectric separator is tracked separately;
its influence on RF performance remains unmeasured. The board's local copper
exclusion and module support rules remain authoritative.

The optional manufacturer steel inner panel is excluded. Base, lid, screws and
gasket remain in every enclosure test. All nominal reserve volumes and the 1 mm
expanded reserves clear the enclosure, including a lid lowered 1 mm to account
for the STEP/drawing height discrepancy. Independent reserves do not intersect;
intentional mating interfaces may touch. Three negative controls detect wall,
lid and lowered-separator collisions. The exported STEP reloads as **19 valid
solids**. No route, fabrication, machining or assembled ingress rating follows
from this gross-fit result.

## Selected insulating support assembly

[Support construction](../../docs/design/evidence/pre-fab-2026-09-14/mechanical-closure.md)
now specifies a stock FR-4 carrier, two upper rails, four external nylon rods and
corner clamps that preserve the hole-free separator. The PCB elevations and hole
pattern above remain unchanged. [Support CAD](support-fit.step) and
[results](support-fit.json) are reproduced with `python check_supports.py` from
this directory, using the same CadQuery environment as the original fit screen.

The precise manufacturer-solid check locates the inner base surface at **Z1.8**
and outer base surface at **Z−4.0** at all six chosen base fastenings. Earlier text
called the retained Z0 datum the floor; it is a reference datum, not that local
surface. Carrier feet therefore have **3.2 mm** effective height to carrier Z5.
The new geometry checks actual base material, support/harness interference and
negative controls. Exact fastener engagement, physical loads, sealing, PE continuity
and the dielectric supports' RF effects remain assembly/commissioning checks.
