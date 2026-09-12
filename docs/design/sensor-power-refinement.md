# Sensor cable power refinement

Status: selected capture basis after independent review, 2026-09-12. This is the
power-line refinement of the [cable ESD design](sensor-cable-protection.md).
The complete boards are not captured or released, and all physical tests remain
unrun. Preserve the 30 mA normal allocation, 50..100 mA current limit, 2 s off,
200 ms startup and three recovery attempts/minute. The revised complete sensor
input capacitance budget is 30 uF; the former 20 uF input budget and 4.0 V sensor
input allocation are superseded. The 3V3_SENSOR budget remains 20 uF.

## Exact circuit

```text
V5_LOGIC -- TPS2553DBVR IN(1), ILIM(5)
             GND(2), EN(3), FAULT(4) unchanged
             OUT(6) = V5_SENSOR_SW
                 |
                 +-- existing 1 uF C2012X7R1E105K125AB -- GND
                 +-- NEW 10 uF C3216X7R1E106K160AB ------ GND
                 +-- existing 10k bleeder --------------- GND
                 |
                 +-- NEW 6.8 ohm CRCW25126R80FKEGHP -- V5_SENSOR
                                                        |
                                               controller SMBJ7.0A
                                          cathode to rail, anode GND
                                                        |
                                         connector/cable <=203.2 mm
                                                        |
                                          sensor SMBJ7.0A, same polarity
                                                        |
                                             LT3042 IN(1/2), EN(3)
                                                        +-- existing 10 uF CIN -- GND
                                                        +-- 1N4148W anode
                                                             cathode -- LDO_PGFB -- PGFB(6)
                                                        +-- NEW 10k bleeder -- GND
```

The existing controller bleeder belongs on **V5_SENSOR_SW**, at the local capacitors. Add **Panasonic ERA3AEB103V** on sensor-board V5_SENSOR. This gives each board a discharge path when either connector is unplugged. The series resistor is between the TVS tap and protected local capacitors, as encountered by incoming ESD. Neither SMBJ moves to the protected side of the resistor. The sensor end needs no second power resistor. LT3042 IN/EN have +/-22 V absolute limits and CIN is a nonpolar 25 V ceramic. **PGFB does not have those negative ratings**: replace its former direct IN tie with the diode below. The stated +12/-3.5 V TVS test levels fit IN/EN stress limits with that PGFB correction; actual IEC overshoot remains a system measurement at the daughterboard too.

TPS2553 already provides a bidirectional channel while on; the added bulk increases the charge that can return through it. No rail-steering diode or independent sensor supply is introduced. The PGFB diode is confined to the daughterboard regulator control pin. TPS2553 reverse shutoff remains a 3..7 ms VOUT>VIN response at the specified test condition and is **not credited** for ESD or below-ground protection. The finite-charge/source-order assessment below replaces any implication of zero backfeed.

| Addition / change | Quantity | Exact selection and role |
| --- | ---: | --- |
| Series power resistor | 1 controller | Vishay **CRCW25126R80FKEGHP**, 6.8 ohm, 1%, 100 ppm/K, pulse-proof 2512, 1.5 W P70; resistor has no polarity |
| Additional local bulk | 1 controller | TDK **C3216X7R1E106K160AB**, 10 uF, 10%, 25 V, X7R, 1206; parallel with the retained 1 uF at TPS2553 OUT |
| Daughterboard input bleeder | 1 sensor | Panasonic **ERA3AEB103V**, 10k, 0.1%, 25 ppm/K, 0.1 W, 0603; use a conservative 1% resistance envelope in the following discharge/load calculations |
| PGFB reverse isolation | 1 sensor | Diodes Incorporated **1N4148W-7-F**, leaded SOD-123; anode V5_SENSOR, cathode new LDO_PGFB net at LT3042 pin 6 |
| Rail naming / budget | n/a | TPS2553 OUT becomes V5_SENSOR_SW; resistor cable side remains V5_SENSOR. Both names together have a 30 uF maximum budget. 3V3_SENSOR stays at 20 uF. |

## LT3042 PGFB correction and stable capture map

**Add 1N4148W-7-F; retain the current TPS2553 feed.** ADI LT3042 Rev C p2/p5 limits PGFB to -0.3..22 V, while IN and EN/UV tolerate +/-22 V. A direct PGFB-to-IN connection would expose an unprotected substrate diode to the proposed -3.5 V cable-side residual. ADI p12 explicitly specifies a 1N4148 with **anode at IN and cathode at PGFB** when power-good/fast-start are unused and reverse-input protection is needed; its p23 TA04 application draws this exact arrangement. PG remains unconnected. No series diode goes in the main 30 mA power path.

Use the following daughterboard map. `D_PGFB` is a stable proposed logical reference for source capture, subject only to the root's final reference numbering.

| Part / pin | Net | Connection |
| --- | --- | --- |
| LT3042IMSE#PBF U2 pins 1/2 IN, 3 EN/UV | V5_SENSOR | Direct cable input with its existing 10 uF bypass and new 10k bleeder |
| U2 pin 6 PGFB | **LDO_PGFB** | Diode cathode only; no direct V5_SENSOR tie |
| D_PGFB 1N4148W-7-F, adopted pad 1 K | LDO_PGFB | Banded cathode toward U2 pin 6 |
| D_PGFB, adopted pad 2 A | V5_SENSOR | Anode toward U2 IN pins 1/2 |
| U2 pin 4 PG | NC_PG | Intentionally unconnected |
| U2 pin 5 ILIM | LDO_ILIM | Existing 2.49k ERA3AEB2491V to GND |
| U2 pin 7 SET | LDO_SET | Existing 33k ERA3AEB333V and 0.47 uF to GND |
| U2 pins 8/11 | GND | Pin and exposed-pad ground |
| U2 pins 9 OUTS, 10 OUT | 3V3_SENSOR | Existing Kelvin output, 10 uF COUT and 3.01k bleeder |

The chosen Diodes part is currently listed in the manufacturer catalog and DS30086 Rev 31-2 ordering table. Do not confuse it with `1N4148W-7-F-79`, the suffix specifically retired in PCN-2584, or the separate NRND `1N4148W(LS)` family. The two EOL PCNs linked from the product page do not retire the chosen ordering code.

DS30086 p2 specifies 100 V repetitive/DC reverse blocking, 300 mA forward continuous current, 2 A at 1 us nonrepetitive surge, 2 pF maximum capacitance and 4 ns maximum recovery at its stated 10 mA/100-ohm test. Leakage maxima are 25 nA at 20 V/25 C, 1 uA at 75 V/25 C, and 30 uA at 25 V/150 C. Those are specified test points, not a newly guaranteed 0..50 C leakage curve. A conservative retained PGFB voltage of +12 V followed by -3.5 V on the input creates only 15.5 V reverse stress. Normal diode current is regulator PGFB bias, nominally 25 nA at ADI's stated test point, not the sensor's load current; it fits the existing 7.3 mA LDO overhead allocation.

At the 3.7986 V sensor-input floor, PGFB can tolerate **3.4896 V** diode drop before reaching ADI's full-temperature 309 mV maximum rising threshold. The diode's 25 C specified maximum drop is 0.715 V at 1 mA, leaving PGFB at least 3.0836 V at that test condition, 2.7746 V above the threshold. To screen 0..50 C without relabeling that 25 C test as a temperature guarantee, allocate **1.5 V** diode drop, over twice the 1 mA specification; PGFB remains 2.2986 V, 1.9896 V above threshold. This is an explicit engineering margin, supported by ADI's prescribed 1N4148 circuit, not a new manufacturer maximum. The diode is not near its current or power limits. At the beginning of a slow ramp PGFB may cross its threshold separately from EN, but this cannot extend the existing conservative non-fast-start SET charging time; the 200 ms wait and fresh-reading requirement remain. Confirm PGFB stays above its threshold at the final 0..50 C minimum-input startup check and above -0.3 V during negative-pulse testing.

SOD-123 has visible metal leads and a cathode band. DS30086 p4 gives body 2.55..2.85 x 1.40..1.70 mm, terminal span 3.55..3.85 mm, height 1.00..1.35 mm. Its suggested lands are **0.90 x 0.95 mm at x=+/-1.575 mm**, giving 4.05 mm outer span and 2.25 mm inner gap. The drawing was visually inspected. Adopt pad 1 cathode/pad 2 anode consistently; `Diode_SMD:D_SOD-123` is a native starting candidate, not an assertion of exact manufacturer copper. Keep the diode at PGFB, with a short protected cathode trace separated from the TVS current path. Its fast recovery and small capacitance do not constitute an IEC PGFB peak-voltage guarantee.

## Normal voltage, loading and heat

For 0..50 C, 1% initial tolerance plus 100 ppm/K times 25 K gives **R=6.715..6.885 ohm**. At the complete 30 mA branch allocation the added loss is at most **206.55 mV**, dissipating **6.1965 mW**. Crediting all 30 mA through the resistor is conservative because the controller bleeder is upstream of it.

Use the existing explicit service engineering model, not an unstated ideal 5 V source:

`4.6325 adapter - 0.090 service harness - 0.740*0.045 service eFuse - 0.450 OR diode - 0.030*0.135 TPS2553 - 0.050 sensor harness - 0.030*6.885 = 3.798600 V`.

This **replaces** the old approximately 4.0 V minimum sensor-input allocation. It leaves **114.600 mV** beyond `3.384 V LT3042 output + 0.300 V dropout`. The PSU-derived source model has a higher floor. The separate 3.9 V buck-budget assumption must not silently be applied as the starting point for this sensor calculation. Adapter regulation, diode drop, harness losses and efficiency remain the existing engineering allocations, not a combined manufacturer guarantee. Normal minimum-supply startup and load steps still need final-unit confirmation.

Both 10k bleeders together draw at most `2*5.3675/9900 = 1.084344 mA` normally. Including the existing <11.92 mA daughterboard allocation, 2 mA hot-leakage allowance for the two SMBJ devices, and 2 uA signal-ESD leakage gives **<15.007 mA** before charging, leaving about 15 mA within the unchanged 30 mA branch budget. The broader total 3.3 V load allowance must be reduced from 22.7 mA to **19.61 mA**, after 7.3 mA LDO overhead and these bleeder/ESD allocations. Existing circuit load is about 4.618 mA on 3.3 V. The 2 mA TVS hot-leakage allocation is not a guaranteed maximum; the only stated SMBJ7.0A leakage maximum is 200 uA each at 7 V/25 C. Each 10k bleeder dissipates at most 4.603 mW at 6.75 V, well below 0.1 W.

## Capacitance and the two-polarity pulse envelope

The controller has 11 uF nominal and the sensor input has 10 uF nominal. Positive initial and X7R temperature tolerances give **21*1.10*1.15 = 26.565 uF maximum**, leaving 3.435 uF within the proposed 30 uF complete rail budget for TVS/cable/other additions. Do not retain the old 20 uF statement. The former 0.02 uF TVS-pair allowance easily fits, but its source graph is typical, not a production capacitance maximum.

Conservatively credit **only the new local 10 uF** for the following RC calculation. Its inspected TDK curve loses about 22..23% near 6.75..7.0 V. Reuse the existing 25% bias-loss allocation and 15% aging allocation:

`Cscreen = 10 uF * 0.90 tolerance * 0.85 temperature * 0.75 bias * 0.85 aging = 4.876875 uF`.

These characterization/aging allocations are not a combined production guarantee. The retained 1 uF and the remote 10 uF are deliberately omitted from the simple lower-capacitance pulse screen. The minimum modeled pole is **6.715*4.876875 uF = 32.748216 us**.

For a rectangle of voltage Vp at the TVS-side node, the ideal protected capacitor voltage is `V(t)=Vp+(V0-Vp)*exp(-t/RC)`. This is a **conditional residual-pulse design calculation**, not a claim that the SMBJ enforces that IEC waveform:

| Initial state / TVS-side imposed pulse | Protected voltage after 0.5 us | After 1 us |
| --- | ---: | ---: |
| Unpowered 0 V; -3.5 V pulse | -0.053033 V | **-0.105261 V** |
| Unpowered 0 V; +12 V pulse | 0.181825 V | 0.360895 V |
| Normal maximum 5.3675 V; +12 V pulse | 5.467996 V | **5.566970 V** |
| Existing fault envelope 6.75 V; +12 V pulse | 6.829549 V | **6.907892 V** |

Thus the positive case does **not** exclude a simultaneous 6.75 V starting fault. At that start, the ideal +12 V pulse can last **1.59779 us** before reaching 7 V. At the unpowered negative start, -3.5 V can last **2.93464 us** before reaching -0.3 V. From normal maximum the +12 V crossing time is 9.25281 us. A +13 V/1 us pulse from 6.75 V gives 6.93797 V; +15 V/1 us gives 6.99812 V and has essentially no usable margin. Longer pulses or elevated residual voltage are not covered merely because the TVS is rated 600 W.

A conservative arbitrary-waveform charge screen is `abs(delta V) <= integral(abs(Vcable-V0)dt)/(Rmin*Cscreen)`. Its area allowances are **9.82446 V*us** for a negative excursion from 0 to -0.3 V and **8.18705 V*us** for positive excursions from 6.75 to 7 V. Apply it to the entire relevant tail, not only the first plotted peak, and retain separate ESR/ESL/ground-drop terms.

The primary source specifies SMBJ7.0A **12 V maximum at 50 A, 10/1000 us, 25 C**, and the separate single-die forward limit **3.5 V at 50 A**. Neither number is a guaranteed IEC first-peak clamp, full-temperature residual ceiling or fixed voltage plateau. Its VBR temperature coefficient must not be applied to VC as though it bounded the complete dynamic clamp. A +/-30 kV component ESD rating also does not supply those missing waveform guarantees.

TDK's published equivalent model gives **1.5 mohm ESR and 0.75 nH ESL** for the exact 10 uF part. These are models, not maximum assembled-board values. As a sensitivity example, including 50 mohm series ESR with the same capacitance gives **6.944386 V** for the +12 V/1 us pulse from 6.75 V; 100 mohm gives **6.980362 V**. The 1.5 mohm model gives 6.908994 V before inductance. A first edge can still create `L*di/dt` spikes that are absent from those RC/ESR numbers. Do not label any of those values the actual instantaneous pin maximum. The retained 1 uF provides a short local high-frequency path, but there is no guaranteed nanosecond static-absolute-limit proof without the device, layout and source waveform information.

The accompanying script also computes an explicitly simplified 150 pF/330 ohm source with an ideal fixed TVS, then charge sharing after TVS release. At 15 kV that model predicts -0.02896 V unpowered negative and 6.79024 V starting from 6.75 V positive. These are only a plausibility check. TI's SEED guidance requires a suitably shaped RLC source, TVS/IC TLP parameters and board parasitics; a bare 150 pF/330 ohm circuit does not reproduce the IEC first peak.

## Current limit, fault energy and startup

The TPS2553 ILIM-to-IN connection still gives 50/75/100 mA limiting. At 100 mA a sustained cable short dissipates at most **68.85 mW** in the resistor. At normal maximum supply the switch itself can dissipate about `(5.3675 - 0.1*6.715)*0.1 = 0.4696 W` before thermal or firmware shutdown. Its DBV thermal metric is 182.6 C/W and current-limit shutdown threshold is 135 C minimum, so continuous short protection must retain the datasheet thermal behavior and firmware shutdown, not assume a cool continuous limiter. At the 6.75 V fault envelope the corresponding screen is 0.6079 W; that input level itself exceeds the 6.5 V recommended operating maximum and is already an upstream fault case.

On a new cable short, the local 11 uF maximum stores **317.0 uJ** at 6.75 V. The resistor bounds the initial ideal capacitor contribution to **1.0053 A**, with peak dissipation about 6.79 W and a local RC time constant below 96 us. The remote capacitor can still discharge directly into a remote short; the upstream resistor does not limit energy already stored on the daughterboard. With +12 V imposed and the local node initially at zero, the resistor screen is **21.445 W** for 1 us, or **21.445 uJ**. Vishay's inspected pulse curves exceed 1000 W at 1 us and 100 W at 100 us for this case size, with their stated repetition, average-power, pulse-voltage and resistance-change qualifications. These margins concern the **residual after the primary TVS**. They do not qualify the resistor to absorb the complete ESD gun energy or an unconstrained surge.

A deliberately conservative startup charge allowance is `30 uF*6.75 + 20 uF*3.384 + 0.59455 uF*3.384 = 272.192 uC`. With 50 mA minimum limit and the full 30 mA normal load, 20 mA remains for charging, giving a **13.610 ms charge screen**. The series resistor's largest normal input-capacitor pole is below 0.21 ms. Adding that charge screen to the existing LT3042 SET 99.9% time of 136.006 ms leaves roughly 50 ms inside 200 ms for switch/ramp/dynamic effects. This is an engineering startup screen, not a new TI turn-on guarantee; TPS2553's 3 ms turn-on specification is at its stated 1 uF/100 ohm fixture, not this network.

**Firmware coordination is implemented.** TPS2553 can assert FAULT after 5 ms in current limit, so capacitive startup can create a flag that clears inside 200 ms. `firmware/app/src/sensor.rs` keeps input invalid, then samples `recovery_epoch` after settling and **before** the FAULT-high/SDA-high/SCL-high checks. Initialization and an entirely fresh frame must still succeed. The previous pre-power epoch would reject healthy startups after a charging flag. Independent review confirms persistent/later faults and epoch saturation still fail closed; merely waiting does not clear the latch. Actual startup timing remains a final-board measurement.

## Finite capacitor backfeed and source ordering

**Retain the 6.8-ohm/11-uF-local circuit.** Finite charge can return from the local 13.915 uF and remote 12.65 uF maximum input capacitors while TPS2553 is enabled. That is an intended reverse-conduction/protection state of this part, not a new independent sensor supply. This assessment does not require zero backfeed and does not treat the forward 50..100 mA setting as a reverse-current limit.

TI SLVS841F p7 specifies a 95..190 mV reverse comparator threshold and 3..7 ms turn-off delay at VIN=5 V. Its p14 text explicitly permits reverse channel conduction before turn-off. The resistance table gives typical/maximum RDS(on), **no minimum**. Do not turn its typical value into a peak-current ceiling. Figure 10 on p9 shows a typical reverse-conduction/shutoff waveform, supporting this use of the function, but provides no guaranteed pulse SOA or reverse-current maximum. A TI support reply mentioning about 1.6 A typical likewise supplies no worst-case rating and is not used in these calculations.

EN low disables the charge pump/driver/switch; input UVLO also disables it. Thus **already-disabled** and **transitioning-off** are different cases. The p7 IREV maximum is 1 uA only at VIN=0 V, VOUT=6.5 V, TJ=25 C. It corroborates off-state reverse blocking, but is not a guarantee at 6.75 V, at 50 C, or during turn-off. TI's stated 3 ms enable turn-off measurement uses CL=1 uF/RL=100 ohms; retain the much longer existing discharge interval instead of inventing a 3 ms guarantee for this capacitive network.

For stored charge, use Q=C*V and E=C*V^2/2. At the normal upper input allocation and the existing fault ceiling:

| Charged capacitors | Q at 5.3675 V | E at 5.3675 V | Q at 6.75 V | E at 6.75 V |
| --- | ---: | ---: | ---: | ---: |
| Local 13.915 uF | 74.6888 uC | 200.4460 uJ | 93.9263 uC | 317.0011 uJ |
| Remote 12.65 uF | 67.8989 uC | 182.2236 uJ | 85.3875 uC | 288.1828 uJ |
| **Fitted total 26.565 uF** | **142.5876 uC** | **382.6696 uJ** | **179.3138 uC** | **605.1839 uJ** |
| Complete 30 uF budget | 161.0250 uC | 432.1508 uJ | 202.5000 uC | 683.4375 uJ |

The new local 10 uF adds the same maximum charge/energy as the remote row, at most 288.183 uJ at 6.75 V. LT3042 Rev C p22 describes output-to-input reverse blocking with input grounded, intermediate or floating. Its 3V3 output capacitor therefore has no intended low-resistance return into these V5 capacitors; the existing 3.01k/SET paths discharge that rail to GND. Do not add an arbitrary externally maintained sensor voltage or assume infinite charge after the input source disappears.

The remote contribution has a useful current bound independent of TPS RDS(on): with local voltage initially 0 and neglecting all other positive resistance, Iremote <= Vremote/6.715, or **0.79933 A normal / 1.00521 A at 6.75 V**. Remote resistance time constant is at most 87.095 us. The maximum fault-start resistor pulse is 6.785 W with at most 288.183 uJ remote stored energy. These values fit the previously checked CRCW2512 pulse curves and are not continuous currents. No corresponding guaranteed instantaneous local-capacitor current is available. The total signed charge return and total available sensor-input energy remain finite even if the channel turns off before fully sharing; later forward recharge must come from an actual selected input source.

The existing V5_LOGIC input pair is two 22 uF GRM32ER71E226ME15L capacitors. Using its already documented **19.074 uF engineering minimum screen**, no load, both fitted sensor capacitors at Vs, and a hypothetical input reservoir initially at Vi, the dissipative RC equilibrium is:

`Vshared = (19.074*Vi + 26.565*Vs)/(19.074 + 26.565)`.

| Initial V5_LOGIC Vi | Vs=5.3675 V | Vs=6.75 V |
| --- | ---: | ---: |
| 0 V | 3.12425 V | 3.92896 V |
| 2.5 V | 4.16908 V | 4.97379 V |
| 3.8 V | 4.71239 V | 5.51710 V |
| 4.5 V | 5.00494 V | 5.80965 V |

These overconservative complete-transfer examples are **not predictions of a disabled switch conducting**. They quantify what charge sharing could do if the switch remained on. Actual loads, reverse shutoff, bleeders and partial transfer reduce that equilibrium. With passive RC paths and no new source, the quasi-static voltage cannot exceed the largest initial rail voltage, independent of the selected capacitance ratio. Losing one or both sources normally removes a forward supply path at the OR diodes; it does not hard-clamp V5_LOGIC to zero. Sensor charge can briefly hold up the controller and delay its brownout. A short on V5_LOGIC instead consumes that charge without raising the shorted rail.

| Actual receiving part / connection | Relevant rating and implication |
| --- | --- |
| TPS2553 IN, OUT, ILIM; IN-to-OUT | Pins -0.3..7 V; differential +/-7 V. The 5.3675 V normal and 6.75 V fault quasi-static levels fit stress ratings. 6.75 V remains outside the 6.5 V recommended input ceiling, so no normal functionality is claimed there. |
| AP63203 VIN and EN on V5_LOGIC | 35 V DC absolute, 32 V recommended input maximum. A returned sub-7 V rail is ordinary voltage stress; operation below its 3.8 V recommended minimum is not guaranteed and must remain fail-closed. |
| D1/D2 STPS2L40U cathodes | 40 V reverse rating. Returned logic charge has no intended forward path into V5_PSU/V5_SERVICE or the coil; finite OR reverse leakage remains an existing source-combination check. |
| V5_LOGIC MLCCs | Main pair 25 V; local bypass 50 V. No extra low-voltage IC supply is tied directly to V5_LOGIC: the ESP/USB gate/supervisor/buffer use regulated 3V3. |
| LT3042 sensor input | IN/EN +/-22 V; the newly isolated PGFB remains -0.3..22 V. The reverse-protection function prevents the regulated output reservoir becoming an intended V5 source. |

Charge sharing is not a bound on resonant peaks. Even a deliberately loose energy-only calculation into the 19.074 uF screen with Vi=0 gives `Vs*sqrt(26.565/19.074)`, **6.3344 V normal / 7.9660 V from the fault ceiling**. That second number is not a predicted waveform; it explicitly shows why finite energy alone cannot prove a 7 V instantaneous ceiling. It ignores the 6.8-ohm damping and shutdown but permits energy concentration. Neither Q/7ms, E/7ms, typical RDS(on), typical MLCC ESR, nor the static 182.6 C/W thermal metric establishes pulse SOA or peak junction temperature. Keep local IN/OUT bypass and the input reservoir close with short common ground; review the actual loop inductance before fabrication and measure the final pin-referenced source-collapse/reconnect waveforms. Do not accept an observed absolute-limit excursion simply because its energy is small.

Source states and firmware remain bounded:

- **EN already low, source removed or cable unplugged:** reverse channel is off; both physical boards retain their own 10k input bleeder. No reverse-comparator delay is needed to start the normal off state. Measure leakage/decay at temperature rather than generalizing the 25 C IREV point.
- **EN high, one or both sources disappear:** permit finite sensor-capacitor hold-up until loads, reverse protection, UVLO or EN turn-off end conduction. Do not depend on the 190 mV threshold being reached; small reverse currents can remain below it. The OR diodes keep supply identities separate.
- **EN driven low during recovery:** lower SENSOR_BUS_EN first, then SENSOR_POWER_EN; keep data invalid through the entire 2 s off and 200 ms on interval. The interrupt epoch/fresh-frame rule above applies. A controller reboot must retain hardware EN/bus pulldowns and cannot reuse a stale sensor reading.
- **A source returns while charge remains:** off-state EN stays low until the existing sequence permits it; when on, the 50..100 mA forward limit controls refill. Automatic reverse recovery can finish after its deglitch without supplying a valid sensor sample. Keep mains PSU_GOOD sensing on V5_PSU and relay eligibility independent of service-powered 3V3.

This is a defensible component-capture choice with explicit pulse-verification limits. No specified voltage violation or independently maintained damaging reverse source has been demonstrated for the actual finite-charge event. Accordingly, the contemplated extra input resistor plus changed filter/capacitance is **not selected**; it would add voltage loss, capacitance and startup changes solely to force a new peak-current target. No replacement eFuse/current-limit increase is warranted by this finding. The actual PGFB substrate-diode path is corrected above because it did violate a stated pin limit.

## Discharge, unplugging and routing

Using the proposed 30 uF budget and conservatively pretending only one 10k bleeder conducts, with the whole capacitance behind both resistor tolerances:

`30 uF*(10100+6.885)*ln(6.75/0.3) = 0.944039 s`.

The unchanged subsequent 3V3_SENSOR bound is **0.147326 s**. The deliberately sequential sum is **1.091365 s**, leaving over 0.90 s inside 2 s. With the cable unplugged, the controller's local maximum 13.915 uF discharges through its own bleeder in **0.437579 s**; the sensor's maximum 12.65 uF input capacitor discharges through its new local bleeder in **0.397799 s**, followed by the 3.3 V bound. Neither unplugged board relies on a resistor on the other board. An open series resistor removes sensor power but does not strand either capacitor without its local bleed. A shorted TVS causes current limit/fault recovery; an open TVS or shorted resistor removes part of the protection without necessarily creating a DC fault, so inspect and measure these parts at assembly.

Place connector power pad -> SMBJ cathode/tap -> series resistor -> local 10 uF/1 uF -> TPS2553 OUT. Put the 1 uF directly between OUT and local GND, and the 10 uF immediately beside that loop. Keep the switch IN 100 nF and V5_LOGIC reservoir path short as already required. Route the TVS anode return broadly and directly to the connector ground region and isolated ground plane with short, multiple return vias where applicable. Do not route the pulse return through the protected capacitor ground neck, TPS2553 ground pin, LDO Kelvin return, FDC ground or electrodes. All three harness grounds remain connected at both ends; no new PE or isolation-barrier connection is introduced.

The resistor's physical separation is useful only if dirty and protected copper stay separated. Do not run the cable-side power or TVS current loop beside the protected rail. Final waveforms must be measured relative to each IC's own ground, including both TPS2553 IN and OUT and LT3042 IN/PGFB, rather than only across the TVS pads. No added DC rail-steering path is present, but finite capacitor energy and TPS2553's existing reverse conduction/leakage can still charge V5_LOGIC briefly when unpowered; the millisecond reverse comparator is not an ESD barrier.

## Capture and exact primary evidence

Vishay 2512 body: **6.3 +/-0.20 by 3.15 +/-0.15 by 0.6 +/-0.10 mm**; terminations 0.6 +/-0.20 mm. Manufacturer reflow lands: **1.25 by 3.35 mm** at x=+/-3.125 mm, giving 5.00 mm inner gap and 7.50 mm outer span. `Resistor_SMD:R_2512_6332Metric` is a native starting candidate, not proof of those exact lands. The source coding table specifies `CRCW2512` + `6R80` + `F` (1%) + `K` (100 ppm/K) + `EG` + `HP`.

TDK 1206 body: **3.20 +/-0.20 by 1.60 +/-0.20 by 1.60 +/-0.20 mm**. Exact current product page specifies reflow PA=2.00..2.40 inner gap, PB=1.00..1.20 individual pad length, PC=1.10..1.60 pad width. A midpoint copper candidate is two **1.10 by 1.35 mm** rectangles at x=+/-1.65 mm. `Capacitor_SMD:C_1206_3216Metric` remains only a native starting candidate; verify final source/native lands and assembly details. Nonpolar passives use pads 1/2. Reuse the already captured Panasonic 0603 geometry for the bleeder and preserve each SMBJ cathode mark.

| Primary document and relevant location | SHA-256 of inspected bytes |
| --- | --- |
| [Vishay CRCW-HP e3, 17-Mar-2026](https://www.vishay.com/docs/20043/crcwhpe3.pdf), pp1-3 ratings/order code, p5 pulse curves, p6 pulse voltage/derating, p9 package/lands | `882d8353d2ae19d246e9d24a74d56c3ba890c6b287dc1b66fdaa6a508b798320` |
| [TDK exact 10 uF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf), one page, visually inspected bias/dimensions/impedance | `b2cca941451d5867e9bffe084773e891be09e55add8dd8d7f5a6944007c7c8e8` |
| [TDK C3216 equivalent-circuit model](https://product.tdk.cn/system/files/dam/technicalsupport/tvcl/pdf/capacitor_mlcc_com_general_c3216_ecm.pdf), p5 exact MPN row | `6e11072f0fd64e75f2e539a5b1db4c2682b65b3b1ce23f13cb463da60dff73e3` |
| [TI TPS2553 Rev F](https://www.ti.com/lit/ds/symlink/tps2553.pdf), pp5-7 limits/current/FAULT/IEC qualifications, p21 capacitor guidance | `88e453700cea2b263cdb5b44fce1e883e0f6d3b975457f879ac1423eeea42071` |
| [Littelfuse SMBJ JC.07/04/25 v4](https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e), pp1-2 ratings/exact 7.0A row, p5 lands | `d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b` |
| [Panasonic ERA, 24-Apr-2024](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/AOA0000C307.pdf), ERA-3A ratings/coding | `2ffb715174964a986d8cd22f38607a14465c938bb5ff9817e0948124ebb69a5b` |
| [TI SLAA530B SEED application note](https://www.ti.com/lit/an/slaa530b/slaa530b.pdf), pp18-24 two-stage protection, source/TVS/IC/layout models | `c2c0987dd66ac6ca2109e18a42e6e73e55c21641fb5b519980f300ffbdf1c14b` |
| [TI SLVA711 IEC protection tests](https://www.ti.com/lit/an/slva711/slva711.pdf), pp1-3 test network/waveform/fixture | `1a64cbb9cdec70e9b4ccc0bd45ca47f8b8cc3ce87ff5d02f24f2648622639912` |

Additional primary evidence for this revision:

- [Diodes 1N4148W DS30086 Rev 31-2](https://www.diodes.com/datasheet/download/1N4148W.pdf), September 2024, p1 ordering/polarity, p2 ratings, p4 body/land drawing: SHA-256 `39c16a6888bdab22418e93e17182174aad763a66957a4632e70c944194e3fc08`.
- [Diodes current part catalog](https://www.diodes.com/part/view/1N4148W), [PCN-2584 Rev 2](https://www.diodes.com/assets/PCN-Files/Diodes_PCN_2584.pdf) and [PCN-2561 Rev 2](https://www.diodes.com/assets/PCN-Files/Diodes_PCN_2561_Rev2_EOL.pdf): current catalog/orderability checked; EOL distinctions above checked in original manufacturer notices. No saved-byte hash claimed for these online reads.
- [ADI LT3042 Rev C](https://www.analog.com/media/en/technical-documentation/data-sheets/lt3042.pdf), p2/p5 pin limits, p4 PGFB threshold/bias, p12 diode instruction, p22 reverse-current description, p23 TA04: primary PDF re-read online. Direct-byte downloads timed out; no new downloaded-byte hash is claimed.
- [Diodes AP63203 DS41326 Rev 3-2](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf), p4 input/EN limits: previously downloaded manufacturer bytes reused, SHA-256 `ef99daa3789d835bc025dfcb4c605c5c2e6d3e7223e86d40b33e6b497ea5a722`.
- [ST STPS2L40U data sheet](https://www.st.com/resource/en/datasheet/stps2l40.pdf), reverse rating: prior reviewed manufacturer-authored mirror bytes reused in scratch, SHA-256 `f426b3e7f7f6ae3aae369f6f6d1f6d9fd86d722dce9423703e36656e79e2617c`; this hash is for that earlier mirror, not a new successful ST fetch.

Exact live product pages: [TDK C3216X7R1E106K160AB](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C3216X7R1E106K160AB), [Panasonic ERA3AEB103V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB103V). TDK's .com equivalent-model fetch returned 403; its manufacturer .cn mirror supplied the hashed bytes. The Littelfuse bytes are the already inspected manufacturer-authored copy from the documented mirror in the existing cable-protection evidence; canonical fetch was blocked. No new manufacturer-byte claim is made for LT3042, whose unchanged evidence is in the sensor basis.

## Adoption and remaining evidence

The 6.8 ohm + local bulk circuit is the preferred reviewable refinement. Do not adopt the earlier five-1-uF variant: its +12 V/1 us screen from 6.75 V reaches 7.04215 V. The investigated PET film alternative is also not selected; its low-frequency ESR information and larger package do not improve this analysis.

Independent review accepted this circuit for capture with the stated physical limits. The [controller basis](controller-design-basis.md), [sensor basis](sensor-design-basis.md) and [BOM](../../bom/bom.csv) must carry this topology, exact PGFB diode/net, 30 uF input budget, 3.7986 V input model, two local input bleeders and 19.61 mA generic 3.3 V load allowance together. No direct PGFB-to-V5_SENSOR tie is permitted. Firmware retains 200 ms startup, 2 s off and three attempts/minute. I2C protection and its 200 pF target are unchanged.

Before fabrication, capture the exact copper, complete the return-path/parasitic review and preserve the stated pulse-envelope assumptions in the design. The remaining physical evidence is final-board +/-8 kV contact and +/-15 kV air testing in powered, disabled, unpowered and unplugged/source-order states, with the final cable. Confirm voltage/current residuals, no damage or persistent leakage, both rails below 0.3 V within 2 s, valid fresh acquisition only after startup, and relay-off behavior for every acquisition/power fault. Those are final-unit acceptance tests, not a separate prototype phase or an invented requirement to buy hardware before designing the boards. This proposal provides a calculable suppression network; it does not manufacture a guaranteed nanosecond pin ceiling from DC ratings or typical curves.

Reproduce the numerical screens from the repository root with
`python3 docs/design/calculations/sensor-power.py`. The [calculator](calculations/sensor-power.py)
emits JSON on stdout and performs no hardware or filesystem write. Its results
were compared with the independently reviewed research output. Primary byte
hashes above identify the inspected documents; the local PDF/text/image cache is
`/tmp/crystal-shim-sensor-power-refinement`. This numerical reproduction is not
SPICE, measured immunity, or a physical release test.
