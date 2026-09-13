# Future refill expansion provision

Status: interface reservation requirements, 2026-09-12. Not electrically captured
or applied to the adopted controller. No expansion hardware or firmware is
implemented, and no fabrication readiness is implied.

## Scope and reference

The external [Aquarium refill + conditioning controller, high-level spec v0.1](https://public.mcp.syas.ca/boris/artifacts/art_c4il1nmrk3mtz55xb2)
(`art_c4il1nmrk3mtz55xb2`, updated 2026-09-13 01:34:48 UTC) owns the future
extension concept. All five sections were read for this reservation. Its chemistry,
fluid path, calibration, persistent state and operating behavior are deferred;
this document does not adopt that full specification. Future artifact revisions
require an interface comparison, not automatic changes to this project.

The present three-board fabrication must leave a usable attachment interface so
later refill boards can be added without replacing the Crystal Shim boards.
The later board set and its fabrication are outside the current one-shot build.
The ESP remains the eventual control owner. A future I/O expander and motor-driver
board is allowed; a second autonomous controller is not required. This adapts the
artifact's main-board pump-output proposal to the owner's narrower request:
reserve the interface now and put pump-specific circuitry on later boards.

## Reserved interface

Reserve GPIO1, GPIO2 and GPIO3 exclusively for expansion during the remaining
controller design. They are currently NC, at WROOM module pads 9, 27 and 26.
Preserve current skimmer controls, USB12/13, service UART16/17, strapping pins and
GPIO6/7 external JTAG options. This is digital use only; do not take the ADC from
the existing entropy arrangement.

| Resource | Reservation and eventual contract |
| --- | --- |
| GPIO1, module pad 9 | `EXT_SDA`, separate 3.3 V open-drain expansion data |
| GPIO2, module pad 27 | `EXT_SCL`, separate 3.3 V open-drain expansion clock |
| GPIO3, module pad 26 | Active-high `EXT_ENABLE` with default-off pulldown; additional supply qualification is a review candidate, not a settled requirement |
| Power and return | Dedicated isolated expansion-power output from the mains/power board, sized for all three pumps and extension electronics; voltage/current envelope remains to select |
| Physical connection | Controller signal connector for data, clock, enable and isolated reference; separate power-board connector for motor/electronics power. Exact parts and numbering remain to select |

These names describe intended future nets; they do not exist in the accepted
manifest. Do not reinterpret any existing connector pin or service test pad.
Keep the new connector distinguishable from the tank sensor and service power
connectors by mechanical keying or a verified non-intermateable system, not labels
alone. Allocate mating access, strain relief and cable routing in the low-voltage
enclosure before freezing controller placement. Connector reference, pitch,
position, pin order and protection parts remain engineering selections.

Use the expansion bus for the second FDC1004 and a later digital I/O expander.
The two FDC1004s must never share an unswitched segment: the artifact identifies
their fixed address as 0x50. Keep the existing tank bus on GPIO18/19 untouched.
GPIO1/2 do not by themselves establish another hardware I2C peripheral. Before
capture, verify a bounded software open-drain implementation on this pin pair or
select a bridge with an explicitly identified ESP-side transport that fits these
reserved pins without disturbing current controls. An I2C bridge alone does not
remove the need to drive its input bus. Do not assume an unused second regular
hardware I2C controller. No bus firmware is requested now.

The future extension board must provide at least three independent pump control
bits and two bottle-switch inputs through its I/O expander, with address selection
compatible with the reservoir sensor. Pump flyback, motor decoupling, current
paths, keyed pump outputs and optional input conditioning belong there. Reserve
`EXT_ENABLE` as a direct hardware inhibit independent of expander register state:
power loss, reset or a disconnected cable must disable every motor even if an
expander output was left asserted. The proposed `PSU_GOOD` enable gate must be
reassessed against the common-supply topology before capture; a service-only
scenario that cannot physically power motors does not by itself justify the gate.
Require a receiving-board pulldown as well as the controller request pulldown; an
unplugged cable must not float the enable. Later circuitry must bound enable duration or
otherwise fail off on lost control; a static high level alone is not a watchdog.
Neither a port fault nor waiting on the future bus may stall local skimmer control.

Keep the reservoir FDC1004 near its electrodes. Apply the existing complete
203.2 mm sensor-harness limit to the proposed short expansion sensor path,
including intermediate leads, until an independently reviewed bus arrangement
supports another length. Do not silently enlarge the existing tank harness limit.
Pullup loading, bus capacitance, switched-power recovery and unpowered-pin leakage
must be reviewed for the complete extension path. Include cable ESD protection
and disconnect/isolate the unpowered expansion bus without touching the tank bus.

## Power reservation

**The present mains/power board must supply the controller, extension electronics
and all three future pumps. No separate external pump supply or replacement power
PCB is the planned solution.** This owner clarification supersedes the earlier
separate-supply choice. Select the common isolated supply and any secondary rail
conversion before the present board order, allowing later pump selection within
an explicit voltage/current envelope. Pump-specific drivers can remain on later
extension boards.

The existing [power budget](controller-design-basis.md#33-v-regulator-and-design-budget)
is 850 mA, with a 5 V / 2 A IRM-10-5 and a [secondary eFuse](power-protection-review.md)
minimum limit of 1.0438 A. These are existing skimmer-design values, not a qualified
three-pump power provision. The prior 50 mA electronics-only target does not cover
this requirement and is no longer the expansion power contract.

Before freezing the power board, establish a practical pump envelope from candidate
transfer and dosing pumps: operating voltage, running current, startup/stall
current, supported simultaneous loads and duty. This is interface sizing, not
implementation of the refill or chemistry specification. Size the isolated supply,
secondary conversion, protection, connectors, copper and enclosure allowance for
that envelope plus the base load. Publish the accepted limits so future pumps can
be selected without redesigning or reordering the present boards. Do not assume
any arbitrary later pump will fit, or increase the eFuse limit without checking
the complete path. Selection and sizing are still open.

Provide a dedicated low-voltage power output from the power board to the future
motor board. Motor current and its return must bypass the controller/sensor
connector and sensitive return paths. Expansion electronics may derive power from
that output with local regulation on the later board. Do not require a duplicate
controller-side 50 mA supply branch just for convenience. Keep the isolated
signal reference common as required by the chosen interface.

Use proportionate protection for the selected supply and wiring. Compare existing
supply protections, a fuse or simple current limiter and firmware load sequencing
before mandating another eFuse, independent rail supervisor or timed power stage.
Account for a real motor stall/short and controller reset; do not turn every
recoverable low-voltage fault into a requirement that the rest of the system must
continue operating. A fail-off reset with explicit recovery can be acceptable.
No existing captured protection is removed by this requirements correction.

Service power need only support controller setup and calibration. Powering the
future pumps or the whole extension from service power is not required. Under the
chosen topology, check backfeed and unpowered signal behavior and document a
simple service connection procedure; do not demand arbitrary source combinations
unless they are an intended supported use.

## Closure before the present board order

This reservation is now part of G-02/G-03/G-04. It is not closed by writing this
page. Before controller routing and the final enclosure allocation:

1. Resolve the separate-bus implementation and pump power envelope. Select the
   common isolated supply/rails and both signal and power connectors; close the
   base-plus-extension load, startup/stall, wiring and thermal budgets.
2. Capture the controller signal connector, three GPIO nets, default-off provisions
   and the power-board output/supply changes in authoritative tscircuit. Select
   protection and decoupling from the reviewed topology. Update exact BOM and harness
   mating drawings; preserve base interfaces and the mains isolation boundary.
3. Apply the source delta to the adopted controller through a reviewed ECO and
   native KiCad workflow. Preserve unrelated native state and update the handoff
   lock only after parity, ERC/DRC and visual review. Existing NC markers must be
   removed through that workflow; this document does not change them.
4. Verify connector access, cross-mating prevention, full cable allowance and
   extension-absent behavior. Bind release evidence to the implemented revision.
   Before fabrication review default-off, branch-short, bus-stuck and reverse-power
   cases; measure them on the final boards during commissioning. No pump or
   chemical operation is needed to qualify the present attachment interface.

Do not add refill commands, NVS fields, dosing code, calibration UI or chemical
parts now. The existing N8 module remains selected; eventual state must use the
[gated flash owner](flash-storage.md), and future timing/network work must preserve
local control. No new partition or flash-capacity guarantee is made by this
reservation. Expansion feature implementation and acceptance remain separate work.
