Current routing preparation: planes, fills, ground/thermal vias and enforced
routing rules are applied. Follow the [routing guide](../../../docs/design/routing-guardrails.md)
and run `sh scripts/check-routing.sh controller`. The current ECO receipt is
[evidence/routing-guardrails/eco-acceptance.json](evidence/routing-guardrails/eco-acceptance.json).
Earlier evidence/counts below describe the pre-fill placement milestone.

# Controller KiCad routing handoff

Open [controller.kicad_pro](controller.kicad_pro). The accepted shared-power ECO
is ready for routing: **117 footprints, 253 unrouted connections, zero strict ERC
findings, zero ordinary PCB DRC violations and zero schematic parity differences**.
Tscircuit owns schematic identity, specifications and placement. Use a guarded
native ECO for further source changes; never export a fresh seed over this directory.

The [current acceptance](evidence/shared-power/eco-acceptance.json),
[strict cleanup](evidence/shared-power/final-cleanup.json),
[DRC report](evidence/shared-power/final-drc.json) and
[preservation result](evidence/shared-power/final-preservation.json) bind the saved
native handoff. [handoff.lock.json](../design/handoff.lock.json) retains initial
provenance and records the later ECO separately. Files under `evidence/initial/`
and the [initial adoption](evidence/adoption.json) describe historical capture;
they are not current design acceptance. Native symbol/footprint tables use
`${KIPRJMOD}` and the libraries in this directory.

Basic fabrication rules, stack/USB preferences, power net classes and antenna/
mounting keepouts are applied. The [augmentation declaration](../design/kicad-augment.json)
and [stack contract](../../../docs/design/controller-stackup.md) identify the
remaining routed copper, useful thermal area, vias, mask/paste and manufacturing
checks. Native board/stack thickness is 1.6062 mm; 1.6 mm is nominal ordering data.
Keep the matching `.kicad_pro` when reading the board so snapshots retain its
actual rule settings.

Route all connections, preserving the USB reference, short motor flyback loops,
direct 12 V return and sensor separation. Complete routing-dependent augmentation
and final ERC/DRC before fabrication outputs. This handoff does not claim physical
thermal, EMI, sensor or mains commissioning results.
Local `.kicad_prl` preferences, locks and backup archives are not delivery files.
