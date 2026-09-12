# Sensor cable ESD design

Status: selected capture basis, 2026-09-12. Use these suppressors together with the independently reviewed [power RC and PGFB diode refinement](sensor-power-refinement.md). BOM selections are recorded and controller source capture is in progress. Full-board return-path/parasitic review and physical immunity evidence remain open. Tests use the final assembly after fabrication; no separate prototype phase is required.

## Capture selections

Use ground-referenced protection at **both ends** of the removable 203.2 mm maximum harness. A clamp on the other end of a cable is not a substitute for a short local ESD return. Preserve the three separate ground-return conductors and isolated-ground domain.

| Function | Exact part | Quantity | Connection |
| --- | --- | ---: | --- |
| Cable SDA/SCL protection | TI **ESDS312DBVR**, SOT-23-5/DBV0005A | 2, one per board | Pin 4 I/O1 to connector SDA; pin 5 I/O2 to connector SCL; pin 2 GND. Pins 1/3 NC, left unconnected. No supply connection. |
| I2C series damping | Panasonic **ERJ3EKF22R0V**, 22 ohm, 1%, 100 ppm/K, 0.1 W, 0603 | 4 total: preserve controller pair and add sensor pair | One per line, on IC side of each local ESD tap. Controller: toward TCA9517A pins 3 SDAA / 2 SCLA. Sensor: toward FDC1004 pins 10 SDA / 9 SCL; existing sensor pullups remain on the IC side. |
| Cable power transient suppression | Littelfuse **SMBJ7.0A**, unidirectional DO-214AA/SMB | 2, one per board | Banded cathode to connector V5_SENSOR; anode to isolated GND. Use the reviewed 6.8 ohm and local 1+10 uF controller network; retain sensor input 10 uF and add PGFB isolation. **The TVS alone does not enforce a 7 V ceiling at TPS2553.** |

The BOM adds two ESDS312DBVR, two SMBJ7.0A and two sensor ERJ3EKF22R0V resistors, plus the power refinement's resistor, capacitor, bleeder and PGFB diode. Existing controller I2C series resistors remain; USB protection is separate. `SENSOR_SDA`/`SENSOR_SCL` are the ESP-side buffered nets. `SDA_CABLE`/`SCL_CABLE` reach the harness; on the sensor, the series resistors lead to FDC-side `I2C_SDA`/`I2C_SCL` and its pullups.

ESDS312 is preferred over the single-channel leaded ESD321/ESDS311 alternatives because its SOT-23-5 package is easier to assemble and its published typical positive and negative clamps are lower. It is active, tin-finished, MSL1/260 C, and rated -40..125 C. Its channels are ground-referenced passive protection, not VCC steering diodes. A powered-off controller therefore acquires no new path from the sensor rail to controller 3V3 through this protection circuit.

SMBJ7.0A preserves a 7 V working-voltage rating above the 6.75 V existing fault envelope. A 5 V TVS is unsuitable for the 5.363/5.368 V normal envelope. The examined TSD05DYFR has 5.5 V working voltage but can begin avalanche at 6 V, so it cannot be treated as nonconducting over the complete existing fault envelope. Choosing it would require a bounded fault-duration/energy analysis rather than a drop-in part selection. SMBJ7.0A uses the same manufacturer land geometry already inspected for the service-input SMBJ8.0CA, with a new polarity mark and identity.

## Pin and land capture

Native component-side coordinates below use body centre as origin, +Y down, millimetres.

**ESDS312DBVR:** TI drawing 4214839/K, 08/2024, DBV0005A. Five rounded rectangles, 1.10 x 0.60, R0.05. Centres: 1=(-1.30,-0.95), 2=(-1.30,0), 3=(-1.30,+0.95), 4=(+1.30,+0.95), 5=(+1.30,-0.95). Body 1.45..1.75 x 2.75..3.05; lead span 2.60..3.00; height 1.45 maximum. The body dimensions exclude up to 0.25 mm mold flash per side. TI shows NSMD as preferred, with maximum 0.07 mm mask clearance. Use the exact manufacturer land source, not a blind substitution of `Package_TO_SOT_SMD:SOT-23-5`; that stock name is a candidate mapping, not dimensional proof. The already captured TI DBV0005A logic geometry can be reused if its exact dimensions match. Do not mistake NC pins 1/3 for internally connected pass-through pins.

**SMBJ7.0A:** adopt pin 1 = cathode/band, pin 2 = anode. Two rectangular lands 2.16 x 2.26 at (-2.45,0) and (+2.45,0). This implements Littelfuse's minimum J/L=2.16, minimum I=2.26 and maximum K gap=2.74; total copper span is 7.06. Body B=4.06..4.75 by C=3.30..3.94, overall lead span G=5.21..5.59, height D=1.99..2.61. `Diode_SMD:D_SMB` is only a stock starting candidate; retain the selected manufacturer lands and clear cathode marking. The diode is nonpolar only with the CA suffix, which is **not** selected here.

**22 ohm resistor:** use the existing captured Panasonic 0603 geometry. Manufacturer land example for 1608: inner gap a=0.7..0.9, overall span b=2.0..2.2, land width c=0.8..1.0. The centre choice a=0.8, b=2.1, c=0.9 gives two 0.65 x 0.90 rectangles at x=+/-0.725. `Resistor_SMD:R_0603_1608Metric` is a candidate, subject to existing exact-source parity. The normal I2C dissipation is below 37 uW per resistor. Its continuous rating does not establish an IEC ESD pulse-energy rating; the TVS must intercept the primary discharge before the resistor.

## Normal I2C loading and power state

The sensor high rail is 3.217..3.384 V; ESDS312's 3.6 V working voltage leaves at least 216 mV. TI specifies less than 500 nA per channel across operating temperature at 3.6 V, and 50 nA maximum at 25 C. Two ends therefore add at most 1 uA shunt leakage per line in the full-temperature allocation, or 2 uA total from the sensor supply. This adds only 2.734 mV pullup drop at Rp=2733.75 ohm.

For the 2.70 kohm pullups and 22 ohm series parts, conservatively combine 1% initial tolerance and 100 ppm/K times 25 K displacement: Rp=2666.25..2733.75 ohm, both series resistors together <=44.55 ohm. The following calculations keep the existing 100 kHz setting:

- Per array, line capacitance is 5.5 pF maximum and interline capacitance 2.75 pF maximum at 0 V/1 MHz. Reserve **22 pF per line for both ends**, conservatively counting `2 * (5.5 + 2*2.75)` to cover opposite-line coupling. This intentionally overcounts a simple static other-line condition.
- Use **200 pF as the initial total cable-segment design target**, including ICs, connectors, PCB and ESD. Including both series resistors in a lumped first-order screen gives `tr = 0.8473 * (2733.75 + 44.55) * 200 pF = 0.47081 us`. At the 400 pF I2C ceiling that screen is 0.94162 us, but it leaves little margin and does not close falling-edge timing. The TVS allowance itself adds about 51.79 ns. The 425 pF algebraic rise-time crossing point is not a new allowable bus limit.
- TCA9517A contributes up to 13 pF per input. After TCA and the conservative TVS allowance, **165 pF remains within the 200 pF design target** for cable, connectors, PCB, FDC input and any probing. FDC1004 does not publish an I2C pin-capacitance maximum in its current electrical tables; do not invent one. Exact cable capacitance and final measured rise/fall waveforms remain necessary.
- At FDC VOL=0.4 V, pullup current is at most `(3.384-0.4)/2666.25 = 1.1192 mA`, below its 3 mA test current. A conservative far-end low bound adding both series drops is 0.45655 V, below TCA's 0.3*VCCA even at 3.0 V controller power.
- TCA A-side VOL is at most 0.2 V at 6 mA. Through both series resistors the FDC pin screens below `0.2 + (3.384-0.2)*44.55/(2666.25+44.55) = 0.25233 V`, below FDC's minimum-rail low threshold 0.3*3.217=0.9651 V.
- Conservatively allocating 11 uA for TCA high-level input/output leakage plus 1 uA for both TVS arrays gives a high floor of 3.184195 V before unspecified FDC leakage. This exceeds TCA's 2.52 V VIH at a 3.6 V controller rail by 0.664 V. FDC input leakage is not specified; final high-level measurement closes that remaining term.

**Falling-edge budget:** acceptance is 70-30% fall time <=300 ns at each receiver. At 200 pF, both series resistors have a lumped RC pole of 8.91 ns, or 7.55 ns for a 70-30% first-order transition. An initial constant-current screen using 3 mA FDC sink capability, subtracting maximum pullup current, gives `200 pF * 0.4 * 3.384 / (3 mA - 3.384/2666.25) = 156.41 ns`; with that resistor contribution, about 164 ns. This is an engineering loading model, not a guaranteed waveform. At 400 pF the same screen is already 312.83 ns before the resistor contribution, which is why 400 pF is not the proposed initial design target. FDC1004 specifies 300 ns maximum fall time with CL<=400 pF and IL<=3 mA; it does not separately qualify the two added series resistors. TCA9517A's A-output fall limit is 175 ns at its *specified 57 pF/167 ohm fixture*, not at this cable's loading. Do not transfer that fixture value to the actual cable or linearly scale it into a guarantee. Preserve measured rise/fall, VOL, VIH and timing checks with the final buffer/pullup network.

Keep the existing TCA enable sequencing and sensor-only pullups. ESDS312 adds neither a pullup nor a VCC clamp, and its ground leakage assists discharge. Its typical holding voltage is 5 V, above the normal 3.384 V line ceiling; there is no intended sustaining source after an ESD event. Holding voltage is typical, so persistent latch or leakage change is part of final ESD recovery checks. The current power-off/backfeed gate remains; this protection does not establish zero leakage for TCA9517A, TPS2553 or FDC1004.

## Power-line loading and protection limits

SMBJ7.0A: 7 V stand-off; 7.78..8.60 V breakdown at 10 mA; 12 V maximum clamping at 50 A with the 10/1000 us waveform; 600 W peak for the stated waveform; 200 uA maximum reverse leakage at 7 V and 25 C. The two parts add no series drop and at most 0.4 mA in that 25 C leakage test. Reserve 2 mA for both in the 0..50 C load allocation pending hot-leakage measurement. This is a design allowance, not a manufacturer hot-leakage guarantee. The existing <11.92 mA daughterboard, both local input bleeders and protection allocations total <15.007 mA normally within 30 mA. The TVS capacitance graph is typical only; reserve 0.02 uF for the pair in the revised complete 30 uF V5_SENSOR/V5_SENSOR_SW input budget. The controller 11 uF plus sensor 10 uF nominal bulk contributes at most 26.565 uF with positive initial/X7R tolerances, leaving 3.435 uF for TVS/cable/other additions. The [power refinement](sensor-power-refinement.md) preserves the 2 s discharge and 200 ms startup contracts with the implemented fault-epoch correction.

**This cannot be described as a guaranteed 7 V protection circuit.** TPS2553 IN/OUT are rated -0.3..7 V absolute and its reverse-voltage shutoff takes 3..7 ms. The clamp starts above 7 V and cannot enforce that limit. LT3042 IN/EN tolerate +/-22 V absolute and operate through 20 V, but PGFB only tolerates -0.3 V and must use the selected IN-anode/PGFB-cathode 1N4148W-7-F diode. Neither LDO rating protects the switch at the other end of the cable. The supplied TPS2553 IEC +/-8 kV contact and +/-15 kV air result was on TI's EVM with external capacitance, not this selected RC network.

Independent review found the bare network's negative boundary unresolved as
well: the stated -3.5 V cable event exceeds TPS2553's -0.3 V minimum. Its reverse
shutdown responds to output above input, not below ground. The selected 6.8 ohm
RC refinement now gives conditional two-polarity residual calculations including
an initial 6.75 V fault, finite capacitor backfeed and ESR sensitivity. It also
isolates LT3042 PGFB as ADI requires. The TVS remains at the connector with a short
return; its component rating and the conditional model are not an assembled IEC
waveform guarantee.

Nor does an ideal capacitor calculation prove immunity: the IEC 150 pF source carries 1.2 uC at 8 kV. In the superseded 1 uF-only circuit, that part screened as only 0.5527 uF effective at normal voltage; depositing all of the charge locally would raise it by 2.17 V before ESR/ESL/ground effects. This historical calculation illustrates why nominal capacitance alone was insufficient. The selected additional 10 uF and resistor have separate conditional pulse, ESR and finite-charge calculations in the power refinement; those also retain explicit parasitic and physical limits.

The exact quoted clamp conditions are:

| Device / condition | Positive | Negative | Status |
| --- | --- | --- | --- |
| ESDS312 trigger, slow sweep at 1 mA before snapback | 4.5..7.5 V | Forward branch; 0.8 V at 1 mA | Positive interval specified; negative magnitude typical |
| ESDS312 holding voltage at 1 mA after snapback | 5 V | n/a | Typical |
| ESDS312 8/20 us, 1 A | 5 V | -1 V | Typical |
| ESDS312 8/20 us, 12 A | 5.6 V | -2.1 V | Typical |
| ESDS312 8/20 us, 25 A | 6.5 V | -3.6 V | Typical |
| ESDS312 100 ns TLP, 16 A | 5.5 V | -2.2 V | Typical, not a production peak ceiling |
| SMBJ7.0A breakdown, 10 mA | 7.78..8.60 V | Forward branch | Specified at 25 C |
| SMBJ7.0A 10/1000 us, 50 A | 12.0 V maximum | See separate forward-voltage rating | Specified at 25 C, stated waveform |
| SMBJ7.0A instantaneous forward voltage, 50 A, single die | n/a | -3.5 V maximum magnitude | Manufacturer forward test, not an IEC residual guarantee |

ESDS312's component rating is +/-30 kV IEC contact/air and 25 A 8/20 us surge. Littelfuse lists 30 kV air/contact for the SMBJ family. These are stress withstand results for the suppressors; none supplies a guaranteed assembled-PCB residual peak or a guarantee that the protected IC survives. Trigger/clamp values under the specified DC sweep, TLP or surge waveform must not be substituted for the IEC first peak.

Similarly ESDS312's 5.5 V positive and 2.2 V negative TLP clamps at 16 A are **typical**, with a 4.5..7.5 V trigger range. FDC SDA/SCL are -0.3..6 V absolute with 3 mA maximum input current; TCA bus pins are -0.5..7 V absolute and permit negative excursions subject to clamp-current limits. The 22 ohm resistors are useful damping/secondary-current impedance, not a proven bound keeping either IC within every absolute rating during IEC discharge.

Thus these exact parts are a defensible low-capacitance ESD suppression capture proposal, with an essential remaining **system transient-immunity validation**, not datasheet-only closure. If the required release claim is that all protected IC pins remain within their static absolute maxima for a specified ESD waveform, this minimal network does not supply that proof. The selected RC/PGFB change improves the power circuit, but that stronger claim still requires measured or validated full transient evidence before being asserted.

## Layout and final-unit checks

1. Put each local array and power TVS immediately at its connector. Route connector -> TVS tap/pad -> series resistor -> IC. Keep the unprotected connector segment short and away from protected signals, SET, CIN and shield-driver routes. Do not insert the resistor ahead of the TVS.
2. Make TVS GND return broad and short into isolated GND at the connector, with nearby ground vias if needed. Avoid a shared narrow return through the FDC, LDO Kelvin ground, electrode guards or controller reset network. Preserve the three cable returns; do not bond this network to PE or cross the mains isolation boundary.
3. Measure SDA/SCL 30-70% rise time <=1 us and 70-30% fall time <=300 ns, low/high margins and recovery at both ends with the final cable, 0..50 C operating range, minimum/maximum supply, sensor off, controller off and source-order combinations. Probe capacitance is part of the measurement load.
4. Keep the target at +/-8 kV contact and +/-15 kV air at accessible connector/cable discharge points as an **unrun test target**, not a part-level-to-system certification inference. Apply staged final-assembly ESD with an appropriate test setup; check both polarities and powered, disabled and unpowered states. Record local clamping waveforms, supply rebound, leakage before/after and whether normal acquisition recovers.
5. Reject unintended relay assertion, false valid wet frames, persistent bus latch, excessive leakage, damage or failure to return both sensor rails below 0.3 V within the existing 2 s off interval. A reset or acquisition fault must produce the existing relay-off behavior and bounded recovery. Preserve the 200 ms startup delay and three recovery attempts/minute limit.

No new prototype phase or pre-fabrication hardware test is proposed. These are front-loaded component selections plus explicit final-assembly acceptance evidence still owed.

## Primary evidence and byte hashes

| File / source | Relevant pages | SHA-256 |
| --- | --- | --- |
| [TI ESDS31x Rev C](https://www.ti.com/lit/ds/symlink/esds312.pdf), fetched current URL | 2-3 pin map; 4-5 ratings; 8-10 operation/layout; PDF 17-19 DBV0005A drawing/lands/stencil | `e84b2b818dd54038bfc371bd72760349a3878c918ad31d8db3079107c2bc70fb` |
| [TI TCA9517A Rev E](https://www.ti.com/lit/ds/symlink/tca9517a.pdf), fetched current URL | 5-7 bus ratings, thresholds, leakage and capacitance; 9-10 sequencing | `ad2d7dc5994583006aa21b67ee9f18507a2698ad9366285dff56816f065790c6` |
| [TI FDC1004 Rev C](https://www.ti.com/lit/ds/symlink/fdc1004.pdf), fetched current URL | 4 absolute limits; 5-6 I2C levels/timing | `79f6eb7e66c8064b465acf43a153b8ad9091dbd3fff46ab8787176a30529ae1e` |
| [TI TPS2553 Rev F](https://www.ti.com/lit/ds/symlink/tps2553.pdf), fetched current URL | 5-7 ratings, IEC test qualification, delay/current limits; 21 capacitance guidance | `88e453700cea2b263cdb5b44fce1e883e0f6d3b975457f879ac1423eeea42071` |
| [Littelfuse SMBJ series JC.07/04/25 v4](https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e) | 1 ratings; 2 exact SMBJ7.0A row; 4 capacitance; 5 lands/package; 6 polarity/order codes | `d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b` |
| [Panasonic ERJ series 29-May-25](https://industrial.panasonic.com/cdbs/www-data/pdf/RDA0000/AOA0000C304.pdf) and [exact ERJ3EKF22R0V record](https://industrial.panasonic.com/ww/products/pt/general-purpose-chip-resistors/models/ERJ3EKF22R0V) | part value/power/tolerance/TCR; resistor rating table | `78825b819853a63f57cc18214f321d2f1da9dc205a7e58af7db18ae73563e378` (PDF) |
| [Panasonic resistor land examples 24-Dec-25](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf) | 1, 1608 (0603) row | `fc707b230cce91d464bc3aaf1ed614fa5b412f40cbe7df7cab1541d2c164a882` |
| [TI TSDxx Rev C](https://www.ti.com/lit/ds/symlink/tsd05.pdf), examined but not selected | 6 TSD05 5.5 V working voltage and 6 V minimum breakdown | `2b975384cf4f982cbf4beeac5ceebf35ddc279f89fe2a3918f3cbe1043937a52` |

The Littelfuse canonical PDF fetch remains HTTP 403. The listed bytes are the previously inspected manufacturer-authored file from the [document mirror](https://atta.szlcsc.com/upload/public/pdf/source/20250918/1F4D01A109F9E96436584D6D9E812816.pdf), copied from the existing service-protection evidence cache. The drawing/part table are manufacturer content; no claim is made that a distributor owns those specifications. [ADI LT3042 Rev C](https://www.analog.com/media/en/technical-documentation/data-sheets/lt3042.pdf), pages 1-3, was reread through the web PDF tool; direct byte fetch timed out, so no new local hash is claimed for that unchanged part. The hashes identify the manufacturer bytes used for this review. Source geometry and assembly settings still need normal capture/export verification.
