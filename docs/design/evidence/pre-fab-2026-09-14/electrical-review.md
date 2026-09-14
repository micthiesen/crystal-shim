# Independent electrical and integration review

Reviewed 2026-09-14. Scope: the three production native boards, their critical
pin/net mappings, power architecture, cross-board interfaces, and previously
inspected routing. No native board or circuit changes were made. This review
found no additional electrical circuit blocker requiring a PCB change. It is
one review scope, not a standalone fabrication release: current full-severity
DRC, source/schematic parity, output/CAM, mechanical and order-form checks belong
to the combined release receipt.

## Inspected inputs and method

KiCad's native Python API freshly enumerated every footprint, pad number, net,
position, land size and drill from the production boards. The critical entries
below were inspected against the design bases and primary documents. Scratch
readback is `/tmp/crystal-prefab-electrical/native.json`; it can be reproduced by
loading the listed boards through `pcbnew.LoadBoard` and enumerating footprints
and pads. These hashes identify the inspected native inputs:

| Board | SHA-256 |
| --- | --- |
| controller | `69c4d25b8127714f53fdf4ea083773830b7892a06b504e735f891ae1d443e750` |
| sensor | `1b94e98e3c224908d4005c001344469bcc459e7d74653f8752529c217476ff45` |
| mains | `81febb900335cac1f11ac71229623fad672641d952d74bb261275805ade6f26e` |

Reviewed the PCB/manufacture skill scopes, manufacturing output profile,
controller/mains/sensor design bases, refill interface and sensor power
refinement. Earlier session native copper renders and track/zone readbacks
supplied the detailed regulator/decoupling review; current pad/net readback does
not substitute for fresh release DRC or prove unchanged routing by itself.

## Mains and inter-board power

Native mains J1.1 supplies U1 AC/L and F3; F3's other terminal reaches J2.1 filter
LINE. J1.2/U1 AC/N/J2.2 are common AC_N. Filter LOAD enters J3; J3.1 reaches relay
K1 contact 3, contact 4 reaches J4.1, and J3.2 reaches J4.2. Thus the relay switches
filtered hot, not neutral. Filter LINE and LOAD neutral remain distinct board
nets. PE is absent from this PCB and must retain the independent continuous
protective-earth harness specified in the electrical documentation.

Native IRM-45 pads retain the recorded component-side transform: AC pins at
(58.3,57)/(58.3,63.75), DC pins at (134.3,92.75)/(134.3,98.25), 1.5 mm AC drills
and 2.5 mm DC drills. These match the project's manufacturer-drawing capture;
this review did not independently remeasure every package dimension. The
[Mean Well specification](https://www.meanwell.com/Upload/PDF/IRM-45/IRM-45-SPEC.PDF)
confirms 12 V, 3.8 A/45.6 W, overload hiccup and substantial cold-start inrush.

K1 native coil pins are 1/5; normally-open contacts are 3/4. Their recorded
23.5 mm offset, 7.5 mm row spacing and 3.5 mm contact stagger are retained.
D1 cathode is V5_PSU and anode is COIL_DRAIN. This is consistent with the selected
[Omron G5RL](https://omronfs.omron.com/en_US/ecb/products/pdf/en-g5rl.pdf) variant
and the existing pin/footprint capture. Contact welding remains undetected.

Mains J5 and controller J1 agree pin-for-pin: 1=5 V, 2=isolated return,
3=coil drain. Mains J6 and controller J6 agree: 1=fused 12 V, 2=return.
Controller D1/D2 cathodes share V5_LOGIC; their anodes go separately to PSU and
service inputs. USB_VBUS has no native power connection to those rails.
Service power therefore has no intended forward path into the relay coil rail
or motor supply. Confirm leakage and actual harness wiring during assembly.

The documented conservative demands recalculate to 30.3925 W with 2 A aggregate
motors and 42.9325 W with 3 A brief startup, below 45.6 W. The latter leaves only
2.6675 W allocation margin. This is a design budget, not measured startup or
thermal proof; 2 A is aggregate, not a per-port allowance. F2 is branch protection,
not an accurate current limiter. PSU inrush/fuse coordination and motor startup
remain commissioning items.

## Controller and sensor circuits

Both AP6320x native pin maps match the
[Diodes datasheet](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf):
FB senses their regulated output, EN/VIN share the appropriate input, GND is
isolated return, and SW/BST connect through the inductor/bootstrap network.
The prior copper review found compact switching/bootstrap paths, useful local
input bypassing, continuous reference ground and short ESP bypass connectivity.
No power-budget calculation establishes actual rail transient performance.

Controller U4 retains the 95.3 kohm/10 kohm PSU divider, giving nominal
0.405 × 10.53 = 4.26465 V. U6 ANDs PSU_GOOD with RELAY_REQUEST before the
relay MOSFET. The native nets preserve this hardware qualification independently
of service power. The design-basis tolerance window remains the applicable
acceptance calculation; firmware and assembled threshold tests are separate.

Controller U5 TPS2553 pin 5 ILIM is tied to pin 1 IN, and pin 6 feeds the sensor
branches. This is intentional: [TI specifies](https://www.ti.com/lit/ds/symlink/tps2553.pdf)
50/75/100 mA minimum/typical/maximum current limiting with ILIM tied to IN.
The 30 mA shared normal allocation is below the minimum. U3/U12 have separate
sensor data nets and common recovery enables; no native net accidentally joins
the two fixed-address FDC1004 buses.

Sensor U1 pin map is SHLD1, LEVEL, RL, open CIN3, open CIN4, SHLD2, GND,
3V3, SDA, SCL. Neither shield is tied to ground. This agrees with the
[FDC1004 pin map](https://www.ti.com/lit/ds/symlink/fdc1004.pdf).
Sensor U2 IN/EN share the feed, OUT is V3V3_SENSOR and pins 2/4 are grounded.
Grounding fixed-version pin 4 is explicitly permitted by
[TI TPS7A24 Table 5-1](https://www.ti.com/lit/ds/symlink/tps7a24.pdf).
D2 runs from output anode to input cathode, preserving the documented reverse
current path. Harness J1 agrees with controller J3: power/SDA/SCL on 1/2/3,
returns on 4/5/6. Use pin numbers, not an assumed view-dependent wire order.

Controller motor Q2/Q3/Q4 retain AO3400A gate/source/drain pins 1/2/3,
100 ohm gate resistors, 10 kohm pulldowns and D9/D10/D11 cathodes at 12 V,
anodes at the respective drains. The [AOS datasheet](https://www.aosmd.com/res/data_sheets/AO3400A.pdf)
specifies operation at 2.5 V gate drive and 30 V drain rating. These are compatible
with the intended 3.3 V control and clamped 12 V motors. Native motor outputs
carry positive supply on pin 1 and switched return on pin 2. Do not substitute
an arbitrary motor/startup load based only on connector or MOSFET headline ratings.

USB U8 native pins retain the MSOP FSUSB42 map, including unused HSD2 pins,
grounded SEL and active-low OE. This agrees with the
[onsemi datasheet](https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf).
This pin-map check does not qualify the newly accepted via geometry or USB
waveforms; the separate routing and stack reviews govern those.

## Remaining boundaries

No new circuit redesign is requested by this review. It does not independently
certify every passive MPN, all package dimensions, firmware safety behavior,
all-layer mains spacing or final Gerber equivalence. Those require the combined
native/source, mechanical and manufacturing evidence. Hand assembly changes the
assembly workflow, not electrical pin numbering, polarity or required parts.

Commissioning remains unrun: sensor monotonicity through 5 mm glass and adhesive,
shield/input capacitance and saturation, harness rise times, PSU/diode/regulator
thermal behavior, relay pickup/dropout and load transients, motor startup,
service-only isolation/leakage, USB attach/detach and Wi-Fi supply behavior.
These are the documented final-board operating gates, not a new prototype or
custom-supplier requirement. No order, flashing or mains energization occurred.
