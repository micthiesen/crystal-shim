# Mains power layout and assembly

The current mains U2 is **AP63205WU-7**, a six-lead TSOT26 buck, and the board
is 150 × 110 mm beneath the matching controller. The former TPS259470 ten-pad thermal/stencil contract and
`evidence/mains-thermal-stencil/recommended-operations.json` describe removed
hardware. They are historical evidence, not operations to apply to this board.
There is no special eFuse split-land, eight-via or twelve-aperture requirement.

## Power and return paths

Budget 850 mA at 5 V and 2 A continuous/3 A brief startup at the motor feed.
The conservative 80% buck efficiency allowance corresponds to 1.0625 W loss at
4.25 W output. It is a budget bound, not predicted junction temperature. Verify
buck operation, repeated motor startup and final enclosure heating on the final
assembly. See [power calculations](mains-design-basis.md#isolated-supply-and-power-budget).

Follow the [Diodes layout guidance](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf):
keep VIN bypass close to pins 3/4, BST capacitor adjacent to pins 5/6, SW–L1 short,
and FB pin1 connected after L1 at the output capacitor. Keep SW small. Use useful
isolated ground copper on both layers, ordinary through vias where needed, and
separate motor return current from the buck/logic return until near U1 secondary.
The package has no exposed pad. No thermal pad or exotic via process is added.

Start with 2 mm 5 V/12 V power routes, 3 mm for shared motor-feed/return trunks,
and 0.3 mm short buck lead escapes widening immediately. Ordinary isolated signal
clearance is 0.15 mm. Primary routes start at 2 mm; J1/MOV surge paths at 3 mm
where pads allow. These are layout allocations, not a fuse-clearing qualification.
Join both tails of each Sabre blade. Preserve 8 mm primary-to-isolated and 3.2 mm
different-primary-net gaps after copper fill. Keep F2 motor feed and its return
sized for the actual startup current without interpreting the fuse as a current limiter.

## Assembly and stencil

Use ordinary SMT assembly for U2, L1, F2 and C2–C7; 0.10 mm stencil is the
starting assembly choice, with lead apertures based on captured copper and the
assembler's process. Inspect final aperture unions and soldermask webs. TSOT26
has no ground exposed pad, split power land or special tented via bank. Keep
source mask expansion 0.05 mm and preserve all exact land dimensions.

No paste on U1, K1, J1–J6, F3, D1, R1, C1, RV1, mounting holes or connector
locators. Hand-solder through-hole parts after reflow. F3 axial fuse needs at least
1.5 mm body standoff, bends more than 1 mm from caps, and 350 ±5 C for at most
5 s soldering. U1 uses 1.5 mm AC and 2.5 mm DC finished drills. Preserve the MOV
plated slot and existing installed-body envelope. Replacing F2 or F3 requires
desoldering; isolate mains first.

All 53 PTH lands and six NPTHs must remain free of paste. There are 22 SMT lands.
Source paste records are compiler evidence, not a count of final physical stencil
apertures. Native DRC/CAM, exact pin/net parity and final assembly checks remain
separate from source-level validation.
