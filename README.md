# Crystal Shim

A water-level interlock for an OASE CrystalSkim 350. An active sensor outside the
aquarium glass reports to an ESP32-C6; a separate mains board filters and switches
the skimmer. The controller and mains board share an enclosure with physical separation.

It runs on configurable 15-minute schedules when the water level permits, with
bounded HomeKit overrides. Every run ends automatically. See [behavior](docs/controls.md).
Pushover alerts report confirmed water-level transitions in either direction.
An ESP-hosted local webpage implements settings and schedules. The sensor
targets a freshwater tank with 5 mm glass and is held snug by the owner's separate
clip; this project supplies the PCB attachment interface.

**Build approach:** one complete design and fabrication cycle for all three
final-use boards. Complete design reviews before fabrication, then calibrate and
commission the assembled unit. No separate prototype phase is planned.

**Status:** the shared-power controller ECO is accepted and ready for routing.
Its schematic passes strict ERC; native PCB checks report zero ordinary DRC
violations and zero schematic parity differences, with 253 connections to route.
The sensor is also accepted for routing: 16 footprints, 41 unrouted connections
and zero strict ERC, ordinary DRC or parity findings. The mains board is accepted
with 26 footprints, 39 unrouted connections and the same clean checks. All three
boards are ready for routing. See [current state](docs/STATE.md) for receipts.
The C6 application includes sensing, relay/watchdog control, retained state,
private Matter provisioning, local settings and verified-TLS Pushover delivery.
The present hardware includes fixed 12 V power, three future pump drivers and a
second sensor port under the [refill attachment contract](docs/design/refill-expansion.md).
Future refill/conditioning behavior is deferred. Routing, fabrication release and
physical calibration/commissioning remain separate work.

Start with [the overview](docs/overview.md) and [current state](docs/STATE.md).
The [decision register](docs/decisions.md) tracks open inputs and release gates.

- [Design dossier](docs/README.md)
- [Firmware and simulator](firmware/README.md)
- [PCB tooling and three board areas](pcb/README.md)
- [Bill of materials](bom/README.md)
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
