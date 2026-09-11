# Decisions and release gates

Initial brief: owner setup request, 2026-09-11. Requirements and proposals below
are not a released electrical design.

## Baseline

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
| D-05 | Six-position sensor header/contact set and wire | Open; `43025-0600` housing candidate | Pinout, harness, orderable set |
| D-06 | FDC1004 VSSOP, ESP32-C6-WROOM-1, IRM-05-5 | Proposed; exact order suffixes/footprints where needed remain open | Schematics and power budget |
| D-07 | G5RL-1A-TV8 5 V coil | Proposed; exact motor rating and actual start behavior to confirm | Relay selection |
| D-08 | FN2090 filter variant | Open | Attenuation, leakage, enclosure fit |
| D-09 | Fuse/MOV/RC/regulators and internal mains connector set | Open, no generic values frozen | Protection and source capture |
| D-10 | Enclosure, insulation/spacing and earth scheme | Open, reviewed mains layout required | Physical safety |
| D-11 | Thresholds, calibration limits and freshness timeout | Open; 1/10/30 s timing seeds provisional | Sensor and firmware tuning |
| D-12 | Retained state and network interface | HomeKit switch via Matter-over-Wi-Fi selected like Stillair; maintenance and current-window Off suppression need persistence | Hardware firmware |
| D-13 | Run duration and daily schedule | Default 15 min shared by schedule and override, all adjustable; exact daily times/count/timezone open | Local scheduler and configuration |
| D-14 | Water-transition notifications | Pushover selected; first baseline silent; keys and delivery/persistence adapter not provisioned | Notification integration |
| D-15 | Settings interface | Confirmed: ESP-hosted local webpage for settings and schedule; implementation pending | Schedule, calibration, timing and Pushover provisioning workflow |
| D-16 | Aquarium water and mounting envelope | Confirmed: freshwater, ample width with reasonably compact sensor PCB, snug contact via owner's separate gravity/friction clip; other hardware on spacious flat surface behind tank within 8 inches | PCB attachment interface remains project work; printed clip design is out of scope |

The confirmed inputs do not establish electrode geometry or physical thresholds.
Proceed with independent tooling and documentation while designing those from
the reference and measurements. Do not fabricate geometry by guessing.

The owner inputs needed to begin sensor design are resolved. Exact schedule entries
can wait for the local settings page, and physical stop/restart thresholds need
calibration. Exact part selection, protection values, GPIO allocation and
insulation layout are engineering work,
not a list of component choices the owner must answer before work can proceed.

## Release gates

| Gate | Evidence needed |
| --- | --- |
| G-01 Sensor feasibility | Actual glass/range defined; wet/dry reference geometry; receding wet-glass and interference measurements establish threshold margin |
| G-02 Electrical capture | Exact parts, pin/pad maps, power budget, harness mating views; schematic checks and visual review |
| G-03 Mains and enclosure review | Protection coordination, rated connectors, thermal/insulation/spacing, PE, separation, strain relief, splash/GFCI installation reviewed |
| G-04 PCB handoff and fabrication | Tscircuit manifest parity, declared KiCad augmentations, ERC/DRC, renders, assembly and manufacturing evidence per project skills |
| G-05 Firmware on hardware | Calibration/faults, default-off reset/watchdog/USB, maintenance, HomeKit switch, schedule suppression, bounded overrides/expiry, configuration and clock changes, network independence demonstrated |
| G-06 Actual load and installation | Pump start/switching, tuned suppression, temperature, GFCI/leakage, repeated switching with no PC wake or controller/sensor upset |
| G-07 Unattended use | All applicable prior gates passed with dated evidence; no routine cleaning goal validated over an agreed observation period |

No gate is passed by creating this repository. A source test cannot establish
isolation, EMC, enclosure suitability or certification of the completed unit.
