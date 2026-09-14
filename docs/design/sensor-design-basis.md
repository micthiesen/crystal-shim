# FDC1004 sensor design basis

Status: slim source redesign, 2026-09-13. The source is
[pcb/sensor/design](../../pcb/sensor/design/README.md). Native ERC/DRC and handoff are
separate evidence; final-unit calibration follows the one fabrication cycle. No
prototype board, rim measurement prerequisite or planned respin is introduced.

## Selected design

One `FDC1004DGSR` uses TI's out-of-phase (OoP) arrangement with a common segmented LEVEL
and wet/liquid reference RL. The optional live environment reference RE is omitted. TI
TIDU736A sections 4.1, 4.3 and 5.1 explicitly permit omitting it. The owner specifies
water at least 10 mm below the rim; that gap is not used as a live dry-reference
channel. Omitting RE removes live compensation for dry-container/environment changes:
commissioning and periodic recalibration must establish whether stored dry baselines
remain adequate.

`CIN1` reads LEVEL and `CIN2` reads RL. `CIN3` and `CIN4` are open at the package, with
no trace, via, electrode or test pad. Each measurement selects open `CIN4` as its
negative input, so SHLD1 follows the selected positive input and SHLD2 follows CIN4 out
of phase. Never ground either shield. Differential mode disables CAPDAC; keep input
capacitance below 115 pF, measured difference within +/-15 pF and each shield load below
400 pF.

| Measurement | CHA | CHB | Configuration |
| --- | --- | --- | --- |
| MEAS1 | CIN1 | CIN4 | `0x0c00`, LEVEL |
| MEAS2 | CIN2 | CIN4 | `0x2c00`, RL |

Use 100 samples/s, single-trigger conversions, LEVEL followed by RL, read MSB before LSB
and enforce the existing monotonic completion timeout. No MEAS3 is needed. Firmware
[calibration](calibration.md) stores separate `level_empty_counts` and
`wet_reference_empty_counts`, then computes `q = (LEVEL - LEVELdry) / (RL - RLdry)`. Its
low/high calibration endpoints are measured, not inferred millimetres. Reject stale,
saturated, disconnected, implausible-slew or out-of-envelope readings, and
collapsed/wrong-sign wet response. There is no independently sensed dry-reference
condition.

## Mechanical and electrode target

![Accepted sensor appearance](sensor-visual-target.png)

The board is **18 × 64 mm, four layers, 1.60 mm nominal FR-4**. Adhere its
soldermask-covered B.Cu sensing face to the outside of the 5 mm glass using thin,
uniform adhesive transfer film. No clip, bracket, foam tape or intervening plate. The
board top is 2 mm below the rim, so the entire assembly stays below it. Adhesive
material and thickness must be recorded with final calibration. The illustration defines
appearance; the geometry below defines actual copper.

Looking through the glass, x=0..18 runs right and y=0..64 down from the PCB top. Source
coordinates are `x_ts=9-x_glass,y_ts=32-y_glass`; native outward view uses
`x_native=100+x_ts,y_native=100-y_ts`. Copper layers do not swap on mirroring. LEVEL
occupies board y=1..51, exactly 50 mm physically, or 3..53 mm below the rim. RL occupies
y=53..63, below LEVEL, or 55..65 mm below the rim. With water at least 10 mm below the
rim, the upper 7 mm of LEVEL is always dry; usable calibrated water travel is
correspondingly less than the physical span. RL must remain wet for an accepted level
reading. No endpoint accuracy or full 50 mm usable travel is claimed.

The glass face has ten paired horizontal bars. All left bars belong to CIN_LEVEL; all
right bars belong to SHLD2. They are **two common electrodes**, not twenty measurement
channels. Each bar is 6.35 mm wide and 4.55 mm high; adjacent bars have a 0.50 mm
horizontal slot. A 0.15 mm continuous spine connects each set. The opposing columns
occupy x=1.15..7.50 and x=10.50..16.85 with a 3.00 mm gap. RL and its SHLD2 partner use
the same column widths at the bottom. Its 0.15 mm lead rises in the central gap at
x=8.925..9.075 and connects at y=58.

This is a deliberately shallow-slotted adaptation of the prior OoP geometry: paired
slots preserve opposing symmetry and 91% of each continuous face area. It does not use
alternating fine-pitch excitation fingers whose electric field would be concentrated
close to the PCB instead of extending through 5 mm glass. Segmentation can add response
ripple; the 5 mm glass does not establish a proven smoothing or accuracy result.
Rising/falling calibration must verify monotonicity and threshold repeatability. Retain
the existing two-channel firmware and stored dry baselines; do not infer millimetres
from bar counts.

### Layers and routing

| Layer | Purpose |
| --- | --- |
| F.Cu | All components, pigtail solder lands and primary routing |
| In1.Cu | Electronics GND return and limited routing, above the driven shields |
| In2.Cu | Fixed SHLD1/SHLD2 copper directly behind the sensing face |
| B.Cu | Mask-covered E1 sensing bars, references and their leads only |

In2 SHLD1 covers x=0.65..8.00, SHLD2 x=10.00..17.35, both y=0.50..63.50. A 0.30 mm wide
SHLD1 finger covers the RL lead and joins the left shield at y=58. The source E1 has 32
copper primitives sharing the accepted thirteen numbered schematic terminals; numbering
exists for parity, not channel allocation. Pads have no soldermask or paste openings and
are excluded from BOM/CPL. The rear shield topology shares the same paired columns
between LEVEL and RL; it adapts TI's side-by-side reference layout to a stacked
reference. Symmetry and hand immunity are commissioning requirements, not inherited TI
test results.

Use the same producible JLC7628 four-layer construction as the controller: outer copper
35 µm, inner copper 15.2 µm, outer dielectrics 0.2104 mm and central dielectric 1.065
mm. The resulting physical copper/dielectric sum is 1.6062 mm, with 1.6 mm as the
nominal order thickness. Do not reduce B.Cu to In2 dielectric below 0.18 mm without
recalculating input loading. With conservative relative permittivity 4.5, 289 mm² LEVEL
copper over 0.18 mm gives about 64 pF of passive parallel-plate loading; a 74 mm²
RL-plus-lead area gives about 17 pF. These are screening estimates, not liquid response
predictions. They leave margin below the 115 pF input bound. The approximately 500 mm²
shield over a >=0.9 mm central dielectric contributes about 22 pF to In1 ground; even
adding the face loading keeps the estimated shield load below 100 pF versus the 400 pF
limit. Final native stackup and copper geometry must preserve these bounds. Differential
signal must still remain within ±15 pF; only final measured calibration establishes it.

The inner shield lets components sit behind the sensing span without consuming a
separate head band. Do not put ground on B.Cu or In2, merge the two shields, leave
shield islands floating, or use B.Cu as a general routing layer. Keep the CIN3/CIN4
package pins open. Route CIN connections first and keep their shielded breakouts short.
Necessary small tented vias belong in declared breakout areas, away from active bars; no
through-hole component tails may protrude into the tape. No blind/buried vias or
via-in-pad fabrication process is required by this target. Both netclasses default to
0.45 mm vias with 0.20 mm drills. Additional vias must fit the central shield gap and
pass native clearance checks; the six required breakout/ground vias are already placed.
Keep the accepted B.Cu breakout geometry recorded in `pcb/tools/routing-policy.json`.

### Left-exiting pigtail

J1 is six outward-facing 3 × 2 mm solder lands on 3 mm pitch at the left edge, replacing
the through-hole Micro-Fit header whose tails would prevent flush glass mounting.
Hand-solder the existing six-wire harness to these numbered lands and support the
insulated wires on the outward face before they turn left. The controller-side Micro-Fit
interface, wire pairing, pin mapping and complete 203.2 mm harness limit remain
unchanged. There is no sensor-side removable header, locator hole or extra connector
body. Do not pull on solder lands to remove the board from its adhesive. Record
practical adhesive retention and cable strain relief in final assembly evidence.

## Electrical capture

### Exact ICs and pin map

| Part | Pin connections |
| --- | --- |
| U1 FDC1004DGSR | 1 SHLD1, 2 CIN_LEVEL, 3 CIN_RL, 4/5 open, 6 SHLD2, 7 GND, 8 V3V3_SENSOR, 9 I2C_SDA, 10 I2C_SCL |
| U2 TPS7A2433DBVR | 1/3 V5_SENSOR, 2/4 GND, 5 V3V3_SENSOR |
| U3 ESDS312DBVR | 1/3 open, 2 GND, 4 SDA_CABLE, 5 SCL_CABLE |
| J1 PCB-SENSOR-PIGTAIL-6 solder lands | 1 V5_SENSOR, 2 SDA_CABLE, 3 SCL_CABLE, 4/5/6 GND |
| D2 STPS2L40U | cathode V5_SENSOR, anode V3V3_SENSOR |

TPS7A24's fixed-version pin 4 is internally unconnected and TI permits grounding it. D2
provides the data-sheet reverse-current path during input collapse; it is not another
supply input. No LT3042 SET/ILIM/PGFB network or precision regulator programming
remains. One controller-side feed clamp serves the short connected harness; there is no
duplicate SMBJ on this sensor board and no hot-plug claim.

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

The local regulator's absolute/normal limits, rail discharge and two-board budget are in
[sensor power refinement](sensor-power-refinement.md). Budget **10 mA normal input per
board**, **20 mA for two**, inside the shared 30 mA allocation. That is an allowance
including protection leakage, not a measured consumption.

## Harness contract

Keep the controller-side six-position locking Micro-Fit 3.0 harness, max 203.2 mm
complete length per branch, ending in sensor solder lands. Housing `43025-0600` and tin
contact `43030-0007`, 24 AWG; wire pin-to-same-number land. Pairs are 1/4 power/return,
2/5 SDA/return, 3/6 SCL/return. The tank and future reservoir each need their own bus
because the FDC1004 address is fixed; shared power does not join their I2C data lines.
See [harness](sensor-harness.md).

## Required checks

Source tests check named-pin electrical connectivity, exact parts and placements,
geometry transforms, mask/paste handling and FDC unused pins. Before routing, inspect
both copper faces and the native schematic and close native ERC/DRC except ordinary
unrouted nets. Native rules must prohibit unrelated copper in the sensing window and
preserve the source electrode shapes. Before fabrication, inspect every CIN/shield
connection and confirm no floating islands or shorts. Check converter and shield
capacitance limits with geometry estimates and conservative margins; field extraction is
useful if those estimates approach a limit, not an automatic requirement to build a
separate modeling project.

At 100 kHz, 2.70 kohm nominal pullups permit about 437 pF under the 1 us rise-time
limit. Keep 100 kHz; measure the completed harness during commissioning. The
layer-loading estimates above screen converter and shield limits; they do not predict
the liquid signal. Driven-shield and fringing behavior differ from a passive parallel
plate.

Final-unit commissioning covers rising/falling water, wet film/deposits, adhesive
thickness, bubbles, retention and remounting, nearby hands, cable movement and repeated
CrystalSkim switching. Preserve raw measurements and independently observed water
positions. TI measured 2 mm plastic with adhesive; this board uses 5 mm glass with an
adhesive film. No sub-millimetre accuracy or no-cleaning performance is claimed.

## Primary sources

- [TI FDC1004 Rev C](https://www.ti.com/lit/ds/symlink/fdc1004.pdf): pin map, converter limits and DGS0010A land drawing 4221984/A 05/2015. Download SHA256 `79f6eb7e66c8064b465acf43a153b8ad9091dbd3fff46ab8787176a30529ae1e`.
- [TI TPS7A24 Rev E](https://www.ti.com/lit/ds/symlink/tps7a24.pdf): fixed pin map, regulation/dropout/capacitor conditions, reverse-current example and DBV0005A drawing 4214839/K 08/2024. SHA256 `5cfbb6f17e5be0a018664b90f0bca99f9ad84b7d06c072bffcd36e693ffd70d0`.
- [TI TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf): optional RE, OoP excitation and electrode/shield guidance; [TI layer plots](https://www.ti.com/lit/pdf/tidrcs2).
- [ST STPS2L40](https://www.st.com/resource/en/datasheet/stps2l40.pdf): shared audited SMB diode model.
- [TDK 10 uF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf): existing effective-capacitance basis.
- [TI I2C pullup calculation](https://www.ti.com/lit/an/slva689/slva689.pdf).
- [Molex 43045-0600 drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf): mating orientation and pin/locator dimensions, also recorded in the shared connector model.


## Stencil process

Use a 100 µm stencil with the native F.Paste apertures. All 42 assembled SMT
apertures have zero effective paste margin. The limiting aperture is U1 pads
1 through 10: a 1.45 × 0.30 mm rounded rectangle with 0.05 mm corner radius.
Its area is 0.432854 mm² and perimeter is 3.414159 mm, giving
`A / (perimeter × thickness) = 1.26782`, above the 0.66 design criterion.
E1 and the hand-soldered J1 pigtail lands have no paste apertures. This is a
geometry-based process selection; printing and assembly remain unmeasured.
The saved calculation is in `pcb/sensor/design/evidence/stencil-process/apertures.json`.
