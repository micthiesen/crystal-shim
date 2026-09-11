# Current state

Last updated: 2026-09-11

## Now

- Initial three-board design brief is encoded in the [dossier](README.md), with
  candidate parts in the [BOM](../bom/bom.csv) and physical checks in the
  [commissioning matrix](../testing/test-matrix.csv). No hardware test has run.
- Owner confirmed **5 mm glass** and a **50 mm sensing span downward from the tank
  rim**, with freshwater and ample width for a reasonably compact sensor. Board
  padding is allowed; the PCB stays outside the glass. The owner's separate clip
  goes over the glass and holds it snug by gravity/friction. See [sensor](sensor.md).
- Other hardware sits behind the tank on a spacious flat surface within 8 inches.
  The local settings/schedule webpage is confirmed. The printed clip is outside
  project scope; the PCB attachment interface is included. See [mechanical](mechanical.md).
- Scheduled 15-minute runs, HomeKit switch/temporary overrides and automatic low-water
  control are locked in. All timing and thresholds are adjustable; runs never last
  indefinitely. Exact daily times/timezone remain open. See [controls](controls.md).
- Pushover alerts are required on confirmed high/low water transitions. Live
  notification sending and credentials are deferred to app integration.
- Rust host control/simulator and inert ESP32-C6 app are scaffolded. Actual sensor
  acquisition, GPIO bindings, calibration, watchdog and maintenance persistence
  remain implementation work. [Firmware](../firmware/README.md).
- PCB tools and native skills come from Stillair, with reciprocal sync maps.
  Product board areas contain requirements only; the TSX fixture validates tooling.

## Next

Adapt the TI reference electrode geometry to the confirmed glass and sensing span,
then produce a concrete low-voltage prototype design and measurement plan.
This addresses the main uncertainty, sensing through receding wet glass, before
committing the full controller layout. Scope is a focused sensor design/prototype
task; the risk is inadequate separation between real water level and residual film.
See [sensor](sensor.md), [G-01](decisions.md) and [build sequence](build.md).
Reference study and circuit planning can begin now. Provide a dimensioned PCB
attachment interface for the owner's clip; do not design the clip itself.
Physical validation needs the prototype, snug mount and freshwater aquarium.

Exact mating connectors, retention features, reference margins, calibrated thresholds,
daily schedule and all protection values remain open in [decisions](decisions.md).
No remaining owner question blocks sensor design. D-15 and D-16 are resolved;
schedule times can wait for the settings page, and level thresholds need measurements.

## Candidates not chosen

- Full mains schematic: larger task that unblocks G-02/G-03 and can begin with
  datasheet research; final protection choices need pump measurements. Sensor
  feasibility has priority because it can invalidate the present approach.
- Matter/HomeKit and configuration: medium implementation task, with host work
  available now and actual pairing gated on a C6 board. The local settings webpage
  is selected; this implementation does not resolve sensor feasibility.
- Enclosure design: medium mechanical task that unblocks physical assembly, but
  needs selected filter/connectors and reviewed isolation
  layout. Fabrication now risks making an enclosure that cannot fit the design.

## Learned recently

- Stillair already records received Micro-Fit 3.0 parts; the family question is
  resolved without assuming six-position stock. [Sources](sources.md).
- This project follows Stillair's Rust and tscircuit/Oxc split, including TypeScript
  5.9.3 compatibility, instead of the generic setup service baseline. [Instructions](../AGENTS.md).
