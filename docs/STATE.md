# Current state

Last updated: 2026-09-13

## Now

The proposed [shared stacked-board target](design/stacked-board-target.md) is
150 × 110 mm, controller above mains, matching M3 holes 7 mm from each corner
and a 45 mm inter-board gap. This is a dimensional recommendation for visual
discussion, not an accepted placement or stack-fit result. Native boards remain
unchanged by this proposal. The owner confirmed retaining four controller layers.

The owner has selected a new [sensor visual target](design/sensor-visual-target.md):
slim horizontal pad segments, entirely below the rim, thin adhesive mounting and
a left-exiting cable. Water stays at least 10 mm below the rim. Discuss the other
boards visually before resizing or placement work. The target supersedes the old
sensor clip/above-rim requirements; implementation and electrical verification
are pending. The routing handoffs below still describe the existing geometry.

The agreed simplified design is captured in the specifications, BOM, firmware
bindings, all three tscircuit schematics and placements, and native KiCad projects.
The current milestone is routing preparation, not fabrication or commissioning.

- One 120 VAC input supplies the filtered CrystalSkim and isolated electronics.
  The mains board has an IRM-45-12 and AP63205 5 V buck. The controller retains its
  3.3 V buck. Future loads have a fixed nominal 12 V, 2 A aggregate continuous
  allocation, 3 A brief startup target and 1 A continuous maximum per channel.
- Three simple pump drivers/connectors and a second buffered sensor connection
  are on the current controller, with two accessible accessory input pads.
  Future additions are accessories and a reservoir sensor PCB. The external
  [refill artifact](design/refill-expansion.md) remains the feature specification;
  refill, dosing and reservoir behavior are not implemented. Pump GPIOs stay low.
- Service power uses the known 5 V adapter, a 2 A fused lead and existing diode OR.
  The service and mains secondary eFuses are removed. Sensor regulation uses
  TPS7A2433, with LEVEL and wet reference channels plus stored dry baselines.
  Optional live dry reference and LT3042 circuitry are removed. Ordinary digital
  resistors are 1%; the actual sense divider retains precision parts.
- The demonstrated skimmer EMI requirement, mains/SELV boundary, filter,
  suppression and local control behavior remain. Exceptional overload/reset and
  manual recovery are acceptable. No extraordinary ESD qualification or redundant
  pump safety subsystem was added.
- The shared Hammond 1590ZGRP243 enclosure has a retained manufacturer STEP,
  board/connector/wiring allocations and expanded-envelope fit checks under
  [cad/shared-enclosure](../cad/shared-enclosure/). Board mounts use insulating
  hardware. Mains J1 was moved 3 mm to clear its full mounting envelope.

## Routing handoff

Open the production projects directly. Keep their adjacent project files,
custom rules and local libraries together. Never export a new seed over them.

| Board | Project | Placement | Expected unrouted connections |
| --- | --- | --- | --- |
| Controller | [controller.kicad_pro](../pcb/controller/kicad/controller.kicad_pro) | 110 × 110 mm, 4 layers, 117 footprints | 166 |
| Sensor | [sensor.kicad_pro](../pcb/sensor/kicad/sensor.kicad_pro) | 38 × 86 mm, 2 layers, 16 footprints including electrode copper | 29 |
| Mains | [mains.kicad_pro](../pcb/mains/kicad/mains.kicad_pro) | 180 × 110 mm, 2 layers, 26 footprints | 31 |

All three native ECOs are accepted with strict ERC, source and schematic parity,
preserved geometry and zero ordinary or schematic-parity DRC findings. Expected unconnected items remain because routing is the next
step. Physical commissioning is not claimed by these checks.

Routing settings include power/motor widths, the controller stack and USB class,
antenna/mount copper exclusions, the sensor sensing-window rule area, and mains
3.2 mm primary and 8 mm primary-to-SELV rules plus barrier/mount exclusions.
The five standard initial DRC ignored categories remain explicitly recorded;
applicable fabrication checks and routed connectivity must be closed before an
order. All ERC categories are enabled with no exclusions.

Follow the native project READMEs and each `kicad-augment.json` while routing.
Ground planes and 43 ground/thermal vias are now applied and filled. Native
width/via/layer rules and bounded pad-escape checks are installed; all USB pairs
are recognized by the differential router. See [routing guardrails](design/routing-guardrails.md).
Final trace paths, paste/silk and fabrication checks remain routing/manufacturing work.
Use the declared copper widths and compact buck/motor loops; join sensor copper
islands at the head and keep all layer changes above the rim. Preserve the
controller USB reference plane and the mains clearance boundary.

## Evidence and remaining work

- [Controller native ECO](../pcb/controller/kicad/evidence/shared-power/): previous
  lock, plan, native snapshot, strict cleanup, DRC and complete page renders.
- [Sensor routing evidence](../pcb/sensor/kicad/evidence/routing-ready/): accepted
  ECO, exact pin/copper parity, strict ERC, DRC, physical stack and renders.
- [Mains final ECO](../pcb/mains/design/evidence/final-eco-receipt.json): accepted
  placement, strict ERC, 3.2/8 mm rules, DRC/parity, mounting envelopes and renders.
  Initial adoption evidence is retained beside it.
- `sh scripts/check.sh` passed after all circuit, firmware and tooling corrections:
  firmware/TLS/build checks, 26 UI tests, 250 PCB tests (33,263 assertions) and
  42 handoff tests. [Validation record](design/evidence/routing-ready/validation.json).
- Focused review resolved actual pin/footprint mapping, supply/drop budgets,
  sensor discharge timing, mount/connector interference, native clearance,
  schematic connectivity and library-field defects. It did not expand protection
  scope. Earlier smaller-board/eFuse evidence is historical and superseded.

Run `sh scripts/check-routing.sh` during routing; unconnected items are allowed
until `--final`. All three boards currently have zero ordinary DRC/parity findings.
The eight negative native DRC probes and six USB pair-recognition checks pass.
Current ECO evidence is in each board’s `kicad/evidence/routing-guardrails/`.

The owner can begin routing now. No input
is outstanding for schematic/placement decisions. Final routed DRC/CAM, assembly
process checks, fabrication files and actual calibration, temperatures, pump
startup, EMI/PC sleep and HomeKit behavior remain the later release/commissioning
stages. All physical test rows remain Not run. No parts were ordered, hardware
flashed or mains energized. The broader [delivery goal](goal.md) remains distinct
from this completed routing-preparation milestone.

Routing guardrail validation: [current checks](design/evidence/routing-guardrails/validation.json).
The small via-authorization tooling change was also ported to Stillair (`9f60768`, then the history-cache receipt fix `d48e7e9`);
older shared handoff divergence was not part of this PCB task.
