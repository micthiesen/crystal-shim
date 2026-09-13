# Shared enclosure fit

Current enclosure: **Hammond 1590ZGRP243**, for the enlarged 180 × 110 mm mains
board and 110 × 110 mm controller. The previous `controller-fit/` and `mains-fit/`
receipts concern the superseded 1554V2GY arrangement and do not validate this one.

- [Plan](fit-plan.svg): practical board/partition/filter allocations.
- [Fit results](fit-results.json): actual nominal solid collisions, clearances,
  1 mm allocation sensitivity, negative controls and source/export hashes.
- [CAD screen](fit-screen.step): manufacturer enclosure plus declared bounding
  envelopes. Colored component-level assembly is not implied by this STEP.
- [Manufacturer drawing](source/1590ZGRP243.pdf) and original STEP ZIP are retained.
- [Reproduction script](check_fit.py): requires CadQuery; run
  `python cad/shared-enclosure/check_fit.py` from any directory.

The manufacturer STEP contains eight valid solids, including an optional steel
inner panel. That panel is excluded; no common conductive carrier is selected.
The other seven solids remain. Our six allocation solids bring the independently
reloaded export to thirteen valid solids. Coordinate translation is recorded in
JSON. The nominal STEP is 1 mm taller than the present drawing; lowering the lid,
cover screws and gasket by 1 mm is included in the sensitivity check.

Use existing PCB mounting holes with ordinary M3 insulating standoffs, retaining
PCB top at Z28. Support these on uncomplicated insulating carriers or brackets
fixed to the enclosure's mounting points. This screen reserves the board underside
down to Z21; it does not specify carrier machining, adhesive attachment, bracket
hole locations or mounting tolerances. Do not substitute the supplied steel-panel
model without separately resolving PE bonding and isolation underneath the boards.

The straight partition allocation is 3 mm thick at X225..228, Y10..225, Z5..100.
It separates primary/filter wiring from the controller. Its edge gaps and fixing
feet are not a touchproof service compartment; unplug mains before opening or
servicing the enclosure. Keep primary cables wholly on the mains side. Only
isolated power/control harnesses cross the partition, in a retained opening near
the relevant connector, whose exact machining follows final mating hardware.

The 130 × 75 × 40 mm filter/wire reserve contains a 73 × 53 × 25 mm maximum
filter body allocation and space for terminals and bends. It is not a measured
Faston housing/crimp geometry. Route marked LINE and LOAD pairs separately.

These results establish ample gross fit for routing allocation. They do not
release fabrication, enclosure machining or electrical operation. See
[mechanical requirements](../../docs/mechanical.md) for what remains.
