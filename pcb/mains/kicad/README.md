# Power-board routing handoff

Open [mains.kicad_pro](mains.kicad_pro). The accepted **150 × 110 mm, two-layer**
lower board has 26 footprints and **31 unrouted connections**. Strict ERC,
schematic parity and ordinary DRC pass. Four 3.2 mm NPTH mounts are inset 7 mm
and align with the controller, with 45 mm clear board-face separation.

J1–J4 use Phoenix 1868076 two-position side-entry screw terminals, with both positions used. All 106 previous owner-routed
tracks were cleared as authorized. Eleven ground vias, isolated F.Cu/B.Cu pours,
mounting/barrier exclusions, netclasses and bounded pad-escape rules are applied.
The saved two-layer stack totals 1.6 mm.

Follow the [routing guide](../../../docs/design/routing-guardrails.md). Keep the
primary/SELV boundary intact. Native DRC enforces 3.2 mm between different primary
nets and 8 mm primary-to-SELV clearance. Use netclass width with connected-track
inheritance disabled; narrow segments belong only inside their named pad escapes.

[Stacked-layout evidence](evidence/stacked-layout/) includes the accepted ECO,
exact pad/field parity, strict ERC, filled DRC and five native rule probes.
[Connector ECO](../../../docs/design/evidence/connector-eco/mains/) replaces the headers and obsolete NC labels.
[Final preparation](evidence/final-preparation/) adds service labels and verifies
mask/paste/slot geometry. [The handoff lock](../design/handoff.lock.json) binds
current acceptance. Older
evidence describes superseded board dimensions and connector orientations.

Keep this project, board, custom rules and local libraries together. Route,
refill with **B**, save and run `sh scripts/check-routing.sh mains --final`
before fabrication checks/export. Unconnected items are allowed without `--final`.
