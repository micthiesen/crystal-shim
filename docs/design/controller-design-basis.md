# Controller design basis

Status: complete schematic and source placement under review, 2026-09-12. These selections have source
evidence and calculations; they are not an accepted layout or fabrication release.
The board carries isolated low voltage only. Physical checks remain unrun.

## Module and pin allocation

Use **ESP32-C6-WROOM-1-N8**, with 8 MB flash and the module's PCB antenna. Preserve
the module's RF implementation. The 29-pad WROOM module is not footprint-compatible
with Stillair's MINI module. Use the manufacturer footprint from
[Espressif's KiCad library](https://github.com/espressif/kicad-libraries/blob/main/footprints/Espressif.pretty/ESP32-C6-WROOM-1.kicad_mod),
pin its source revision, and compare its pad coordinates against the datasheet
before importing it. The installed KiCad 10.0.5 stock RF library has C6-MINI but
does not supply this WROOM footprint.

The following allocation uses module pad numbers, not bare-chip pad numbers.
It preserves boot straps GPIO8/9/15 and keeps
GPIO12/13 for native USB. GPIO18/19 use the regular I2C peripheral's GPIO matrix;
they are not a claim to use the LP-I2C fixed pins. No ADC channel is consumed,
leaving the peripheral available to the Matter entropy source used by Stillair.

| Signal | GPIO | Module pad | Circuit and firmware contract |
| --- | --- | --- | --- |
| `RELAY_REQUEST` | 10 | 11 | Active high; 10 kohm external pulldown; initialize low before any other work |
| `MAINTENANCE_N` | 11 | 12 | Momentary button to GND, 10 kohm pullup to 3V3; firmware latches off and requires explicit exit |
| `SENSOR_SDA` | 18 | 16 | Open-drain I2C at 100 kHz; no push-pull high |
| `SENSOR_SCL` | 19 | 17 | Open-drain I2C; finite transaction timeout and bus recovery |
| `STATUS_LED` | 20 | 18 | Active high LED through resistor; startup indication has no power-control role |
| `PSU_GOOD` | 21 | 19 | Input from isolated 5 V supervisor; low is hardware-off and cancels manual demand |
| `SENSOR_POWER_EN` | 22 | 20 | TPS2553 enable; 10 kohm external pulldown; low at reset and during sensor recovery |
| `SENSOR_POWER_FAULT_N` | 23 | 21 | TPS2553 open-drain fault, 10 kohm pullup to 3V3; any assertion invalidates acquisition |
| `SENSOR_BUS_EN` | 0 | 8 | TCA9517A enable, 10 kohm pulldown; disconnect the bus before power-off and until sensor startup completes |
| `USB_D_N` | 12 | 13 | Native USB Serial/JTAG D-, 22 ohm series resistor near module |
| `USB_D_P` | 13 | 14 | Native USB Serial/JTAG D+, 22 ohm series resistor near module |
| `BOOT_N` | 9 | 15 | Separate recessed boot button to GND, 10 kohm pullup; not the maintenance button |
| Boot strap | 8 | 10 | 10 kohm pullup; ensures documented joint-download combination when BOOT_N is low |
| `CHIP_EN` | n/a | 3 | 10 kohm pullup, 1 uF directly to GND, separate reset button through 330 ohm to GND |
| `3V3` | n/a | 2 | Buck output; local 22 uF and 100 nF close to module |
| `GND` | n/a | 1, 28, 29 | Isolated ground, exposed-pad implementation per manufacturer drawing |
| Reserved UART0 | 16, 17 | 25, 24 | Accessible unpopulated service pads; no required external UART bridge |
| NC | n/a | 22 | No connection |

GPIO1/2/3 drive the three future pump channels. GPIO6/7 carry the independent
reservoir sensor bus, relinquishing external JTAG on that pair. GPIO4/5 reach
accessible accessory input pads with a nearby ground pad. Their straps select
SDIO clock edges only; this project does not use SDIO. SPI boot uses GPIO8/9 and
JTAG source selection uses GPIO15. See the full
[attachment pin and power contract](refill-expansion.md) and
[module datasheet Tables 3-1 and 4-3/4-4](https://documentation.espressif.com/esp32-c6-wroom-1_wroom-1u_datasheet_en.html).
The module body is 18 x 25.5 mm; its final antenna position must satisfy the
manufacturer keepout and remain away from the filter, mains wiring and tank.
Place the antenna end at the enclosure's low-voltage outer edge.

## Power domains and USB

Keep these distinct power nets:

- `V5_PSU`: mains-board fixed 5 V buck output, also feeding the relay coil.
- `V5_LOGIC`: diode OR of V5_PSU and V5_SERVICE, feeding the controller buck and
  shared sensor supply, below 5 V by the OR diode drop.
- `V5_SERVICE`: known regulated 5 V adapter input, C20/C21 and D2 anode.
- `V12_PUMP`: separate fused motor supply; no connection to 5 V except through
  the mains-board buck's intended conversion path.
- `3V3`: the controller regulator output. Its tscircuit net spelling is `V3V3`;
  use that one common net when integrating source sections. The sensor has its own regulator.

Use two **STPS2L40U** Schottky diodes in SMB, each with its anode at its respective
source and both cathodes at V5_LOGIC. There is no direct connection from USB VBUS
or V5_LOGIC back to V5_PSU. USB VBUS has no power connection to either input.
This topology prevents the service supply from powering the relay coil and
prevents either supply from driving the other through a forward-biased diode.
Finite reverse leakage still exists; verify that service power leaves the
unpowered coil rail below its operating threshold.
[ST datasheet, Tables 1-4 and package section](https://www.st.com/resource/en/datasheet/stps2l40.pdf).

| Sources present | Logic/sensor supply | Coil supply | Relay eligibility |
| --- | --- | --- | --- |
| None | Off | Off | Off |
| USB only | Off | Off | Off; USB does not power the board |
| Service 5 V, with or without USB | V5_LOGIC from service input | Off | Blocked in hardware and firmware |
| PSU only | V5_LOGIC from PSU | V5_PSU | Requires PSU_GOOD and a valid timed request |
| PSU and service together | Unsupported service procedure | Disconnect mains before service | No simultaneous-source qualification required |

Use a **GCT USB4105-GF-A** USB-C receptacle for USB 2.0, with separate 5.1 kohm
CC1/CC2 pulldowns. Join A6/B6 as D+ and A7/B7 as D- at the connector; do not join
CC1/CC2. The pin and solder-tab geometry must match the
[GCT drawing](https://gct.co/files/drawings/usb4105.pdf) and KiCad's
`Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal` footprint.
Protect D+/D- with **USBLC6-2SC6**, with its VBUS reference connected to connector
VBUS and a short ground return at the connector.
[ST USB protection datasheet](https://www.st.com/resource/en/datasheet/usblc6-2.pdf).

USB is a self-powered data/service interface. Connector VBUS powers no ESP,
sensor or relay load, removing radio current and input bulk charging from the
host's budget. Its only steady load is the hardware presence detector. A separate
regulated isolated **5 V service supply, at least 1 A**, connects to a two-position
Micro-Fit `43045-0200` header through `43025-0200` and `43030-0007` contacts:
circuit 1 V5_SERVICE, circuit 2 GND. It differs in position count from the
three-position coil/PSU harness and six-position sensor harness, but shares its
housing with the new 12 V ports: label and verify all harnesses before connection.
Use the [known adapter and fused service lead](service-input.md).
The former U10 service protection network is removed; C20/C21 and D2 remain.
Put USB and the clearly marked 5 V service input behind the low-voltage service cover. Disconnect the mains cord
for programming and calibration; the final board runs its full radio and sensor
functions from service power while the coil remains unpowered.

Gate D+/D- in hardware with **onsemi FSUSB42MUX**, the leaded MSOP-10 version,
powered from 3V3 with 100 nF bypass. Pin 1 VCC, 2 SEL to GND, 3 D+ and 4 D- to
the connector protection, 5 GND, 6 HSD1- and 7 HSD1+ to the module's respective
22 ohm series resistors. Leave pins 8/9 HSD2-/HSD2+ unconnected. Pin 10 OE is
active low, with a 10 kohm pullup to 3V3. The part supports 2.4-4.4 V supply,
data signals through 4.5 V and powered-off port isolation; these limits suit the
USB full-speed signals without applying 5 V to an ESP pin. Its pinout differs
from TS3USB30E despite the similar package.
[onsemi FSUSB42 datasheet, pin and electrical tables](https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf).

Drive OE from **SN74LVC1G14DBVR**: pin 2 A senses USB VBUS through 1.0 kohm,
with 100 kohm from A to GND; pin 4 Y drives OE. Pin 1 is NC, 3 GND, 5 3V3 with
100 nF bypass. Its Schmitt input accepts up to 5.5 V independently of VCC and
supports partial power-down. VBUS present makes OE low; removal makes OE high.
The detector draws about 50 uA at 5 V plus input leakage. This is independent of
ESP firmware, including ROM download and reset. Verify supported source arrangements,
host-off leakage and USB attach/detach waveforms on the assembled board. The ESP
has no hardware VBUS input for native USB Serial/JTAG; a software-only detach
scheme cannot cover its default ROM pullup.
[TI SN74LVC1G14 input limits and pinout](https://www.ti.com/lit/ds/symlink/sn74lvc1g14.pdf).

## 3.3 V regulator and design budget

Use **AP63203WU-7**, fixed 3.3 V synchronous buck, TSOT26. Pin 1 FB goes directly
to the regulated output, 2 EN to V5_LOGIC, 3 VIN to V5_LOGIC, 4 GND, 5 SW to the
inductor, and 6 BST to a 100 nF capacitor whose other end is SW. There is no
external feedback divider. Keep the VIN capacitor/switching return loop short,
the SW copper small, and the feedback pickup outside that loop.

Use **SRP5030TA-4R7M**, 4.7 uH shielded inductor. Diodes' current datasheet lists
3.9 uH for AP63203 and permits 2.2-10 uH. The 4.7 uH selection reduces ripple
at this low input/output ratio. Bourns lists 53 milliohm maximum DCR, 4.6 A Irms
and 6 A saturation current, above the regulator's 3.1 A maximum peak-limit value.
Its nominal 5.3 x 5.2 mm body, 5.7 mm lead span and 2.8 mm height need an exact manufacturer-pattern footprint,
not an arbitrary 5 mm inductor substitute.
[Diodes DS41326 Rev 3-2, Table 2 and sections 10-14](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf),
[Bourns SRP5030TA drawing and ratings](https://www.bourns.com/docs/product-datasheets/srp5030ta.pdf).

Use **Murata GRM32ER71E226ME15L**, 22 uF +/-20%, 25 V X7R, 1210, for two
input capacitors, two buck-output capacitors and the module's local 22 uF.
The 2.7 mm maximum body height fits the controller allocation. Keep 100 nF
high-frequency bypass at the regulator and module. The input pair replaces the
earlier nominal 10 uF allocation to preserve capacitance after derating.
[Murata current production/model record](https://ds.murata.com/simsurfing/mlcc.html?partnumbers=%5B%22GRM32ER71E226ME15%22%5D).

ROHM's published characterization of this exact Murata series reports a 2%
capacitance reduction at 3.3 V; its curve shows about 20% reduction at 5 V.
For design screening, allow 10% DC-bias loss at 3.3 V, 25% at 5 V, 20% initial
tolerance, 15% temperature change and a further 15% aging allowance. This gives
`44 * 0.80 * 0.85 * 0.90 * 0.85 = 22.9 uF` for the output pair and
`44 * 0.80 * 0.85 * 0.75 * 0.85 = 19.1 uF` at the input. The module's local
capacitor adds output reserve. These are conservative calculation allowances,
not manufacturer-guaranteed combined limits. Retain the exact part through
capture; verify startup, ripple and load-transient response on the final board.
[ROHM 61AN104E Rev 004, page 5 and Figure 6](https://fscdn.rohm.com/en/products/databook/applinote/ic/power/switching_regulator/capacitor_calculation_appli-e.pdf).

Use TDK C1608X7R1H104K080AA for the thirteen 100 nF bypass/bootstrap positions
and C2012X7R1E105K125AB for CHIP_EN, service input and sensor-feed OUT
(three 1 uF positions).
The [small-parts inventory](controller-small-parts.md) enumerates their uses,
resistor ordering codes and effective-capacitance allowances. Do not substitute
the smaller or differently rated Murata series on nominal capacitance alone.

Use one Kingbright WP710A10LGD green THT LED through 680 ohm from GPIO20 and
three Omron B3F-1002-G gold-contact buttons for maintenance, BOOT and reset.
Fit ERJ3EKF3300V, 330 ohm, in series with the reset button to bound discharge of
the CHIP_EN capacitor. Its initial current is below 11 mA and peak resistor loss
below 40 mW. Including the TPS3808 MR internal pullup, held CHIP_EN remains below
0.132 V at a 3.6 V rail. The sourced calculation permits reset after 1 ms stable
closure; a deliberate press of at least 10 ms allows for switch bounce. Keep BOOT
recessed and distinct from maintenance. See the small-parts record for limits and
assembly requirements.

Design the 3.3 V rail for at least **500 mA**; use **600 mA** as the initial
allocated load including module, LED and logic. This is a design allowance, not
a measured consumption figure. Espressif recommends at least 500 mA supply
capability and documents 382 mA in the highest listed Wi-Fi transmit condition.
[Espressif power/USB guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html),
[module datasheet Table 6-4](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf).

Use a **0–50 °C enclosure-air design range** for normal power budgeting.
The common supply and fixed 5 V buck are specified in the
[mains basis](mains-design-basis.md). Allocate at most 50 mV total harness drop
and 0.45 V OR-diode loss. Retain **3.9 V** as the conservative logic input budget,
above AP63203's 3.8 V minimum. The mains 5 V acceptance allocation is
4.8–5.2 V: AP63205 CCM static limits are 4.95–5.05 V plus a project
150 mV dynamic allowance each way. This is a commissioning acceptance bound,
not a guaranteed PFM/startup specification. After 50 mV harness and 450 mV
diode allowances the normal logic floor is 4.3 V. At 600 mA / 3.3 V and 80% assumed efficiency,
controller input is 635 mA. Two sensor boards have a combined 20 mA normal limit,
within the retained 30 mA sensor-feed allowance. With 110 mA cold-coil allowance
and 75 mA reserve the rounded base allocation remains **850 mA**.
Future 12 V loads have their own 2 A continuous allocation. The previous 2 A / 5 V
IRM rating and eFuse voltage-drop model are superseded. Efficiency, diode loss
and harness drop are design allowances; commission actual rails and load steps.
At VIN = 5.125 V, L = 4.7 uH and 1.1 MHz, the ideal inductor ripple estimate is
0.227 A peak-to-peak; include inductance tolerance and frequency spread in review.

## Relay drive and supply qualification

Use **AO3400A**: pad 1 gate, 2 source to GND, 3 drain to `COIL_DRAIN` on the
mains harness. A 100 ohm series gate resistor and 10 kohm gate-source pulldown
sit at the MOSFET. The 30 V drain rating requires the mains-board coil clamp to
stay below it with tolerance and wiring overshoot included. The specified
48 milliohm maximum on-resistance at VGS = 2.5 V gives ample drive margin for a
small 5 V coil at 3.3 V logic.
[AOS AO3400A datasheet](https://www.aosmd.com/res/data_sheets/AO3400A.pdf).

Qualify V5_PSU independently of service power using **TPS3808G01DBVR** plus
**SN74LVC1G08DBVR**. A 95.3 kohm / 10.0 kohm divider, both 0.1%, from V5_PSU
to SENSE gives nominal falling threshold 0.405 x 10.53 = **4.26465 V**. Use the
adjustable G01, not G50: G50's upper threshold/hysteresis can leave too little
margin below the minimum PSU output once ripple and harness loss are included.

TPS3808 pin 1 RESET_N becomes `PSU_GOOD` with a 10 kohm pullup to 3V3; pin 2 GND;
pin 3 MR tied to CHIP_EN; pin 4 CT intentionally open for the 20 ms nominal
release delay; pin 5 SENSE at the divider; pin 6 at 3V3 with 100 nF bypass.
Including ±2% threshold and independent 0.1% resistor tolerances, the falling
threshold spans 4.172-4.358 V. Applying the maximum 3% hysteresis to the upper
case gives a maximum rising threshold of 4.489 V. The power-envelope calculation
permits 4.75 V at this node after the 50 mV harness allowance, leaving 261 mV
above the worst rising threshold. The earlier 100 kohm divider had essentially no
margin once ripple, temperature and wiring were included. Check hot-coil pickup
and measured power transitions before approving this threshold.

The AND gate combines PSU_GOOD and RELAY_REQUEST, then drives the gate resistor.
DBV pin 1 A = request, 2 B = PSU_GOOD, 3 GND, 4 Y = gated request, 5 VCC = 3V3.
Use 100 nF bypass and the request pulldown. This makes service-only coil operation
impossible through the intended supply path, and removes drive when the mains-board
5 V supply is below threshold. It does not detect welded relay contacts or constitute
an independent safety controller. Firmware reads PSU_GOOD and treats its loss as
hardware-off so restored supply cannot resume a stale manual override.
[TI TPS3808 Rev N, pin table and electrical characteristics](https://www.ti.com/lit/ds/symlink/tps3808.pdf),
[TI SN74LVC1G08](https://www.ti.com/lit/ds/symlink/sn74lvc1g08.pdf).

## Sensor bus and power sequencing

Fit **TCA9517ADGKR**, VSSOP-8, on the controller. Pins 1 VCCA and 8 VCCB both
use controller 3V3, each with 100 nF bypass; 4 GND and 5 EN driven by
SENSOR_BUS_EN with a 10 kohm pulldown. Cable
SCL/SDA connect to A-side pins 2/3 through 22 ohm series resistors. ESP SCL/SDA
connect to B-side pins 7/6 with separate 2.70 kohm pullups to controller 3V3.
The cable segment has only the sensor's 2.70 kohm pullups to 3V3_SENSOR. The two
pullup pairs are on buffered segments, not parallel on one wire.

This buffer's I/O tolerates 5.5 V even when either supply is off, and its startup
circuit disables the drivers until both supplies are valid. A charged or faster
sensor rail therefore cannot feed directly into an unpowered ESP GPIO. The cable
side has no controller-sourced high drive; sensor removal or loss of its supply
produces a bus fault, not a valid reading. Firmware releases the bus on error and
uses finite recovery attempts. Do not enable internal ESP pullups as a substitute
for the specified external resistor pair.

The B-side low output is at most 0.60 V, below the ESP's 0.25 x VDD low-input
limit at a valid 3.3 V supply. The ESP must sink its local pullup below the
buffer's 0.45 V contention threshold; verify this against its selected drive
setting and in the final waveform check. The A-side low output is at most 0.20 V
at 6 mA, with less than 1.3 mA pullup load here. Include up to 13 pF per buffer
I/O plus resistor/protection parasitics in the cable rise-time calculation.
[TI TCA9517A Rev E, pin table, electrical limits and power sequencing](https://www.ti.com/lit/ds/symlink/tca9517a.pdf).

Use **TPS2553DBVR**, SOT-23-6, for V5_SENSOR. Pin 1 IN and pin 5 ILIM connect to
V5_LOGIC, pin 2 to GND, pin 3 EN to SENSOR_POWER_EN with a 10 kohm pulldown,
pin 4 FAULT to SENSOR_POWER_FAULT_N with a 10 kohm pullup to 3V3, and pin 6 OUT
to `V5_SENSOR_SW`. Add 100 nF at IN and the existing 1 uF plus a new
`C3216X7R1E106K160AB` 10 uF at OUT. A `CRCW25126R80FKEGHP` 6.8 ohm resistor
connects OUT to cable-side `V5_SENSOR`; its SMBJ7.0A cathode is on the cable side,
anode at isolated GND. The [reviewed refinement](sensor-power-refinement.md)
defines shared recovery, source-collapse behavior and layout limits.
With ILIM shorted to IN, TI's
Table 2 specifies 50/75/100 mA minimum/typical/maximum limiting. The 30 mA normal
budget is below the minimum limit; it is not the protection threshold. This part
limits continuously and has thermal/reverse-voltage protection. The firmware
turns EN off after a fault; do not substitute a latch-off suffix without review.
[TI TPS2553 Rev F, pin table, protection behavior and Table 2](https://www.ti.com/lit/ds/symlink/tps2553.pdf).

Fit a 10 kohm bleeder on `V5_SENSOR_SW` at the controller and another on
`V5_SENSOR` at the daughterboard, so unplugging leaves each board a discharge path.
Each sensor uses TPS7A2433DBVR, 10 µF input/output, 3.01 kΩ output bleed and
10 kΩ input bleed. Its normal allocation is at most 10 mA, including cable
pullups; both ports fit within the 30 mA feed allowance. The reservoir branch
mirrors the tank branch's resistor, clamp, buffered bus and bypassing. GPIO0
disables both buffers and GPIO22 powers both sensors together. Independent
fault-isolated sensor uptime is not required.

Retain 200 ms startup and 2 s power-off recovery. The combined capacitance,
sequential discharge bound and voltage limits are in
[sensor power refinement](sensor-power-refinement.md). The old LT3042 SET-network
settling and load model no longer applies. Firmware uses LEVEL and RL with stored
dry baselines; live RE is not captured. Do not add future reservoir acquisition
or pump behavior to this firmware change.

## Harness and placement interface

Sensor cable: controller **43045-0600** right-angle header, **43025-0600** housing
and **43030-0007** loose-piece female tin contacts for 20-24 AWG. Sensor J1 is
six outward solder lands with a left-exiting pigtail, not a second header. Use 24 AWG
three-pair cable, subject to insulation diameter and exact cable capacitance
checks. The overall harness remains at most 203.2 mm including connector routing.

| Sensor connector circuit | Net | Twisted pair |
| --- | --- | --- |
| 1 | V5_SENSOR, protected branch of V5_LOGIC | 1 with 4 |
| 2 | SDA_CABLE | 2 with 5 |
| 3 | SCL_CABLE | 3 with 6 |
| 4, 5, 6 | GND | Corresponding signal/power return |

`SENSOR_SDA`/`SENSOR_SCL` name the ESP-side TCA B segment. `SDA_CABLE`/`SCL_CABLE`
name this harness segment, reached through separate TCA A pins and 22 ohm
resistors. They must never collapse into one net across the buffer.

Wire each controller circuit number to the same numbered sensor solder land. Molex's
component-side PCB drawing numbers rows 1/2/3 and 4/5/6; do not substitute the
odd/even numbering of a generic two-row connector. Produce mating-face and
wire-entry drawings during capture. At the controller, the drawing's 10.16 mm maximum mating-edge
distance is measured from the locator centre, which lies 4.32 mm ahead of pin 1.
Preserve board material around the locator and reserve the mate/latch/wire sweep
separately; the pin-1-to-edge distance is not the quoted dimension.
[Molex header drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf),
[Molex contact](https://www.molex.com/en-us/products/part-detail/430300007).

Use **43650-0300** single-row right-angle Micro-Fit headers at both ends of the
internal mains-to-controller low-voltage harness, with two **43645-0300** housings
and six **43030-0007** contacts. Circuit 1 is V5_PSU, 2 GND and 3 COIL_DRAIN.
The dual-row 43045/43025 series is not the three-circuit interface. This harness
must not mate with the two-position service input, six-position sensor cable or
internal mains connectors.
[Molex three-position header](https://www.molex.com/en-us/products/part-detail/436500300).

Put the regulator and relay driver at the harness side, the antenna at the
opposite outer edge, and the USB connector/buttons at the service edge. Provide
accessible isolated-ground, V5_PSU, V5_LOGIC, 3V3, SDA, SCL, PSU_GOOD and gated
relay test points. Allocate a **150 × 110 mm**, 1.6 mm nominal controller PCB with
four 3.2 mm non-plated mounting holes at (7,7), (143,7), (7,103) and
(143,103) mm from its upper-left corner. Reserve a 4 mm radius around each hole
for mounting hardware and tool access. Source selects four layers with a
continuous L2 ground reference, nominal 1.6 mm FR4 and top assembly. The exact
stack and USB routing geometry are selected in the
[fabrication contract](controller-stackup.md), with native verification separate.
The [placement basis](controller-placement.md) owns positions and routing intent.
Use the [canonical mechanical stack](../mechanical.md): controller above mains,
45 mm clear board-face gap, matching insulating mounts and retained separator.
The [1590ZGRP243 CAD records](../../cad/shared-enclosure/README.md) distinguish old
side-by-side fit from new evidence. Mating access and final harness lengths must
use the current stack; historical enclosure rotations do not govern it.

## Capture and downstream verification

The complete 113-component source joins the relay-permission circuit, buck/diode
OR, known-adapter service input, USB data gate, module/local controls, two sensor
ports, three future pump drivers and fourteen test pads. A shared placement table
locates every component. U10, its threshold network and service clamps are absent;
the sensor uses a fixed regulator without PGFB circuitry.

Source tests compare the drawn schematic with named nets. USB origin/contact
normalization remains tested at the initial-export boundary. Native parity,
strict schematic ERC, pre-route DRC and physical renders remain separate evidence.
Complete return-path review, connector mating access and native assembly details
against the current enclosure. The [BOM](../../bom/bom.csv) lists exact current
MPNs and quantities. Actual rail, thermal and interference measurements follow
assembly; source capture is not a fabrication release.
