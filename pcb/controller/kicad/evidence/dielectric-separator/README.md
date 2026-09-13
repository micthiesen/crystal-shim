# Dielectric separator clarification

A documentation-only ECO distinguishes the 15 mm antenna reserve for lower
components, metal, wires and mounting hardware from the intact dielectric
separator. The CAD allocation leaves 11.1 mm vertically between separator and
antenna; its RF effect remains unmeasured. Copper exclusions do not change.

Before and after native snapshots are identical. Strict schematic cleanup
passes and the handoff lock was advanced with `accept-eco`. The preceding
stacked-layout DRC result remains applicable: zero ordinary/parity findings
and 166 expected unconnected items. No native geometry or rules changed.
