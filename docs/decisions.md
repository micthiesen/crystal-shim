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
- One FDC1004 with continuous level and wet/dry reference electrodes, using TI's
  reference geometry as the design basis. No local sensor processor.
- Rust host-testable core + separate C6 app; tscircuit source before KiCad routing.
- Keep original skimmer cord and standard external mains connections.
- Validate no routine cleaning and no interference-induced PC wake in the actual setup.
- Configurable 15-minute scheduled runs when water permits; HomeKit via Matter over
  Wi-Fi, as a switch. Off suppresses the current window; On permits a bounded manual
  override even at valid low water. No indefinite run. All control tuning is configurable.
- Pushover alerts on confirmed high-to-low and low-to-high water changes, independent
  of pump activity; notification delivery cannot gate local control.
- Freshwater tank. A separate owner-designed clip holds the compact sensor PCB
  snug against glass; this project defines the PCB attachment interface only.
- Controller enclosure sits on a spacious flat surface behind the tank within
  8 inches of the sensor. Settings and scheduling use a local webpage on the ESP.

## Open inputs and selections

| ID | Input/choice | Current state | Resolves |
| --- | --- | --- | --- |
| D-01 | Glass thickness | Confirmed by owner: 5 mm, 2026-09-11 | Sensor sensitivity and geometry |
| D-02 | Desired vertical detection range and mounting datum | Confirmed: 50 mm down from top of tank rim; padding at top/bottom allowed; PCB stays outside glass while separate mount clips over it | Stick outline and reference margins remain to design |
| D-03 | Stop low / automatic restart after refill | Owner confirmed; only within unsuppressed scheduled windows, with explicit timed manual override exception | Product behavior locked |
| D-04 | Existing Stillair connector family | Resolved from BOM: Micro-Fit 3.0, received parts; see sources | Family continuity only |
| D-05 | Six-position sensor header/contact set and wire | Capture candidates: `43045-0600` / `43025-0600` / `43030-0007`, 24 AWG; exact cable and mating drawings owed | Pinout, harness, orderable set |
| D-06 | FDC1004 VSSOP, ESP32-C6-WROOM-1, IRM-05-5 | Capture candidates: FDC1004DGSR, ESP32-C6-WROOM-1-N8, IRM-05-5; footprint/capture review owed | Schematics and power budget |
| D-07 | G5RL-1A-TV8 5 V coil | G5RL-1A-TV8 DC5 sourced motor rating and pin map; design review and final-unit start tests owed | Relay selection and commissioning |
| D-08 | FN2090 filter variant | FN2090A-1-06 / 802490-SF capture candidate | Attenuation, leakage, enclosure fit |
| D-09 | Fuse/MOV/RC/regulators and internal mains connector set | Sourced candidates and calculations in the detailed design basis; integrated schematic review owed | Protection and source capture |
| D-10 | Enclosure, insulation/spacing and earth scheme | Hammond 1554V2GY envelope and conservative spacing proposed; actual CAD/routed mains review owed | Physical safety |
| D-11 | Thresholds, calibration limits and freshness timeout | Open; 1/10/30 s timing seeds provisional | Sensor and firmware tuning |
| D-12 | Retained state and network interface | Matter-over-Wi-Fi selected; host retained schema and schedule implemented, ESP storage/network adapters owed | Hardware firmware |
| D-13 | Run duration and daily schedule | Default 15 min shared by schedule and override, all adjustable; exact daily times/count/timezone open | Local scheduler and configuration |
| D-14 | Water-transition notifications | Pushover selected; first baseline silent; verified TLS provider built and host-tested; keys and delivery/persistence adapter remain work | Notification integration |
| D-15 | Settings interface | Confirmed: ESP-hosted local webpage for settings and schedule; implementation pending | Schedule, calibration, timing and Pushover provisioning workflow |
| D-16 | Aquarium water and mounting envelope | Confirmed: freshwater, ample width with reasonably compact sensor PCB, snug contact via owner's separate gravity/friction clip; other hardware on spacious flat surface behind tank within 8 inches | PCB attachment interface remains project work; printed clip design is out of scope |
| D-17 | Build strategy | Owner confirmed: one-shot final-use build of all three boards; no separate prototype or planned respin | Complete design/review before fabrication; physical calibration and acceptance afterward |
| D-18 | Normal-full water surface below glass rim | Owner measurement requested: proposed RE band requires at least 11 mm below rim | Final reference geometry and valid upper limit |
| D-19 | USB and service power | Self-powered USB data port with hardware VBUS gating; separate isolated 5 V service input | Mains-disconnected programming/calibration without host radio-current dependency |
| D-20 | Sensor bus power sequencing | TCA9517A separates pullup domains; independent GPIO0 enable disconnects the cable during recovery/startup | Prevent sensor backfeed and isolate the unpowered cable's low/floating bus |
| D-21 | Controlled sensor recovery | TPS2553 with GPIO22 enable/GPIO23 fault; discharge resistors and bounded power-cycle/reinitialization sequence | Recover transient sensor faults without blocking control; persistent faults stay off |

The confirmed inputs do not establish electrode geometry or physical thresholds.
Set geometry from TI's reference, the installation constraints and documented
engineering analysis before fabrication. Set physical thresholds from measurements
on the final sensor during commissioning. Sensor measurements do not gate design
or fabrication of the other boards.

The original inputs were sufficient to begin design. TI reference placement now
requires the normal-full surface datum (D-18) before fixing the sensor geometry.
Other board and firmware work continues independently. Exact schedule entries
can wait for the local settings page, and physical stop/restart thresholds need
calibration. Exact part selection, protection values, GPIO allocation and
insulation layout are engineering work, not a list of component choices the owner
must answer before work can proceed.

## Release gates

Gate IDs are stable references, not execution order. G-02/G-03/G-04 are required
for fabrication release of the complete board set. G-01/G-05/G-06 use the final
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
