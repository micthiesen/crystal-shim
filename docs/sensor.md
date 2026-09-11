# Active sensor daughterboard

## Proposed hardware

| Item | Initial requirement |
| --- | --- |
| Water | Freshwater aquarium |
| Mounting | Snug against outside 5 mm glass, held by an owner-designed external clip; adhesive is not required |
| Width | Reasonably compact; ample glass width available, no fixed maximum specified |
| Sensing span | 50 mm downward from the top of the tank rim; extra board padding at top/bottom allowed |
| Converter | One TI FDC1004, leaded VSSOP-10 package; exact order suffix open |
| Electrodes | One continuous level electrode, matched dry reference above range, wet reference below range |
| Shielding | Driven, out-of-phase arrangement adapted from TI's actual geometry |
| Supply | 5 V cable input, local 3.3 V regulator and decoupling |
| Interface | 3.3 V I2C, initially 100 kHz |
| Harness | At most 8 inches (203.2 mm), six-position locking Molex Micro-Fit 3.0 candidate |
| Conductors | Three signal/return pairs: 5 V/GND, SDA/GND, SCL/GND |
| Assembly | Components face outward; 0603/0805 passives where practical |
| Processor | None; ESP performs calibration and interpretation |

The owner will model a separate 3D-printed mount that clips over the glass and is
retained by gravity and friction. That mount is outside this project's scope.
The sensor PCB itself stays on the outside face of the glass and does not wrap
over the rim. Define a practical attachment interface on the PCB, with dimensions,
permitted clamp/retention regions and component/connector clearances for the owner
to use. Choose those features during board design without compromising the
electrodes or driven shields; no arbitrary hole pattern is frozen by this brief.

The FDC1004 has four capacitance channels and active shield drivers and supports
a 3.3 V supply. VSSOP-10 avoids requiring the smaller leadless package.
[TI datasheet](https://www.ti.com/lit/ds/symlink/fdc1004.pdf).

Place the electronics and connector near the top, away from the main sensing
area. Keep electrode-to-converter traces short. Resolve connector footprint,
local regulator noise, decoupling, pullups to 3.3 V, cable capacitance/rise time,
and connector ESD protection during schematic work. No pin numbers are assigned
by the pair list; draw both mating faces before freezing the harness.

## Geometry and calibration

Adapt [TI TIDA-00317](https://www.ti.com/tool/TIDA-00317), particularly
[TIDU736A sections 4 and 6](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf), rather
than replacing it with six independent level pads. Its matched liquid and
environment references support compensation, while the out-of-phase shield
geometry reduces nearby-object interference. This is a reference to adapt and
validate on glass, not evidence that our board already achieves its performance.

Owner inputs (2026-09-11): **5 mm glass**, with the desired detection span extending
**50 mm down from the top of the tank rim**. The board must not clip over the rim.
Padding at the top and bottom is acceptable; 50 mm is the sensing span, not the
total PCB height. The available width is generous; keep the board reasonably
compact while preserving the reference geometry and a usable clip attachment.
Dry/wet reference margins, exact stick width, retention features and electrode
placement relative to the rim remain engineering work. The clip may extend over
the glass; the PCB need not. Resolve any actual obstruction when checking the
owner's mount against the board interface, before claiming coverage at the datum.
The wet reference must remain covered
and the dry reference remain above water throughout the calibrated range.
Loss of either reference condition must become invalid input rather than a
plausible but misleading level. Specify the channel/shield assignment from TI's
design before capture; the fourth channel does not imply another required pad.

Calibration must retain raw level/wet/dry capacitances, baseline/scale, validity
bounds and revision. Reject stale, disconnected, saturated, out-of-range, or
degenerate reference readings. A normalized level can support multiple discrete
thresholds without claiming physical millimeters. Thresholds and allowed sample
age need actual calibration; do not invent physical values from the demo.

## Acceptance evidence

Test rising and falling water, particularly a receding level that leaves wet
glass. Use the actual freshwater aquarium conditions. Include deposits/biofilm,
temperature changes, clip pressure, contact gaps, removal/reseating, nearby
hands/objects, cable motion, and skimmer switching. Validate repeatable snug
contact; any protective layer or spacer must be included in the sensor calibration.
Retain raw measurements and independent observed water position. Establish a
stable stop/restart margin before building the full mains controller. See the
`SEN-*` rows in [the commissioning matrix](../testing/test-matrix.csv).

Until that evidence exists, no routine cleaning and immunity to hand movement
remain goals. Continuous sensing is a hardware simplification, not a promise of
precision level measurement.
