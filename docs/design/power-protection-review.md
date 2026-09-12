# Secondary power protection

Status: selected circuit for capture review, 2026-09-12. Exact parts and networks
are recorded; rendered lands and transient/thermal review remain before schematic release.
No physical result or fabrication approval is implied.

The coil-only TPS7A24 proposal is not preferred: its lower regulated setting
does not establish hot pickup, and its higher setting operates in dropout at the
minimum PSU voltage. The TPS259630 cutoff was then examined but rejected for a
direct downstream connection: its OUT limit depends on IN and it lacks reverse
blocking. Stored output energy during input collapse needs a separate path.
Do not treat the flyback diode as a supply overvoltage protector.
[TPS7A24](https://www.ti.com/lit/ds/symlink/tps7a24.pdf),
[TPS2596 absolute/recommended OUT limits](https://www.ti.com/lit/ds/symlink/tps2596.pdf).

Use **IRM-10-5**, 5 V / 2 A, replacing IRM-05-5 with the same body and four-pin
geometry. Retain the 850 mA system allocation. Its rating exceeds the entire
chosen secondary current-limit band, as TI requires. Module overload is separately
specified at 115-190% of 2 A. The [mains basis](mains-design-basis.md#irm-10-5-footprint)
records the visually checked geometry and native pin mapping.
[Mean Well specification](https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf).

Use **TPS259470ARPWR**, with true reverse blocking, ahead of both secondary
branches. It accepts 2.7-23 V and specifies 45 milliohms maximum over temperature
at its 3 A test point. At 850 mA, use 38.25 mV in the loss model. The RPW0010A
HotRod package is 2 x 2 mm with ten unusual lands. The TI 4225183/A land and
stencil drawings were visually inspected: long pads 5/6 are IN/OUT, not an
exposed ground pad. Capture must reproduce them and use stencil/reflow assembly.
Do not substitute a generic QFN-10.
[TPS25947 Rev C, May 2026](https://www.ti.com/lit/ds/symlink/tps25947.pdf).

## Capture connections

IRM +V becomes **V5_RAW**; the eFuse output retains **V5_PSU**, feeding both
coil and controller J5.1. The flyback cathode and controller PSU_GOOD supervisor
also use protected V5_PSU. GND_ISO and COIL_DRAIN retain J5.2/J5.3. Preserve the
three-position harness; no new GPIO or status wire is required. Service power
still feeds logic only through its separate OR diode.

| Pin | Connection | Network |
| ---: | --- | --- |
| 1 EN/UVLO | `EFUSE_UV` | 26.1 kohm to V5_RAW, 10.0 kohm to GND_ISO |
| 2 OVLO | `EFUSE_OV` | 38.3 kohm to V5_RAW, 10.0 kohm to GND_ISO |
| 3 AUXOFF | Unconnected | Optional unpopulated measurement pad; no pullup |
| 4 FLT | Unconnected | Optional unpopulated measurement pad; no pullup |
| 5 IN | `V5_RAW` | C2 1 uF / 25 V X7R and C3 100 nF / 50 V at pin |
| 6 OUT | `V5_PSU` | C4 22 uF / 25 V X7R bulk, D2 clamp and R7 bleeder |
| 7 dVdt | `EFUSE_DVDT` | C5 4.7 nF / 50 V C0G, 5%, to GND_ISO |
| 8 GND | `GND_ISO` | Short local ground return |
| 9 ILM | `EFUSE_ILM` | 2.87 kohm to GND_ISO |
| 10 ITIMER | Unconnected | No intentional overcurrent blanking capacitor |

All five threshold/current resistors are Panasonic ERA-3A, 0.1%, 25 ppm/C,
0603, 0.1 W. Exact ordering codes, also in the BOM:

- UV top: [ERA3AEB2612V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB2612V).
- OV top: [ERA3AEB3832V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB3832V).
- Both divider bottoms: [ERA3AEB103V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB103V).
- ILM: [ERA3AEB2871V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB2871V).
- Ramp capacitor: [TDK C1608C0G1H472J080AA](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C1608C0G1H472J080AA), 4.7 nF, 50 V, C0G, 5%, 0603.

Complete passive references on the mains PCB are R2 UV top, R3 UV bottom,
R4 OV top, R5 OV bottom, R6 ILM, R7 bleeder, C2/C3 input bypass, C4 output
bulk and C5 ramp. R1/C1 remain the mains snubber. Every part has an independent
BOM quantity; the five controller bulk capacitors do not include mains C4.

| Ref | Exact part | Value / connection and placement |
| --- | --- | --- |
| C2 | [TDK C2012X7R1E105K125AB](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X7R1E105K125AB) | 1 uF, 25 V, X7R, 10%, 0805; V5_RAW to GND_ISO at U2.5/8 |
| C3 | [TDK C1608X7R1H104K080AA](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C1608X7R1H104K080AA) | 100 nF, 50 V, X7R, 10%, 0603; same nets, closest to U2.5/8 |
| C4 | Murata GRM32ER71E226ME15L | 22 uF, 25 V, X7R, 20%, 1210; V5_PSU to GND_ISO at U2.6/8; same exact part as the separately counted controller bulk |
| R7 | [Panasonic ERA6AEB222V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA6AEB222V) | 2.20 kohm, 0.1%, 25 ppm/C, 0805, 0.125 W; V5_PSU to GND_ISO |

C2's [inspected bias curve](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c2012x7r1e105k125ab.pdf)
allows a 15% bias-loss allocation at 5.363 V and 20% at 6.75 V. With 10%
initial tolerance, 15% temperature and 15% aging allocations, this gives 0.5527
and 0.5202 uF respectively. These are characterized design allowances, not
production guarantees. They exceed TI's 0.1 uF input-bypass guidance. Use the
smaller effective value when calculating input ringing; do not assume nominal
1 uF is guaranteed. C4's normal effective-capacitance model is about 9.5 uF,
using the [controller's same-part derating basis](controller-design-basis.md),
well above TI's greater-than-1-uF output recommendation. Count its maximum
30.36 uF, not nominal 22 uF, against startup loading. Fault/transient capacitance
and parasitics remain part of the waveform review.

R7 draws 2.44 mA nominal at 5.3625 V; allocate 2.5 mA. The combined 0.1%
tolerance and 0.0625% temperature allowance gives at most 2203.575 ohm.
Its maximum normal dissipation is below 13.1 mW, within 0.125 W. For a constant
net leakage into this rail, equilibrium is `Ileak * 2203.575 ohm`. A hypothetical
443 uA would give 0.977 V, but **443 uA is not a specified forward off-state
leakage limit**: TI tests IOUTLKG(OVLO) with VOUT greater than VIN. That condition
does not describe a live overvoltage input and discharged output. Do not credit
the conditional estimate as a discharge guarantee.

Before accepting off-state/backfeed behavior, obtain a source-supported bound
for the actual polarity and temperature or measure it on the final unit in
PWR-05. Include eFuse leakage and service-OR backfeed together. The acceptance
target is V5_PSU below 1.0 V after cutoff with the unloaded output and with the
controller attached, for every source combination. This requires net injection
below 454 uA at the maximum resistor. Also measure the decay time and confirm
PSU_GOOD falls and cancels a pending demand; a bleeder alone does not prove the
shutdown timing. These assumptions remain open until that evidence exists. Use STPS2L40U for the output negative clamp, anode
GND_ISO and cathode V5_PSU, close to OUT. Its high-current forward voltage and
lead inductance still need comparison with the OUT negative limit. This is
separate from the relay flyback diode. Keep loops short and ground copper inside
the isolated region; no thermal copper crosses the mains barrier.

## Calculated static limits

Use `Vtrip = Vpin * (1 + Rtop/Rbottom) + Ileak * Rtop`. Independent pin thresholds
are 1.183-1.223 V rising and 1.076-1.116 V falling, with +/-0.1 uA leakage.
The corners below include 0.1% resistor tolerance plus 0.0625% temperature drift
for 0-50 C at 25 ppm/C relative to 25 C.

| Function | Nominal | Calculated band |
| --- | ---: | ---: |
| UVLO rising | 4.332 V | 4.258-4.429 V |
| UVLO falling | 3.9349 V | 3.872-4.041 V |
| OVLO rising | 5.796 V | 5.695-5.927 V |
| OVLO recovery | 5.2647 V | 5.179-5.409 V |
| Current limit, `3334 / RILM` | 1.162 A | 1.0438-1.2800 A, including +/-10% device accuracy |

The 4.6375 V normal source floor permits startup. The 5.3625 V normal ceiling
does not trigger OVLO. Recovery after overvoltage is not guaranteed at every
normal output voltage: the lowest recovery threshold is below the normal upper
envelope, so a power cycle may be needed. Firmware cannot override the cutoff.
PSU_GOOD loss cancels an old manual demand.

Minimum current limit leaves 194 mA over the 850 mA allocation; maximum limit
is below the 2 A supply rating. The existing 75 mA reserve covers the eFuse's
610 uA maximum quiescent current, divider loads and 2.5 mA bleeder allowance.
Normal loss is about 36 mW using 45 milliohms and maximum quiescent current. The resistance
application at 850 mA is a loss model, not a new guaranteed test point. Published
thermal resistances use four-layer test boards; they do not establish the
temperature on this project's final layout.

## Startup and fault behavior

The 4.7 nF ramp capacitor gives about 0.426 V/ms nominal. Scaling TI's typical
equation by its 0.81-3.82 uA dVdt current range and 5% capacitance tolerance gives
an engineering envelope of 0.149-0.774 V/ms, up to 36.2 ms to 5.3625 V. This
extrapolation is not a guaranteed ramp bound. Allocate **150 uF maximum equivalent
startup capacitance**, including local bulk, controller input and reflected
converter-output charging. The model adds at most 117 mA to the 850 mA steady
allocation, below minimum current limit. Verify actual buck startup and maximum
capacitance before accepting that model. Sensor power starts off; its later
charging is separately limited by TPS2553.

ITIMER open means fastest response, not instantaneous limiting. Current-limit
response is 400 us typical; scalable fast trip is about 2.01 times ILIM typical.
OVLO recovery bypasses dVdt and can charge the load in current limit. Persistent
faults can cause thermal shutdown and automatic retry. Review startup, shorted
output and repeated OV recovery energy against TI's transient thermal guidance
with the actual placement. The normal 36 mW loss does not describe these faults.

AUXOFF stays high for several load faults; FLT does not assert for UVLO/OVLO.
Neither is a complete rail-good signal. The controller therefore qualifies the
actual protected voltage. Stored energy takes time to decay after cutoff;
measure coil dropout and PSU_GOOD timing with service-powered logic and every
supply-removal order. Relay eligibility also requires a fresh timed request.

## Downstream limits

For the controller OR path, use two **STPS2L40U** in SMB. Its stated maximum
forward drop is 0.39 V at 1 A and 25 C. A 0.45 V allowance over 0-50 C is an engineering allocation, not a published
full-temperature guarantee. With the eFuse estimate, 50 mV wiring allowance and
that diode allocation, the logic rail floor is about **4.099 V**, preserving the
3.9 V buck budget. Verify cold/hot loss and reverse leakage on the final assembly.
[STPS2L40 electrical table](https://www.st.com/resource/en/datasheet/stps2l40.pdf).

Protected V5_PSU at the supervisor is at least 4.54925 V under this loss model,
about 60 mV above the 4.489 V maximum rising threshold. Replace the sensor's
6 V-input TPS7A20 with **LT3042IMSE#PBF**, whose guaranteed operating input extends
to 20 V. The [sensor basis](sensor-design-basis.md) owns its network and 200 ms
startup delay.

OVLO response is **1.2 us typical, with no published maximum**. A 5.927 V static
cutoff is not a guaranteed output clamp during a fast source fault. TPS2553 has
6.5 V recommended and 7 V absolute input limits; AP63203 and LT3042 tolerate
6.75 V, but TPS2553 still requires transient qualification. Do not credit a
minimum OR-diode drop. Omron's 130% coil limit applies at 23 C, not automatically
at 50 C. Bound coil voltage/time/energy and downstream pin excursions using the
source, capacitance and layout parasitics before release, then verify on the
final unit. The module's 6.75 V OVP figure is a threshold, not a maximum transient
specification. No arbitrary 5 V TVS is credited as an accurate clamp.

The TPS259472 nominal 5.7 V clamp allows 6.12 V under its stated test condition,
so it did not resolve the old sensor regulator's 6 V limit. The earlier
48.7 kohm OVLO divider would trip near 7.04 V and was rejected. The 3.32 kohm
ILM example's 850 mA lower limit had no load margin. These are reviewed
alternatives, not parts of the selected circuit.

Remaining release work: final effective-capacitance/inductance models, exact
land-pattern imports, source capture, transient/thermal review and final-unit
PWR-05 evidence. The rendered source must prove both coil and controller use
protected V5_PSU and service power has no intentional forward path back to it.
