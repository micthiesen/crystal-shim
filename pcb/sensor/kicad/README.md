# Sensor native routing project

The complete source-derived seed was adopted from the verified initial stage on
2026-09-12. Open `sensor.kicad_pro`. The root schematic references
`tanksensor.kicad_sch`; project-local symbol and footprint libraries travel with it.

The initial lock is `../design/handoff.lock.json`. Its original manifest,
augmentation, snapshot and reports are preserved under `../design/evidence/initial`.
`../design/evidence/native-completion-plan.json` records the unblocked plan before
native metadata synchronization. Description fields and unique no-connect net names
were then synchronized from the native schematic netlist through KiCad's API.

The native completion ECO is accepted. `evidence/routing-ready/` contains strict
ERC with no ignored categories, schematic/board/source parity, preservation,
physical stackup readback and reviewed schematic/copper renders. The final DRC has
zero ordinary violations and 41 unrouted connections. Five standard DRC categories
remain at KiCad defaults; no ERC category is waived. The current library is the
portable `libraries-v2/CrystalShim_Sensor.kicad_sym` with exact footprint filters.

Route the electronics above native y=79 mm. Preserve the sensing-window rule area:
no vias or zone fills within (81,79)..(119,143) mm on either copper layer. Connect
each same-net electrode/shield island at its head; retain mask covering on E1 and
keep CIN3/CIN4 open. Ordinary tracks use 0.20 mm clearance; the four electrode and
shield nets use 0.15 mm. Layer changes belong above the sensing window. Follow
[the routing contract](../../../docs/design/sensor-design-basis.md) and close
unconnected nets and fabrication checks after routing.
