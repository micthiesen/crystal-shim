# Accepted sensor routing

The owner-approved sensor routing is locked on 2026-09-13. This accepts the saved
sensor circuit, C3 placement and routed copper only. Final pre-fabrication review
of sensor, controller and mains together remains pending; no manufacturing package
or ordering release is implied.

[run.json](run.json) indexes content-addressed source checks, strict ERC,
source/native parity, native DRC, preparation audit, layer/schematic renders,
independent review, exact historical routing deltas and the guarded acceptance
receipt. The current handoff lock includes 117 tracks and nine tented vias.
The final routing check has zero findings and zero unconnected items.
All 13 ground pads share one F.Cu region and five GND vias connect it to continuous
In1 ground. U1/C3 has a 3.0708 mm power connection. The original E1 pad geometry,
nets and layers are unchanged. The exact five B.Cu track segments are now protected
by the routing policy; no field restrictions or clearance rules were relaxed.

Because the owner moved C3 and routed the board before this session, a live
`begin` against the old source placement correctly refused parity. The baseline
is the retained accepted handoff snapshot, not a fabricated pre-edit snapshot.
The guarded `accept-eco` command reconstructed the unblocked plan, verified the
15 exact old-track removals and 117 exact new-track additions, checked current
native/source state and preservation, then advanced the existing lock. The run
retains that receipt and passes `pcb_workflow.py status sensor --run
 docs/design/evidence/sensor-routing-acceptance`.

The known copper-only E1 source-placement checker limitation remains exact-output
bound. C3's new center, bounds and edge distance are the only output changes;
substituting its former coordinates reproduces the prior stdout checksum exactly.
Native placement/copper checks pass. All nine vias retain both-side tenting; the
glass face remains free of mask and paste openings.

`sh scripts/check.sh` passed. The owner continues mains routing. Final three-board
fabrication review and physical commissioning remain separate stages.
