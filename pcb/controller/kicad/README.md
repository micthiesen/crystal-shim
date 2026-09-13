# Controller routing handoff

Open [controller.kicad_pro](controller.kicad_pro). This is the accepted
150 × 110 mm, four-layer upper board: 117 footprints, **166 unrouted connections**,
clean strict ERC, no schematic parity differences and no ordinary DRC findings.
Four 3.2 mm NPTH mounts are inset 7 mm and align with the mains board below.

Ground pours, reference plane, thermal/ground vias, netclasses, bounded pad
escapes and native custom rules are installed. Follow the
[routing guide](../../../docs/design/routing-guardrails.md) for order and widths.
Keep In1.Cu as ground reference; route USB pairs on F.Cu without vias. The saved
physical stack totals 1.6062 mm; the ordering thickness is nominally 1.6 mm.

[Stacked-layout evidence](evidence/stacked-layout/) records the native move,
source parity, strict ERC, filled DRC and preservation checks. The subsequent
[separator receipt](evidence/dielectric-separator/) changes only the declared
mechanical contract. [Final preparation](evidence/pre-routing-preparation/)
corrects USB shell/duplicate paste, completes service labels and records the
100 µm stencil/order process. [The lock](../design/handoff.lock.json) records acceptance.
Earlier evidence directories describe historical placements.

Keep the project, board, custom rules and local libraries together. Do not export
a new source seed over this native project. Route, refill with **B**, save and run
`sh scripts/check-routing.sh controller --final` before fabrication checks/export.
Unconnected items are allowed when `--final` is omitted during routing.
