# Mains board

Requirements only. Follow [the electrical specification](../../docs/electrical.md).
The intended board supports protected 120 VAC input, an always-powered isolated
5 V module, and hot-conductor relay switching of the filtered skimmer branch.
The manufactured EMI filter sits alongside this board in the mains section.

Fuse, MOV, RC suppression, exact filter variant, connector set, insulation layout
and enclosure construction remain open design work. There is no mains schematic,
fabrication profile or permission to infer fabrication readiness from the tooling
checks. Add authoritative tscircuit files under `design/` when authoring starts
using [the PCB workflow](../../.agents/skills/pcb/SKILL.md).
