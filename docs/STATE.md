# Current state

Last updated: 2026-09-11

## Now

- Initial three-board design brief is encoded in the [dossier](README.md), with
  candidate parts in the [BOM](../bom/bom.csv) and physical checks in the
  [commissioning matrix](../testing/test-matrix.csv). No hardware test has run.
- Owner confirmed **5 mm glass** and a **50 mm sensing span downward from the tank
  rim**. Board padding is allowed; it must not clip over the rim. See [sensor](sensor.md).
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
then define a low-voltage sensor feasibility prototype and its measurements.
Wet glass and reference placement are the main uncertainties; prove those before
committing the complete mains controller geometry. See [sensor](sensor.md),
[G-01](decisions.md) and [build sequence](build.md). Physical validation needs a
sensor prototype and the actual aquarium; source/design work can proceed first.

Exact mating connectors, rim clearance, reference margins, calibrated thresholds,
daily schedule and all protection values remain open in [decisions](decisions.md).

## Candidates not chosen

- Full mains schematic: can be researched independently, but sensor feasibility
  and exact protection/connector selections come first.
- Matter/HomeKit connection: technology and switch behavior are selected; actual
  sensor acquisition and the bounded local run policy precede pairing work.
- Enclosure fabrication: waits for the sensor, connector, filter and reviewed mains layout.

## Learned recently

- Stillair already records received Micro-Fit 3.0 parts; the family question is
  resolved without assuming six-position stock. [Sources](sources.md).
- This project follows Stillair's Rust and tscircuit/Oxc split, including TypeScript
  5.9.3 compatibility, instead of the generic setup service baseline. [Instructions](../AGENTS.md).
