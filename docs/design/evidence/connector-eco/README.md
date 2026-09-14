# Connector ECO routing handoff

Accepted 2026-09-13. [Validation](validation.json) binds the final controller and mains receipts.

- Mains J1–J4: Phoenix Contact 1868076, two-position side-entry screw terminals. Both positions used; seven unused pins and obsolete NC labels removed. Pin 1 is L, pin 2 N; PE bypasses the board.
- Controller J2: JST S2B-XH-A with XHP-2 housing and SXH-001T-P0.6 contacts, 22 AWG. The 5 V service connector differs from the 12 V Micro-Fit ports.
- Unchanged circuits, board outlines, mounts and unrelated copper. Updated connector escape regions retain trunk-width rules; removed mains dual-tail regions leave eight inactive custom-rule entries without areas.

Each board's `run.json` points to content-addressed source/parity, strict ERC, native DRC, preparation, renders, review and acceptance evidence. The authoritative handoff locks advance only after those checks. Expected unrouted counts are controller 166 and mains 31. Sensor remains unchanged at 21.

Source-driven footprints were applied on isolated native KiCad copies, saved and checked through KiCad, then published with baseline hash checks. Schematic changes used verified Konnect calls. Native library normalization was required before embedding replacement symbols: Konnect's default Datasheet `~` differs from KiCad's normalized empty library field. Native schematic normalization removed serializer whitespace. No protected KiCad file was text-edited.

The preparation audit identified old mains pad-escape bounds. `extend-plan.py` records the supplemental declaration against the original baseline, without restoring or replacing production state. UUID-bound escape receipts prove unrelated geometry and filled copper preservation.

The full project gate passed. Final native validation includes the subsequent escape correction. Physical assembly and routed fabrication acceptance remain outstanding. The fixed terminals require top screwdriver access with controller/separator removed and mains disconnected; see the current mains design basis for strip length and torque.
