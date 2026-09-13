---
name: kicad-manufacture
description: "Generate and validate downstream KiCad fabrication outputs for Crystal Shim. Use for Gerbers, drill, JLCPCB, BOM/CPL, assembly files, production export or ordering."
---

# KiCad fabrication

Use the canonical [manufacturing output profile](../../../docs/design/manufacturing-output.md)
for all three accepted native boards: board construction, assembly split, exact
exclusions, sourcing and KiCad CLI export paths. Do not run or copy Stillair's
board-specific `jlc_fab.py` profiles. Tooling smoke checks do not establish
fabrication readiness.

Fabrication starts after the local [PCB skill](../pcb/SKILL.md) routed-KiCad review
passes. Require current source-to-KiCad parity and verified implementation of each
required `design/kicad-augment.json` item. Board profiles must explicitly state
layers, assembly mode, DNP/no-part/hand-solder sets, sourcing policy and output path.

Before export, save the project and refill zones. Run the actual board's ERC/DRC
path, allow only exact reviewed waivers, and require zero unconnected items. Check
outline, drills, stackup/copper, insulation constraints, mask/paste, special vias,
critical orientations and component side. Match the Gerber layer set and assembly
split to the order contract.

Use `kicad-cli`, reviewed project tooling and direct artifact inspection. Do not
use Konnect's manufacturing package or validator as release evidence; Stillair
observed incorrect outputs and false-ready reports on its KiCad 10 workflow.

After export inspect archive contents, drill table, board/copper renders, BOM/CPL
and release manifest. The fabricator's current quote and DFM output govern live
capabilities and prices. Confirm every assembled part's placement, pin 1 and
polarity in the order preview, then review returned CAM/engineering files against
the board's documented requirements before approval. Repository setup does not
authorize placing a paid order.
