# Mains board

The complete 23-part electrical source and proposed 135 x 75 mm placement live in
[design](design/README.md). Follow
[the electrical specification](../../docs/electrical.md) and the exact
[mains design basis](../../docs/design/mains-design-basis.md).
The intended board supports protected 120 VAC input, an always-powered isolated
5 V module, and hot-conductor relay switching of the filtered skimmer branch.
The manufactured EMI filter sits alongside this board in the mains section.

The design basis selects the fuse, MOV, RC suppression, exact filter, connectors
and power protection. The fuse, manufactured filter and continuous PE remain
off-board. Three schematic sheets capture the primary circuit, protected isolated
supply and load/coil suppression. MOV assembly acceptance, mated/partition fit,
insulation routing, native handoff and fabrication profile remain work under
[the PCB workflow](../../.agents/skills/pcb/SKILL.md).
