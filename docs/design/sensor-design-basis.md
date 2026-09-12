# FDC1004 sensor design basis

Status: design basis for the final-use sensor board, 2026-09-11. This proposes
topology and geometry for tscircuit capture, subject to integration review and
the owner's normal-full water datum. It is not commissioning
evidence. The board is calibrated and accepted after the one fabrication cycle;
there is no separate sensor prototype, evaluation-board gate or planned respin.

## Selected design

Use one `FDC1004DGSR` on the glass-mounted board with TI's differential
out-of-phase (OoP) electrode arrangement. The three sensed electrodes are:

- `CIN1`: the continuous level electrode;
- `CIN2`: the reference-liquid electrode (`RL`), fully below the lowest valid
  water surface; and
- `CIN3`: the reference-environment electrode (`RE`), fully above the highest
  valid water surface.

`CIN4` has no electrode, trace, via or test point. It remains electrically open,
but firmware selects it as the negative input for all three differential
measurements. `SHLD1` follows each selected positive input and `SHLD2` follows
`CIN4`, 180 degrees out of phase. The paired `SHLD1` and `SHLD2` copper geometry
is what makes this TI OoP topology; a conventional level electrode beside a
ground strip or a single driven back shield is a different topology.

Configure the FDC1004 as follows. Differential mode disables CAPDAC, so the
layout and final calibration must keep each input capacitance below 115 pF and
the magnitude of each measured difference below 15 pF.

| Measurement | CHA | CHB | Result | CAPDAC |
| --- | --- | --- | --- | --- |
| `MEAS1` | `CIN1` | `CIN4` | `C_LEVEL` | disabled |
| `MEAS2` | `CIN2` | `CIN4` | `C_RL` | disabled |
| `MEAS3` | `CIN3` | `CIN4` | `C_RE` | disabled |

This matches TIDU736A section 4.3, Figures 6 and 7, and the explicit GUI
configuration in section 5.2. TI assigns `CIN1 = LEVEL`, `CIN2 = RL`,
`CIN3 = RE`, and leaves `CIN4` floating.

Use deterministic single-trigger conversions at 100 samples/s, the FDC1004's
lowest and highest-resolution rate, in the order `MEAS1`, `MEAS2`, `MEAS3`.
Set `REPEAT = 0`, enable only the selected `MEAS_x`,
wait for its `DONE_x` bit with a monotonic timeout, read its MSB register before
its LSB register, then trigger the next measurement. Repeat mode is not needed
to preserve OoP operation: during each differential conversion SHLD1 follows
that measurement's CHA and SHLD2 follows CHB (`CIN4`), while the unselected CIN
electrodes float. TIDU736A section 4.3 explicitly describes sequential channel
sampling with the shared shield geometry still connected. A timeout, malformed
result or incomplete three-reading set invalidates the sample set.

The earlier names "wet reference" and "dry reference" are useful installation
conditions, but TI's functions are more precise: RL supplies the liquid-dependent
unit response and RE tracks the dry container/environment baseline. The level
equation uses `C_RL - C_RE` as its reference span. RL and RE must therefore have
the same copper dimensions, wall stack, coating and mounting pressure.

## Reference validity is a plausibility test

Keeping `C_RL` and `C_RE` as separate raw readings makes several faults
observable: a collapsed reference span, a value outside its calibrated envelope,
converter saturation, an open or shorted electrode, and a large common shift can
all invalidate the sample. It does not prove, for every physical failure, that RL
is wet and RE is dry. A film on RE, an air gap over RL, a shifted board, or a
particular environmental change can resemble a valid capacitance.

Firmware must reject a sample unless all of these calibrated conditions hold:

- all three conversions completed and are fresh;
- no channel is saturated and all raw values lie inside commissioned absolute
  envelopes;
- `C_RL - C_RE` has the commissioned sign and exceeds a commissioned minimum
  magnitude;
- the three values and the normalized result have plausible slew rates.

Any failed validity check immediately supplies invalid input to the controller.
Debounce applies to valid low-water transitions and fault recovery, never to
continued operation with an invalid sample.

The envelopes and minimum reference span come from the final mounted board.
Until then, `reference_valid` means "consistent with calibration," not an
independent observation of water on both reference bands. The requirement covers
detectable departures from those envelopes. It cannot guarantee detection of all
physically different conditions that produce the same readings.

## Geometry for capture review

### TI geometry used as the basis

TIDA-00317 uses four layers in its rigid section and two copper layers in its
flex sensor section. Its sensor region is 4200 mil by 1800 mil (106.68 mm by
45.72 mm); see TIDU736A Figure 22 and the TI assembly and PCB-layout files.
Inspection of the published vector layer plot shows about
250 mil (6.35 mm) sensing-electrode width, approximately 10 mm reference pads,
and wider shield copper behind the sensed copper. TIDU736A section 4.4 separately
requires the coplanar sensor-to-shield gap to be one quarter to one half of the
electrode width. The Crystal Shim geometry retains the 6.35 mm width, uses a
3.00 mm gap (0.472 times the width), and shortens the level axis to the required
50 mm.

TI tested its board on a 2 mm plastic container with adhesive and no intentional
air gap. Crystal Shim uses 5 mm aquarium glass and a removable gravity/friction
clip. TI's measured resolution and immunity therefore do not transfer as a
guarantee.

### Coordinate system and board envelope

All dimensions below are nominal millimetres. View the PCB from the glass side.
`x = 0` is the left board edge. `y = 0` is the top-of-rim datum and positive `y`
points down the aquarium wall. The PCB remains flat and outside the aquarium; its
top portion projects upward in the same plane and does not fold over the rim.

Use one explicit transform for every point and layer. Relative to the same
top-left board outline, a front-side view has `x_front = 38 - x_glass` and
`y_front = y_glass + 22`. For a centered tscircuit board with +y upward, use
`x_ts = 19 - x_glass`, `y_ts = 21 - y_glass`. KiCad front-view coordinates are
`x_kicad = X0 + x_front`, `y_kicad = Y0 + y_front`, where X0/Y0 are the recorded
board-origin translation. B.Cu remains B.Cu; mirroring a view does not swap layers.
Render both glass and outward views with the rim datum and pin-1 marks before
accepting capture. Transform trace endpoints, arcs, text anchors and footprints
consistently; never mirror only the electrode rectangles.

| Parameter | Proposed value | Reason |
| --- | ---: | --- |
| Board outline | 38.00 wide by 86.00 high | Four OoP lanes plus a 22 mm electronics head and 2 mm bottom margin |
| Board bounds | `x = 0..38`, `y = -22..64` | Keeps physical and rim datums distinct |
| Stack | 2-layer, 1.60 mm nominal FR-4 | TI says standard PCB thickness is acceptable; common rigid final-use construction |
| Glass-facing layer | `B.Cu`; soldermask-covered; no silkscreen, exposed pads, vias or components for `y = 0..64` | Flat, insulated contact surface |
| Outward layer | `F.Cu`; all components within `y = -20..-2` | Keeps electronics away from the sensing span |
| Physical level span | `y = 0..50` | Exactly 50 mm down from the rim |
| Valid water-surface range | `y = 11..50` | Leaves the 10 mm RE band dry with 1 mm vertical margin |
| Reference height | 10.00 | Close adaptation of TI's approximately 10 mm reference pads |
| RL position | `y = 52..62` | Fully submerged with 2 mm margin at the lowest valid surface |
| Side retention rails | `x = 0..1.5` and `36.5..38`, `y = 0..64` | Clip may capture edges without entering active copper lanes |

This proposal does **not yet establish 50 mm of valid water travel**. The
uppermost 11 mm is excluded from a *valid calibrated water surface* because a
glass-backed RE cannot be both above a surface flush with the rim and remain on
an outside-only PCB. A water surface at `y < 11` must be reported as invalid,
not as a trusted high level. Commissioning must confirm that the aquarium's
intended high surface is at least 11 mm below the rim. If it is not, this
three-electrode geometry cannot satisfy the stated reference condition without changing the
mechanical envelope or omitting RE and using a stored dry baseline.
The owner has not accepted that exclusion. Geometry remains open until the
normal-full water datum and its usable high-to-low range are reconciled.

### Copper primitives

These rectangles are source-owned geometry for later tscircuit capture. The
1.80 mm side margin and four 6.35 mm lanes with 3.00 mm gaps exactly fill the
38.00 mm width. All glass-facing sensing copper remains covered by soldermask.

| Stable ID | Net | Layer | `x0..x1` | `y0..y1` | Function |
| --- | --- | --- | --- | --- | --- |
| `sen_oop_level` | `SHLD2` | `B.Cu` | `1.80..8.15` | `0..50` | OoP partner beside LEVEL |
| `sen_level` | `CIN_LEVEL` | `B.Cu` | `11.15..17.50` | `0..50` | Continuous 50 mm level electrode |
| `sen_re` | `CIN_RE` | `B.Cu` | `20.50..26.85` | `0..10` | Dry/environment reference |
| `sen_rl` | `CIN_RL` | `B.Cu` | `20.50..26.85` | `52..62` | Wet/liquid reference |
| `sen_oop_re` | `SHLD2` | `B.Cu` | `29.85..36.20` | `0..10` | OoP partner beside RE |
| `sen_oop_rl` | `SHLD2` | `B.Cu` | `29.85..36.20` | `52..62` | OoP partner beside RL |
| `trace_rl` | `CIN_RL` | `B.Cu` | 0.15 wide, centreline `(18.85,-2)` to `(18.85,57)` to `(20.50,57)` | n/a | Shielded lead into RL's left edge |
| `trace_oop_ref` | `SHLD2` | `B.Cu` | 0.15 wide, centreline `(33.025,10)` to `(33.025,52)` | n/a | Joins the two reference-partner pads |
| `shield2_level_back` | `SHLD2` | `F.Cu` | `0.80..9.15` | `0..62` | Back shield behind LEVEL partner |
| `shield1_level_back` | `SHLD1` | `F.Cu` | `10.15..18.50` | `0..62` | Back shield behind LEVEL |
| `shield1_ref_back` | `SHLD1` | `F.Cu` | `19.50..27.85` | `0..62` | Back shield behind RL/RE lane |
| `shield2_ref_back` | `SHLD2` | `F.Cu` | `28.85..37.20` | `0..62` | Back shield behind reference partners |
| `shield1_rl_trace` | `SHLD1` | `F.Cu` | 0.40 wide, centreline `(18.85,-2)` to `(18.85,57)` to `(20.50,57)` | n/a | Directly behind `trace_rl` |

The two face-side SHLD2 reference pads and their thin connecting trace follow
the actual TI TIDRCS2 first-page copper plot. Section 4.3's equal-height rule
applies to the rear shield lanes, which are full-height on both measurement
sections here. Do not replace the two face pads with a continuous electrode
based only on Figure 7's side view; that would change the published geometry.

The 8.35 mm back-shield lanes overhang each 6.35 mm face lane by 1.00 mm on
both sides, following the wider shield copper visible in the TI layout. The four
back lanes have 1.00 mm gaps. Join same-net face shapes with narrow copper outside
the measurement-facing rectangles. Route each CIN trace from the electronics
head without crossing another CIN or shield electrode; put the corresponding
shield directly behind the route, as required by TIDU736A section 8.4. Preserve
the stated rectangles even if the connecting traces need small local neck-downs.

The long `CIN_RL` lead is part of the sensor and can have a level-dependent
response. Small copper area does not bound that fringing contribution. TI routes
reference leads through its sensing length and requires a directly underlying
shield. Include this lead in field extraction and calibration; widening or moving
it is a material geometry change. Equal RL/RE pad dimensions alone do not make
their complete responses matched. Model each lead with its pad and verify the
reference denominator across the entire range during commissioning. The short LEVEL and RE leads enter their
electrodes directly from `y < 0` and must also have same-width-or-wider shield
traces immediately behind them.

Capture must supply these named connections in addition to the rectangles. The
electronics-head placement determines exact bends and via coordinates; record
those in the source placement and reviewed KiCad routes, not an implicit drawing
convention. All layer transitions occur above `y = 0` so the glass-contact face
stays flat. Each trace must overlap its destination copper electrically.

| Stable route ID | Source endpoint | Required destination / branch |
| --- | --- | --- |
| `route_level` | `U1.2` | `sen_level` top edge at `(14.325,0)` |
| `route_re` | `U1.4` | `sen_re` top edge at `(23.675,0)` |
| `route_rl` | `U1.3` | `trace_rl` head endpoint `(18.85,-2)`, then `sen_rl` |
| `route_shield1` | `U1.1` | Both `shield1_*_back` lanes and `shield1_rl_trace` |
| `route_shield2` | `U1.6` | Both `shield2_*_back` lanes, `sen_oop_level`, and connected `sen_oop_re` / `sen_oop_rl` |

Source and handoff checks must enumerate every primitive above and prove a
same-net conductive path from its U1 pin, including via pads and trace/shape
overlap. They must reject a floating shield island, a CIN-to-shield short, a
crossing through another electrode, or copper on CIN4 beyond its package pad.
Check corresponding shield coverage beneath each CIN head trace in both views.
These checks remain to be implemented with the real board source; ERC alone
cannot verify an unmodeled copper island or its shielding geometry.

Do not add copper pours, ground, mounting holes or test pads in `x = 0..38`,
`y = 0..64`. In particular, do not put ground beside the face electrodes: SHLD2
replaces ground in the OoP field geometry. `SHLD1` and `SHLD2` are driven AC nets
and must not be joined to ground.

### Clip interface

The owner-supplied clip may contact the two 1.5 mm side rails over `y = 0..64`
and the component-free outward face below `y = 0`. It must not place a spacer
between the sensing face and glass, cover the electronics head, or load the
Micro-Fit cable. The board thickness presented to the clip is 1.60 mm nominal;
the fabricator's finished-thickness tolerance must be carried into the interface
drawing. The connector/component height envelope is confined to the 22 mm head
above the rim and must be taken from the placed parts before the clip CAD is
released. No mounting-hole pattern is required.

The clip must include a positive vertical datum: a seat on the top glass edge
and a stop locating the PCB's top edge 22 mm above that seat. Gravity/friction
alone must not leave the PCB free to slide vertically relative to the clip.
Allocate at most +/-0.5 mm of vertical placement variation after assembly and
reseating, including PCB outline tolerance, printed stop error and glass-edge
seating. This is an interface requirement for the owner's separate CAD.
The proposed 1 mm dry and 2 mm wet guard bands are not yet validated margins:
they must include this placement envelope plus water ripple, meniscus and the
5 mm glass field extent. Keep them open until the owner datum and field analysis
support them; commissioning then tests receding film and actual repeatability.

Any conformal coating, protective film, soldermask change or clip pressure pad
inside the sensing window changes the dielectric stack. It must be present for
calibration and removal/reseat testing.

## Electrical capture

### Exact ICs and pin map

| Ref | Exact part | Package / footprint basis | Pin | Net | Capture rule |
| --- | --- | --- | ---: | --- | --- |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 1 | `SHLD1` | Driven shield only |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 2 | `CIN_LEVEL` | LEVEL electrode |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 3 | `CIN_RL` | Liquid reference |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 4 | `CIN_RE` | Environment reference |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 5 | `NC_CIN4` | Open; no physical copper beyond pad |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 6 | `SHLD2` | Driven OoP shield only |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 7 | `GND` | Required device ground |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 8 | `3V3_SENSOR` | Local decoupling at pin |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 9 | `I2C_SCL` | Open-drain bus, local pull-up |
| `U1` | TI `FDC1004DGSR` | DGS, VSSOP-10, 0.50 mm pitch | 10 | `I2C_SDA` | Open-drain bus, local pull-up |
| `U2` | ADI `LT3042IMSE#PBF` | MSE, MSOP-10 with exposed pad, 0.50 mm pitch | 1 | `V5_SENSOR` | IN; local input bypass |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 2 | `V5_SENSOR` | IN; join pin 1 |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 3 | `V5_SENSOR` | EN/UV tied directly to IN |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 4 | `NC_PG` | PG unused; leave open |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 5 | `LDO_ILIM` | Current-limit resistor to GND |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 6 | `LDO_PGFB` | 1N4148W-7-F from IN, anode IN/cathode PGFB; fast startup disabled with reverse-input protection |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 7 | `LDO_SET` | Setting resistor and bypass capacitor to GND |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 8 | `GND` | Join exposed pad directly |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 9 | `3V3_SENSOR` | OUTS; Kelvin route to positive pad of `c_ldo_out` |
| `U2` | ADI `LT3042IMSE#PBF` | MSE | 10 | `3V3_SENSOR` | OUT; local output bypass |
| `U2` | ADI `LT3042IMSE#PBF` | MSE exposed pad | 11 | `GND` | Solder to PCB ground; electrical and thermal connection |

`FDC1004DGSR` is the active large-reel VSSOP orderable. `FDC1004DGST` is listed
obsolete in TI's package addendum and must not be substituted. The VSSOP has no
exposed DAP.

`LT3042IMSE#PBF` replaces the earlier TPS7A20 candidate so the sensor regulator's
input rating covers the isolated module's 6.75 V fault envelope. Its electrical
characteristics cover 2 V to 20 V input, and its input absolute maximum is
plus or minus 22 V. The I grade guarantees the specified temperature limits
over -40 to 125 degrees C, covering cold startup and the 0 to 50 degrees C
design environment. This is a component-rating margin; it does not prove the
complete rail's response to a fast overvoltage step.

PGFB does not share the IN/EN reverse-input rating: its absolute minimum is
-0.3 V. ADI Rev C pages 12 and 22 require a diode from IN to PGFB, anode at IN,
when disabling fast startup while retaining reverse-input protection. The earlier
direct tie is withdrawn. The selected Diodes Incorporated `1N4148W-7-F` uses pad 1
cathode on `LDO_PGFB`, pad 2 anode on `V5_SENSOR`; see its checked ratings and
lands in the [power refinement](sensor-power-refinement.md). Do not capture PGFB
directly on `V5_SENSOR`.

Use MSE drawing `05-08-1664 Rev I`: 3.00 x 3.00 mm body, 4.90 mm nominal lead
span, 1.10 mm maximum height and 1.68 x 1.88 mm exposed pad. The candidate
KiCad mapping is `Package_SO:MSOP-10-1EP_3x3mm_P0.5mm_EP1.68x1.88mm`.
The exposed pad must be soldered, including for hand-assisted assembly. Exact
lands, stencil apertures and any thermal vias remain part of the
[footprint audit](footprint-audit.md) and capture review.

### Passives and power nets

| Stable ID | Value / class | From | To | Placement |
| --- | --- | --- | --- | --- |
| `c_ldo_in` | TDK `C3216X7R1E106K160AB`, 10 uF, 10%, X7R, 25 V, 1206 | `V5_SENSOR` | `GND` | At `U2.1/U2.2` and `U2.8` |
| `r_input_bleed` | Panasonic `ERA3AEB103V`, 10 kohm, 0.1%, 0603 | `V5_SENSOR` | `GND` | Local input discharge when cable unplugged |
| `d_pgfb` | Diodes `1N4148W-7-F`, SOD-123 | Anode pad 2 `V5_SENSOR` | Cathode pad 1 `LDO_PGFB` | Close to U2 pin 6; separate from TVS return |
| `c_ldo_out` | TDK `C3216X7R1E106K160AB`, 10 uF, 10%, X7R, 25 V, 1206 | `3V3_SENSOR` | `GND` | At `U2.10/U2.8`; separate Kelvin route from `U2.9` |
| `r_ldo_set` | Panasonic `ERA3AEB333V`, 33.0 kohm, 0.1%, 25 ppm/K, 0603 | `LDO_SET` | `GND` | Kelvin ground return to the load |
| `c_ldo_set` | TDK `C2012X7R1E474K125AA`, 0.47 uF, 10%, X7R, 25 V, 0805 | `LDO_SET` | `GND` | Ground directly at `c_ldo_out` ground |
| `r_ldo_ilim` | Panasonic `ERA3AEB2491V`, 2.49 kohm, 0.1%, 25 ppm/K, 0603 | `LDO_ILIM` | `GND` | Kelvin return directly to `U2.8` |
| `c_fdc_hf` | TDK `C1608X7R1H104K080AA`, 0.10 uF, 10%, X7R, 50 V, 0603 | `3V3_SENSOR` | `GND` | Closest capacitor to `U1.8/U1.7` |
| `c_fdc_bulk` | TDK `C2012X7R1E105K125AB`, 1.0 uF, 10%, X7R, 25 V, 0805 | `3V3_SENSOR` | `GND` | Beside `c_fdc_hf`, after it |
| `r_sda_pullup` | Panasonic `ERA3AEB272V`, 2.70 kohm, 0.1%, 0603 | `I2C_SDA` | `3V3_SENSOR` | Sensor board only, FDC side of series resistor |
| `r_scl_pullup` | Panasonic `ERA3AEB272V`, 2.70 kohm, 0.1%, 0603 | `I2C_SCL` | `3V3_SENSOR` | Sensor board only, FDC side of series resistor |
| `r_sda_series` | Panasonic `ERJ3EKF22R0V`, 22 ohm, 1%, 0603 | `SDA_CABLE` | `I2C_SDA` | After connector-side ESDS312 tap |
| `r_scl_series` | Panasonic `ERJ3EKF22R0V`, 22 ohm, 1%, 0603 | `SCL_CABLE` | `I2C_SCL` | After connector-side ESDS312 tap |
| `r_sensor_discharge` | Panasonic `ERA3AEB3011V`, 3.01 kohm, 0.1%, 0603 | `3V3_SENSOR` | `GND` | Discharges local rail and maintains at least 1 mA load |

The 2.49 kohm current-limit resistor supersedes the earlier 2.50 kohm proposal.
Keep the input and output bypass ground pads close. Guard `LDO_SET` with
`3V3_SENSOR` copper and clean flux residue; 100 nA of unwanted SET current
changes the output by about 3.31 mV. Do not treat `c_ldo_out` as a replacement
for the two bypass capacitors at `U1`.
The FDC bypasses and pullups reuse the exact controller-selected families and
checked lands from the [small-parts inventory](controller-small-parts.md).
The [exact 3.01 kohm part](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB3011V)
is 0.1 W and 25 ppm/K. Existing 1% resistance calculations remain conservative.
The bulk bypass is now the same 0805 part used on the controller, replacing its
earlier package-only 0603 proposal without changing the 1 uF allocation.
Fit the local ESDS312DBVR on `SDA_CABLE`/`SCL_CABLE` and SMBJ7.0A on `V5_SENSOR`
as specified in the [cable protection design](sensor-cable-protection.md).

### Voltage, capacitance and recovery margins

The nominal output is `100 uA * 33.0 kohm = 3.300 V`. Using the full-temperature
98 to 102 uA SET-current limits and +/-2 mV output offset gives
`3.228766..3.371366 V` with the resistor's initial 0.1% tolerance. Allowing
another +/-0.25% for resistor temperature drift, conservatively covering a
100-degree displacement from its reference temperature, gives
`3.220681..3.379781 V`. Including a +/-100 nA SET-leakage allocation expands the
design envelope to `3.217..3.384 V`. The 3.01 kohm bleeder draws at least
`3.217 / (3010 * 1.01) = 1.058 mA`, satisfying the 1 mA minimum load used for
the accuracy specifications even when the converter is idle.

ADI specifies at most 300 mV dropout at 1 mA and 50 mA across temperature.
Using that bound for this board's smaller load leaves
`3.7986 - 3.384 - 0.300 = 0.1146 V` additional headroom at minimum sensor input.
The [power refinement](sensor-power-refinement.md) derives this input floor from
the service supply, both harnesses, source OR, power switch and 6.8 ohm resistor.
This includes static regulation corners; final-board startup and transient
measurements remain required. With 0.47 uF SET capacitance the data sheet gives
1.9 uV RMS typical output noise over 10 Hz to 100 kHz. Noise and PSRR are
layout-dependent characteristics, not guaranteed final-sensor performance.

The LDO requires at least 4.7 uF effective output capacitance, ESR below 50 mohm
and ESL below 2 nH. Use 4.7 uF as the input effective-capacitance floor as well.
TDK's exact 10 uF part has a published model of 1.5 mohm and 0.75 nH before PCB
interconnect. Its visually inspected bias curve shows approximately 5% loss
near 3.384 V, 14% near 5.363 V and 22% near 6.75 V. The adopted calculation is
`Ceff = 10 uF * 0.90 initial tolerance * 0.85 temperature * bias factor *
0.85 aging`:

| Location / maximum voltage | Allocated bias loss | Calculated effective capacitance |
| --- | ---: | ---: |
| `c_ldo_out`, 3.384 V | 10% | 5.852 uF |
| `c_ldo_in`, 5.363 V normal | 20% | 5.202 uF |
| `c_ldo_in`, 6.75 V module fault | 25% | 4.877 uF |

Bias curves are manufacturer characterization, not production guarantees.
The 15% aging allowance is a design allocation, not a part-specific lifetime
guarantee. The complete `V5_SENSOR`/`V5_SENSOR_SW` input network now has a
30 uF maximum budget; `3V3_SENSOR` retains 20 uF. Positive initial/temperature
tolerances give `10 * 1.10 * 1.15 = 12.65 uF` for the local input capacitor.
Together with the controller's 11 uF nominal, input capacitance is at most
26.565 uF before the cable/TVS reserve. Output capacitance is
`(10 + 1 + 0.1) * 1.10 * 1.15 = 14.0415 uF`. Even reserving the SET capacitor's
maximum 0.59455 uF against the output budget keeps it below 14.64 uF. Count all
later additions against the corresponding complete rail budget.

Leave fast startup disabled through the protected IN-to-PGFB diode connection. With the
largest setting resistor and capacitor, the natural SET time constant is
`33000 * 1.0035 * 0.47 uF * 1.10 * 1.15 = 19.689 ms`; 99.9% settling takes
`ln(1000) * 19.689 = 136.006 ms`. Firmware therefore waits **200 ms** after
enabling sensor power before enabling the bus and initializing the FDC1004.
This allowance includes the short input-capacitor charge interval and must be
confirmed with the final current-limited feed and assembled sensor.

Preserve the **2 s off interval** with the bus buffer disabled and both bus
lines released. The controller's 10 kohm bleeder is on `V5_SENSOR_SW`, and the
daughterboard has its own 10 kohm on `V5_SENSOR`. Conservatively using only one
bleeder with a 1% resistance envelope and the series resistor discharges the
30 uF budget from 6.75 V to 0.3 V in
`30 uF * (10100 + 6.885) * ln(6.75 / 0.3) = 0.944039 s`.
Subsequently discharging another
20 uF on `3V3_SENSOR` from 3.384 V to 0.3 V through the 3.01 kohm, 1% bleeder
takes at most 0.147326 s. This deliberately sequential bound is 1.091365 s,
leaving more than 0.90 s inside the off interval. Each unplugged board also
retains a local discharge path. SET discharges through its
33 kohm resistor with at most the 19.689 ms time constant. This calculation
requires the documented bus isolation and excludes an external backfeed fault;
measure both rails during final-board recovery.

The exact 1206 capacitor body is 3.20 +/-0.20 by 1.60 +/-0.20 mm, with
1.60 +/-0.20 mm height. Its candidate `Capacitor_SMD:C_1206_3216Metric`
footprint uses IPC lands rather than an exact copy of TDK's reflow land
recommendation. Preserve the manufacturer's PA/PB/PC dimensions in the
footprint audit and resolve the land/stencil choice during capture review.

The sensor board owns the only I2C pull-ups on the cable segment. Tying them to
`3V3_SENSOR` prevents an unpowered sensor from being fed through controller-side
pull-ups. The [controller](controller-design-basis.md) adds a TCA9517A buffer with
a separate local pull-up pair on the ESP segment; this prevents sensor rail
charge from feeding an unpowered ESP during startup or shutdown. When sensor
power is absent, controller firmware releases both open-drain lines and treats
the missing address as a sensor fault. Its cable-side 22 ohm series resistors
and ESD network add no pull-up to that segment.

At the 3.384 V rail ceiling and minimum pull-up resistance, the 2.70 kohm,
1% pull-up asks a device at the specified low level to sink
`(3.384 - 0.4) / 2673 = 1.117 mA`, below the FDC1004's 3 mA `VOL` test condition.
TI application report SLVA689 gives `tr = 0.8473 Rp Cb`; 2.70 kohm meets the
1 us Standard-mode rise time through about 437 pF. Use 100 kHz initially. Do not
raise the bus to 400 kHz without measuring total harness, connector, ESD and pin
capacitance; at the 300 ns Fast-mode limit the same pull-up permits only about
131 pF.

The converter's maximum conversion current is 0.95 mA. Budget both I2C lines
at zero volts and use minimum resistor values: the converter, pull-ups and
bleeder draw at most
`0.95 + 2 * 3.384 / 2673 * 1000 + 3.384 / 2979.9 * 1000 = 4.618 mA`.
Reserve 7.3 mA for the LT3042, including its 7 mA worst-case GND-pin current
at the higher 50 mA load and its SET/ILIM overhead. The resulting daughterboard
allocation is below 11.92 mA before input bleeders, protection leakage and capacitor
charging. Two input bleeders plus the TVS hot-leakage and signal-ESD allocations
bring the total below 15.007 mA normally. The broader 30 mA branch allocation now
permits at most **19.61 mA** of total 3.3 V loads after all overhead, including
the output bleeder and pull-ups. The TVS hot-leakage allowance still needs measurement.

`ILIM = 125 mA*kohm / 2.49 kohm = 50.2008 mA` nominal. Scaling ADI's
45 to 55 mA limits at 2.50 kohm by the selected resistor gives
`45.136..55.276 mA` with initial resistor tolerance, or
`45.023..55.415 mA` including the conservative +/-0.25% drift allocation.
The controller's TPS2553 feed limits at 50 to 100 mA and still protects the
cable; either limiter may act first on an output fault. These fault currents
are not part of the 30 mA normal-load allocation. At the maximum allocated
19.61 mA output load and 6.75 V input, regulator dissipation is bounded for
design by `(6.75 - 3.217) * 0.01961 + 6.75 * 0.0073 < 0.119 W`.
The data-sheet 33 degrees C/W MSE thermal metric predicts less than 3.93 degrees C
rise; it is not a substitute for the final copper layout and temperature check.

## Harness contract

Use the same numbered, tin-plated Molex Micro-Fit 3.0 interface at both boards.
The board header is `43045-0600`, a right-angle through-hole header specified
for a 1.60 mm PCB. The cable housing at each end is `43025-0600`, and
loose-piece tin female contact `43030-0007` accepts 20, 22 or 24 AWG. Use 24 AWG
conductors and keep the finished cable, including service routing and strain
relief, at or below 203.2 mm (8 inches). Place the header no more than 10.16 mm
from the PCB edge as dimensioned in the Molex sales drawing, with its cable axis
pointing away from the sensing span.

| Header pin | Net | Twisted pair | Matching return |
| ---: | --- | ---: | ---: |
| 1 | `V5_SENSOR` | A | 4 |
| 2 | `SDA_CABLE` | B | 5 |
| 3 | `SCL_CABLE` | C | 6 |
| 4 | `GND` | A | 1 |
| 5 | `GND` | B | 2 |
| 6 | `GND` | C | 3 |

Pins 4, 5 and 6 join `GND` on both PCBs; keep three separate return conductors
through the cable. Wire pin 1 to pin 1 through pin 6 to pin 6. The Molex sales
drawing is a component-side view and mates `43045-0600` with `43025-0600`.
Before release, put both header mating-face drawings and both cable-end views on
one harness sheet and continuity-check a built cable. Do not infer pin numbering
from the schematic symbol or from adjacent conductor order.

## Range and performance prediction

The following are design checks, not acceptance claims:

- FDC1004 differential full scale is plus or minus 15 pF. Each differential
  input electrode must remain below 115 pF and each shield driver below 400 pF.
- TIDA-00317 measured `4.2119 - 0.1525 = 4.0594 pF` over 80 mm, or an average
  50.7 fF/mm, through a 2 mm plastic wall. Its section 7.1 reports about 3 fF as
  the detection condition and about 0.1 mm inferred resolution in that setup.
- Do not scale TI's result by inverse wall thickness to predict this board's
  signal or noise margin. Fringing fields, glass permittivity, soldermask,
  rigid-board thickness, deposits and air gaps require the actual stack model
  and final-board measurements.
- A parallel-plate upper-order check for a 6.35 mm by 50 mm electrode over
  1.60 mm FR-4 gives roughly 7.4 pF of electrode-to-back-shield coupling using
  relative permittivity 4.2. Fringing and the driven equal-potential relationship
  change what the converter sees, but this check gives comfortable separation
  from the 115 pF per-input and 400 pF shield limits. Recalculate with the actual
  stackup and extracted copper before fabrication.

No sub-millimetre resolution, linear millimetre output, immunity to a touching
hand, or no-cleaning interval is predicted for the final board. TI's section 6
test used adhesive on 2 mm plastic. It also warns that liquid film or residue can
make readings inconsistent. Crystal Shim's 5 mm glass, clip pressure, biofilm and
receding wet glass remain final-board commissioning risks.

## Required checks

Before fabrication release:

1. Render both copper layers and verify every rectangle, gap, back-shield
   overhang, rim datum and no-copper region against the tables above.
2. Validate DGS-10 against TI's drawing and MSE-10 plus exposed ground pad 11
   against ADI drawing `05-08-1664 Rev I`, including the LT3042 Kelvin routes
   and exposed-pad soldering. Resolve the exact passive lands/stencil in the
   footprint audit. Validate `43045-0600` pad numbers and component-side
   orientation against the Molex sales drawing.
3. Extract actual CIN-to-shield, CIN-to-ground and SHLD-to-ground capacitances
   from the routed board or a field model. Confirm `<115 pF` on each input,
   `|CHA-CHB| <15 pF`, and `<400 pF` on each shield with margin.
4. Calculate I2C rise time from the selected 24 AWG cable data or a measured
   representative cable plus connector, ESD and pin capacitance. Keep 100 kHz if
   the result is not known.
5. Review the actual tank rim and clip envelope. Confirm that the intended high
   surface is at least 11 mm below the rim and that RL remains submerged at the
   50 mm low endpoint.
6. Inspect a flatness/interface drawing with finished board thickness tolerance,
   soldermask/coating stack, side rails, connector clearance and cable strain
   relief. The owner's separate clip CAD remains outside this repository.

During final-board commissioning, retain raw `C_LEVEL`, `C_RL`, `C_RE`, status
bits and observed water position. Test rising and falling water, receding wet
glass, deposits, temperature, removal/reseat, clip pressure, nearby hands, cable
motion and skimmer switching. Those measurements set the reference envelopes,
normalization, thresholds, hysteresis and freshness limit required by G-01; this
document does not pass that gate.

## Primary sources

- [TI FDC1004 data sheet, Rev. C](https://www.ti.com/lit/ds/symlink/fdc1004.pdf):
  VSSOP pinout and functions on page 3; operating and capacitance limits on
  pages 4-6; shield behavior and differential mode on pages 9-12; liquid-level
  application, decoupling and layout on pages 19-22; orderable status in the
  package addendum.
- [TI TIDA-00317 design guide, TIDU736A Rev. A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf):
  ratiometric references and equation on pages 6-7, OoP topology and geometry in
  Figures 5-7 on pages 9-10, exact channel configuration on pages 11-12, test
  stack and residue warning on page 13, measured results on pages 14-16, layer
  plots and board dimensions in Figures 15-22 on pages 18-19, and routing rules
  on page 20.
- [TI TIDA-00317 PCB layout plots, TIDRCS2](https://www.ti.com/lit/pdf/tidrcs2)
  and [assembly drawing, TIDRCS1](https://www.ti.com/lit/pdf/tidrcs1): source
  geometry inspected for electrode, shield and outline proportions.
- [ADI LT3042 data sheet, Rev. C](https://www.analog.com/media/en/technical-documentation/data-sheets/lt3042.pdf):
  ratings, orderables and electrical limits on pages 2-5; pin functions on
  pages 12-13; SET, Kelvin layout and output stability on pages 14-15; input
  capacitance and startup on pages 17-19; MSE package drawing on page 30.
- [TDK C3216X7R1E106K160AB](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C3216X7R1E106K160AB),
  [bias and temperature characterization](https://product.tdk.com/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf)
  ([manufacturer mirror inspected](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf)),
  and [equivalent circuit model, page 5](https://product.tdk.com/system/files/dam/technicalsupport/tvcl/pdf/capacitor_mlcc_com_general_c3216_ecm.pdf):
  exact 10 uF part, dimensions, recommended lands and derating basis.
- [TDK C2012X7R1E474K125AA](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X7R1E474K125AA):
  exact 0.47 uF SET capacitor, 25 V, 10%, X7R, 0805.
- [TDK capacitor aging explanation](https://product.tdk.com/en/contact/faq/capacitors-0043.html):
  logarithmic Class II capacitance loss; the 15% allowance above is an explicit
  project allocation rather than a guaranteed lifetime specification.
- [Panasonic ERA3AEB333V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB333V)
  and [ERA3AEB2491V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB2491V):
  exact 33.0 kohm and 2.49 kohm resistors, 0.1%, 25 ppm/K, 0603, 0.1 W.
- [TI I2C Bus Pull-Up Resistor Calculation, SLVA689](https://www.ti.com/lit/an/slva689/slva689.pdf):
  pull-up minimum/maximum equations and the `0.8473 Rp Cb` rise-time relation on
  pages 1-3.
- [Molex `43045-0600` sales drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf),
  [`43025-0600` housing](https://www.molex.com/en-us/products/part-detail/430250600),
  and [`43030-0007` contact](https://www.molex.com/en-us/products/part-detail/430300007):
  mating family, numbering view, tin plating and 20/22/24 AWG contact range.
