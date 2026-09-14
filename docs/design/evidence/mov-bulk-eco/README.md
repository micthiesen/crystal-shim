# Bulk MOV footprint change

RV1 now selects Littelfuse TMOV14RP175E. Pad2 has a 4.5 × 1.3 mm plated slot and
6.1 × 2.9 mm copper, centered at local (7.9, 0). Only the right edge grows,
by 0.8 mm. All 89 tracks, 11 vias, copper pours and component placements remain
unchanged. The existing neutral escape rule area follows the new pad bounds.

`run.json` retains the original baseline, checked plan, validation, review and
accepted handoff. Initial preparation/acceptance failures are retained honestly:
the non-copper escape area needed resizing and explicit zone-ownership declaration.
These were corrected through native APIs and the standard final acceptance passed.
`native-preservation.json` is the intermediate pad-change comparison before the
rule-area resize; the accepted workflow snapshot and escape receipt govern final geometry.
`final-check/` repeats validation after correcting two stale size assertions in the
aggregate initial-export test; this test-only edit does not change the manifest.

Independent source/copper and CAM reviews found no blockers. `cam.json` verifies
the replacement archive against the saved native board, including the plated slot.
Use `pcb/mains/fabrication/2026-09-14-mov-bulk/crystal-shim-mains-rev1-jlcpcb.zip`.
The earlier mains archive is superseded; controller and sensor releases are unchanged.
The owner plans a final trace review before ordering. No order has been placed.

The slot uses standard JLCPCB fabrication. Physical MOV seating and whole-body
clearance inspection remain assembly acceptance checks, as specified in
[the current assembly contract](../../mov-capture.md).
