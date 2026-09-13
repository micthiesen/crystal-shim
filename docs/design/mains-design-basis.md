# Mains board and enclosure design basis

Current source design, 2026-09-12: a shared 12 V supply supports the existing
skimmer interlock and the future refill interface. The extension behavior remains
outside this hardware capture; see [refill expansion](refill-expansion.md) for the
artifact reference and reserved interface. No independent extension adapter is required.

## Selected architecture

```text
IEC inlet L -> F1 T2A -> J1.1 AC_L_FUSED -> U1 IRM-45-12 AC/L
IEC inlet N ----------> J1.2 AC_N -------> U1 AC/N
AC_L_FUSED -> RV1 TMOV -> AC_N
AC_L_FUSED -> F3 T1A -> FILTER_LINE_L -> J2.1 -> filter LINE L
AC_N ---------------------------------> J2.2 -> filter LINE N
filter LOAD L -> J3.1 -> K1 contact 3
filter LOAD N -> J3.2 -> J4.2 -> pump neutral
K1 contact 4 -> J4.1 -> pump hot
J4.1 -> R1 100 ohm -> C1 47 nF X2 -> J4.2

U1 +V -> V12_RAW -> F2 3A -> J6.1 V12_MOTOR -> controller motor feed
U1 +V -> AP63205 fixed buck -> V5_PSU -> J5.1 and K1 coil 1
U1 -V -> GND_ISO -> J5.2 and J6.2
K1 coil 5 -> J5.3 COIL_DRAIN -> controller relay MOSFET
D1 cathode -> K1.1; D1 anode -> K1.5

IEC PE -> dedicated PE star -> filter case and output pigtail PE
```

The supply remains outside the skimmer EMI filter. Neutral and PE are never
switched; PE has no PCB trace or pluggable PCB dependency. K1 is normally open.
Loss of coil power opens hot but cannot cure welded contacts. No mains energizing,
purchase or fabricated-board performance is implied by source checks.

## Isolated supply and power budget

Select **Mean Well IRM-45-12**, 12 V, 3.8 A, 45.6 W. The
[manufacturer specification](https://www.meanwell.com/Upload/PDF/IRM-45/IRM-45-SPEC.PDF)
(2025-11-21) gives 85–305 VAC input, full rated output through 50 C at at least
100 VAC, typical 87.5% efficiency, 30 A cold inrush at 115 VAC and 60 A at 230 VAC.
Overload is 115–160% hiccup; OVP operates at 12.6–16.2 V. Those limits describe
the source protection, not a precisely limited accessory output.

Keep the existing **850 mA allocation at 5 V**: relay 110 mA, controller converter
635 mA, sensor supply 30 mA, reserve 75 mA. Two 10 mA sensor allocations fit that
30 mA allowance. This 4.25 W load needs 5.3125 W from 12 V at the deliberately
conservative 80% buck efficiency used for budgeting. Sensor/controller peaks and
startup charging remain inside this base allocation until measured.

| Combined demand | Conservative calculation | Share of 45.6 W |
| --- | --- | ---: |
| 2 A continuous motor allocation plus base | 12.54 V × 2 A + 5.3125 W = 30.3925 W | 66.7% |
| 3 A brief aggregate motor startup plus base | 12.54 V × 3 A + 5.3125 W = 42.9325 W | 94.2% |

The 11.46–12.54 V normal design envelope includes 2.5% total tolerance, 150 mVpp
ripple and 0.03%/C temperature drift over 0–50 C. It is a conservative arithmetic
allocation, not measured output. The 3 A startup target has limited headroom;
confirm actual selected pump pulses, no sustained aggregate overload, repeated
starts and no controller brownout on the final assembly. The 2 A allocation is
**total for all three future pump channels**, not per connector.

### IRM-45-12 footprint

The module body is 87 × 52 × 29.5 mm with general ±1 mm drawing tolerance and
195 g mass. Reserve 30.5 mm body height above its seating plane. It is larger and
heavier than the superseded IRM-10-5. The source footprint mirrors the manufacturer's
bottom view about 87 mm into component-side coordinates (+X right, +Y down):

| Source pin | Function | Component-side X,Y mm | Finished drill / copper mm |
| --- | --- | --- | --- |
| 1 | AC/N | 5.3, 11.75 | 1.5 / 3.0 |
| 2 | AC/L | 5.3, 5.0 | 1.5 / 3.0 |
| 3 | -V | 81.3, 40.75 | 2.5 / 4.5 |
| 4 | +V | 81.3, 46.25 | 2.5 / 4.5 |

Manufacturer terminals have functions rather than source pin numbers. AC leads
are 1 mm diameter, DC leads 2 mm, projection 3.5 ±1 mm. Finished drills and copper
are declared project allowances; preserve the exact source geometry on export.
The manufacturer's PDF SHA-256 is recorded in `power-components.tsx`.

## Five-volt conversion and coil interface

Use **Diodes AP63205WU-7**, fixed 5 V/2 A synchronous buck in TSOT26. Its
[manufacturer datasheet](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf)
DS41326 Rev 3-2 specifies 3.8–32 V input, cycle current limiting, hiccup short
protection, thermal shutdown and soft start. Pin 1 FB senses V5_PSU after L1;
pins 2 EN and 3 VIN use V12_RAW; pin 4 is GND; pin 5 SW drives L1; pin 6 BST
connects through C5 100 nF to SW. L1 is Bourns SRP5030TA-4R7M, 4.7 µH.
C2/C3 are Murata GRM32ER71E226ME15L, 22 µF/25 V, in parallel at the
input; C4/C6 are the same output pair. C7 is 100 nF/50 V at VIN. Retain this
ordinary capacitor population. [Analog Devices' MAXREFDES1101](https://www.analog.com/media/en/reference-design-documentation/reference-designs/maxrefdes1101.pdf)
uses this exact Murata family at 12 V and budgets 60% capacitance reduction from
DC bias. For this 12.54 V upper-normal input, use a more conservative **65% bias
loss**, then 20% initial tolerance and 15% X7R temperature loss:
`44 µF ×0.35 ×0.80 ×0.85 = 10.472 µF`. That remains above the Diodes 10 µF
input recommendation. This is a disclosed design allowance using a published
application, not a manufacturer-guaranteed minimum capacitance curve.

At 850 mA output and nominal 1.1 MHz, the bank's maximum ideal input ripple is
`I/(4 f C) = 18.5 mVpp`; maximum bank RMS current is `I/2 = 425 mA`. Keep both
parts and C7 close to VIN/GND. The output pair is the recommended 2 ×22 µF, at
lower DC bias. Retain normal final-unit ripple/transient/thermal commissioning;
no extra capacitor or protection bank is needed for source capture.

The datasheet gives 4.95–5.05 V in CCM across its specified temperature/input
range. Use **4.8–5.2 V** as the project normal-rail acceptance allocation, leaving
150 mV each way beyond the static limit for ripple and dynamics. It is not a
guaranteed PFM/transient specification. Nominal CCM calculation at 12.54 V,
4.7 µH and 1.1 MHz gives 0.58 A inductor ripple and about 1.5 mVpp ideal
capacitive output ripple with 44 µF, before ESR/bias/tolerance. Measure final
load transitions and repeated starts against the chosen envelope.

The previous TPS259470 cutoff, precision dividers, ramp parts, bleeder and clamp
are removed. Ordinary operation uses the protected converter and known 5 V coil.
There is no independent buck-failed-high disconnect. A failed-short buck could
expose the coil to 12 V; the retained flyback diode is not supply-overvoltage
protection. The AP63205 itself accepts the module's 16.2 V OVP maximum; 25 V input
capacitors retain voltage margin. The controller and sensor input ratings are
owned by their respective design bases. Existing hardware PSU_GOOD remains the
controller's coil-supply presence condition.

Keep Omron **G5RL-1A-TV8 DC5** and Vishay **1N4007-E3/54** flyback. Omron's
[terminal drawing](https://omronfs.omron.com/en_US/ecb/products/pdf/en-g5rl.pdf)
uses coil 1/5 and NO contacts 3/4; the source component-side positions are
1=(23.5,0), 5=(23.5,7.5), 3=(0,0), 4=(3.5,7.5) mm. Preserve the 3.5 mm contact
stagger and 1.3 mm finished drills. Coil pickup/dropout at enclosure temperature
and opening transients remain commissioning checks. Flyback may delay release.

J5 stays Molex **43650-0300**, mating **43645-0300**, contacts **43030-0007**:
1=V5_PSU, 2=GND_ISO, 3=COIL_DRAIN. Preserve the existing 22 AWG red/black/blue
harness. J6 uses **43045-0200**, mating **43025-0200**, contacts **43030-0007**,
1=12 V motor positive and 2=return. Use 20 AWG for that short internal 2 A feed.
Both isolated harnesses cross the enclosure partition. Label the 12 V harness at
both ends and keep it distinct from the service input during assembly and service;
this internal harness does not require a new incompatible connector family.

## Fuse, surge and relay-load suppression

F1 is **Littelfuse 0215002.MXP**, 215-series T2A, 250 VAC ceramic cartridge,
in the existing fused IEC inlet. F3 is board-mounted **0215001.MXEP**, the
same series T1A axial version, ahead of J2/filter LINE. This branch fuse preserves
a 1 A pump/filter branch without passing the larger shared PSU current through it.
The [215 datasheet](https://www.littelfuse.com/assetdocs/littelfuse_fuse_215_datasheet?assetguid=990f7193-d9a2-48e4-b760-2b43514249cf)
gives 1.5 kA interrupt rating at 250 VAC; nominal melting integrals are 11.68 A²s
for T2A and 1.52 A²s for T1A. These are not full clearing-energy guarantees or
proof of selective coordination. Repeated source inrush must not nuisance-open F1.

F3 uses a declared 30.48 mm formed-lead pitch, 1.1 mm drills and 2.5 mm copper.
The axial body is 21.5 ±1 mm long, 5.5 ±0.3 mm diameter; 0.65 ±0.05 mm leads.
Keep the body at least 1.5 mm above PCB and bends more than 1 mm from its caps.
Hand-solder after SMT, 350 ±5 C for at most 5 s. This removes a fuse-holder or
extra harness assembly, at the cost of desoldering for replacement. Mains cord
removal is required before enclosure access or fuse replacement.

F2 is **Littelfuse 0451003.MRL**, 451-series 3 A fast SMT, in the 12 V motor feed.
The [451/453 datasheet](https://www.littelfuse.com/assetdocs/fuse-451-and-453-datasheet?assetguid=533cd5cc-956c-4243-867f-6ab5a62f6ba1)
gives 125 VAC/VDC, 300 A interrupt at 32 VDC, 0.0227 Ω nominal cold resistance,
4 h minimum hold at rated current and 5 s maximum opening at twice rating.
At 2 A the nominal cold loss is 91 mW. The 2 A load is below the manufacturer's
75% continuous-current recommendation for a 3 A fuse at room temperature;
confirm its temperature derating and actual startup pulses. A fuse is not a
3 A current limiter. IRM hiccup may occur before F2 opens; base-power availability
during a motor short is not promised. Do not add a second eFuse bank.

Retain **TMOV14RP175EL2T7** across fused line/neutral at J1, with its
[existing source/installed-envelope contract](mov-capture.md). F1 carries its
surge/fault current. Retain the load-side **PR02FS0201000KA100** 100 Ω flameproof
2 W resistor and **B32921C3473K000** 47 nF/305 VAC X2 capacitor. The RC bridges
switched hot to filtered neutral and has no open-relay bypass path. The source suppression models preserve their exact part geometry and pulse basis.

## Mains harness, filter and enclosure

Keep TE/Schaffner **FN2090A-1-06** (802490-SF), rated 1 A at 40 C. Its temperature
curve must be respected above 40 C; the supply's 50 C capability is not the
filter's current rating. Keep LINE and LOAD pairs apart. The OASE CrystalSkim350
120 V/60 Hz/4 W label does not publish RMS current or motor startup current.
Commission actual current, starts and relay opening behavior; 4 W/120 V is only
unity-power-factor current, not a fuse-selection measurement.

J1/J2/J3/J4 use right-angle Molex Sabre headers **43160-1102/-1103/-1104/-1106**, respective
**44441-2002/-2003/-2004/-2006** housings and **43375-2001** contacts. Circuits 1/2
are line/neutral; higher-numbered metal blades remain intentionally unconnected.
Retain both solder tails on every blade and all occupied-metal clearance rules.
Keep the selected Schurter inlet/cord, insulated TE 2-520184-2 Faston terminals,
Americord 1112.048.005350 output pigtail and Heyco M3231 gland described in the
[harness specification](../electrical.md). Do not alter the pump's original cord.

The source board is **150 × 110 mm**, two layers, nominal 1.6 mm FR4. Four 3.2 mm
mounts are 7 mm from each edge, matching the controller above at 45 mm clear
board-face spacing. See the [canonical stack](../mechanical.md). The old 135 ×75 mm screen and Hammond1554V2GY
arrangement are superseded; they are not evidence that the new shared-supply
assembly fits. Use the revised enclosure allocation and preserve the mains/SELV
partition, 8 mm primary-to-isolated and 3.2 mm different-primary-net clearance
requirements. Complete mated connector occupancy, mounting metal, wire bend access,
all-layer routed clearances and final temperature still need native/assembly review.

## Capture and acceptance

Source capture contains 22 electrical parts, 60 logical pins, 75 numbered lands
(53 PTH, 22 SMT), 14 named nets, 53 connected endpoints, seven deliberate NCs,
and six NPTHs. See [placement](mains-placement.md),
[thermal/stencil](mains-thermal-stencil.md) and [native handoff](mains-native-handoff.md).
The source and in-memory converter checks do not establish a routed clearance,
clean native ERC/DRC, fuse coordination or assembled thermal performance.
