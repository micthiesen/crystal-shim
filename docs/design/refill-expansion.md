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
| GPIO3, module pad 26 | `EXT_ENABLE_REQUEST`, active high with external pulldown; export `EXT_ENABLE` only after hardware qualification by existing `PSU_GOOD` |
| Power and return | Protected `V5_EXT` logic supply derived from `V5_LOGIC`, plus isolated GND; nominal 5 V minus existing path losses, not a regulated 5 V promise |
| Physical connection | Reserve a locking, polarized connector for those five functions and a second ground contact; select exact header, mating housing, contacts and numbering before capture |

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
expander output was left asserted. Qualify GPIO3 request with the existing
`PSU_GOOD` in hardware before exporting `EXT_ENABLE`, so service-only power cannot
authorize separately powered motors. Require a receiving-board pulldown as well
as the controller request pulldown; an unplugged cable must not float the enable. Later circuitry must bound enable duration or
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

Reserve **50 mA maximum normal input current at V5_EXT for extension electronics**,
including the reservoir sensor supply, I/O expander, pullups and local regulation.
This is a design target to close before fabrication, not available power today.
The future board must fit this ceiling or power its electronics from its separate
isolated pump supply. Do not export controller 3.3 V for motor or sensor loads.

The existing [power budget](controller-design-basis.md#33-v-regulator-and-design-budget)
is 850 mA for the complete system. Adding this reservation makes the design target
900 mA. The [secondary eFuse](power-protection-review.md) minimum limit is
1.0438 A; the old startup envelope adds up to 117 mA, leaving only 26.8 mA if all
loads start together. That subtraction does not qualify the new design. Keep
extension power off during base startup and bound its later charging and fault
current; recalculate total current, capacitance, path loss and thermal margins for
both mains and service operation before accepting the branch. Retain the original
75 mA system reserve. Do not count the IRM-10-5's 2 A nameplate or the old 194 mA
arithmetic gap as an allocated accessory supply.

The controller-side branch must have its own current limiting and controlled
startup, reverse/backfeed protection as required by the chosen topology, and
powered-off signal isolation. A short on the extension must not collapse the base
logic rail. Select the limit tolerance and transient response against remaining
upstream margin; a 50 mA operating allocation is not a current-limit setting.
Verify the future board cannot feed V5_EXT or the GPIOs when independently powered.
Service power may support the reserved electronics, but must not energize pumps.

**Pump power is a separate, later, isolated low-voltage supply connected directly
to the extension motor board.** Its voltage and current depend on later pump
selection. Reserve physical entry and cable space in the low-voltage enclosure;
do not add a mains tap, enlarge the present mains PCB, route motor current through
the controller connector, or assume the existing skimmer supply can run pumps.
Join the isolated signal reference where the eventual interface requires it;
route motor return directly to its supply and away from sensor/controller returns.
This choice removes unknown pump ratings from the present mains-board design.

## Closure before the present board order

This reservation is now part of G-02/G-03/G-04. It is not closed by writing this
page. Before controller routing and the final enclosure allocation:

1. Resolve the separate-bus implementation, select the connector and branch
   protection, and prove the 50 mA power target under the source combinations.
2. Capture the connector, three GPIO nets, pulldowns, PSU_GOOD enable gate, power and signal protection,
   decoupling and placement in authoritative tscircuit. Update exact BOM and harness
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
