# Controller design basis

Status: design for schematic capture, 2026-09-12. These selections have source
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
It avoids GPIO4/5/8/9/15 strapping functions for application controls and keeps
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

Other GPIOs remain explicitly unused in the schematic and manifest. See
[module datasheet v1.4, Tables 3-1 and 4-3, and sections 9-11](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf).
The module body is 18 x 25.5 mm; its final antenna position must satisfy the
manufacturer keepout and remain away from the filter, mains wiring and tank.
Place the antenna end at the enclosure's low-voltage outer edge.

## Power domains and USB

Keep these distinct power nets:

- `V5_PSU`: the protected IRM-10-5 secondary, also feeding the relay coil. The
  mains-board TPS259470 separates it from V5_RAW; raw output never enters this board.
- `V5_LOGIC`: the diode-OR of V5_PSU and V5_SERVICE, feeding the controller buck and
  sensor supply. Its nominal voltage is below 5 V by a diode drop.
- `V5_SERVICE_RAW`: the service adapter connector, ahead of controller protection.
- `V5_SERVICE`: the service eFuse output, ahead of its OR diode.
- `3V3`: the controller regulator output. Its tscircuit net spelling is `V3V3`;
  use that one common net when integrating source sections. The sensor has its own regulator.

Use two **STPS2L40U** Schottky diodes in SMB, each with its anode at its respective
source and both cathodes at V5_LOGIC. There is no direct connection from USB VBUS
or V5_LOGIC back to V5_PSU. USB VBUS has no power connection to either input.
This topology prevents the service supply from powering the relay coil and
prevents either supply from driving the other through a forward-biased diode.
Finite reverse leakage still exists; source-combination testing must verify that
it does not raise an unpowered rail enough to operate a connected device.
[ST datasheet, Tables 1-4 and package section](https://www.st.com/resource/en/datasheet/stps2l40.pdf).

| Sources present | Logic/sensor supply | Coil supply | Relay eligibility |
| --- | --- | --- | --- |
| None | Off | Off | Off |
| USB only | Off | Off | Off; USB does not power the board |
| Service 5 V, with or without USB | V5_LOGIC from service input | Off | Blocked in hardware and firmware |
| PSU only | V5_LOGIC from PSU | V5_PSU | Requires PSU_GOOD and a valid timed request |
| PSU and service supply, with or without USB | Higher effective diode input supplies V5_LOGIC | V5_PSU | Same local interlocks; service power cannot bypass them |

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
circuit 1 V5_SERVICE_RAW, circuit 2 GND. This cannot mate with the three-position
coil/PSU harness or six-position sensor harness. Use the selected
[GST18U05-P1J adapter, Tensility pigtail and service protection](service-input.md).
A second TPS259470, with service-specific 470 kohm control-pin resistors and
input TVS, feeds V5_SERVICE before the OR diode. Its thresholds and reverse-input
conditions differ from the mains eFuse. Source and transient closure remain work.
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
ESP firmware, including ROM download and reset. Verify all supply ramp orders,
host-off leakage and attach/detach waveforms on the assembled board. The ESP
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
Its 5.7 x 5.2 x 2.8 mm package needs an exact manufacturer-pattern footprint,
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

Use TDK C1608X7R1H104K080AA for the ten 100 nF bypass/bootstrap positions and
C2012X7R1E105K125AB for CHIP_EN and sensor-feed OUT (two 1 uF positions).
The [small-parts inventory](controller-small-parts.md) enumerates their uses,
resistor ordering codes and effective-capacitance allowances. Do not substitute
the smaller or differently rated Murata series on nominal capacitance alone.

Use one Kingbright WP710A10LGD green THT LED through 680 ohm from GPIO20 and
three Omron B3F-1002-G gold-contact buttons for maintenance, BOOT and reset.
Fit ERA3AEB331V, 330 ohm, in series with the reset button to bound discharge of
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

Use a **0-50 C enclosure-air design range** for the normal power calculation.
The IRM specifies +/-2.5% output tolerance (including line/load regulation),
200 mV peak-to-peak ripple and +/-0.03%/C temperature coefficient. Conservatively
subtract or add the entire 200 mV ripple allowance and 37.5 mV temperature drift
from 25 C. This gives **4.6375-5.3625 V** at the PSU terminals; do not add its
5.75-6.75 V fault-protection threshold to this normal envelope.

Allocate 38.25 mV eFuse loss, at most 50 mV total supply/return harness loss
at peak load and 0.45 V for the OR diode over 0-50 C. That gives V5_LOGIC at least
4.09925 V under this engineering model. Use **3.9 V** for budgeting, above
AP63203's 3.8 V minimum input:
600 mA at 3.3 V and an assumed 80% efficiency requires **635 mA** input.
With 30 mA sensor, 110 mA cold-coil allowance and 75 mA reserve, the complete
system allocation is **850 mA**, leaving 1150 mA of the 2 A nameplate unallocated.
The 80% efficiency, 0.45 V diode loss and 50 mV harness drop are design allowances,
not guaranteed combined performance. Validate the final diode curve, complete
harness/contact resistance and regulator startup/load steps before release and
measure the resulting rails on the final unit. The supply's temperature derating
still applies above 50 C.
[Mean Well IRM-10 specification, output notes and temperature coefficient](https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf).
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
permits 4.54925 V at this node after eFuse/harness loss, leaving about 60 mV above
the worst rising threshold. The earlier 100 kohm divider had essentially no
margin once ripple, temperature and wiring were included. Check hot-coil pickup
and measured power transitions before approving this threshold.

The AND gate combines PSU_GOOD and RELAY_REQUEST, then drives the gate resistor.
DBV pin 1 A = request, 2 B = PSU_GOOD, 3 GND, 4 Y = gated request, 5 VCC = 3V3.
Use 100 nF bypass and the request pulldown. This makes service-only coil operation
impossible through the intended supply path, and removes drive when the protected
supply is below threshold. It does not detect welded relay contacts or constitute
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
to V5_SENSOR. Add 100 nF at IN and 1 uF at OUT. With ILIM shorted to IN, TI's
Table 2 specifies 50/75/100 mA minimum/typical/maximum limiting. The 30 mA normal
budget is below the minimum limit; it is not the protection threshold. This part
limits continuously and has thermal/reverse-voltage protection. The firmware
turns EN off after a fault; do not substitute a latch-off suffix without review.
[TI TPS2553 Rev F, pin table, protection behavior and Table 2](https://www.ti.com/lit/ds/symlink/tps2553.pdf).

Fit a 10 kohm / 1% bleeder on V5_SENSOR at the controller and 3.01 kohm / 1%
on 3V3_SENSOR at the daughterboard. The latter keeps LT3042 loaded above 1 mA
for its accuracy specification. Each rail's complete maximum capacitance,
including MLCC tolerance, must stay below 20 uF. The maximum individual time
constants are 202 ms and 60.802 ms. Preserve the 2-second off interval for both
cascaded decays; confirm both rails below 0.3 V on the final unit. Include
0.54 mA input bleed, about 1.14 mA output bleed and 7.3 mA LDO overhead in the
30 mA sensor allocation. Exact capacitor and regulator calculations are in the
[sensor basis](sensor-design-basis.md#passives-and-power-nets).

On an acquisition timeout, malformed frame or asserted power fault, publish
invalid input immediately. The separate control task turns the relay off without
awaiting recovery. Abort the HAL transaction, release SDA/SCL and lower
SENSOR_BUS_EN before turning sensor power off. Keep the buffer disabled throughout
the 2-second discharge interval and subsequent supply startup. This isolates the
unpowered cable's floating/low inputs from the ESP segment. GPIO0 is independent
of the power-enable GPIO so the buffer cannot reconnect during the rail ramp.

After restoring sensor power, wait at least 200 ms with the buffer disabled.
The LT3042 SET-network calculation permits 99.9% settling within 136 ms;
the 200 ms allowance also covers the current-limited feed ramp. Verify the
assembled startup waveform during commissioning.
Release both ESP bus pins, enable the buffer between transactions, check both
lines high within a bounded timeout, and then reinitialize the FDC before
accepting an entirely new frame. Normal EN changes occur with an idle bus as TI
requires. Disconnecting a stuck bus is deliberate transaction cancellation;
never continue the old transfer after reconnecting. Limit automatic recovery to
three attempts per minute. A persistent cable short remains a reported fault
and keeps the relay off; power cycling cannot repair it. Exact cable ESD parts
remain to be selected.

## Harness and placement interface

Sensor cable: matching **43045-0600** right-angle headers, **43025-0600** housings
and **43030-0007** loose-piece female tin contacts for 20-24 AWG. Use 24 AWG
three-pair cable, subject to insulation diameter and exact cable capacitance
checks. The overall harness remains at most 203.2 mm including connector routing.

| Sensor connector circuit | Net | Twisted pair |
| --- | --- | --- |
| 1 | V5_SENSOR, protected branch of V5_LOGIC | 1 with 4 |
| 2 | SENSOR_SDA | 2 with 5 |
| 3 | SENSOR_SCL | 3 with 6 |
| 4, 5, 6 | GND | Corresponding signal/power return |

Wire circuit number to the same circuit number at the opposite end. Molex's
component-side PCB drawing numbers rows 1/2/3 and 4/5/6; do not substitute the
odd/even numbering of a generic two-row connector. Produce mating-face and
wire-entry drawings during capture. Keep the header within the drawing's
10.16 mm maximum distance from the PCB edge for mating clearance.
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
relay test points. Allocate a **70 x 110 mm**, 1.6 mm nominal controller PCB with
four 3.2 mm non-plated mounting holes at (5,5), (65,5), (5,105) and (65,105) mm
from its upper-left corner. The 70 mm axis spans the 75 mm controller bay.
Keep antenna copper clearance independent of these mounting allocations; move
the module or holes if the manufacturer's keepout conflicts during placement.
This is an initial CAD allocation, not a verified enclosure fit. Final connector
overhang, service access, standoffs, antenna keepout and cable bends must fit the
[enclosure coordinates](mains-design-basis.md#enclosure-and-layout).

## Capture work still owed

The source now includes USB4105-GF-A, TPS259470 and SMBJ8.0CA copper/pin models.
USB origin/pin normalization and eFuse custom-pad anchor correction are tested
at the initial-export boundary; complete-board integration and native parity are
still required. Capture the selected service-input circuit and finish its
transient model, sensor-feed ESD, connector mating drawings, remaining passive
footprints and the enclosure fit. Review the schematic and transient
power combinations before adopting these selections as a fabrication baseline.
