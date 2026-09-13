# FDC1004 sensor design basis

Status: fixed source geometry and electrical capture, 2026-09-12. The source is
[pcb/sensor/design](../../pcb/sensor/design/README.md). Native ERC/DRC and handoff
are separate evidence; final-unit calibration follows the one fabrication cycle.
No prototype board, rim measurement prerequisite or planned respin is introduced.

## Selected design

One `FDC1004DGSR` uses TI's out-of-phase (OoP) arrangement with a continuous LEVEL
and wet/liquid reference RL. The optional live environment reference RE is omitted.
TI TIDU736A sections 4.1, 4.3 and 5.1 explicitly permit omitting it. This removes
the old requirement that water remain at least 11 mm below the rim. It also removes
live compensation for dry-container/environment changes: commissioning and periodic
recalibration must establish whether stored dry baselines remain adequate.

`CIN1` reads LEVEL and `CIN2` reads RL. `CIN3` and `CIN4` are open at the package,
with no trace, via, electrode or test pad. Each measurement selects open `CIN4` as
its negative input, so SHLD1 follows the selected positive input and SHLD2 follows
CIN4 out of phase. Never ground either shield. Differential mode disables CAPDAC;
keep input capacitance below 115 pF, measured difference within +/-15 pF and each
shield load below 400 pF.

| Measurement | CHA | CHB | Configuration |
| --- | --- | --- | --- |
| MEAS1 | CIN1 | CIN4 | `0x0c00`, LEVEL |
| MEAS2 | CIN2 | CIN4 | `0x2c00`, RL |

Use 100 samples/s, single-trigger conversions, LEVEL followed by RL, read MSB
before LSB and enforce the existing monotonic completion timeout. No MEAS3 is
needed. Firmware [calibration](calibration.md) stores separate `level_empty_counts`
and `wet_reference_empty_counts`, then computes
`q = (LEVEL - LEVELdry) / (RL - RLdry)`. Its low/high calibration endpoints are
measured, not inferred millimetres. Reject stale, saturated, disconnected,
implausible-slew or out-of-envelope readings, and collapsed/wrong-sign wet response.
There is no independently sensed dry-reference condition.

## Geometry for capture review

The 38 x 86 mm, two-layer, 1.60 mm nominal FR-4 board is flat against the outside
of 5 mm freshwater aquarium glass. All dimensions are millimetres. Glass-view
`x=0..38` runs left to right; `y=0` is the tank rim and positive y runs downward.
Board bounds are `x=0..38,y=-22..64`. Source coordinates are
`x_ts=19-x_glass,y_ts=21-y_glass`; KiCad outward view uses
`x_native=100+x_ts,y_native=100-y_ts`. Mirroring a view never swaps copper layers.

The physical LEVEL span is exactly `y=0..50`. RL occupies `y=52..62`, beneath the
low endpoint. No owner normal-full datum is assumed. Calibration determines useful
operating thresholds within the physical span and validates fringe/meniscus effects
near either endpoint; this is not a guarantee of precise sensing at the glass edge.

The source copper-only footprint E1 has thirteen individually numbered primitives.
Numbers identify source/native correspondence, not thirteen independently measured
channels. Same-net pieces are connected during routing. It is excluded from the
purchase BOM and assembly pick-and-place.

| E1 pad | Stable primitive | Net | Layer | x bounds | y bounds |
| ---: | --- | --- | --- | --- | --- |
| 1 | sen_oop_level | SHLD2 | B.Cu | 1.80..8.15 | 0..50 |
| 2 | sen_level | CIN_LEVEL | B.Cu | 11.15..17.50 | 0..50 |
| 3 | sen_rl | CIN_RL | B.Cu | 20.50..26.85 | 52..62 |
| 4 | sen_oop_rl | SHLD2 | B.Cu | 29.85..36.20 | 52..62 |
| 5 | trace_rl_vertical | CIN_RL | B.Cu | 18.775..18.925 | 0..57.075 |
| 6 | trace_rl_horizontal | CIN_RL | B.Cu | 18.775..20.575 | 56.925..57.075 |
| 7 | shield2_level_back | SHLD2 | F.Cu | 0.80..9.15 | 0..62 |
| 8 | shield1_level_back | SHLD1 | F.Cu | 10.15..18.50 | 0..62 |
| 9 | shield1_ref_back | SHLD1 | F.Cu | 19.50..27.85 | 0..62 |
| 10 | shield2_ref_back | SHLD2 | F.Cu | 28.85..37.20 | 0..62 |
| 11 | shield1_rl_trace_vertical | SHLD1 | F.Cu | 18.65..19.05 | 0..57.2 |
| 12 | shield1_rl_trace_horizontal | SHLD1 | F.Cu | 18.65..20.70 | 56.8..57.2 |
| 13 | trace_oop_rl_vertical | SHLD2 | B.Cu | 32.95..33.10 | 0..52.075 |

The 6.35 mm face-lane width follows the TI reference; the 3.00 mm coplanar gap is
0.472 times that width, within TI's quarter-to-half-width guidance. The 8.35 mm
back lanes overhang face lanes by 1 mm. The long thin RL lead contributes to the
response and must be included in final calibration. Its rear shield is wider than
the lead. The remaining SHLD1/SHLD2 lanes are not ground pours. The thin OoP lead reaches
the head so its face-side RL partner needs no via against the glass.

### Routing contract

All E1 copper is soldermask-covered, with no paste openings. The exporter explicitly
removes the pinned converter's unwanted mask layers from E1 pads. No exposed pad,
via, component, mounting hole or unrelated copper belongs in the glass-contact
region `y=0..64`. Do not pour ground over either face there. Connect each U1 CIN
pin to its E1 head endpoint above the rim and provide its same-net driven shield
behind that route. Connect both rear SHLD1 lanes, rear SHLD2 lanes and face OoP
partners at the head. The disconnected same-net shield pieces remain ordinary
routing work, not an instruction to leave floating copper. Keep CIN3/CIN4 open.

The staged native board includes `SENSOR_WINDOW_NO_ROUTING`, a two-copper-layer
rule area covering native `(81,79)..(119,143)` mm. It prohibits vias and zone fills.
Tracks remain permitted for short connections entering electrode head endpoints;
this is not permission to route unrelated signals through the window. Place layer
changes above native `y=79` mm. The native augmentation checks that every source
pad, net, position and layer remains unchanged when the rule area is saved.

### Clip interface

Components face outward and occupy the head above `y=0`. The separate owner clip
may retain the 1.5 mm side rails (`x=0..1.5` and `36.5..38`) and contact the
mask-covered outward face below the head. Keep conductive hardware away from the
sensing/shield region. No spacer belongs between glass and sensing face.

Locate the PCB top edge 22 mm above the glass-edge seat. Include a printed stop
so the board cannot slide independently of the clip. Target +/-0.5 mm reseating
repeatability, tested during commissioning rather than claimed from printed CAD.
The finished PCB thickness tolerance and soldermask stack belong on the exported
mechanical interface. Connector J1 points upward away from the sensing span;
its source position is `(0,35)` in centred source coordinates, with pin 1 as
its native origin. Allow the mated housing, latch access and cable bend beyond
the head; no force from that cable should lift the sensor off the glass.

## Electrical capture

### Exact ICs and pin map

| Part | Pin connections |
| --- | --- |
| U1 FDC1004DGSR | 1 SHLD1, 2 CIN_LEVEL, 3 CIN_RL, 4/5 open, 6 SHLD2, 7 GND, 8 V3V3_SENSOR, 9 I2C_SDA, 10 I2C_SCL |
| U2 TPS7A2433DBVR | 1/3 V5_SENSOR, 2/4 GND, 5 V3V3_SENSOR |
| U3 ESDS312DBVR | 1/3 open, 2 GND, 4 SDA_CABLE, 5 SCL_CABLE |
| J1 43045-0600 | 1 V5_SENSOR, 2 SDA_CABLE, 3 SCL_CABLE, 4/5/6 GND |
| D2 STPS2L40U | cathode V5_SENSOR, anode V3V3_SENSOR |

TPS7A24's fixed-version pin 4 is internally unconnected and TI permits grounding
it. D2 provides the data-sheet reverse-current path during input collapse; it is
not another supply input. No LT3042 SET/ILIM/PGFB network or precision regulator
programming remains. One controller-side feed clamp serves the short connected
harness; there is no duplicate SMBJ on this sensor board and no hot-plug claim.

### Passives and power nets

| Refs | Value / exact part | Connection |
| --- | --- | --- |
| C1 | 10 uF C3216X7R1E106K160AB, 25 V, 1206 | V5_SENSOR to GND at U2 |
| C2 | same 10 uF | V3V3_SENSOR to GND at U2 |
| C3 | 100 nF C1608X7R1H104K080AA, 50 V, 0603 | closest bypass at U1.8/7 |
| C4 | 1 uF C2012X7R1E105K125AB, 25 V, 0805 | U1 local bulk bypass |
| R1/R2 | 22 ohm ERJ3EKF22R0V, 1%, 0603 | cable SDA/SCL to FDC segment |
| R3/R4 | 2.70 kohm ERJ3EKF2701V, 1%, 0603 | local I2C to V3V3_SENSOR |
| R5 | 10 kohm ERJ3EKF1002V, 1%, 0603 | input discharge |
| R6 | 3.01 kohm ERJ3EKF3011V, 1%, 0603 | output discharge and >=1 mA minimum load |

The local regulator's absolute/normal limits, rail discharge and two-board budget
are in [sensor power refinement](sensor-power-refinement.md). Budget **10 mA
normal input per board**, **20 mA for two**, inside the shared 30 mA allocation.
That is an allowance including protection leakage, not a measured consumption.

## Harness contract

Keep the existing six-position locking Micro-Fit 3.0 harness, max 203.2 mm complete
length per branch. Housing `43025-0600` and tin contact `43030-0007`,24 AWG;
wire pin-to-same-pin. Pairs are1/4 power/return,2/5 SDA/return,3/6 SCL/return.
The tank and future reservoir each need their own bus because the FDC1004 address
is fixed; shared power does not join their I2C data lines. See [harness](sensor-harness.md).

## Required checks

Source tests check named-pin electrical connectivity, exact parts and placements,
geometry transforms, mask/paste handling and FDC unused pins. Before routing,
inspect both copper faces and the native schematic and close native ERC/DRC except
ordinary unrouted nets. Native rules must prohibit unrelated copper in the sensing
window and preserve the source electrode shapes. Before fabrication, inspect every
CIN/shield connection and confirm no floating islands or shorts. Check converter
and shield capacitance limits with geometry estimates and conservative margins;
field extraction is useful if those estimates approach a limit, not an automatic
requirement to build a separate modeling project.

At 100 kHz,2.70 kohm nominal pullups permit about 437 pF under the 1 us rise-time
limit. Keep 100 kHz; measure the completed harness during commissioning. The simple
parallel-plate estimate for 6.35x50 mm over 1.60 mm FR-4 is about 7.4 pF, comfortably
below 115 pF input capacity but not a prediction of the liquid signal. Driven-shield
and fringing behavior differ from a passive parallel plate.

Final-unit commissioning covers rising/falling water, wet film/deposits, clip
pressure and reseating, nearby hands, cable movement and repeated CrystalSkim
switching. Preserve raw measurements and independently observed water positions.
TI measured 2 mm plastic with adhesive; this board uses 5 mm glass with a removable
clip. No sub-millimetre accuracy or no-cleaning performance is claimed.

## Primary sources

- [TI FDC1004 Rev C](https://www.ti.com/lit/ds/symlink/fdc1004.pdf): pin map, converter limits and DGS0010A land drawing4221984/A05/2015. Download SHA256 `79f6eb7e66c8064b465acf43a153b8ad9091dbd3fff46ab8787176a30529ae1e`.
- [TI TPS7A24 Rev E](https://www.ti.com/lit/ds/symlink/tps7a24.pdf): fixed pin map, regulation/dropout/capacitor conditions, reverse-current example and DBV0005A drawing4214839/K08/2024. SHA256 `5cfbb6f17e5be0a018664b90f0bca99f9ad84b7d06c072bffcd36e693ffd70d0`.
- [TI TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf): optional RE, OoP excitation and electrode/shield guidance; [TI layer plots](https://www.ti.com/lit/pdf/tidrcs2).
- [ST STPS2L40](https://www.st.com/resource/en/datasheet/stps2l40.pdf): shared audited SMB diode model.
- [TDK 10 uF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf): existing effective-capacitance basis.
- [TI I2C pullup calculation](https://www.ti.com/lit/an/slva689/slva689.pdf).
- [Molex43045-0600 drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf): mating orientation and pin/locator dimensions, also recorded in the shared connector model.
