# Adopted controller KiCad project

Open [controller.kicad_pro](controller.kicad_pro). This is the production working
directory for the controller, still **unrouted**. Tscircuit continues to own its
schematic, component identity, outline and placement. Never export a fresh seed
over this directory; use the [guarded ECO workflow](../../../.agents/skills/pcb/references/kicad-handoff.md).

The reviewed initial stage's 113 native files were copied byte-for-byte and
verified before creating [handoff.lock.json](../design/handoff.lock.json).
[Initial adoption](evidence/adoption.json) binds that event. Files under
`evidence/initial/` describe the historical stage and retain its original absolute
paths. They are provenance, not a dependency on that temporary directory.
The current symbol and footprint tables use `${KIPRJMOD}` and the libraries here.
KiCad's GUI made those relocation changes and saved all eight schematic sheets.

Strict schematic cleanup passes with no ignored categories or ERC findings.
Source geometry and connectivity are preserved: 99 footprints, 51 named board
nets, 71 total schematic nets and 274 logical pin memberships. The board has
216 unconnected items, zero tracks/vias/zones and zero ordinary DRC violations.
Zero violations on this unrouted board does not establish routing readiness or
fabrication readiness.

The [augmentation contract](../design/kicad-augment.json) now has a partially
applied subset: basic fabrication rules, Default/USB90 routing preferences and
known stack layers/material labels/finish. Read the precise scope and unverified
mask/loss-tangent placeholders in [the stackup contract](../../../docs/design/controller-stackup.md).
The native header and stack total are both 1.6062 mm; source 1.6 mm is nominal
ordering data. The initial handoff lock remains the seed baseline. Subsequent
augmentation and preservation evidence records changes against it; it must not
be rewritten as if those later changes were part of the original receipt.
The [current operation record](evidence/basic-augmentation/readback.json) binds
the exact saved board/project, native readbacks, augmentation plan, preservation,
ERC/DRC and inspected render. Its `native-*-operation.py` files are archived
one-time audit records with machine-specific guards, not commands to rerun.
Keep the adjacent `.kicad_pro` when taking a native snapshot: loading the board
alone can return default minimum rules. The retained snapshot and explicit
project-attached readback agree for this complete directory.

Power-route constraints, keepouts, copper zones, special vias, mask/paste details,
routing, mechanical fit, final DRC and manufacturing outputs remain work.
Local `.kicad_prl` preferences, locks and backup archives are not delivery files.
