# Controller test and UART service pads

Status: connected source section, 2026-09-12. The pad bank implements the
[controller design basis](controller-design-basis.md) observability and UART
service requirements. It is provisional placement within the allocated 70 x
110 mm controller board, not an accepted complete layout.

## Electrical assignment

Each reference has one electrical pad numbered 1. Ground is the isolated
controller ground. `RELAY_GATED` is the AND-gate output before the MOSFET gate
resistor; observing it does not establish coil current or relay-contact state.

| Reference | Net | Silkscreen | Intended observation |
| --- | --- | --- | --- |
| TP1 | GND | GND | Return beside supply measurements |
| TP2 | V5_PSU | 5V PSU | Protected PSU secondary and coil supply |
| TP3 | V5_LOGIC | 5V LOGIC | Diode-OR output, below its source by a diode drop |
| TP4 | V3V3 | 3V3 | Controller regulator output |
| TP5 | SENSOR_SDA | SDA | Controller-side I2C data |
| TP6 | SENSOR_SCL | SCL | Controller-side I2C clock |
| TP7 | PSU_GOOD | PSU GOOD | Independent PSU qualification |
| TP8 | RELAY_GATED | RELAY EN | Hardware-qualified relay command |
| TP9 | UART0_RX | RX 3V3 | Module pad 24, GPIO17, UART receive |
| TP10 | UART0_TX | TX 3V3 | Module pad 25, GPIO16, UART transmit |
| TP11 | GND | GND | Return beside UART service pads |

UART pads carry **3.3 V logic**. Connect an external adapter TX to TP9, RX to TP10
and ground to TP11; leave the adapter's supply output disconnected. The pads do
not provide USB or 5 V service power. Power the controller through its normal
isolated PSU or the separate protected service connector J2. USB VBUS remains a
presence/reference input under the self-powered USB contract. No installed UART
bridge or populated service header is required.

## Source-owned geometry

The board-owned footprint is
`CrystalShim:TestPoint_Pad_D2.0mm_NoPaste`. It is one top-side circular copper pad,
2.00 mm diameter, centered on the component origin. An explicit 0.05 mm mask
expansion produces a 2.10 mm opening. It has no hole and no solder-paste aperture.
These dimensions are a project probe-access choice, not a manufacturer's land
pattern for a purchased component.

A 4 mm diameter courtyard reserves local probe access. Pad centers are at least
8 mm apart, leaving 6 mm between copper edges. Keep component bodies, connectors,
cable overhang and enclosure obstructions outside each probe-access circle in
the final integrated placement. Ref and short signal labels sit 2.2 mm above and
below pad center at 0.8 mm text size. Their nearest text bounds remain outside
the mask opening; final silkscreen and access checks still belong to layout.

All coordinates below are millimetres, measured from the board center with X
right and Y up. Convert to upper-left X-right/Y-down by `(35 + X, 55 - Y)`.

| References | Center X | Center Y |
| --- | --- | --- |
| TP1, TP2, TP3, TP4 | -24, -16, -8, 0 | -29 |
| TP5, TP6, TP7, TP8 | -24, -16, -8, 0 | -37 |
| TP9, TP10, TP11 | 12, 20, 28 | -37 |

This lower-half allocation stays inside the 70 x 110 mm outline and away from
the four allocated mounting-hole centers. It has not been reconciled with all
other provisional section placements, enclosure access or final routing. Keep
I2C and relay measurement branches short when integrating it. The UART locations
are individual probe/solder pads, not a claim of compatibility with a header or
pogo connector pitch.

## BOM and initial export

These eleven unpopulated copper features add no purchased BOM line, MPN or
supplier quantity. Source uses the dedicated test-point component type. Native
footprints exclude them from BOM and component-position files; native schematic
instances retain `on_board` and exclude them from BOM. The schematic uses a
single passive pin and an actual electrical net label for each pad.

The pinned converter adds `F.Paste` to exposed SMD pads despite the source's
zero-paste setting. Complete initial export must call
`omitTestPointPasteForInitialExport(board)` from
[test-points.tsx](../../pcb/controller/design/test-points.tsx) on the generated
`KicadPcb` object before its first stage serialization. It validates the complete
TP1-TP11 bank, pad number, net, copper, mask margin, layers and exclusions before
removing only `F.Paste`. It rejects unexpected or already-adjusted targets and
preserves unrelated objects. It never reads or edits an existing native board.

The custom test-point symbol preserves the explicit BOM metadata that the
pinned built-in symbol path drops. Each fixed reference has a distinct symbol
name because the resolved reference text affects symbol bounds. Reusing TP1's
symbol for TP10/TP11 had produced incorrect native pin origins; unique symbols
preserve both visible references and native connectivity. This does not alter
the shared schematic exporter.

## Verification and remaining integration

Focused source tests check the exact eleven net assignments, real schematic
reachability, exposed copper/mask, zero source paste, probe spacing and absence
of purchased-part metadata. Initial-converter tests check native copper/origin,
mask, pin/net and BOM/CPL parity, fail-before-mutation behavior, unrelated-object
preservation and unique schematic symbol identities.

Disposable KiCad 10.0.5 readback verified all eleven schematic pins and all eleven
physical pads, a 2.00 mm copper diameter, a 2.10 mm mask opening, zero paste pads
and eleven BOM/CPL exclusions. Source schematic, source copper and native
schematic renders were visually inspected. Scratch evidence is in
`/tmp/crystal-shim-test-points`, with `native-proof.json` and `verify-native.py`.
The parent capture must integrate this section, invoke the initial-only paste
adjustment, and declare the corresponding final native footprint/augmentation.
Full-board routing, DRC, physical probe access and fabrication remain pending.
