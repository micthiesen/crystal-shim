# Stock-material mounting closure

2026-09-14. Selected construction: unplated FR-4 carrier and upper support rails,
nylon fasteners, and an unperforated edge-clamped separator. All PCB positions,
holes and copper remain unchanged. The manufacturer-solid interference check is
[check_supports.py](../../../../cad/shared-enclosure/check_supports.py), with
[saved results](../../../../cad/shared-enclosure/support-fit.json) and
[STEP](../../../../cad/shared-enclosure/support-fit.step). This verifies geometric
fit against allocated component/harness volumes, not physical load, vibration,
insulation, RF, torque or ingress performance.

## Material and fixed geometry

Order unplated flame-retardant FR-4 laminate with supplier UL94 V-0 evidence at the
purchased thickness. Stock [flame-retardant G-10/FR4 sheet](https://www.mcmaster.com/product/85345K137/)
is commercially available; choose by the exact dimensions below, not an arbitrary
imperial sheet thickness. No PCB fabrication customization is involved.

Coordinates use the existing enclosure datum and manufacturer transformation.
The actual manufacturer-solid floor at the selected fixing points is **Z1.8**,
with outer surface **Z−4.0** and **5.8 mm wall**. The older datum called Z0 the
floor; retain its coordinate system, not that literal floor interpretation.

| Piece | Finished position / stock | Quantity |
| --- | --- | --- |
| Carrier | 182 × 144 × 3 mm; X84..266, Y48..192, Z5..8 | 1 |
| Separator | 158 × 118 × 2 mm; X96..254, Y61..179, Z50.1..52.1; no holes/notches | 1 |
| North upper rail | Cut from 180 × 32 × 3 mm; crossmember X85..265,Y68..76; arms X85..115 and235..265,Y49..81; Z55.6..58.6 | 1 |
| South upper rail | Same blank; crossmember X85..265,Y164..172; arms X85..115 and235..265,Y159..191; same Z | 1 |
| Separator clamp tabs | 20 × 20 × 2 mm; paired at four corners, lower Z48.1..50.1 and upper Z52.1..54.1 | 8 |
| PE bracket | 40 × 30 × 3 mm; X270..310,Y180..210,Z10..13 | 1 |

The rails are H-shaped to avoid the antenna's direct projection while reaching
both PCB supports and outer frame posts. They and all frame fasteners are
insulating. The closest new dielectric support is 5.44 mm from the antenna;
its RF effect remains a physical commissioning check, like the separator.
No conductive object is added to the 15 mm antenna reserve.

## Carrier, frame and separator attachment

Four continuous **M4 nylon threaded rods**, purchased at least 80 mm long and
trimmed to the installed stack, pass through **4.4 mm enclosure-base and carrier
holes** at (90,55), (260,55), (90,185), (260,185). These positions clear the
manufacturer's molded features and all retained harness envelopes. The floor
fixings were checked against actual solid material, not just a floor rectangle.
Use broad insulating washers, compatible exterior sealing washers and nylon nuts.
The carrier sits on four **3.2 mm effective insulating feet**, preserving Z5.
External retaining nuts need about 4 mm below the enclosure's lowest original
datum; add four 10 mm insulating/rubber feet for freestanding use. Modified
base holes do not inherit the unmodified enclosure's IP66 rating.

The lower PCB attaches at (107,72), (243,72), (107,168), (243,168), using four
**plain 7 mm spacers** and M3 × 16 mm pan-head nylon through-bolts from below the
carrier, with top washers/nuts. Its underside remains Z15 and top Z16.6. Upper
rails are fixed between nylon nuts/washers on the outer rods. Four **plain 3 mm
spacers**, M3 × 12 mm countersunk nylon through-bolts and top washers/nuts retain
the upper PCB at underside Z61.6. Countersink the rail attachment heads flush;
do not put two opposing screws into a 3 mm threaded spacer. At PCB holes all
hardware remains within the existing 8 mm diameter reserves.

Corner clamp tab bounds are X84..104 or246..266, Y49..69 or171..191. Each pair
slides over its external frame rod and sandwiches the separator without drilling
it. Two M3 nylon stop screws per corner prevent lateral escape. Stop centres are:
(94.5,63), (98,59.5), (255.5,63), (252,59.5), (94.5,177), (98,180.5),
(255.5,177), (252,180.5). Their 3 mm shafts touch the separator edges; they
never penetrate it. Use M3 × 12 mm countersunk screws with heads flush in the
upper tabs and nuts below the lower tabs. The stops and clamped surfaces provide
mechanical capture rather than relying on glue or friction alone.

Do not include washer thickness twice: the 7, 3 and 3.2 mm dimensions above are
**effective installed separations**. Trim ordinary insulating spacer stock or
select matching shims so final measured board elevations agree. Buy hardware
stock with enough length; trim rod ends after setting the heights.

## Purchase quantities

- FR-4: one 3 mm carrier blank at least 182 ×144 mm; two 3 mm rail blanks at
  least 180 ×32 mm; one 3 mm PE bracket40 ×30 mm. One 2 mm sheet sufficient for
  separator158 ×118 mm and eight20 ×20 mm tabs.
- Four M4 nylon threaded rods at least 80 mm long; stock **40 M4 nylon nuts and
  40 washers** allows all clamping stacks and spares. [Essentra's rod family](https://www.essentracomponents.com/en-my/p/fully-threaded-studs-rods)
  includes M4 nylon rods. Six base sealing washers cover frame and PE bracket.
- Four 3.2 mm carrier feet; four 7 mm lower-PCB spacers; four 3 mm upper-PCB spacers;
  two 8.2 mm PE-bracket feet. All insulating; PCB support OD no larger than 8 mm.
- Four M3 ×16 mm pan-head nylon bolts; twelve M3 ×12 mm countersunk nylon
  bolts (four upper PCB plus eight corner stops); **16 M3 nuts and 48 washers**.
- Two M4 ×30 mm nylon through-bolts secure the PE bracket through its base
  fixing points (275,195), (305,195). Four 10 mm nonconductive external feet.
- PE junction: one M4 ×30 mm metal stud/bolt, four matching metal nuts including
  an all-metal locking nut, four metal flat washers, one serrated locking washer,
  and an insulating cover within the bracket's40 ×30 ×20 mm reserve.
- Sensor: two 15–20 mm square nonconductive cable-tie bases, four small nylon
  ties, and genuine 3M VHB5952 for those bases only.

## PE junction and sensor relief

The common PE stud is centred at **(290,195)** on the isolated FR-4 bracket.
Its cover reserve is X270..310,Y180..210,Z13..33. This lies outside PCB,
component and harness reserves. Three ring branches meet at the stud: two TE
31886 and one TE320551. [TE31886](https://www.te.com/en/product-31886.html) accepts
M4/#8 and22–16 AWG. The selected filter's PE termination is a FASTON, so its
opposite wire end does not need another stud ring. Keep separate crimped branches.

Clamp the ring stack **metal-to-metal** between metal washers and locking nuts;
no nylon or FR-4 belongs within the electrical clamping stack. Fix that clamped
metal assembly to the FR-4 with a separate mounting nut so polymer creep cannot
relax ring contact pressure. Fit the cover and keep the junction independently
secured when servicing other components. Do not invent a generic torque for the
terminals; use the purchased fastener/terminal instructions and record the
as-built installation and continuity checks.

Anchor the sensor cable jacket to adjacent aquarium glass with two tie bases:
first approximately 15 mm left of the PCB edge, second 30–50 mm farther along.
Leave a relaxed bend between first anchor and outward J1 lands; count it in the
existing harness limit. [3M VHB5952](https://www.3m.com/3M/en_US/p/dc/v100809057/)
is specified for adhesion to glass among other surfaces. Follow surface-prep,
pressure and dwell instructions. Foam tape goes **under cable anchors only**,
never under the sensor electrode. Check cable retention in the actual humid
installation. These anchors are not mains cord grips and add no sensor clip.

## Evidence and remaining physical checks

The support check finds no volume intersection with the manufacturer enclosure
(after the six explicitly selected mounting holes), existing separator or allocated
component/harness reserves. It checks material underneath every base fixing.
Negative controls reject an uncut enclosure intersected by the frame rod and a
rail lowered into the separator. New support solids do not modify PCB geometry.

No mechanical design decision here requires a PCB respin or custom JLC service.
Before drilling, confirm the received enclosure matches its retained drawing and
check the selected points against its actual molding. After construction verify
fastener engagement, clamp retention, board heights, cable pull relief, PE
continuity, clearances, thermal performance and RF behavior. These are as-built
checks; this CAD evidence does not assert they passed.
