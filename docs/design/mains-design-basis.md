# Mains board and enclosure design basis

Status: preferred design for schematic and mechanical capture, 2026-09-12. The
parts and calculations below establish a concrete pre-fabrication baseline for a
single 120 VAC, 60 Hz, 4 W OASE CrystalSkim 350. They do not certify the assembled
product or replace review and measurements on the final unit. No pump current,
power factor, starting current or winding impedance is published by OASE, so
those load-dependent checks remain commissioning gates.

## Selected architecture

Use a fused, grounded IEC C14 inlet and a separate molded NEMA 5-15R pigtail. The
pump's original plug and cord remain intact. Put the filter and mains PCB in one
partition of a Hammond `1554V2GY` enclosure and the controller in the other. Only
the isolated 5 V harness crosses the partition.

The exact power path keeps the IRM supply outside the pump EMI filter. The fuse
and MOV protect the common input before it divides into the always-powered IRM
branch and the filtered pump branch:

```text
IEC C14 L -> F1 0.8 A time-lag -> J1.1 AC_L_FUSED
IEC C14 N -----------------------> J1.2 AC_N
J1.1 AC_L_FUSED -> RV1 TMOV -> J1.2 AC_N

AC_L_FUSED -> IRM primary L
AC_N        -> IRM primary N

AC_L_FUSED -> J2.1 -> FN2090 LINE L
AC_N        -> J2.2 -> FN2090 LINE N
FN2090 LOAD L -> J3.1 PUMP_L_FILTERED -> K1 contact pin 3
FN2090 LOAD N -> J3.2 PUMP_N_FILTERED -> J4.2 -> output pigtail white
K1 contact pin 4 -> PUMP_L_SW -> J4.1 -> output pigtail black
PUMP_L_SW -> R1 100 ohm -> C1 47 nF X2 -> PUMP_N_FILTERED

IEC C14 PE -> dedicated PE star stud
PE star stud -> output pigtail green
PE star stud -> FN2090 earth terminal/case

IRM +V -> V5_RAW -> U2 TPS259470 IN
U2 OUT -> V5_PSU -> K1 coil pin 1 and controller harness J5.1
IRM -V -> GND_ISO -> controller harness J5.2
K1 coil pin 5 -> COIL_DRAIN -> controller harness J5.3
D1 cathode -> K1 pin 1; D1 anode -> K1 pin 5
```

Neutral is never switched. Protective earth is neither switched nor fused and
does not depend on a PCB trace or pluggable PCB connector. The relay is normally
open, so loss of coil power opens pump hot. This does not detect or cure a welded
contact.

## Known load and unresolved load behavior

The [OASE product page](https://www.oase.com/en-US/aquarium/crystalskim-350)
identifies product 86944 as 120 V, 60 Hz and 4 W with a 2 m cord. It does not give
current, power factor, locked-rotor or start current, start duration, motor type,
plug geometry, or conducted emissions. `4 W / 120 V = 33.3 mA` is only the
unity-power-factor current. It is not an estimate of the actual RMS or starting
current.

The design therefore uses parts with large absolute current margins but does not
claim a motor-life rating from the 4 W label. On the final assembly, measure pump
RMS current, peak start current and start duration at high and low line; capture
the relay opening transient; and repeat cold starts to confirm that the 0.8 A
fuse does not nuisance-open. Keep those results in the commissioning matrix.

## Isolated supply and power budget

Use the exact Mean Well `IRM-10-5`. The
[manufacturer specification](https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf)
gives 5 V at 2 A, 10 W, with 77% typical efficiency. Its input is 85 to 305 VAC,
47 to 440 Hz; typical input current is 0.25 A at 115 VAC. Cold-start input inrush
is 20 A typical at 115 VAC. Mean Well gives no inrush pulse duration or I-squared-t,
so the fuse cannot be proven from the peak alone.

The module is Class II and potted in a UL 94V-0 case. Its input-to-output test is
4.2 kVAC, leakage is less than 0.25 mA at 277 VAC, and its listed protections are
hiccup overload at 115 to 190% and 5.75 to 6.75 V output overvoltage. The data
sheet calls for final-system EMC confirmation even though the module itself has
Class B test results.

The normal power calculation uses **0-50 C enclosure air**. Combining the IRM's
2.5% output tolerance, an intentionally conservative full 200 mV ripple allowance
and 37.5 mV temperature drift gives **4.6375-5.3625 V** at its terminals.
The [controller calculation](controller-design-basis.md#power-domains-and-usb)
then includes harness and OR-diode loss and uses 3.9 V for its buck-input budget.

At 23 C, the relay coil is 62.5 ohm nominal with +/-10% tolerance. Omron's
[relay temperature guidance](https://www.ia.omron.com/support/guide/17/further_information.html)
gives an approximate copper resistance change of 0.4%/C. At 0 C, the estimated
minimum is 62.5 x 0.9 x (1 - 0.004 x 23) = **51.075 ohm**. The upper normal
supply gives about **105 mA**; allocate **110 mA**, rather than 88 mA derived
only from nominal voltage/current. Coil heating increases resistance and reduces
current, but hot pickup needs a separate check. The integrated budget is:

| Load on `V5_PSU` | Allocated current | Basis |
| --- | ---: | --- |
| Relay coil | 110 mA | normal high supply and cold-coil resistance allowance |
| Controller buck input | 635 mA | controller design assumption at 3.9 V and 80% efficiency |
| Sensor | 30 mA | controller design allocation |
| Harness/supervisor and unallocated transient reserve | 75 mA | design allowance |
| **Design allocation** | **850 mA** | 42.5% of IRM nameplate current |
| **Unallocated nameplate margin** | **1150 mA** | not a guaranteed transient response margin |

The 850 mA limit is the whole-system PSU allocation, including the coil that does
not pass through the controller connector. Update it only from
the integrated controller calculation. Keep enclosure air at or below 50 C for
the full 10 W rating; the IRM graph derates above 50 C to 10% load at 85 C. At full
10 W output, its 77% typical efficiency implies about 2.99 W loss. Efficiency at
the allocated 4.25 W load is not guaranteed to remain 77%; use the actual load
curve and final temperature measurements. The supply has the same footprint as
IRM-05-5 but enough current margin for the [secondary eFuse](power-protection-review.md).

### `IRM-10-5` footprint

The body is 45.7 x 25.4 x 21.5 mm with plus or minus 0.5 mm dimensional tolerance.
Pins are 1.0 mm diameter and project 3.5 plus or minus 1 mm. The manufacturer
drawing is a bottom view. A tscircuit or KiCad footprint is viewed from the
component side, so mirror the manufacturer's x coordinates about the 45.7 mm
body centreline. With origin at the upper-left body corner in the component-side
view, `+x` along the 45.7 mm side and `+y` along the 25.4 mm side, use:

| Pin | Function | Centre `(x, y)` mm |
| ---: | --- | --- |
| 1 | `AC/N` | `(42.10, 14.20)` |
| 2 | `AC/L` | `(42.10, 3.45)` |
| 3 | `-V` / `GND_ISO` | `(3.60, 3.45)` |
| 4 | `+V` / `V5_RAW` | `(3.60, 11.45)` |

The manufacturer drawing labels functions, not numeric pins. The numbers above
retain KiCad's native `IRM-05-5` symbol numbering, with the component value
changed to `IRM-10-5`. The IRM-10 manufacturer drawing was visually checked
and matches the IRM-05 body, hole centres and lead diameter. The stock
`Converter_ACDC_MeanWell_IRM-05-xx_THT` footprint is a physically exact candidate:
rotate the stock local coordinates 180 degrees and translate by (42.10,14.20)
to obtain this table. No output-pad swap or custom geometry is required. The
earlier project-assigned AC input numbers were reversed relative to that native
symbol; the table above supersedes them.

These component-side coordinates reproduce the specified 10.75 mm input spacing,
38.5 mm primary-to-secondary x spacing and 8.0 mm output spacing. The stock
candidate uses 1.5 mm finished holes for the 1.0 mm leads; verify the resulting
annuli, fabricator tolerance and assembly fit before adoption. Keep a 47.7 x
27.4 mm placement envelope, derived from the maximum
body plus at least 0.75 mm assembly clearance on every side. Do not derive a
footprint from a generic encapsulated supply. In footprint review, compare a
rendered component-side view against this table and a mirrored bottom-side view
against the manufacturer drawing.

## Relay and coil interface

Use exact order code **`G5RL-1A-TV8 DC5`**. This is the flux-protected, SPST-NO,
PCB-terminal, high-inrush model with a 5 VDC coil. The
[current Omron data sheet](https://components.omron.com/us-en/asset/datasheet_pdf/K132-E1.pdf)
specifies:

- coil 80 mA, 62.5 ohm and about 400 mW at 5 V; rated current and resistance are
  plus or minus 10% at 23 C;
- must-operate voltage no more than 70% of rated voltage, must-release voltage at
  least 10%, and maximum coil voltage 130% at 23 C;
- Ag-alloy contact, 12 A at 250 VAC resistive and 12 A at 24 VDC, with 12 A carry
  current and 250 VAC maximum switching voltage;
- contact resistance 100 milliohms maximum, operate time 15 ms maximum and
  release time 5 ms maximum, without a suppression-dependent guarantee;
- 6 kVAC for one minute and 10 kV impulse between coil and contacts, with 8 mm
  clearance and 8 mm creepage between coil and contacts;
- 1 kVAC for one minute across open contacts. Omron does not publish a physical
  open-contact gap, so this relay is not treated as a disconnecting device;
- the failure-rate reference is P level at 100 mA and 5 VDC. This is not a
  guaranteed minimum load and it does not characterize a roughly 4 W AC motor.

Omron's North American approvals for this exact TV8 family include 12 A at
277 VAC general use for 80,000 operations at 40 C, TV-8 at 120 VAC for 25,000
operations at 40 C, A300, and 1/2 hp at 120 VAC for 6,000 operations at 40 C.
TV-8 is a television-load test, not a statement of CrystalSkim motor life.
Because actual pump start behavior is unpublished, the final repeated-start and
contact-transient evidence remains mandatory.

### Protected coil rail

U2 **TPS259470ARPWR** cuts off the common secondary before the relay and
controller. Its exact networks, current/ramp calculations, leakage bleeder and
negative clamp are in [secondary power protection](power-protection-review.md).
The selected static OVLO band is 5.695-5.927 V; the module's 5.75-6.75 V OVP
threshold is separate from its normal envelope. Both coil and controller use
protected V5_PSU. The raw module output is V5_RAW.

Transient closure remains a release obligation. The eFuse's 1.2 us typical OVLO
response has no published maximum; a static cutoff is not an absolute clamp.
Omron's maximum coil voltage of 130% is specified at 23 C and does not establish
its 50 C limit. Bound hot pickup and fault voltage/time/energy from the final
circuit before release, then measure its actual transitions on the final unit.
The flyback diode suppresses turn-off inductance, not supply overvoltage.

### `G5RL-1A-TV8` footprint and pin map

The body is 29.0 x 12.7 x 15.7 mm maximum. Omron's PCB-hole and terminal diagram
is a bottom view. Mirror it for the component-side footprint. With contact pin 3
at `(0, 0)`, pin 4 staggered 3.5 mm to the right and 7.5 mm down, and the coil
pins 23.5 mm to the right of pin 3, the
component-side pad centres are:

| Relay pin | Centre `(x, y)` mm | Function | Net |
| ---: | --- | --- | --- |
| 1 | `(23.50, 0)` | coil, no inherent polarity | `V5_PSU` |
| 5 | `(23.50, 7.50)` | coil, no inherent polarity | `COIL_DRAIN` |
| 3 | `(0, 0)` | normally-open fixed contact | `PUMP_L_FILTERED` |
| 4 | `(3.50, 7.50)` | moving contact | `PUMP_L_SW` |

Use four 1.3 plus or minus 0.1 mm finished holes as Omron specifies. In footprint
review, the component-side render must match this table and the mirrored
bottom-side render must match Omron's drawing. Do not swap the coil and contact
columns.

The 20 +/-0.1 mm dimension runs from coil pin 5 to contact pin 4; another
3.5 +/-0.1 mm reaches pin 3's column. The derived 23.5 mm span does not have
an independently specified +/-0.1 mm tolerance. This corrects the earlier table
that incorrectly aligned both contacts and put the coil only 20 mm from pin 3.
Independent inspection of the manufacturer's mounting-hole and terminal drawings
confirmed the correction before a mains footprint was authored.

### Coil suppression and controller harness

Fit a Vishay `1N4007-E3/54` in DO-204AL directly beside relay pins 1 and 5,
cathode to pin 1 `V5_PSU` and anode to pin 5 `COIL_DRAIN`. The
[Vishay 1N400x data sheet](https://www.vishay.com/docs/88503/1n4001.pdf)
specifies 1 A average forward current and 1.1 V maximum forward drop at 1 A.
At turn-off, the MOSFET drain is therefore clamped to approximately `V5_PSU +
Vf`; using 5.0 V and the diode's worst stated forward drop gives 6.1 V. Even an
abnormal 6.75 V IRM overvoltage threshold plus 1.1 V remains 7.85 V, well below
the controller's 30 V AO3400A rating before wiring overshoot.

Use a diode-only clamp. A series zener would shorten release, but pump control is
on a seconds-to-minutes time scale and the Omron sheet gives no coil inductance
or suppressed release curve from which to justify its voltage. The diode-only
choice minimizes harness voltage and radiated transient energy. Verify drain
overshoot and actual dropout on the final harness. If a later measurement proves
a release-time problem, a zener change requires a fresh worst-case AO3400A clamp
calculation and is not a stuffing substitution.

Use a straight-through three-circuit Micro-Fit 3.0 cable between the boards. Fit
a Molex **`43650-0300`** right-angle single-row header on each board, a
**`43645-0300`** receptacle housing at each cable end, and six loose-piece tin
female contacts **`43030-0007`** for 20 to 24 AWG. The
[Molex header page](https://www.molex.com/en-us/products/part-detail/436500300)
specifies three circuits, 3.00 mm pitch, 8.5 A/contact, 600 V maximum, a shrouded
right-angle through-hole header, 1.6 mm recommended PCB and -40 to 105 C. The
[Molex contact page](https://www.molex.com/en-us/products/part-detail/430300007)
specifies 7 A maximum and 1.85 mm maximum insulation diameter. Use Alpha Wire
**`6713`**, 22 AWG, for all three conductors: red `V5_PSU`, black `GND_ISO` and
blue `COIL_DRAIN`. The
[manufacturer page](https://www.alphawire.com/products/wire/ecogen/ecowire/6713)
specifies 600 V, 105 C, VW-1, 1.24 mm nominal OD and those colour options. This
harness remains entirely in the isolated low-voltage partition.

For each component-side header footprint, put plated pad 1 at `(0, 0)`, pad 2 at
`(3.00, 0)` and pad 3 at `(6.00, 0)` mm. Put the 3.00 mm non-plated locator hole
at `(3.00, -4.32)` mm, with the header body and cable exit on the negative-y side.
The pad drills are 1.02 mm nominal. These values follow the
[Molex 43650 manufacturer drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf).
The pin-1 chamfer and silkscreen mark must remain visible. Wire circuit 1 to 1,
2 to 2 and 3 to 3; read molded circuit numbers at each mating face rather than
mirroring the cable order by eye.

| Micro-Fit circuit at both boards | Net | Rule |
| ---: | --- | --- |
| 1 | `V5_PSU` | protected secondary and relay coil supply; never USB-derived |
| 2 | `GND_ISO` | IRM secondary return and MOSFET source return |
| 3 | `COIL_DRAIN` | relay coil low side to controller AO3400A drain |

The controller diode-ORs `V5_PSU` and a separate isolated `V5_SERVICE` input into
`V5_LOGIC`; neither service power nor USB can reach circuit 1. USB VBUS is a
presence signal only. Service-powered programming leaves the physical relay coil
supply absent when mains is disconnected.

## Filter selection

Use **TE/Schaffner `FN2090A-1-06`**, TE internal number `802490-SF`, only in the
pump branch. The 1 A variant is the lowest current in the family and is 30 times
the pump's 33.3 mA unity-power-factor lower bound. Actual pump RMS and starting
current still need measurement. The IRM branch bypasses this filter, so its
0.25 A typical input current at 115 VAC does not consume filter current capacity.

The A version is preferred over the standard version because its maximum leakage
is 0.07 mA at 120 VAC/60 Hz and 0.13 mA at 250 VAC/50 Hz. The standard 1 A version
is 0.26 mA at 120 VAC/60 Hz; the B version is nominally zero leakage but gives up
substantial common-mode attenuation. The A version is a useful compromise for a
GFCI-protected aquarium installation. Schaffner notes that interrupted neutral
can double the quoted leakage.

The [manufacturer data sheet](https://www.te.com/commerce/DocumentDelivery/DDEController?Action=srchrtrv&DocFormat=pdf&DocLang=English&DocNm=FN2090&DocType=Data+Sheet&PartCntxt=802490-SF)
gives a 1 A rating at 40 C and 1.1 A at 25 C, 250 VAC maximum, DC to 400 Hz,
natural convection, overvoltage category II, pollution degree 2, IP00, and
-25 to 100 C operation. Its values are 20 mH, 0.22 uF X capacitance, 0.47 nF for
each of the two Y capacitors, 680 kilohms discharge resistance, 1.8 W power loss
at 25 C/DC and 73 g. Tolerances are -30/+50% inductance, plus or minus 20%
capacitance and plus or minus 10% resistance.

The published CISPR 17, 50 ohm/50 ohm graph is typical component data. Visual
readout for the 1 A A type is approximately 20 dB differential and 50 dB
common-mode at 100 kHz, about 80 dB differential and 65 dB common-mode at 1 MHz,
and about 70 dB differential and 55 dB common-mode at 10 MHz. These are graph
readings, not guaranteed minima or installed-equipment predictions. Wiring and
load impedance can materially reduce them.

The `-06` suffix provides 6.3 x 0.8 mm Faston tabs. Overall mounting length `A`
is 71 mm; body length `B` is 46.6 mm; height `C` is 22.3 mm; body/chassis depth
`D` is 50.5 mm; body width `E` is 44.5 mm. Mounting-hole centres are 61 mm apart
and the cross-axis dimension `G` is 21 mm. The remaining drawing dimensions are
`H=10.8`, `I=16.8`, `J=25.25`, `K=5.3`, `L=6.3`, and sheet thickness `M=0.7 mm`.
Use the manufacturer's drawing rather than interpreting these letters as an
independent envelope. Allow at least 73 x 53 x 25 mm including tolerances and
assembly clearance.

Mount the filter to the enclosure floor. Keep its marked LINE pair beside board
connector `J2` and its LOAD pair beside board connector `J3`. Put those connectors
at opposite board edges; do not cross or bundle the dirty and clean pairs. Bond
its earth terminal/case directly to the PE star with its
own conductor. Its IP00 rating requires the closed enclosure and guarded tabs.
TE lists the part active but presently not available from its own store; confirm
authorized-distributor stock before freezing the procurement BOM.

## Fuse, surge and relay-load suppression

### Input fuse

Use Littelfuse **`0215.800MXP`**, 215-series 800 mA, 250 VAC, time-lag ceramic
5 x 20 mm cartridge. The
[manufacturer 215 data sheet](https://www.littelfuse.com/assetdocs/fuse-215-datasheet?assetguid=990f7193-d9a2-48e4-b760-2b43514249cf)
gives 1.5 kA breaking capacity, 0.4675 ohm nominal cold resistance and 0.975
A-squared-seconds nominal melting integral for 800 mA. Its IEC time-current
limits are at least 60 minutes at 150%, no more than 30 minutes at 210%, 0.25 to
80 seconds at 275%, 0.05 to 5 seconds at 400%, and 0.005 to 0.150 seconds at
1000%.

Put F1 only in line, in the IEC inlet's integral holder. It protects the common
input before the IRM and pump-filter branches. The 0.8 A selection is below the
filter's 1 A rating while leaving large running-current margin. It is not proven
against the IRM's 20 A typical inrush because Mean Well omits inrush duration.
Confirm repeated cold starts at worst available line and temperature. Do not
raise F1 above 1 A without adding and coordinating separate pump-branch
overcurrent protection within the filter rating.

### Thermally protected MOV

Fit Littelfuse **`TMOV14RP175E`** from `AC_L_FUSED` to `AC_N`, immediately after
board input `J1`. F1 is upstream. The MOV is before the circuit divides at its
pads into the IRM branch and board connector `J2` for the pump filter. The
[TMOV manufacturer data sheet](https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05)
gives 175 VAC/225 VDC maximum continuous voltage, 243 to 297 V varistor voltage
at 1 mA, 455 V maximum clamp at 50 A, 70 J for a 2 ms pulse, 6 kA for one and
4.5 kA for two 8/20 us pulses, and 700 pF typical capacitance. It contains a
thermal disconnect and is a recognized component; its use does not make this
assembly a listed surge protective device.

The 175 VAC version preserves margin above a 120 VAC branch's expected high line
while clamping lower than 200 or 230 VAC versions. The 0.8 A fuse opens a hard
short and is upstream of the MOV; the TMOV's integral disconnect addresses MOV
overheating under a sustained limited-current abnormal voltage. This upstream
location covers both branches, subject to harness inductance. The component data
sheets do not establish a coordinated fault test for this exact assembly. Keep
the MOV and its short high-current loop beside `J1`, away from the enclosure wall and
low-voltage barrier, and inspect temperature and fault containment before
release. Do not fit line-to-PE or neutral-to-PE MOVs.

The standard bulk part has two 0.76 to 0.86 mm leads on 7.5 plus or minus 1.0 mm
spacing. For the 175 V 14 mm body, maximum thickness is 9.0 mm and body dimensions
span 15 to 22 mm high and 12.5 to 17 mm diameter by the family drawing. Use a
1.1 mm nominal finished hole, then check lead and fabrication tolerances.

### Pump RC network

Populate an initial load-side RC series network between `PUMP_L_SW` and
`PUMP_N_FILTERED`:

- `R1`: Vishay **`PR02FS0201000KA100`**, PR02-FS 100 ohm plus or minus 10%, 2 W,
  axial ammo-pack part;
- `C1`: TDK **`B32921C3473K000`**, 47 nF plus or minus 10%, 305 VAC X2,
  630 VDC, untaped straight leads.

The [Vishay PR02-FS sheet](https://www.vishay.com/docs/28915/pr02fs.pdf)
specifies a non-inductive, flameproof, UL 94V-0, UL 1412-recognized resistor for
snubber use, with greater than 600 V 1.2/50 us pulse capability. Its body is
10.0 mm long by 3.9 mm diameter maximum with 0.78 plus or minus 0.05 mm leads.
Use a 15.24 mm horizontal pitch and 1.1 plus or minus 0.1 mm finished holes
with 2.6 mm copper lands. This increases the original 1.0 mm hole proposal to
allow more clearance around the 0.83 mm maximum wire. The drawing separately
limits the coating extent `L2` to 12.0 mm; retain it in the forming envelope.
The project chooses the horizontal pitch. Verify the bend beyond the coating
and assembly standoff before native footprint adoption.

The [TDK product table](https://www.tdk-electronics.tdk.com/en/3191402/products/product-catalog/film-capacitors/emi-suppression-capacitors/search-results-deltacap-capacitors?so=%7B%22orderingCode%22%3A%22B32921C3473%2A%22%7D)
specifies a 10 mm lead pitch and 13 x 5 x 11 mm maximum body. The June 2026
[manufacturer drawing](https://www.tdk-electronics.tdk.com/inf/20/20/db/fc_2009/X2_B32921_928.pdf)
gives straight leads 0.60 plus or minus 0.05 mm in diameter, pitch tolerance
plus or minus 0.4 mm and untaped lead length 6 minus 1 mm. Use 1.3 plus or
minus 0.1 mm finished holes and 2.9 mm copper lands. The worst diametric
clearance is 0.55 mm, allowing the lead-pitch tolerance plus a 0.10 mm
differential hole-position budget. Verify the actual fabrication position
tolerance and body standoff; never force the capacitor into the board.
Use the exact X2 part rather than an ordinary film capacitor.

At 120 VAC/60 Hz, the 47 nF reactance is 56.44 kilohms. The branch current is
2.126 mA RMS and normal resistor dissipation is 0.452 mW. The RC time constant is
4.7 us, its corner is 33.9 kHz, and capacitor energy at 169.7 V peak is 0.677 mJ.
These values provide a conservative first suppression network with negligible
60 Hz resistor heating. They do not establish critical damping because pump and
wiring inductance and resistance are unknown.

Put the RC across the pump load, not the relay contact, so the open relay leaves
no powered leakage path into the pump. Reserve pads for a 10 mm-pitch X2 capacitor
up to 100 nF and an axial 47 to 220 ohm PR02-FS without shrinking mains spacing.
The installed values remain the exact parts above. Change them only after a final
unit contact-voltage waveform and conducted-emissions measurement.

## External and internal connections

### IEC input

Use Schurter **`6200.2300`**, a screw-mounted C14, protection-class-I inlet with
one wired 5 x 20 mm fuse pole and 6.3 x 0.8 mm quick-connect tabs. Use Schurter
**`RC320`** as its rear terminal cover. The
[Schurter 6200 data sheet](https://www.schurter.com/en/datasheet/typ_6200.pdf)
rates it 10 A/250 VAC under IEC and UL/CSA, with greater than 2 kVAC L-N and
L/N-PE dielectric strength, -25 to 70 C operation, 2 W fuse power acceptance at
23 C, UL 94V-0 housing and IP40 at the front face. Fuse replacement requires
removing the mains cord.

The front flange is 44 x 36 mm. The panel opening is 31.5 by 27.5 mm, each
`+0.2/-0`, with maximum 3 mm corner radius. Two M3 mounting holes are on 36.0 mm
horizontal and 30.8 mm vertical centres. Rear depth to the tip of quick-connect
tabs is 23.5 mm. Use the manufacturer's drawing and no more than 0.5 N-m screw
torque. Use Schurter **`6009.1315`** as the detachable input cord. Its
[manufacturer data sheet](https://www.schurter.com/en/datasheet/6009.1315)
specifies a 2.5 m black SJT 3 x 18 AWG cord, straight NEMA 5-15P to IEC C13,
10 A/125 VAC, UL and CSA approval, and -40 to 60 C operation.

Use TE **`2-520184-2`** fully insulated Ultra-Fast 250 receptacles on every 6.35
x 0.81 mm inlet and filter tab. TE rates this terminal 600 V for 22 to 18 AWG,
0.32 to 0.82 square millimetre wire, up to 3.43 mm insulation diameter and
-40 to 110 C. It is active but TE's store currently shows unavailable, so confirm
authorized-distributor stock or select a dimensionally equivalent manufacturer
terminal before harness release. Apply it only with the specified production
crimp tooling and pull-test samples.

### Output pigtail and gland

Use Americord **`1112.048.005350`**, a 4 ft black 18/3 SJTOW cord with a molded
NEMA 5-15R, 2 in removed outer jacket and 3/8 in stripped conductors. The
[manufacturer product page](https://www.americord.com/en-ca/products/4ft-roj-2-strip-3-8-to-nema-5-15r-power-cord-18-3-sjtow-na)
specifies 10 A/125 V, 105 C, North American colour code, and UL/cUL approvals.
Verify stock immediately before the one-time purchase; the manufacturer page
currently labels the selected part low stock.

Americord's
[wire diameter chart](https://www.americord.com/pages/wire-o-d-range) gives
0.300 to 0.335 in, 7.62 to 8.51 mm, for 18/3 SJ/SJT/SJO/SJTO-family cable; the
selected SJTOW construction is in that same junior-service family. Pass it
through a black Heyco **`M3231`** LTCG 1/2 NPT liquid-tight cordgrip. The
[Heyco manufacturer table](https://www.heyco.com/wp-content/uploads/2024/10/Liquid-Tight-Cordgrips-NPT.pdf)
accepts 0.170 to 0.450 in, 4.3 to 11.4 mm, so the full published cord range is
inside the gland range. Its clearance hole is 0.875 in, 22.2 mm, maximum overall
length 1.70 in, 43.2 mm, thread length 0.61 in, 15.5 mm, and nut flats 0.98 in,
24.9 mm. Mount it in a downward-facing wall and include a drip loop.

The 4.3 to 11.4 mm gland range contains the complete 7.62 to 8.51 mm
manufacturer family range with at least 0.89 mm margin at the upper end. Measure
the received cord jacket before drilling the final wall because Americord does
not put a part-specific OD on the selected product page. Reject or change the
gland if the received marking or OD falls outside those published values.

Terminate pigtail black and white into the output Sabre harness at `J4`, using
loose Molex `43375-2001` contacts only after checking the received conductor
insulation OD is within the contact drawing's 2.84 mm maximum. Terminate the
green conductor directly to the PE star ring terminal, with enough slack that PE
is last to take strain. This molded receptacle accepts common NEMA 1-15P and
5-15P pump plugs without an enclosure outlet cutout and preserves the original
pump cord.

### Board-side mains connectors

Use four different-circuit-count, single-row, vertical, shrouded Molex Sabre
interfaces. The previous 4.20 mm Mini-Fit Jr proposal cannot meet the project's
3.2 mm PCB copper clearance after real land geometry is accounted for. The
selected Sabre set keeps the dirty filter wiring apart from its clean output:

| Interface | PCB header | Cable housing | Female contact | Circuits |
| --- | --- | --- | --- | ---: |
| fused mains input `J1` | `43160-0102` | `44441-2002` | `43375-2001` | 2 |
| filter LINE output `J2` | `43160-0103` | `44441-2003` | `43375-2001` | 3 |
| filter LOAD input `J3` | `43160-0104` | `44441-2004` | `43375-2001` | 4 |
| pump pigtail `J4` | `43160-0106` | `44441-2006` | `43375-2001` | 6 |

The supplied [Molex Sabre header drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf)
is five pages; the exact `43160-0102`, `-0103`, `-0104` and `-0106` parts are
listed on page 2. Its recommended plated holes are 1.78 +/- 0.08 mm and its
nominal terminal pitch is 7.493 mm. Propose 3.50 mm copper pads for capture,
giving a nominal adjacent-pad gap of 7.493 - 3.50 = 3.993 mm, above the
project's 3.2 mm minimum. This is a capture proposal: compare every drawing
dimension and pin count, account for unused header metal, solder fillets and
the shroud in the routed CAD, and require final DRC before release. The header
envelopes are 21.08, 28.58, 36.07 and 51.05 mm for 2, 3, 4 and 6 circuits,
respectively, so actual board and enclosure fit remains owed.

The [Molex Sabre housing drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/444/44441/444412006_sd.pdf)
and [Sabre product specification PS-44441-9999-001](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/productspecificationpdf/444/44441/PS-44441-9999-001.pdf)
cover the 44441 receptacles and 43160 headers. The specification reports 600 V
AC RMS under CSA and 16 A fully loaded for the 43160 header series; use the
exact variant, wire, cavity count and applicable derating before claiming a
field rating. The black `44441-2002/-2003/-2004/-2006` housings are polarized,
latched, single-row, 7.50 mm-pitch parts. Use Alpha Wire **`6715`** for the
black and white internal conductors. The
[Alpha Wire product page](https://www.alphawire.com/en/products/wire/ecogen/ecowire/6715)
specifies 18 AWG 16/30 tinned copper, 1.70 plus or minus 0.05 mm outside diameter,
600 V, 105 C, VW-1 and black and white colour options. The
[loose Sabre contact drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/433/43375/433752001_sd.pdf)
specifies `43375-2001` for stranded 18-20 AWG wire with insulation no larger
than 2.84 mm. Verify the exact received wire and terminal drawing before the
harness release.

The pigtail's jacket is removed before `J4`; use `43375-2001` on its black and
white conductors only if the received conductor OD fits the drawing. The larger
`43375-3001` is not selected; consider it only if its exact drawing, wire range
and terminal fit are checked against the received pigtail before release. Do not
improvise a crimp when the received OD is outside the selected contact range.

All four cables use L on circuit 1 and N on circuit 2. Use the housing's marked
circuit numbers as viewed at its mating face. The remaining cable cavities are
EMPTY. Confirm the assignments against both sales drawings during harness
drawing release:

| Connector | Circuit | Net | Colour / disposition |
| --- | ---: | --- | --- |
| `J1` | 1 | `AC_L_FUSED` | black, from inlet fused line tab |
| `J1` | 2 | `AC_N` | white, from inlet neutral tab |
| `J2` | 1 | `FILTER_LINE_L` | black, to filter LINE L |
| `J2` | 2 | `FILTER_LINE_N` | white, to filter LINE N |
| `J2` | 3 | EMPTY | no contact |
| `J3` | 1 | `PUMP_L_FILTERED` | black, from filter LOAD L |
| `J3` | 2 | `PUMP_N_FILTERED` | white, from filter LOAD N |
| `J3` | 3-4 | EMPTY | no contact |
| `J4` | 1 | `PUMP_L_SW` | pigtail black |
| `J4` | 2 | `PUMP_N_FILTERED` | pigtail white |
| `J4` | 3-6 | EMPTY | no contact |

PE bypasses all connectors. Different circuit counts alone do not prove that
two connectors cannot partial-mate or cross-mate. Before release, perform a CAD
partial/cross-mate check for all four headers and housings, then inspect the
received parts for keying, circuit count, pin numbering and fit. No
non-intermateability claim is verified yet. Keep these connectors inside the
enclosure and treat them as de-energized-service connectors. Do not expose them
as user disconnects.

## Protective earth

Install one dedicated M4 protective-earth stud in the mains bay. Use corrosion-
resistant hardware, a toothed washer against the ring terminal, a prevailing
locking nut, and a protective-earth label. The stud serves no other mechanical
function. Fit separate ring terminals for IEC inlet PE, output pigtail green and
filter PE/case, so removing one branch does not daisy-chain through another.

Use Alpha Wire **`3075`** green/yellow for the inlet-to-stud and filter-to-stud
PE leads. Its
[manufacturer page](https://www.alphawire.com/en/products/wire/hook-up-wire/premium/3075)
specifies 18 AWG 16/30 tinned copper, 600 V, 105 C, VW-1 and 2.82 plus or minus
0.10 mm diameter. Terminate these leads with TE PIDG **`31886`** closed-ring
terminals. The [TE product page](https://www.te.com/en/product-31886.html)
specifies a #8/M4, tin-plated ring for 22-to-16 commercial AWG conductors, 300 V,
105 C, and 2.67 to 3.56 mm insulation; the complete `3075` tolerance fits.

Use TE PIDG **`320551`** for the output pigtail PE if its received green conductor
fits that terminal's published 22-to-16 AWG and 2.03 to 3.18 mm insulation range.
Do not crimp it until that diameter is checked. Route every PE conductor
with more slack than the corresponding line and neutral conductor. Verify less
than 0.1 ohm from the C14 earth pin to the NEMA 5-15R ground contact and filter
case on the final unit. This is an engineering continuity target; the applicable
product-standard current and voltage test still need determination by the final
safety review.

## PCB partition, spacing and physical basis

Use a 135 x 75 mm, 1.6 mm nominal FR-4 mains PCB with four 3.2 mm non-plated
mounting holes centred 5.0 mm from each corner. This outline is the capture
allocation and may shrink after placement; it must not grow without repeating the
enclosure fit. Keep all mounting hardware nonconductive where it approaches the
isolation boundary.

Partition the PCB into a primary/mains region and an isolated-secondary region.
The IRM body straddles that boundary only in accordance with its pin arrangement;
the relay straddles it only through its internal coil-contact isolation. Use
these conservative capture constraints:

- at least 8.0 mm creepage and 8.0 mm clearance between any mains net and
  `V5_PSU`, `GND_ISO`, `COIL_DRAIN`, secondary connector copper, test points,
  mounting hardware or controller conductors;
- at least 3.2 mm creepage and clearance between line and neutral, filtered and
  unfiltered mains, and the two sides of the open relay contact;
- no soldermask or conformal coating credit; no copper, vias, test pads or plated
  holes inside the 8 mm boundary;
- add milled slots where the placed relay or IRM pad geometry otherwise shortens
  surface creepage, and measure the routed board rather than relying on a netclass
  setting;
- keep the RC network beside the output connector and the MOV beside the input,
  with no surge-current path through the isolated boundary.

The 8 mm isolation rule agrees with the relay's own published coil-contact
clearance and creepage and provides a coherent board-level boundary. The 3.2 mm
mains-net rule is a conservative project constraint for 120 VAC. Neither is a
claim that an applicable product standard has been independently evaluated.
Review material group, pollution degree, overvoltage category, altitude, slots
and routed geometry before fabrication.

## Enclosure and layout

Use Hammond **`1554V2GY`**, solid gray polycarbonate, 239 x 160 x 89 mm. The
[specific product page](https://www.hammfg.com/part/1554V2GY) gives UL94 5VA,
UL file E65324, IP66 and NEMA 1, 4, 4X, 12 and 13 for the unmodified enclosure.
It includes a silicone gasket and four M4 cover screws. Maximum internal PCB
allocation is 231.47 x 146.74 mm. Hammond's wider series page specifically
excludes this V-size part from the series' IP67/IP68 and Type 6/6P claims.

Cutouts for the IEC inlet, output gland and USB service access invalidate the
catalog enclosure rating unless the modified assembly is evaluated. Face the
inlet and cord exit away from the aquarium and downward where installation
permits. Maintain drip loops and keep the enclosure on the spacious surface
behind the tank, within the project's 8 in sensor-harness limit.

Use the 231 x 146 mm usable floor as follows:

| Zone | Allocation | Contents |
| --- | --- | --- |
| mains bay | 141 x 146 mm | 135 x 75 mm mains PCB plus 73 x 53 mm filter envelope arranged in two rows |
| solid partition | 5 mm thick mechanical allocation | floor-to-lid polycarbonate barrier with only a bushed low-voltage harness opening |
| controller bay | 75 x 146 mm | 70 x 110 mm controller PCB, USB service opening and antenna at outer wall |
| end margins | 5 mm at each end of the 231 mm axis | installation tolerance and wall/boss clearance allocation |

The occupied bays and partition use 221 mm: 141 + 5 + 75 mm, leaving 10 mm
total end margin within the conservative 231 mm floor length. In floor coordinates
the mains bay spans X = 5-146, the partition X = 146-151 and the controller bay
X = 151-226 mm; Y spans 0-146 mm. These dimensions supersede the earlier
zero-margin 146/5/80 allocation. Orient the mains PCB
and filter so their 75 and 53 mm depths, plus at least 10 mm wiring space, fit
within the 146 mm bay width. Maintain at least 10 mm air and routed-wire separation
between filter LINE and LOAD wiring. The barrier is a routing and touch-access
backstop, not a substitute for PCB creepage and clearance. Use flame-rated sheet
and mechanically retained, insulated penetrations; confirm the final lid closure
and conductor bend radii in CAD and on the assembled unit.

The IRM's typical full-load loss is about 2.99 W and the filter data sheet lists
1.8 W loss at its full 1 A rating. Actual system losses will be load dependent.
Measure the closed-enclosure internal temperature at maximum controller radio
activity, continuous relay operation and worst expected ambient. The IRM air
temperature must remain at or below 50 C for the undiminished 10 W rating, and the
Schurter inlet must remain within 70 C.

## Capture parts table

| Ref / item | Exact manufacturer part | Quantity | Rating / physical basis | Capture disposition |
| --- | --- | ---: | --- | --- |
| `U1` | Mean Well `IRM-10-5` | 1 | 5 V, 2 A; 45.7 x 25.4 x 21.5 mm | exact four-pin footprint above |
| `U2` | TI `TPS259470ARPWR` | 1 | 2 x 2 mm RPW0010A; reverse-blocking eFuse | exact ten-pad source and network in secondary protection document |
| `D2` | ST `STPS2L40U` | 1 | SMB; output negative clamp | anode GND_ISO; cathode V5_PSU; transient review owed |
| `R2/R3` | Panasonic `ERA3AEB2612V` / `ERA3AEB103V` | 1 each | 26.1k / 10k; 0.1%, 25 ppm/C, 0603 | UV divider; top to V5_RAW, bottom to GND_ISO; midpoint U2.1 |
| `R4/R5` | Panasonic `ERA3AEB3832V` / `ERA3AEB103V` | 1 each | 38.3k / 10k; 0.1%, 25 ppm/C, 0603 | OV divider; top to V5_RAW, bottom to GND_ISO; midpoint U2.2 |
| `R6` | Panasonic `ERA3AEB2871V` | 1 | 2.87k; 0.1%, 25 ppm/C, 0603 | U2.9 to GND_ISO, short Kelvin return |
| `R7` | Panasonic `ERA6AEB222V` | 1 | 2.20k; 0.1%, 25 ppm/C, 0805, 0.125 W | protected V5_PSU discharge to GND_ISO |
| `C2` | TDK `C2012X7R1E105K125AB` | 1 | 1 uF, 25 V, X7R, 10%, 0805 | V5_RAW input bypass at U2.5/8 |
| `C3` | TDK `C1608X7R1H104K080AA` | 1 | 100 nF, 50 V, X7R, 10%, 0603 | closest input HF bypass at U2.5/8 |
| `C4` | Murata `GRM32ER71E226ME15L` | 1 | 22 uF, 25 V, X7R, 20%, 1210 | V5_PSU bulk at U2.6/8; separate mains-board quantity |
| `C5` | TDK `C1608C0G1H472J080AA` | 1 | 4.7 nF, 50 V, C0G, 5%, 0603 | U2.7 to GND_ISO, short Kelvin return |
| `K1` | Omron `G5RL-1A-TV8 DC5` | 1 | SPST-NO, 5 V/80 mA coil; 29 x 12.7 x 15.7 mm max | pins 1/5 coil, 3/4 contact |
| `D1` | Vishay `1N4007-E3/54` | 1 | 1 A, 1000 V, DO-204AL | cathode to `V5_PSU` |
| `RV1` | Littelfuse `TMOV14RP175E` | 1 | 175 VAC MCOV, thermally protected, 7.5 mm pitch | fused input L-N before branch split |
| `R1` | Vishay `PR02FS0201000KA100` | 1 | 100 ohm, 10%, 2 W, flameproof/non-inductive | series RC, 15.24 mm footprint pitch |
| `C1` | TDK `B32921C3473K000` | 1 | 47 nF, 10%, 305 VAC X2, 10 mm pitch | series RC across pump load |
| `J1` | Molex `43160-0102` / `44441-2002` | 1 set | 2-circuit shrouded vertical Sabre, 7.50 mm pitch | fused input after C14/F1; L1/N2 |
| `J2` | Molex `43160-0103` / `44441-2003` | 1 set | 3-circuit shrouded vertical Sabre, 7.50 mm pitch | dirty filter LINE output; L1/N2, cavity 3 EMPTY |
| `J3` | Molex `43160-0104` / `44441-2004` | 1 set | 4-circuit shrouded vertical Sabre, 7.50 mm pitch | clean filter LOAD input; L1/N2, cavities 3-4 EMPTY |
| `J4` | Molex `43160-0106` / `44441-2006` | 1 set | 6-circuit shrouded vertical Sabre, 7.50 mm pitch | switched pump output; L1/N2, cavities 3-6 EMPTY |
| `J5` and controller mate | Molex `43650-0300` | 2 | 3-circuit single-row right-angle Micro-Fit 3.0 | same pin map on both boards |
| line filter | TE/Schaffner `FN2090A-1-06`, `802490-SF` | 1 | 1 A at 40 C, low leakage, 6.3 mm Faston | chassis mounted in mains bay |
| inlet | Schurter `6200.2300` plus `RC320` | 1 each | C14, single 5 x 20 fuse, 6.3 mm Faston | screw-mounted wall cutout |
| input cord | Schurter `6009.1315` | 1 | 2.5 m, NEMA 5-15P to C13, 10 A/125 V | detachable external assembly |
| `F1` | Littelfuse `0215.800MXP` | 1 | 800 mA, 250 VAC, time-lag, 1.5 kA | inlet fuse holder |
| Faston receptacles | TE `2-520184-2` | as wired | 22-18 AWG, 600 V, fully insulated, 6.35 x 0.81 mm | production crimp and pull test |
| mains harness contact / wire | Molex `43375-2001`; Alpha Wire `6715` | 6 / as needed | loose 18-20 AWG contact, insulation OD <=2.84 mm; wire 18 AWG, 600 V, 105 C, OD 1.65-1.75 mm | black/white internal harnesses; verify exact drawings |
| pigtail contact | Molex `43375-2001` | 2 | loose 18-20 AWG contact, insulation OD <=2.84 mm | verify received conductor OD; `43375-3001` not selected unless its drawing fits |
| LV housing/contact / wire | Molex `43645-0300`, `43030-0007`; Alpha Wire `6713` | 2 / 6 / as needed | 3 circuits, 20-24 AWG contact; 22 AWG, 600 V, 105 C wire | red/black/blue straight-through harness |
| PE harness wire / ring | Alpha Wire `3075` green/yellow; TE PIDG `31886` | as needed | 18 AWG, 600 V, 105 C; #8/M4 ring | inlet and filter to PE star |
| pigtail PE ring | TE PIDG `320551` | 1 | #8/M4, 22-16 AWG, OD 2.03-3.18 mm | verify received conductor OD |
| output cord | Americord `1112.048.005350` | 1 | 4 ft 18/3 SJTOW, molded NEMA 5-15R, 10 A/125 V | check stock and received OD |
| output gland | Heyco `M3231` | 1 | 1/2 NPT, 4.3-11.4 mm cord | 22.2 mm clearance hole |
| enclosure | Hammond `1554V2GY` | 1 | 239 x 160 x 89 mm, solid gray PC, UL94 5VA | rating no longer assumed after cutouts |

## Pre-fabrication and final-unit gates

Before PCB release:

1. Import each manufacturer drawing, compare every pad number and dimension, and
   run tscircuit source, render and parity checks plus KiCad ERC/DRC under the
   project PCB workflow.
2. Review the routed creepage and clearance, slots, protective-earth harness,
   terminal covers, wire bend radii, inlet/gland cutouts, partition and lid
   closure from the actual mechanical model.
3. Confirm authorized stock for the filter, Faston terminals, inlet, input cord
   and output pigtail. Verify the received pigtail jacket and conductor diameters
   against the selected gland and contacts before releasing the harness drawing.
4. Reconcile the controller's final peak current against the 850 mA `V5_PSU`
   allocation and IRM temperature derating. Recalculate if USB behavior or radio
   load changes.
5. Have a qualified mains design reviewer determine the applicable product
   standard and verify the insulation, earthing, fuse, surge and enclosure design
   against it. Component recognitions do not approve the assembled controller.

On the assembled, final-use unit only:

1. With appropriate isolated instrumentation and qualified supervision, measure
   pump running current, power factor, start-current waveform and start duration
   at representative high and low line.
2. Repeat cold starts and relay cycles to verify fuse survival, clean starts and
   contact behavior. Record failures rather than increasing the fuse by default.
3. Measure `COIL_DRAIN` turn-off overshoot, relay dropout, pump contact voltage and
   ringing. Retune the RC only if the waveform or conducted-emissions result
   requires it.
4. Verify PE continuity, line/neutral polarity, insulation, touch protection,
   strain relief, drip routing and no conductor damage after the pull test.
5. Measure closed-enclosure temperature during worst controller activity and
   continuous relay operation. Verify IRM output ripple and minimum voltage at
   the controller during radio and relay transients.
6. Check GFCI operation and unintended leakage in the actual installation, then
   perform the project's normal dry and wet commissioning. Do not infer these
   results from the filter's component leakage specification.

The main unresolved risks are the unpublished pump start/load impedance, received
pigtail dimensions, final controller transient consumption, installed filter
attenuation, and the applicable assembled-product safety test requirements. None
requires a separate prototype PCB, but all must be closed by design review,
procurement evidence or measurements on the one final assembly.
