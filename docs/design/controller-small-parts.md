# Controller small parts

Status: component selections for source capture, 2026-09-12. This closes the
small parts enumerated in the [controller basis](controller-design-basis.md).
The complete controller, its protection, enclosure integration and layout remain
incomplete. These selections do not approve a schematic, footprint or fabrication
release. Physical checks remain unrun.

## Exact selections and quantities

Quantities are for one controller board. They exclude sensor/mains parts and the
five already selected controller bulk capacitors and the additional
[service-input protection parts](service-input.md) and
[sensor cable additions](sensor-power-refinement.md). Resistors and ceramic capacitors
are nonpolar; pads 1/2 are electrically interchangeable.

| Exact manufacturer part | Qty | Value / package | Use |
| --- | ---: | --- | --- |
| [Omron B3F-1002-G](https://components.omron.com/us-en/system/files/2023-01/datasheet_pdf/A070-E1.pdf) | 3 | Gold-contact SPST-NO; THT; 6 x 6 x 4.3 mm | Maintenance, BOOT and CHIP_EN reset |
| [Kingbright WP710A10LGD](https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf) | 1 | Green diffused 3 mm THT LED | STATUS_LED |
| [Panasonic ERA3AEB681V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB681V) | 1 | 680 ohm; 0603 | LED series resistor |
| [Panasonic ERA3AEB331V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB331V) | 1 | 330 ohm; 0603 | CHIP_EN to reset button; limits capacitor discharge current |
| [TDK C1608X7R1H104K080AA](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C1608X7R1H104K080AA) | 10 | 100 nF; 50 V; X7R; 10%; 0603 | Nine supply bypasses and buck bootstrap, enumerated below |
| [TDK C2012X7R1E105K125AB](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C2012X7R1E105K125AB) | 2 | 1 uF; 25 V; X7R; 10%; 0805 | CHIP_EN to GND; TPS2553 OUT to GND |
| [Panasonic ERA3AEB103V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB103V) | 13 | 10.0 kohm; 0603 | Twelve logic/gate/bleeder uses below, plus supervisor divider bottom |
| [Panasonic ERA3AEB512V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB512V) | 2 | 5.10 kohm; 0603 | Separate USB CC1/CC2 pulldowns |
| [Panasonic ERA3AEB102V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB102V) | 1 | 1.00 kohm; 0603 | VBUS detector input series resistor |
| [Panasonic ERA3AEB104V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB104V) | 1 | 100 kohm; 0603 | VBUS detector input pulldown |
| [Panasonic ERA3AEB101V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB101V) | 1 | 100 ohm; 0603 | AO3400A gate series resistor |
| [Panasonic ERA3AEB272V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB272V) | 2 | 2.70 kohm; 0603 | ESP-side SDA/SCL pullups |
| [Panasonic ERJ3EKF22R0V](https://industrial.panasonic.com/ww/products/pt/general-purpose-chip-resistors/models/ERJ3EKF22R0V) | 4 | 22 ohm; 1%; 100 ppm/K; 0.1 W; 0603 | USB D+/D- and cable-side SDA/SCL series pairs |
| [Panasonic ERA3AEB9532V](https://industrial.panasonic.com/ww/products/pt/high-precision-chip-resistors/models/ERA3AEB9532V) | 1 | 95.3 kohm; 0603 | Existing supervisor divider top |

The ten 100 nF positions are module 3V3, FSUSB42 VCC, SN74LVC1G14 VCC,
AP63203 VIN, AP63203 BST-to-SW, TPS3808 VDD, SN74LVC1G08 VCC, TCA9517A
VCCA, TCA9517A VCCB and TPS2553 IN. Place each supply bypass at its IC pins;
the bootstrap capacitor connects across BST and SW, not BST and GND.

The twelve general 10 kohm positions are RELAY_REQUEST pulldown, MAINTENANCE_N
pullup, SENSOR_POWER_EN pulldown, SENSOR_POWER_FAULT_N pullup, SENSOR_BUS_EN
pulldown, BOOT_N pullup, GPIO8 pullup, CHIP_EN pullup, FSUSB42 OE pullup,
AO3400A gate-source pulldown, PSU_GOOD pullup and V5_SENSOR_SW bleeder.
RELAY_REQUEST's AND-gate input uses the same pulldown; TPS2553 EN/FAULT uses
the same GPIO resistors. Do not count those descriptions twice. BOOT/reset are
separate required buttons, not additional functions or aliases of maintenance.

## Electrical and assembly basis

Every listed ERA3AEB resistor is 0.1%, 25 ppm/K and 0.1 W through 85 C, with
-55 to 155 C category range. This tightens existing 1% allocations without changing
nominal values. Continuous working voltage is the smaller of 75 V and
`sqrt(0.1 W * R)`. The 22 ohm ERJ part is deliberate: ERA3AEB starts at 47 ohm.
At 0-50 C, combine initial tolerance and 25 C temperature excursion as 0.1625%
for the ERA parts. CC dissipation at a conservative 5.5 V is under 6 mW;
the 2.70 kohm pullups dissipate under 4.9 mW at 3.6 V. These are below 0.1 W.
The MOSFET gate resistor carries charging pulses rather than a DC load; this
calculation is not a gate-short withstand claim.
[Panasonic ERA datasheet, pages 1-3](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/AOA0000C307.pdf).

Connect GPIO20 through 680 ohm to the LED anode, with cathode at GND.
Kingbright specifies VF = 1.9 V typical / 2.25 V maximum at 2 mA, plus its
0.1 V measurement tolerance. Typical current is `(3.3 - 1.9) / 680 = 2.06 mA`.
Using a deliberately loose 3.6 V supply bound and
`Rmin = 680 * (1 - 0.001625) = 678.895 ohm`, even a shorted LED draws less
than 5.31 mA and the resistor dissipates less than 19.1 mW. For a forward LED,
`P_LED <= 3.6^2 / (4 * Rmin) = 4.78 mW`; the manufacturer current-derating
curve is above 15 mA at 50 C. No junction-temperature estimate is claimed from
Kingbright's thermal resistance because its test uses larger copper pads.
The LED provides 1 mcd minimum / 3 mcd typical at 2 mA and a 50-degree viewing
angle. Final enclosure visibility remains unmeasured. This through-hole LED
cannot undergo reflow; hand-solder after reflow, observing the page-2 lead
solder-temperature limits and avoiding stress on the lens.
[Kingbright Rev 9B, pages 1-3 and 5](https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf).

B3F-1002-G's gold contacts are rated for 100 uA-50 mA at 3-24 VDC resistive
load, suitable for the approximately 330 uA pullup current. It has 1.76 N nominal
force, 5 ms maximum bounce and 300,000-operation specified durability. Keep BOOT
recessed and separately labelled. The switch is IP00 and non-washable; its
-25 to 70 C temperature specification applies at at most 60% RH without
icing/condensation. Omron also specifies 35-85% RH at 5-35 C. Preserve these
combined limits when checking the protected enclosure's operating environment.
[Omron B3F, pages 2-4](https://components.omron.com/us-en/system/files/2023-01/datasheet_pdf/A070-E1.pdf).

For reset only, connect **CHIP_EN -> 330 ohm ERA3AEB331V -> reset switch -> GND**.
The 10 kohm pullup and nonpolar 1 uF capacitor remain directly on CHIP_EN; the
capacitor's other end remains at GND. BOOT/maintenance keep their direct switches.
At 0-50 C, the series resistor spans 329.46375-330.53625 ohm. At 3.6 V its
initial discharge current is at most 10.927 mA and resistor dissipation at most
39.337 mW, below its continuous 0.1 W rating. Capacitance tolerance and X7R
temperature allowance give `Cmax = 1 * 1.10 * 1.15 = 1.265 uF` and stored
energy at most 8.20 uJ; DC bias and aging reductions do not enlarge that bound.
The resistor bounds current even if contact bounce repeatedly reconnects the
charged capacitor. It removes the earlier reliance on unspecified trace/contact
resistance to limit the pulse; actual switch life is still not a measured result.

Include the TPS3808 MR pin's internal pullup, specified as 70 kohm minimum and
90 kohm typical: `Rup_min = 9983.75 || 70000 = 8737.556 ohm`. Including
Omron's 0.1 ohm maximum initial contact resistance gives
`Rdown_max = 330.63625 ohm`. Held EN is at most `0.036462 * VDD`, or
0.13126 V at 3.6 V before input leakage; the ESP's listed 50 nA input current
adds less than 17 uV. Use **0.132 V** for this screening bound. Nominal held
contact current including the 90 kohm pullup is 353.70 uA at 3.3 V. Even ignoring
that extra pullup, current at 3.0 V exceeds 289 uA, above the switch's
100 uA minimum rated load.
[TI TPS3808 Rev N, section 6.5 and MR description](https://www.ti.com/lit/ds/symlink/tps3808.pdf).

Espressif specifies CHIP_PU reset low at or below `0.25 * VDD` and at least
50 us below that threshold. With `tau <= Rdown_max * Cmax = 418.255 us`
and final voltage fraction `a = 0.036462`, the conservative crossing time is
`tau * ln((1 - a) / (0.25 - a)) < 0.64 ms`. A **1 ms stable closure** therefore
provides more than 50 us at a valid reset low. A deliberate press of at least
10 ms covers Omron's 5 ms maximum bounce. Button release leaves the existing
pullup/capacitor startup circuit in control. Verify the final reset waveform and
operation; the component calculation does not replace that check.
[ESP32-C6-WROOM-1 v1.4, Tables 4-8 and 6-3, pages 16 and 26-27](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf),
[Espressif reset timing guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html#chip-power-up-and-reset-timing).

TDK body dimensions are 1.60 +/-0.10 x 0.80 +/-0.10 x 0.80 +/-0.10 mm for
100 nF and 2.00 +/-0.20 x 1.25 +/-0.20 x 1.25 +/-0.20 mm for 1 uF.
Both X7R parts cover -55 to 125 C. Nominal capacitance is not an effective
minimum. The inspected [100 nF bias curve](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608x7r1h104k080aa.pdf)
supports a 5% loss allocation through 6.75 V; with tolerance, temperature and
15% aging allocations, `100 * 0.90 * 0.85 * 0.95 * 0.85 = 61.8 nF`.
The [1 uF curve](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c2012x7r1e105k125ab.pdf)
supports 15% bias loss at 5.363 V and 20% at 6.75 V, giving 0.5527/0.5202 uF
with the same other allocations. These are characterized screening assumptions,
not combined production guarantees or new guaranteed minimum-capacitance claims.
Use 1.265 uF maximum when accounting for the TPS2553 output capacitor in the
existing sensor-feed discharge budget.

## Footprint capture

Native candidates below were inspected in installed KiCad 10.0.5. Dimensions
are in mm. The SMD native patterns are larger than manufacturer examples;
do not record them as exact manufacturer land matches. Use reviewed project-local
lands or explicitly resolve the differences in the [footprint audit](footprint-audit.md).

| Part / native candidate | Manufacturer geometry and mapping |
| --- | --- |
| B3F-1002-G / `Button_Switch_THT:SW_PUSH_6mm_H4.3mm` | 6.5 x 4.5 hole rectangle; Omron recommends 1.0 +/-0.1 holes for 1.6 PCB. Native drill 1.1, pads 2.0. In Omron's top view, upper row is pins 4/3 and lower row 2/1. Pins 1/2 are permanently joined; pins 3/4 are permanently joined. Native repeated pad 1 maps to manufacturer 3/4, repeated pad 2 to 1/2. Connect one pair to signal and the other to GND. |
| WP710A10LGD / `LED_THT:LED_D3.0mm` | Native pad 1 cathode, pad 2 anode; 2.54 pitch and 0.9 holes match the manufacturer's recommended layout. Native copper is 1.8 x 1.8. Preserve cathode marking; the lens flange is 3.2 nominal diameter. |
| ERA3A / ERJ3 / `Resistor_SMD:R_0603_1608Metric` | Manufacturer example: inner gap 0.7-0.9, outer span 2.0-2.2, width 0.8-1.0. Native pads 0.8 x 0.95 at x = +/-0.825 give gap 0.85 and outer span 2.45. |
| TDK 100 nF / `Capacitor_SMD:C_0603_1608Metric` | TDK reflow PA/PB/PC each 0.6-0.8. Native pads 0.9 x 0.95 at x = +/-0.775 give inner gap 0.65. |
| TDK 1 uF / `Capacitor_SMD:C_0805_2012Metric` | TDK reflow PA 0.9-1.2, PB 0.7-0.9, PC 0.9-1.2. Native pads 1.0 x 1.45 at x = +/-0.95 give inner gap 0.90. |

For TDK, PA is the inner gap, PB each pad's length along the component, and PC
pad width. Concrete midpoint examples are two 0.70 x 0.70 pads at x = +/-0.70
for 100 nF and two 0.80 x 1.05 pads at x = +/-0.925 for 1 uF. The Panasonic
midpoint example is two 0.65 x 0.90 pads at x = +/-0.725. These specify copper
only; mask, paste, courtyard, solder process and final footprint approval remain
capture work. Sources: [Panasonic land examples, page 1](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf),
[TDK 0603 lands](https://product.tdk.com/en/search/capacitor/ceramic/mlcc/info?part_no=C1608X7R1H104K080AA),
[TDK 0805 lands](https://product.tdk.com/de/search/capacitor/ceramic/mlcc/info?part_no=C2012X7R1E105K125AB).

## Inspected source identities

SHA-256 of downloaded PDF bytes inspected on 2026-09-12. URLs are the actual
download sources; the Omron mirror supplied the visually inspected drawing.
Product-page links above verify exact ordering codes. Web pages and native library
files are not pinned by this PDF hash table.

| Source | SHA-256 |
| --- | --- |
| [Kingbright WP710A10LGD Rev 9B](https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf) | `7c9e6196c3ba4f86d0cecaf00bc77578ea27dd76d7ab4341ce104781d6a37ccc` |
| [Omron B3F manufacturer mirror](https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3f.pdf) | `be9cf69e5f43fb7689448a2097c19858e5643c0e2e49cd77d018881543e27a1f` |
| [Panasonic ERA, 2024-04-24](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/AOA0000C307.pdf) | `2ffb715174964a986d8cd22f38607a14465c938bb5ff9817e0948124ebb69a5b` |
| [Panasonic lands, 2025-12-24](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf) | `fc707b230cce91d464bc3aaf1ed614fa5b412f40cbe7df7cab1541d2c164a882` |
| [TDK 100 nF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608x7r1h104k080aa.pdf) | `1a0db3109885361f08674eb5b2a35332e85631a3e0c0d80590197a18e3b7fe67` |
| [TDK 1 uF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c2012x7r1e105k125ab.pdf) | `5ca8971a17b99f12b5263703343c3a321d272cafa8281282bf39ae4140f85874` |
