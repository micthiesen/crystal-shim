# Low-voltage controller board

Open the accepted [native KiCad project](kicad/README.md). The controller is ready
for routing: strict schematic ERC is clean; native PCB checks report zero ordinary
DRC violations and zero schematic parity differences. Its 117 footprints include
113 source components and four mounting holes; 253 connections remain unrouted.
The [handoff lock](design/handoff.lock.json) records the accepted shared-power ECO.

The 110 × 110 mm, four-layer board includes ESP32-C6, 3.3 V buck, relay driver,
self-powered USB, known-adapter service input, local controls, two buffered sensor
ports, three default-off future pump drivers and accessible accessory input pads.
No refill or dosing behavior is implemented. Follow the
[fixed attachment contract](../../docs/design/refill-expansion.md).

[Source models](design/README.md), [electrical basis](../../docs/design/controller-design-basis.md),
[placement](../../docs/design/controller-placement.md) and
[stack/routing contract](../../docs/design/controller-stackup.md) own the design.
Native project libraries are repository-local. The
[shared enclosure receipt](../../cad/shared-enclosure/README.md) replaces the old
compact case arrangement.

Route from this accepted board through the [PCB workflow](../../.agents/skills/pcb/SKILL.md).
Complete declared copper, return paths, thermal vias and paste/process checks
while routing, then run final ERC/DRC and manufacturing checks before fabrication.
Final harness construction, calibration and actual skimmer-interference tests use
the assembled unit. No fabrication or operating acceptance is claimed here.
