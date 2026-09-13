# Future refill attachment

Status: current-board hardware capture and all three native handoffs are accepted
for routing, 2026-09-12. [STATE](../STATE.md) records per-board acceptance. Future
feature implementation remains deferred.

## Scope and reference

The external [Aquarium refill + conditioning controller, high-level spec v0.1](https://public.mcp.syas.ca/boris/artifacts/art_c4il1nmrk3mtz55xb2)
(`art_c4il1nmrk3mtz55xb2`, read revision updated 2026-09-13 01:34:48 UTC) owns the
future feature. Its chemistry, fluid path, calibration, persistent state and
operating behavior are deferred. This page defines only the hardware provision;
it does not adopt or reproduce that specification.

The present board order includes three pump drivers and their connectors on the
controller, common power on the mains board, and a second sensor connection.
Later additions are accessories and a reservoir sensor PCB. No separate expansion
controller, I/O-expander or motor-driver PCB is planned. No refill, dosing,
reservoir-calibration or chemistry firmware is implemented now.

## Fixed power and pump contract

One household 120 VAC input powers the CrystalSkim and every isolated low-voltage
load. The PCB-mounted Mean Well IRM-45-12 supplies 12 V; the mains-board AP63205
makes 5 V for the existing controller/relay harness. The controller makes 3.3 V.
Keep the skimmer's manufactured two-stage mains filter and contact suppression.
The pump is not transformer-isolated from household mains. The power-module and
relay boundaries isolate the low-voltage electronics.

Future accessories must be selected within these fixed limits:

| Resource | Contract |
| --- | --- |
| Future load voltage | Nominal 12 V DC; design supply envelope 11.46–12.54 V |
| Future aggregate continuous allocation | 2 A, including pump loads and future auxiliary electronics |
| Brief aggregate motor startup | 3 A design target; verify selected motors against the supply and fuse time/current behavior |
| Each pump channel | At most 1 A continuous; three independently switched brushed-DC loads |
| Water lift | At most 10 inches; very slow transfer is acceptable |
| Reservoir location | Adjacent to the enclosure/tank; no long-distance interface requirement |

The 3 A fuse is wiring/branch protection, not an electronic 3 A current limiter.
Supply hiccup or a reset during an exceptional overload is acceptable; do not
require every other subsystem to continue uninterrupted. Select later motors to
fit the allocation, including starting and stall behavior. Do not enlarge the
present supply or add adjustable rails to accommodate arbitrary motors.

The existing base allowance is 5 V at 850 mA. At a conservative 80% secondary-buck
efficiency this consumes 5.3125 W at the 12 V source. Base plus 2 A at 12.54 V is
30.3925 W; base plus 3 A is 42.9325 W, within the 45.6 W module nameplate. This is
an allocation calculation, not measured startup or enclosed thermal evidence.
The module's full-load ambient limit is 50 °C at input of at least 100 VAC;
commission the assembled enclosure accordingly.

## Controller interfaces

| Resource | Current-board assignment |
| --- | --- |
| GPIO1, WROOM pad 9 | `PUMP_TRANSFER`, Q2, output J7 |
| GPIO2, WROOM pad 27 | `PUMP_CHLORINE`, Q3, output J8 |
| GPIO3, WROOM pad 26 | `PUMP_DECHLOR`, Q4, output J9 |
| GPIO6, WROOM pad 6 | `RESERVOIR_SDA`, second sensor bus |
| GPIO7, WROOM pad 7 | `RESERVOIR_SCL`, second sensor bus |
| J6 | Fused 12 V input from the mains board; pin 1 positive, pin 2 return |
| J7/J8/J9 | Pin 1 common 12 V, pin 2 independently switched negative |
| J5 | Reservoir sensor: 1 switched 5 V, 2 SDA, 3 SCL, 4/5/6 ground |

Each motor channel has an AO3400A low-side switch, 100 Ω gate resistor, 10 kΩ
pulldown and STPS2L40U flyback diode. Present firmware initializes all three outputs
low and retains them in that state. Hardware pulldowns cover reset and startup.
There is no master-enable expander, independent motor watchdog or added rail
supervisor. Future firmware owns sequencing and timeouts under the existing
control/watchdog architecture.

Motor current must run from J6 through the output bank and return directly to
J6.2, with local bulk capacitance. Do not route it through the sensor return or
three-wire 5 V harness. Grounds are common on the isolated side; preserve an
unbroken reference plane and keep the motor loop out of sensitive circuitry.

The existing tank bus remains GPIO18/19. Both FDC1004s use address 0x50, so the
reservoir gets its own TCA9517A-buffered segment on GPIO6/7. These pins support a
future software open-drain bus; this does not assert a second regular hardware
I2C peripheral. External GPIO6/7 JTAG is relinquished; native USB and UART16/17
remain available. GPIO4/5 reach TP12/TP13 (`ACCESSORY_INPUT1/2`), with TP14 ground. These
are 3.3 V input attachment pads; no current bottle-switch firmware is added.
Grounded contacts affect only the unused SDIO clock-edge straps, not SPI boot.

Both sensor ports share the existing TPS2553 switched power and GPIO0 bus-enable
recovery control. Each sensor is allocated 10 mA maximum normal current, 20 mA
combined. The reservoir branch mirrors the short tank interface's series power
resistor, signal resistors and connector protection. Shared recovery may interrupt
both sensors; uninterrupted reservoir operation during tank recovery is not a
requirement. Future bus work must not block local skimmer control.

The complete cable length remains at most 203.2 mm per sensor, including internal
leads. Place the reservoir FDC1004 next to its electrodes. The two sensor ports
have identical electrical pinouts. Label all connectors and harnesses with their
function and polarity; use a verified wiring drawing during assembly.

## Simplification boundaries

Service power supports setup and calibration only, using a known regulated 5 V
adapter with mains disconnected. It does not power motors. The existing diode OR
path remains; the controller service eFuse, its threshold network and extra clamps
are removed. Arbitrary simultaneous supplies and live connector mating are not
supported use cases. USB remains self-powered according to its existing circuit.

The mains secondary uses the supply's protections and a fused motor branch,
without another secondary eFuse or independent buck-failure supervisor. Digital
pullups, pulldowns and series resistors use ordinary 1% parts. Precision remains
where the actual voltage-sensing calculation needs it. The sensor uses a simple
fixed TPS7A2433 regulator and the two-channel LEVEL/RL measurement with stored dry
baselines; the optional live dry-reference electrode is removed.

Keep real mains separation, PE continuity, skimmer EMI filtering, default-off
behavior and meaningful short/return-path checks. Formal contact/air ESD
qualification levels and uninterrupted operation through every exceptional fault
are not requirements. Physical interference and ordinary operating checks remain
commissioning evidence, not claims made from source tests.

## Routing and fabrication boundary

Current source captures the interfaces, exact parts, power budget and placement.
The controller and mains ECOs and sensor initial handoff have accepted native
locks, preservation/parity evidence, strict schematic ERC and clean pre-route DRC.
Unrouted connections are the remaining routing task; no further owner input or
hardware feature decision is required to start routing.

Route the three accepted boards and complete their declared copper, return-path,
thermal-via and paste/process checks. Run final ERC/DRC and fabrication gates
before ordering. Measure assembled rails, motor startup and actual skimmer
interference during commissioning. Future pump selection and feature
implementation remain separate work.

Future persistence must use the existing [gated flash owner](flash-storage.md).
No new partition or capacity guarantee is made. No chemical parts, refill commands,
NVS fields or dosing UI are added by this hardware provision.
