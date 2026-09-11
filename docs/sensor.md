# Active sensor daughterboard

## Proposed hardware

| Item | Initial requirement |
| --- | --- |
| Mounting | Outside 5 mm aquarium glass, thin uniform adhesive layer; no clip over the rim |
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
total PCB height. Dry/wet reference margins, stick width, adhesive, and the exact
electrode placement relative to the rim remain to be designed. If the rim masks
the top of the glass, resolve that geometry before claiming coverage at the datum.
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
glass. Include deposits/biofilm, expected water conditions, temperature changes,
adhesive variation, nearby hands/objects, cable motion, and skimmer switching.
Retain raw measurements and independent observed water position. Establish a
stable stop/restart margin before building the full mains controller. See the
`SEN-*` rows in [the commissioning matrix](../testing/test-matrix.csv).

Until that evidence exists, no routine cleaning and immunity to hand movement
remain goals. Continuous sensing is a hardware simplification, not a promise of
precision level measurement.
