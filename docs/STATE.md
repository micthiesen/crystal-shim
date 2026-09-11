# Current state

Last updated: 2026-09-11

## Now

- The owner selected a **one-shot final-use build**: complete the three-board
  design and reviews, fabricate one board set, then assemble and commission it.
  No separate prototype or planned respin. See [D-17 and release gates](decisions.md)
  and the [build sequence](build.md).
- Freshwater, **5 mm glass**, **50 mm sensing span down from the rim**, compact
  sensor with padding allowed. The owner's separate gravity/friction clip is out
  of scope; the PCB attachment interface is included. Other hardware sits behind
  the tank on a flat surface within 8 inches. See [sensor](sensor.md) and
  [mechanical](mechanical.md).
- Adjustable 15-minute scheduled runs, automatic low-water stop/recovery, bounded
  HomeKit overrides, a local settings/schedule webpage and Pushover water-transition
  alerts are specified. All runs end automatically. See [controls](controls.md).
- Rust host control/simulator and an inert ESP32-C6 app are scaffolded. Sensor
  acquisition, GPIO bindings, calibration/storage, watchdog, Matter, web settings
  and live Pushover integration remain implementation work. [Firmware](../firmware/README.md).
- PCB tools and native skills follow Stillair with reciprocal sync maps. Board
  areas contain requirements only; the TSX fixture validates tooling. The
  [BOM](../bom/bom.csv) has candidates, and every physical check in the
  [commissioning matrix](../testing/test-matrix.csv) remains unrun.

## Next

Complete the design basis and interfaces for **all three final boards**: adapt
TI's electrode/shield geometry, select exact parts and footprints, define the
harnesses and GPIO map, calculate power/protection margins and establish the
enclosure and PCB attachment interfaces. This unblocks coherent schematic/layout
work and one fabrication release without waiting for a sensor prototype.

This is a substantial design task, startable from references and engineering
analysis without hardware in hand. The main uncertainties are the sensor's actual
wet-glass margin and actual-load suppression; review their design assumptions
before fabrication, then verify them during final-assembly commissioning.
See [G-02/G-03/G-04](decisions.md), [electrical](electrical.md), [sensor](sensor.md)
and [build sequence](build.md).

No owner question blocks this work. Exact parts, geometry, protection values and
insulation layout remain engineering selections. Schedule entries and physical
thresholds are configured on the finished unit; G-01 sensor acceptance is owed
after assembly, not before controller/mains design or fabrication.

## Candidates not chosen

- Firmware integration: medium-to-large task that advances G-05; host work can
  proceed alongside design, while actual pairing and GPIO validation use the final
  boards. Establishing hardware interfaces first avoids binding drivers to an
  unsettled pin map.
- Enclosure CAD: medium task that supports G-03/G-04 and is startable without
  hardware, but exact filter/connectors and board envelopes must be selected
  before dimensioned fit can be reviewed. The owner's clip CAD remains out of scope.

## Learned recently

- Prototype-first planning is superseded by the owner's one-shot build decision;
  design review precedes fabrication and measured acceptance follows assembly.
  [Build strategy](decisions.md), [build sequence](build.md).
- Stillair already records received Micro-Fit 3.0 parts; the family question is
  resolved without assuming six-position stock. [Sources](sources.md).
- This project follows Stillair's Rust and tscircuit/Oxc split, including TypeScript
  5.9.3 compatibility, instead of the generic setup service baseline. [Instructions](../AGENTS.md).
