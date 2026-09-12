# Mains board

Selected power-module, relay, protection and suppression source lives in
[design](design/README.md);
the complete mains schematic remains work. Follow
[the electrical specification](../../docs/electrical.md) and the exact
[mains design basis](../../docs/design/mains-design-basis.md).
The intended board supports protected 120 VAC input, an always-powered isolated
5 V module, and hot-conductor relay switching of the filtered skimmer branch.
The manufactured EMI filter sits alongside this board in the mains section.

The design basis selects the fuse, MOV, RC suppression, exact filter, connectors
and power protection. Their footprint capture, insulation layout, enclosure fit
and final-unit verification remain work. The captured sections are not yet a
complete mains schematic or placement. MOV/header capture, inlet-fuse wiring, the native
handoff and fabrication profile remain work under
[the PCB workflow](../../.agents/skills/pcb/SKILL.md).
