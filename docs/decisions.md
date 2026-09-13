# Decisions and release gates

Initial brief: owner setup request, 2026-09-11. Requirements and proposals below
are not a released electrical design.

## Baseline

- One-shot project: one complete design and fabrication cycle for the three
  final-use boards. No separate prototype, evaluation-board phase or planned
  respin. Design review precedes fabrication; calibration and actual-load tests
  use the final assembly.
- Three boards: active glass-mounted sensor, low-voltage ESP, and mains board.
  Controller and mains share a physically partitioned enclosure.
- Isolated controller/sensor power; filtered and relay-switched pump mains without
  an isolation transformer. Hot switched; PE continuous.
- One FDC1004 with continuous level and wet reference electrodes, stored dry
  baselines and TI's reference geometry as the design basis. No local sensor processor.
- Rust host-testable core + separate C6 app; tscircuit source before KiCad routing.
- Keep original skimmer cord and standard external mains connections.
- Validate no routine cleaning and no interference-induced PC wake in the actual setup.
- Configurable 15-minute scheduled runs when water permits; HomeKit via Matter over
  Wi-Fi, as a switch. Off suppresses the current window; On permits a bounded manual
  override even at valid low water. No indefinite run. All control tuning is configurable.
- Pushover alerts on confirmed high-to-low and low-to-high water changes, independent
  of pump activity; notification delivery cannot gate local control.
- Freshwater tank. An 18 × 64 mm four-layer sensor adheres below the rim with
  thin uniform film; its outward pigtail exits left. No separate mount is required.
- Controller enclosure sits on a spacious flat surface behind the tank within
  8 inches of the sensor. Settings and scheduling use a local webpage on the ESP.

## Open inputs and selections

| ID | Input/choice | Current state | Resolves |
| --- | --- | --- | --- |
| D-01 | Glass thickness | Confirmed by owner: 5 mm, 2026-09-11 | Sensor sensitivity and geometry |
| D-02 | Physical detection span and mounting datum | 50 mm LEVEL span, board top 2 mm below rim; LEVEL 3..53 mm and wet RL 55..65 mm below rim; top 7 mm LEVEL remains dry at highest water | Physical span retained; usable water travel set by calibration |
| D-03 | Stop low / automatic restart after refill | Owner confirmed; only within unsuppressed scheduled windows, with explicit timed manual override exception | Product behavior locked |
| D-04 | Existing Stillair connector family | Resolved from BOM: Micro-Fit 3.0, received parts; see sources | Family continuity only |
| D-05 | Six-position sensor termination and wire | Sensor J1 six outward solder lands and left-exiting 24 AWG pigtail; controller retains `43045-0600` / `43025-0600` / `43030-0007`; [harness](design/sensor-harness.md) retains cable/crimp evidence | Controller pinout retained; complete harness ≤203.2 mm |
| D-06 | Converter, MCU and power module | FDC1004DGSR, ESP32-C6-WROOM-1-N8 and IRM-45-12 selected in source; AP63205 makes 5 V on the mains board | Schematics and fixed power budget |
| D-07 | G5RL-1A-TV8 5 V coil | G5RL-1A-TV8 DC5 sourced motor rating and pin map; design review and final-unit start tests owed | Relay selection and commissioning |
| D-08 | FN2090 filter variant | FN2090A-1-06 / 802490-SF capture candidate | Attenuation, leakage, enclosure fit |
| D-09 | Fuse/MOV/RC/regulators and internal mains connector set | Complete 22-part mains source: 2 A inlet fuse, 1 A filter-branch fuse and 3 A motor-branch fuse; MOV and physical envelopes retained | Protection and source capture; native release remains separate |
| D-10 | Enclosure, insulation/spacing and earth scheme | Matching 150 × 110 mm boards, four-layer controller above two-layer mains, 45 mm clear gap and insulating separator; Hammond 1590ZGRP243 retained candidate per [mechanical design](mechanical.md) | Aligned M3 holes inset 7 mm; old side-by-side CAD evidence superseded |
| D-11 | Thresholds, calibration limits and freshness timeout | Open; 1/10/30 s timing seeds provisional | Sensor and firmware tuning |
| D-12 | Retained state and network interface | Matter-over-Wi-Fi selected; runtime schedule/retained transactions, actual command/KV adapters, Wi-Fi/BLE, shared TCP stack, bounded USB provisioning writer/sender and original-capture CASE/USB UTC implemented; unattended time-source compatibility and actual pairing remain work | Hardware firmware |
| D-13 | Run duration and daily schedule | Default 15 min shared by schedule and override, all adjustable; exact daily times/count/timezone open | Local scheduler and configuration |
| D-14 | Water-transition notifications | Pushover worker linked; silent first baseline; eight RAM events, 15-minute expiry, three attempts, verified interval TLS and credential suspension; reboot discards queued work | Live API/phone delivery, RF timing and runtime memory remain G-05/G-06 |
| D-15 | Settings interface | Confirmed and linked: ESP-hosted local settings, schedule, thresholds, response timing and Pushover credential actions; private first-configuration encoder/sender implemented; physical calibration workflow remains | Schedule, calibration, timing and Pushover provisioning workflow |
| D-16 | Aquarium water and mounting envelope | Freshwater, 5 mm glass, 18 × 64 mm adhesive-mounted board, entirely below rim, outward electronics/left cable; other hardware within complete 8-inch harness reach | Thin uniform film without bracket; mounting durability and sensitivity require calibration |
| D-17 | Build strategy | Owner confirmed: one-shot final-use build of all three boards; no separate prototype or planned respin | Complete design/review before fabrication; physical calibration and acceptance afterward |
| D-18 | Normal-full surface datum | Water always at least 10 mm below rim; retain LEVEL/wet RL and stored dry baselines, no live dry-reference channel | Ten common-net horizontal bars per LEVEL column; no added measurement channels |
| D-19 | USB and service power | Self-powered USB with VBUS data gating; known GST18U05-P1J adapter through a 2 A fused service lead and existing diode OR | Mains-disconnected setup only; [service design](design/service-input.md); no eFuse, arbitrary supplies or hot mating requirement |
| D-20 | Sensor bus power sequencing | TCA9517A separates pullup domains; independent GPIO0 enable disconnects the cable during recovery/startup | Prevent sensor backfeed and isolate the unpowered cable's low/floating bus |
| D-21 | Controlled sensor recovery | Existing TPS2553 and GPIO22/23 power/fault control shared by two sensor ports; separate 6.8 ohm feed resistors and input bleeders; fixed TPS7A2433 sensor regulator with output-to-input diode | Bounded recovery and invalid/stale fail-off retained; no live dry-reference channel or LT3042 PGFB network |
| D-22 | Private Matter accessory behavior | Use controlled-load `0x010A` identity for Apple Home interoperability, retaining boot-off and bounded leases. Expose only implemented commands; document deviation from the complete plug profile rather than claim conformance. Certification is outside this personal build | Radio implementation can proceed; actual Apple Home pairing/behavior remains G-05 |
| D-23 | Future refill attachment | Three 12 V pump outputs on GPIO1/2/3; reservoir bus GPIO6/7; GPIO4/5 input pads; fixed 2 A aggregate continuous and 1 A per-channel allocation per [interface contract](design/refill-expansion.md) | Present source captures common power and drivers; no later expansion controller PCB; future feature and reservoir board deferred |

The confirmed inputs do not establish electrode geometry or physical thresholds.
Set geometry from TI's reference, the installation constraints and documented
engineering analysis before fabrication. Set physical thresholds from measurements
on the final sensor during commissioning. Sensor measurements do not gate design
or fabrication of the other boards.

The inputs are sufficient to finish this hardware design. The optional live dry
reference has been removed, so no further owner water-surface datum is required.
Exact schedule entries can wait for the local settings page, and physical stop/restart thresholds need
calibration. Exact part selection, protection values, GPIO allocation and
insulation layout are engineering work, not a list of component choices the owner
must answer before work can proceed.

## Release gates

Gate IDs are stable references, not execution order. The D-23 attachment
reservation is included in G-02/G-03/G-04 and must be physically captured before
the present boards are ordered; the future refill feature is not a release gate.
G-02/G-03/G-04 are required for fabrication release of the complete board set. G-01/G-05/G-06 use the final
hardware after assembly; their measurements are not pre-fabrication requirements.

| Gate | Stage | Evidence needed |
| --- | --- | --- |
| G-01 Sensor calibration and acceptance | Final-board commissioning | Rising/falling water, receding wet glass, mount repeatability and interference measurements establish a stable threshold margin on the final sensor |
| G-02 Complete electrical capture | Before fabrication | Documented sensor geometry/channel/shield design basis; exact parts, pin/pad maps, power budget, protection calculations and harness mating views for all three boards; schematic checks and integration review |
| G-03 Mains and enclosure review | Before fabrication | Protection coordination, rated connectors, thermal/insulation/spacing, PE, separation, strain relief and splash/GFCI installation design reviewed |
| G-04 PCB handoff and fabrication | Before fabrication | Tscircuit manifest parity, declared KiCad augmentations, ERC/DRC, renders and assembly/manufacturing files for all three boards per project skills |
| G-05 Firmware on hardware | Final-board commissioning | Calibration/faults, default-off reset/watchdog/USB, maintenance, HomeKit switch, schedule suppression, bounded overrides/expiry, configuration and clock changes, network independence demonstrated |
| G-06 Actual load and installation | Final-assembly commissioning | Pump start/switching, suppression effectiveness, temperature, GFCI/leakage, repeated switching with no PC wake or controller/sensor upset |
| G-07 Unattended use | After commissioning | All applicable gates passed with dated evidence; no routine cleaning goal validated over an agreed observation period |

No gate is passed by creating this repository. A source test cannot establish
isolation, EMC, enclosure suitability or certification of the completed unit.
One-shot describes the planned build, not a guarantee that unmeasured performance
will pass. If final commissioning fails, record the failure and resolve it before
claiming readiness; do not silently pass the test or introduce a planned respin.
