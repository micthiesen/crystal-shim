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
Exact spacer, washer, carrier attachment and board-load details remain to select.

An **intact 158 × 118 × 2 mm insulating separator** occupies X96..254,
Y61..179, Z50.1..52.1. Its lower face is 3 mm above the allocated 30.5 mm supply
height; it leaves 6.5 mm to the upper assembly's underside reserve at Z58.6.
This is a geometric allocation. Material, retention, primary-guard edges,
wire routing and electrical insulation acceptance remain engineering checks.
No RF notch is selected.

Allow **35 mm outward mating/wiring depth** at each used edge. Lower primary
headers exit left and south; lower isolated headers exit right. Upper sensor
headers exit north, service connectors south and pump outputs right. The north
reserve stays left of the antenna. These are space allocations, not measured
housing withdrawal distances, cable bend radii or exact crimp models.

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
