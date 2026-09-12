# Isolated controller service input

Status: connected controller section captured, 2026-09-12. This closes the
adapter choice, harness construction and service protection connections. It does
not approve the complete controller, assert measured transient performance, or
authorize purchasing or energizing hardware. The [controller basis](controller-design-basis.md)
owns the USB and relay interlocks; the [power review](power-protection-review.md)
owns the separate mains-board eFuse.

## Adapter and harness

Use **Mean Well GST18U05-P1J**, an isolated Class II, US two-pin wall adapter,
5 V / 3 A / 15 W. Use its factory center-positive 5.5 mm OD / 2.1 mm ID,
11 +/-0.5 mm P1J plug and intact 16 AWG, 1200 +/-50 mm output lead. The adapter
stays outside the electronics enclosure at **0-50 C**, noncondensing. Its body
is 79 x 54 x 33 mm; reserve wall-outlet and cord-bend clearance separately from
the controller enclosure. The factory 16 AWG lead must not be crimped into
43030-0007 terminals, which accept 20-24 AWG.

Mean Well specifies 85-264 VAC, 47-63 Hz, input-output withstand of **4242 VDC**,
and maximum leakage current 0.25 mA at 240 VAC. The adapter is Class II with
UL62368-1 and CSA C22.2 No.62368-1 approvals.
Input current is listed as 0.5 A at 115 VAC; cold-start inrush is at most
35 A at 115 VAC and 65 A at 230 VAC. This external supply
does not pass through the mains-board branch fuse or change its selection.
It introduces no PE connection. Connecting USB still joins the existing USB
ground; adapter isolation does not make that interface galvanically isolated.
[GST18U specification, 2026-04-03, pp. 1-4](https://www.meanwell.com/Upload/PDF/GST18U/GST18U-SPEC.PDF).

GST18U05-P1J supersedes GSM18U05-P1J. The earlier adapter's calculated normal
upper envelope, 5.3475 V, overlapped its own 5.25 V minimum OVP threshold.
Mean Well does not publish a correlation that excludes that combination.
This was a gap in the independent-corner screen, not an observed adapter fault.
GST18U's minimum OVP threshold is 5.5 V, **132.5 mV above** its calculated
5.3675 V normal ceiling. The replacement keeps the same plug, factory cable
gauge/length and body dimensions. Its higher ripple allowance requires the
shorter pigtail and revised loss budget below.
[Superseded GSM18U specification, p. 2](https://www.meanwell.com/Upload/PDF/GSM18U/GSM18U-SPEC.PDF).

Build one removable adapter harness with the following parts. Quantities are
per controller/service kit, not three copies of each accessory.

| Quantity | Exact item | Connection or construction |
| ---: | --- | --- |
| 1 | Mean Well GST18U05-P1J | Wall adapter, intact factory output cable |
| 1 | Tensility 10-02248 | Molded 5.5/2.1 mm female barrel pigtail; shorten its 915 mm cable to **100 mm maximum from jack opening to finished crimp ends**, including the molded body |
| 1 | Molex 43025-0200 | Existing two-position service cable housing |
| 2 | Molex 43030-0007 | Existing tin female contacts, one freshly stripped 24 AWG conductor in each |
| 1, already counted | Molex 43045-0200 | Existing controller PCB service header; do not add another header |

Tensility's drawing connects **red to barrel center** and **black to sleeve**.
Terminate red in housing circuit 1, `V5_SERVICE_RAW`, and black in circuit 2,
`GND`. Use the manufacturer cavity numbering, not a left/right view inferred
from the cable side. Remove the factory solder-tinned ends when shortening;
crimp fresh strands. Do not put solder-tinned ends into the crimp barrels.
The cable has two individually insulated conductors, not a shield used as return.
Its 30-00692 wire is 24 AWG, 11 x 0.16 mm tinned copper, with 1.2 +/-0.10 mm
conductor insulation diameter, below the contact's 1.85 mm maximum. Its outer
jacket is 4.0 +/-0.20 mm. Keep at least the listed 24 mm bend radius and provide
strain relief at the service cover so a pull does not load the PCB header.
The molded jack is approximately 40 x 11.4 mm; its exposed mating metal must
remain inside the insulated coupling. This is a detachable service pigtail,
not an added fourth PCB or a mains-panel penetration.
[Tensility assembly drawing, p. 1](https://tensility.s3.us-west-2.amazonaws.com/imports/product_spec_sheets/10-02248.pdf),
[wire drawing A1, p. 1](https://tensility.s3.us-west-2.amazonaws.com/imports/product_spec_sheets/30-00692.pdf),
[Molex contact specification](https://www.molex.com/en-us/products/part-detail/43030-0007).

The pigtail is rated 4.5 A / 48 V; the bare 50-00025 jack is rated 7 A.
Its initial contact resistance is at most 30 milliohms per contact. Budget
60 milliohms for the two barrel contacts, 20 milliohms for the two Micro-Fit
mating contacts, and 10 milliohms for two crimps. Wire resistance is at most
94.2 ohm/km at 20 C. Conservatively count the whole 100 mm as wire and allow
12% copper-resistance increase to 50 C:
`Rwire = 2 * 0.100 * 0.0942 * 1.12 = 0.0211008 ohm`.
The initial loop model is **0.1111008 ohm**, or **82.22 mV at 740 mA**.
Allocate **90 mV total service-harness drop**, measured from the adapter plug
contacts through the mated controller header, including crimps and board entry.
[Tensility jack drawing, pp. 1-2](https://tensility.s3.us-west-2.amazonaws.com/imports/product_spec_sheets/50-00025.pdf),
[Molex PS-43045 Rev R, p. 12](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/productspecificationpdf/430/43045/PS-43045-001.pdf).

This initial-resistance calculation is not a lifetime guarantee: the jack permits
up to 100 milliohms after some environmental/durability tests, and Micro-Fit
allows a 20 milliohm increase after its 30-cycle durability test. Verify the
90 mV functional limit across the intended service temperature/use conditions;
replace a damaged or excessive-drop harness. Check actual plug insertion,
retention, polarity, terminal seating and no shorts on the final assembly.
The [manufacturer catalog page](https://www.tensility.com/products/10-02248)
provides ordering/distribution channels; stock must be checked when ordering.

## Service protection circuit

Use a **second TPS259470ARPWR** on the controller before its existing service
OR diode:

```text
GST18U05-P1J -> barrel/Micro-Fit harness -> V5_SERVICE_RAW
V5_SERVICE_RAW -> TPS259470 IN
TPS259470 OUT -> V5_SERVICE -> existing STPS2L40U anode
existing STPS2L40U cathode -> V5_LOGIC -> buck and sensor feed
```

There is no intentional forward path from this output to `V5_PSU`, the coil,
`PSU_GOOD` sense, or USB VBUS. The existing PSU OR diode remains between
`V5_PSU` and `V5_LOGIC`. Service power supports logic and sensor work with mains
disconnected; service-only operation must leave PSU_GOOD low. Keep the service
connector and USB behind the low-voltage cover.

The [source section](../../pcb/controller/design/service-input.tsx) reserves J2,
U10, D5/D6, R30-R37 and C20-C23 for the complete controller. Placement is still
provisional. All ground connections are controller isolated `GND`.

| Source reference | Function |
| --- | --- |
| J2 / U10 | Service connector / TPS259470 |
| D5 / D6 | RAW bidirectional TVS / output negative clamp |
| R30 / R31 / R32 | UV top / bottom / control-pin series |
| R33 / R34 / R35 | OV top / bottom / control-pin series |
| R36 / R37 | Current limit / output bleeder |
| C20 / C21 | IN 1 uF / 100 nF |
| C22 / C23 | OUT 22 uF / dVdt 4.7 nF |

D2 remains the separate service OR diode in the logic-power section. Native
readback of the disposable initial service export matches all 16 components,
37 connected pins, 40 numbered PCB pads and three intentional NC pins. These
checks establish connectivity, not transient performance or manufacturing release.

| TPS259470 pin | Connection |
| ---: | --- |
| 1 EN/UVLO | UV divider midpoint through **470 kohm** series resistor; divider itself is 26.1 kohm to RAW, 10.0 kohm to GND |
| 2 OVLO | OV divider midpoint through **470 kohm** series resistor; divider itself is 38.3 kohm to RAW, 10.0 kohm to GND |
| 3 AUXOFF | Unconnected; no pullup or new MCU signal |
| 4 FLT | Unconnected; no pullup or new MCU signal |
| 5 IN | V5_SERVICE_RAW, with local 1 uF and 100 nF bypass |
| 6 OUT | V5_SERVICE, with local 22 uF bulk, 2.2 kohm bleeder and output negative clamp |
| 7 dVdt | 4.7 nF C0G to GND |
| 8 GND | Short local ground return |
| 9 ILM | 2.87 kohm to GND |
| 10 ITIMER | Unconnected, no intentional overcurrent blanking capacitor |

Do not connect the divider midpoints directly to pins 1/2. TI requires less
than 10 uA into input-derived control pins during reversed input. The added
470 kohm resistors satisfy that requirement without changing the unloaded
nominal ratios. They also increase leakage error and input-filter delay; use
the service-specific threshold table below, not the mains eFuse table.
[TI TPS25947 Rev C, pp. 5-7, 60-62](https://www.ti.com/lit/ds/symlink/tps25947.pdf).

| Added quantity | Exact part | Use |
| ---: | --- | --- |
| 1 | TPS259470ARPWR | True reverse-current blocking, current-limiting, automatic-retry eFuse; RPW0010A |
| 1 | ERA3AEB2612V | UV divider top, 26.1 kohm |
| 1 | ERA3AEB3832V | OV divider top, 38.3 kohm |
| 2 | ERA3AEB103V | Divider bottoms, 10.0 kohm |
| 2 | ERA6AEB474V | Control-pin series resistors, 470 kohm, 0805, 0.125 W, 0.1%, 25 ppm/C |
| 1 | ERA3AEB2871V | ILM, 2.87 kohm |
| 1 | ERA6AEB222V | Output bleeder, 2.2 kohm, 0805, 0.125 W |
| 1 | C2012X7R1E105K125AB | IN bypass, 1 uF / 25 V, X7R, 10%, 0805 |
| 1 | C1608X7R1H104K080AA | IN bypass, 100 nF / 50 V, X7R, 10%, 0603 |
| 1 | GRM32ER71E226ME15L | Local OUT bulk, 22 uF / 25 V, X7R, 20%, 1210 |
| 1 | C1608C0G1H472J080AA | dVdt, 4.7 nF / 50 V, C0G, 5%, 0603 |
| 1 | STPS2L40U | OUT negative clamp, anode GND, cathode V5_SERVICE; separate from existing OR diode |
| 1 | Littelfuse SMBJ8.0CA | Bidirectional TVS from RAW to GND, immediately behind connector |

ERA-3A divider/ILM parts are 0603, 0.1 W, 0.1%, 25 ppm/C. Existing exact-part
sources and capacitor allowances are in the [power review](power-protection-review.md).
The new [ERA6AEB474V manufacturer entry](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA6AEB474V)
confirms its value/package/rating. Use Panasonic's 0805 land recommendation
and the component-source audit, not a guessed oversized hand-solder pad.
The 22 uF part is additional local service bulk, not one of the controller buck's
already counted capacitors. Its maximum 30.36 uF counts against startup loading.

SMBJ8.0CA is a two-terminal, nonpolar DO-214AA device, 8 V standoff,
8.89-9.83 V breakdown at 1 mA and 13.6 V maximum clamp at 44.2 A,
10/1000 us, 25 C. Its bidirectional leakage allowance is 100 uA at 8 V.
It addresses input-cable ringing, not a precise 5 V rail ceiling. A static
7.0 V adapter fault is below its standoff, so it must not absorb that fault
continuously. Use the manufacturer's p. 5 land drawing; native `Diode_SMD:D_SMB`
is only an audit candidate. Thermal pulse derating and actual parasitics still
apply. [Littelfuse SMBJ series, 2025-07-04, pp. 1-2, 4-6](https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e).

## Calculated operating envelope

At the adapter plug, use `5 V +/-0.25 V +/-0.080 V +/-0.0375 V`, giving
**4.6325-5.3675 V**. This conservatively uses the entire 80 mV peak-to-peak
ripple allowance and 25 C maximum temperature offset at 0.03%/C. The 5%
tolerance already includes setup, line and load regulation; do not add them
again. The fixed factory cable is included because Mean Well defines the output
at the plug. Its ripple test uses 0.1 uF plus 47 uF at a 12-inch twisted pair;
verify actual ripple with this circuit's effective capacitance. The temperature
coefficient is specified over 0-50 C, which sets the service adapter's allowed
ambient range. The adapter derating graph gives full output through 50 C.
Load regulation is measured from 10% to 100% rated load, or 0.3-3 A. Although
the stated current range starts at zero, that does not establish this voltage
envelope below 0.3 A. Its use at cold start and light-load/idle operation is an
extrapolation requiring a manufacturer no-load bound or final-unit measurements.

Allocate **740 mA** service current: 635 mA buck input, 30 mA sensor and
75 mA reserve. The reserve includes this eFuse's quiescent/divider/bleeder load
and TVS leakage. The coil's 110 mA allocation is absent. With the reviewed
45 milliohm eFuse loss model, 90 mV harness allocation and 0.45 V OR-diode
allocation, `V5_LOGIC >= 4.6325 - 0.090 - 0.740*0.045 - 0.450 = 4.0592 V`.
This preserves the controller's 3.9 V buck budget. TPS2553DBVR's 135 milliohm
maximum adds at most 4.05 mV at 30 mA; with 50 mV sensor-harness allowance,
the LT3042 input is **at least 4.00515 V under this engineering model**, only
5.15 mV above its 4.0 V design-input basis. This is not a guaranteed rail floor:
OR-diode temperature loss and harness loss are engineering allocations.
The modeled regulator headroom beyond 3.384 V output and 0.300 V dropout is
0.32115 V; the 5.15 mV figure is margin to the 4.0 V allocation, not the
regulator's remaining dropout margin.
[TPS2553 Rev F, p. 7](https://www.ti.com/lit/ds/symlink/tps2553.pdf),
[LT3042 headroom calculation](sensor-design-basis.md#passives-and-power-nets).

For each service sense input calculate
`Vtrip = Vpin*(1 + Rt/Rb) + Ileak*(Rt + Rs*(1 + Rt/Rb))`, where Rs is
470 kohm. Enumerate independent resistor corners of +/-0.1625%
(0.1% tolerance plus 25 ppm/C over 25 C), pin leakage +/-0.1 uA, rising
threshold 1.183-1.223 V and falling threshold 1.076-1.116 V:

| Function | Nominal | Calculated service band |
| --- | ---: | ---: |
| UV rising | 4.332 V | 4.0884-4.5984 V |
| UV falling | 3.9349 V | 3.7030-4.2113 V |
| OV rising | 5.796 V | 5.4685-6.1542 V |
| OV recovery | 5.2647 V | 4.9530-5.6360 V |
| Current limit, 3334 / 2870 | 1.162 A | 1.0438-1.2800 A, including device +/-10% |

Extrapolating the loaded voltage envelope to initially unloaded RAW gives only
**34 mV** above maximum UV startup. This is not a verified startup margin:
the disabled eFuse presents less than the adapter's 0.3 A load-regulation test
minimum. Require a published no-load bound or measured reliable startup before
relying on it. Downstream charging starts only after enable; within the reviewed
loaded envelope, the lower falling threshold maintains the running state at the
RAW floor of 4.5425 V. Do not attach an uncounted pre-eFuse load. The calculated
upper input is about 101 mV below minimum OV trip within that same envelope.
Normal output does not always fall below the lowest OV recovery threshold;
recovery may require a service-adapter power cycle.

For reverse input, conservatively clamp the control pin to 0 V and calculate
`Ipin = (abs(VIN)*Rb/(Rt+Rb)) / (Rs + Rt||Rb)`. At -15 V, including resistor
corners, UV pin current is below **8.742 uA**, OV below **6.526 uA**. Both are
below TI's 10 uA requirement. The IN rating itself is limited by
`max(-15 V, VOUT-21 V)` over the full device temperature range. This calculation
does not authorize arbitrary negative supplies or input-edge slew rates.

The 4.7 nF ramp gives the power review's approximate 0.149-0.774 V/ms envelope,
at most about 36 ms at normal input, not a guaranteed timing limit. Maintain
**150 uF maximum equivalent startup capacitance**, including the extra local
bulk and reflected buck-output charging. Estimated inrush is at most 117 mA;
740 + 117 = **857 mA**, below minimum eFuse current limit. Sensor feed starts
disabled and charges later through TPS2553. The adapter's 3 A rating exceeds
maximum eFuse limit. Listed adapter setup time is 1500 ms at 115 VAC, followed
by 30 ms rise at full load; this delay precedes controller boot and the sensor's
separate 200 ms settling allowance.

## Failure behavior and release evidence

ITIMER open selects fastest current-limit response, not instantaneous cutoff;
TI gives 400 us typical and approximately 2.01 times ILIM for fast trip.
OV recovery bypasses dVdt and may recharge in current limit. Persistent output
faults can cause thermal shutdown and automatic retry. Normal eFuse dissipation
is approximately 28 mW. At maximum normal input and current limit, a shorted
output dissipates approximately 6.9 W until thermal shutdown; the initial peak
before current limiting can be higher. Review repeated-retry energy and temperature
with actual copper, not the normal-loss number. AUXOFF/FLT are not complete
rail-good indications.

The adapter's overload threshold is 110-150% of rated output power, with hiccup
and automatic recovery. Its OVP threshold is **110-140% of rated output voltage,
or 5.5-7.0 V**. Mean Well describes OVP as a zener clamp/output short;
it does not specify latch-off or guarantee recovery after an overvoltage fault.
This differs from the superseded GSM18U shutdown mode. The threshold is not
an output transient bound. The service eFuse's
1.2 us typical OVLO response has no published maximum, and the added sense
resistance introduces further delay through pin/board capacitance. A 6.1542 V
static trip does **not** guarantee a safe TPS2553 input during a fast fault.
TPS2553 permits 6.5 V recommended and 7 V absolute input; LT3042 permits 20 V
operating input. Do not credit any minimum OR-diode voltage drop or the 8 V
input TVS as protection of TPS2553's limit.

Before schematic release, review the actual source step, input slew limits,
control-pin RC, minimum effective bulk and cable/PCB inductance against all
pin limits. Then include these cases in final-unit PWR-05 evidence:

- Cold start and light-load/idle operation below 0.3 A, including eFuse disabled
  and both source-connection orders. Measure RAW against the service UV/OV bands
  over the allowed adapter line/temperature range. Until a no-load specification
  or these measurements exist, startup and light-load voltage remain unverified.
- Hot insertion/removal, overload, short and repeated OV recovery at minimum/
  maximum load and temperature. Bound V5_LOGIC/TPS2553 excursions, eFuse OUT
  negative pulses and adapter/eFuse retry temperature. TI's OUT limit is -0.3 V
  continuously, or -0.8 V for pulses shorter than 1 us; the Schottky's presence
  alone does not prove this.
- Short in the raw harness or the connector/TVS before the eFuse. The eFuse
  cannot interrupt that current; adapter hiccup is the upstream protection.
  Mean Well does not publish short-circuit peak current or I-squared-t energy.
  Its overload percentage is not such a bound. The 4.5 A harness rating and
  adapter nameplate alone therefore do not close this fault's thermal evidence.
- Correct polarity, retained plug engagement and the 90 mV harness-loss limit.
  Source removal, both supply orders, service-only operation and USB-only
  operation must retain the controller basis's coil-off behavior.
- Off-state discharge and reverse leakage for both sources. The local 2.2 kohm
  bleeder draws at most about 2.5 mA and dissipates under 13.2 mW normally.
  TI's conditional reverse-polarity leakage test does not establish forward
  off-state injection with live overvoltage input. Reuse the power review's
  explicit leakage/discharge acceptance method; do not infer zero backfeed.

Use the reviewed RPW0010A copper pattern and stencil/reflow process. Pads 5/6
are the long IN/OUT lands, not an exposed ground pad. Keep TVS/bypass/eFuse and
output-clamp loops short; separate high-current copper from both sense nodes.
Final land adoption, enclosure strain relief, the stated transient model and
physical fault evidence remain open. Complete schematic capture can use this
pin/part table while those specific release checks are completed.

## Source snapshots

Primary PDFs downloaded on 2026-09-12; hashes allow source-capture comparison.
The source links above remain the authoritative retrieval locations.

| PDF | SHA-256 |
| --- | --- |
| GST18U-SPEC, 2026-04-03, selected | `ba8c84892764face87650d6ca07f7d1a91250d4f917a56d581ca5b978f099e56` |
| GSM18U-SPEC, 2026-04-03, superseded | `8d0e6f533d5202241905a7f3cbfcc628ec97e76ac49760695e8b47a3bb12b088` |
| Tensility 10-02248, drawing A | `4384a38aadebf5115ad45401ec15fd56fafb6976d64bec40946faefb267f3dc3` |
| Tensility 50-00025, drawing A4 | `f6150e58c50ef52cde59d052eab5b453d0695eb9bb29496e6eed50b6c34dd533` |
| Tensility 30-00692, drawing A1 | `941669a0f92bd97c35550a4ae360d30cb08db76565fb9bc9895984f0924dc475` |
