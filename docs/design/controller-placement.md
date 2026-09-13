# Controller placement and routing basis

Status: complete source placement under review, 2026-09-12. The authoritative
113-reference table is [placements.ts](../../pcb/controller/design/placements.ts).
All nine electrical sections use that table; the board owns four mounting holes.
Source placement and the expanded enclosure screen are separate from native
parity, routing and manufacturing release. Current native receipts are in
[STATE](../STATE.md).

Coordinates are **the component's electrical footprint origin**, as passed to source `pcbX` and `pcbY`: millimetres, X right, Y up, positive rotation counterclockwise. They are not the renderer's copper-bounding `pcb_component.center`. The 110 x 110 board occupies X=-55..55, Y=-55..55. All 113 parts stay on top. The complete initial graph exporter invokes the manufacturer-origin adapters before interpreting native footprint anchors.

## Mechanical placement and explicit limits

Use four 3.2 mm NPTHs at source **(-30,26), (30,26), (-30,-50), (30,-50)**. In the specification's upper-left board coordinates these are **(25,29), (85,29), (25,105), (85,105)**. The upper holes clear the top harness/antenna arrangement. Reserve a 4 mm radius around every hole for a screw head, spacer and tool clearance; this is a project allocation, not a selected mounting-part drawing. The revised holes do not claim alignment with Hammond's existing bosses. A retained insulating mounting arrangement and actual underside clearance remain required.

Place J1 and J3 toward the top; their plugs and harnesses depart north, then turn vertically/left within the low-voltage space. At Y=41, both locator centres are at Y=45.32, giving 9.68 mm to the board's Y=55 edge, within the Molex 10.16 mm maximum. Do not measure that distance from pin 1. Keep the J1 harness away from J3's sensor leads, with the coil-current loop confined to J1/Q1 and the mains-board coil/suppression. The two header courtyards have 0.5 mm between them. Individual mating housings, latch-tool access and cable bends must still be overlaid; the assembly courtyards do not prove the mating sweep.

U1 is at (20.2,45.25), rotation 0. Its nominal antenna is X=11.2..29.2, Y=55..61, fully beyond the top board edge. The maximum module outline reaches Y=61.1. Preserve that RF overhang, the manufacturer's no-baseboard-copper region, a grounded base under the module's non-antenna portion, and the separately declared module ground-pad/via/paste work. Do not extend a plane, fixture, shield or support below the antenna. Header housings and wires must stay to its left; do not run a sensor, UART, USB or coil harness across the antenna volume.

**Enclosure allocation:** the current board is 110 × 110 mm. Use the shared
[1590ZGRP243 fit screen](../../cad/shared-enclosure/README.md), rotating the
controller 90 degrees in the enclosure so its sensor/antenna end faces the tank.
The old 1554V2GY offsets, wall openings and fit receipts are historical and do not
constrain this larger enclosure. Native PCB coordinates remain source X right/Y up
converted to KiCad about (100,100); enclosure rotation does not rotate the PCB file.

J5 is the second sensor port on the left, J6 the separate 12 V feed at lower left,
and J7/J8/J9 the three pump outputs down the right edge. Reserve full mating access,
labels, and direct motor returns. TP12/13 and adjacent ground provide future
accessory input attachment without a separate driver board.

## Routing intent

**Buck and input OR:** keep D1/D2 and C1/C2 on the harness/power side. U2, C7, C8, L1 and C3 form a compact block. C7 bridges the VIN/GND side directly; C8 rotation 270 places its BST end above its SW end beside U2. L1 pin 1 faces SW, pin 2 faces the C3/C4 output bank. Keep SW copper confined to U2.5/C8.2/L1.1. Sense 3V3 from the quiet C3/C4 output node, returning to FB outside the switching-current loop, with ground shielding and without a long exposed loop around the inductor. Maintain a broad ground region underneath the buck and adjacent capacitor ground vias. Diodes recommends 2 oz top/bottom copper and bottom ground for thermal performance. Source now selects a four-layer, 1.6 mm FR4 board: top components/signals, uninterrupted L2 GND, L3 power/limited routing and bottom limited routing/ground; the exact stackup, finished copper and USB dimensions are selected in [the fabrication contract](controller-stackup.md) and still require native application and validation. No thermal result follows from these positions.

**Service power:** route J2/C20/C21 directly to D2. The former U10 network,
clamps, programming returns and filled-via requirement are removed. Use the
[known-adapter service procedure](service-input.md).

**Future motor bank:** V12_PUMP and its return carry at most 2 A continuous, with
a 3 A brief aggregate start target. Allocate 2 mm trunk and 1 mm per-channel
copper, reviewing short pad necks individually. Route switched drains as motor
power paths. Keep Q2/Q3/Q4, flyback diodes and connectors in compact loops; return
to J6.2 without using the sensor or three-wire 5 V harness return.

**Sensor:** take J3 power to D7's cathode node, then through R68 to V5_SENSOR_SW at C43/C44/U5 OUT. R68 rotation 90 leaves pin 2 toward the cable/TVS node and pin 1 toward the protected capacitors. R67 bleeds only that protected switch-output node. Keep D7's anode current path broad and direct to the J3 ground region using short vias where needed. Do not funnel it through U5 ground, the capacitor return neck or U3 ground. U11 clamps the cable SDA/SCL nodes; R62/R63 separate those from U3's A side. U3's B-side pullups are R60/R61 toward the module. Route SENSOR_SDA/SCL separately from SDA_CABLE/SCL_CABLE. There are approximately 6.1..7.9 mm connector-to-ESD/TVS pad-centre distances in this hand-assembly layout; final routes and return inductance must be reviewed, not described as already optimized suppression.

**USB:** fan out each duplicate D+/D- connector contact into its own logical pair immediately behind J4. Route through U9's actual straight-through pairs before U8, then north through the open centre corridor to R44/R45 and U1 pads 13/14. Avoid long protection stubs. U9 rotation 90 presents one row toward the connector and the matching row toward the switch. U8's common pair faces south and HSD1 pair faces north. R44/R45 remain close to the PHY pins; their fanout must preserve polarity and length matching. Maintain 90 ohm differential routing with continuous ground reference and paired ground-return vias for any layer changes. The reserved corridor around X=8..11 is a routing allowance, not existing copper; its roughly 70 mm length is a consequence of keeping USB away from the antenna. USB_VBUS remains a detection/clamp net only and never becomes a controller supply.

**Relay and probe access:** Q1 sits just behind J1; the gate resistor/pulldown and U6 remain local. U4's divider and bypass are removed from SW. Route PSU_GOOD/CHIP_EN as quiet control nets, without coil-current return in their ground branch. The two lower-left probe rows retain the specified isolated-ground, 5 V, 3.3 V, B-side I2C and relay nodes. UART pads TP9/TP10 plus TP11 ground are beside the right service controls, away from the antenna. Preserve 4 mm diameter probe spaces and move the existing reference/net silkscreen as needed for readability. These are exposed, unpopulated 3.3 V UART pads, not USB or a service-power connector.

## Evidence and verification scope

The current source placement checker covers all authored courtyards, board edges
and mounting reserves. Its checks do not establish routed current loops, native
DRC, mask/paste or exact cable fit. Current native parity, ERC/DRC and render
receipts are recorded in [STATE](../STATE.md). Earlier 95-part geometry and U10
critical-distance receipts are superseded; do not use them as acceptance of the
expanded controller.
