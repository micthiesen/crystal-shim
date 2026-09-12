# Crystal Shim

A water-level interlock for an OASE CrystalSkim 350. An active sensor outside the
aquarium glass reports to an ESP32-C6; a separate mains board filters and switches
the skimmer. The controller and mains board share an enclosure with physical separation.

It runs on configurable 15-minute schedules when the water level permits, with
bounded HomeKit overrides. Every run ends automatically. See [behavior](docs/controls.md).
Pushover alerts report confirmed water-level transitions in either direction.
An ESP-hosted local webpage is selected for settings and schedules. The sensor
targets a freshwater tank with 5 mm glass and is held snug by the owner's separate
clip; this project supplies the PCB attachment interface.

**Build approach:** one complete design and fabrication cycle for all three
final-use boards. Complete design reviews before fabrication, then calibrate and
commission the assembled unit. No separate prototype phase is planned.

**Status:** detailed design and firmware implementation are in progress. The
[design basis](docs/design/README.md) records sourced parts, interfaces and open
engineering checks. Host code includes control, scheduling, retained safety state
and an async FDC1004 driver. There is no product schematic, routed PCB or
commissioned hardware. The embedded app has no relay GPIO binding yet.

Start with [the overview](docs/overview.md) and [current state](docs/STATE.md).
The [decision register](docs/decisions.md) tracks open inputs and release gates.

- [Design dossier](docs/README.md)
- [Firmware and simulator](firmware/README.md)
- [PCB tooling and three board areas](pcb/README.md)
- [Candidate BOM](bom/README.md)
- [Commissioning matrix](testing/README.md)
- [Build sequence](docs/build.md)

Use the pinned toolchains described in the firmware and PCB READMEs. Then:

```sh
cd pcb
bun install --frozen-lockfile
cd ..
sh scripts/check.sh
python3 .agents/skills/sync/sync-status.py
```

Based on `../stillair`: Rust host core + CLI + separate ESP32-C6 app, Bun/tscircuit
authoring, and KiCad downstream production tooling. Relevant skills and tools have
a reciprocal sync map; Stillair's board designs and fan behavior are not imported.
