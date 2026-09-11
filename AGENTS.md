# Crystal Shim

Three-board water-level interlock for an OASE CrystalSkim 350: an external active
capacitive sensor, an isolated ESP32-C6 controller, and a separate mains board.
Read [docs/STATE.md](docs/STATE.md) first. This repository owns the requirements,
parts, firmware, PCB source, test evidence, and exported mechanical artifacts.

## Project map

- `docs/`: [overview](docs/overview.md), [electrical](docs/electrical.md),
  [sensor](docs/sensor.md), [controls](docs/controls.md), [mechanical](docs/mechanical.md),
  [decisions](docs/decisions.md), [build](docs/build.md), and [sources](docs/sources.md).
- `firmware/core/`: pure Rust `no_std` behavior with injected time and inputs.
- `firmware/cli/`: host simulation; `firmware/app/`: separate ESP32-C6 workspace.
- `pcb/`: Bun/TypeScript tscircuit authoring, then guarded KiCad routing and fabrication.
  `sensor/`, `controller/`, and `mains/` start as requirements, not fabricated designs.
- `bom/bom.csv`: candidate/selected parts and independent purchase status.
- `testing/test-matrix.csv`: commissioning criteria and actual evidence.
- `cad/`: enclosure and sensor-mount exports when dimensions are established.

## Design rules

Preserve the three-board split and mains/low-voltage barrier. The isolated PSU and
relay contact/coil boundary belong on the mains board; the controller and sensor
carry only isolated low voltage. PE is continuous and never switched. Switch hot;
neutral is never switched alone. The pump remains connected to household mains
through a filter and relay, without an isolation transformer.

Relay command defaults off at boot/reset, invalid or stale sensor input, and
maintenance. Networking must not control the availability of local protection.
Automatic runs require water above the restart threshold and an unsuppressed
scheduled window. Explicit HomeKit On may bypass a valid low level for one timed
override, never sensor faults or maintenance. Shared configurable duration starts
at 15 minutes; repeated commands, schedule overlap and config changes cannot extend
an active run indefinitely. See the complete contract in `docs/controls.md`.
Hardware pulldown, watchdog recovery, and software checks do not detect or cure welded
contacts. No GPIO map, electrode dimensions, passive protection values, or mains
spacing is approved yet. Preserve provisional labels until evidence replaces them.

Use the project `$pcb`, `$konnect`, and `$kicad-manufacture` skills for PCB work.
Tscircuit owns new-board schematic, specification, and placement. KiCad owns
downstream routes and declared augmentations. Do not text-edit `.kicad_*` files;
the global schematic-editing skill does not override this project rule. Tooling
fixtures are not product boards. Passing source checks is not an electrical review.

## Firmware and tooling

Follow `../stillair`: bare-metal Rust, stable toolchain, `riscv32imac-unknown-none-elf`,
esp-hal, separate host and embedded workspaces. Keep behavior independent of esp-*
dependencies. Inject monotonic time; use enums and integer calibrated units, focused
modules, and meaningful behavior/failure tests. Hardware bindings stay thin. No
ESP-IDF C SDK, debug leftovers, live credentials, or unrequested flashing.

PCB tooling follows Stillair's pinned Bun, TypeScript 5.9.3, tscircuit, and Oxc.
Do not update TypeScript alone: Stillair observed tscircuit's Rollup compiler-API
integration fail with TypeScript 7. There is no root TypeScript service, mitools,
Biome, or Zod environment config because those do not fit this hardware scaffold.

Validation gate: `sh scripts/check.sh`. It runs host fmt/clippy/tests, embedded
fmt/clippy/release build, PCB lint/format/typecheck and tooling tests, and repository
document checks. Install PCB dependencies first with `cd pcb && bun install --frozen-lockfile`.
Use `python3 .agents/skills/sync/sync-status.py` after shared-tooling changes.
For a real board also run the `$pcb` source, render, parity, ERC/DRC and handoff gates;
hardware tests live in the commissioning matrix and cannot be passed by simulation.

## Continuity and delivery

`../stillair` is the maintained reference; sync resources are declared reciprocally
in `.agents/skills/sync/sync-map.json`. Port procedures, not Stillair's fan circuit,
stock allocations, pin map, fan-specific Matter behavior, or commissioning evidence.
Use Stillair's Matter-over-Wi-Fi stack for the HomeKit switch, with this project's
scheduled-run and override semantics.
Pushover sends confirmed water-state transitions independently of the relay;
notification/network failures never delay local control. Credentials stay out of git.
Local skills are real files under `.agents/skills/`; compatibility links may expose
them to Claude. `$next` selects the next step and `$wrap` records session state.

This is a personal project: commit and push completed work directly to `main`, without
a PR or repeated confirmation. If no remote exists, commit locally and report that.
Preserve concurrent changes. Do not purchase parts, flash hardware, or energize mains
as a side effect of setup. Keep durable knowledge in this repository, not personal
memory. Update these living instructions as project conventions emerge.
