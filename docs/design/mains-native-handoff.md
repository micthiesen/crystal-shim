# Mains native handoff

Historical shared-power handoff record before stacked compaction and the
connector ECO. Current J1–J4 are two-position Phoenix Contact 1868076 fixed
terminals: 53 logical pins / 53 lands (31 PTH, 22 SMT), no NC pins, and the
unchanged 53 connected endpoints. The Sabre counts below are historical.
Its dimensions,
J1 move, unconnected counts and acceptance receipts below describe that earlier
geometry. Current source/native acceptance is recorded in [STATE](../STATE.md);
the [routing guide](routing-guardrails.md) governs current routing.

The IRM-45-12/AP63205 shared-power board is adopted and ready for routing at
`pcb/mains/kicad`. Final ECO acceptance is recorded in
`pcb/mains/design/evidence/final-eco-receipt.json`; the accepted source/native lock
is `pcb/mains/design/handoff.lock.json`. It is unrouted and not fabrication-ready.

The accepted circuit has 22 electrical parts, 60 logical pins, 75 numbered lands
(53 PTH/22 SMT), 14 nets/53 connected endpoints and seven intentional NC pins.
Four mounting footprints make 26 total footprints; four mounts and J5/J6 locators
make six NPTH holes. The schematic hierarchy is root plus Primary, Secondary and
Suppression. Source authority remains in `pcb/mains/design`.

## Verified native state

Final strict schematic cleanup passed exact source/XML parity and ERC with no
ignored checks or exclusions. Native DRC including `--schematic-parity` and all
severities returned zero violations and 39 expected unrouted connections. The
ECO preservation check passed with zero errors. Four final schematic pages and
the PCB image were visually reviewed; content fits and the concise hierarchy
names avoid title overlap. Final renders are under `pcb/mains/kicad/review-renders`.

Native project libraries use portable project-relative paths. The saved two-layer
stack is 0.035 mm outer copper, 1.51 mm FR4 core and 0.01 mm mask on each side,
with ENIG. Its sum and the native board header both equal 1.6 mm. This records the
selected nominal construction, not fabricated material or coupon measurements.

The Custom Rules GUI contains 3.2 mm separation between different primary nets
and 8 mm primary-to-SELV clearance. Its syntax check and final DRC pass. Unused
J1–J4 contacts remain primary through footprint membership; no same-footprint
exception is needed. The reviewed input is
[`custom-routing-rules.txt`](../../pcb/mains/design/custom-routing-rules.txt).
Native netclasses use 2 mm primary tracks, 3 mm inlet/MOV and motor/return tracks,
2 mm 5 V/coil power tracks, and 0.3 mm short buck pad-entry tracks; ordinary vias
are 0.6/0.3 mm. The exact class and rule readbacks are archived in design evidence.

Four rule areas prohibit tracks, vias, pads and fills across the primary/SELV
boundary on both copper layers. Four additional 8×8 mm mounting reservations
prohibit tracks, vias and fills. These mount areas permit their existing NPTH
pads because KiCad's pad prohibition also rejects mechanical holes. Source/parity
checks retain the fixed pad inventory. M3 screws, washers and standoffs are all
insulating, with an 8 mm maximum occupied diameter. Every component's native
Fab/courtyard envelope was checked against all four mount reservations.

J1 is at source (-73,-42) mm. Its 3 mm shift right clears the full H3 hardware
allocation by approximately 1 mm. The native move preserved every other pad,
net and size. Before/after snapshots and the unblocked plan are archived under
`pcb/mains/design/evidence`.

## Exporter and evidence

The typed initial adapters preserve source datums, Sabre repeated tails,
J5/J6 locator geometry, PTH masks, exact fields and pin types. F3 uses its declared
30.48 mm formed-lead datum. Only the seven unused Sabre pins get NC markers.
Native APIs synchronize Description fields and unique NC names to schematic XML.

One audited pinned-converter BUCK5_SW label stub overlaps the U2.5–L1.1 trunk.
The initial adapter removes that redundant stub and splits the existing trunk
at its existing junction, preserving the geometric union. Changed motifs are
rejected; a focused regression covers the repair. The native isolation helper
reloads every saved polygon and rule flag, verifies all pad geometry and nets
unchanged, and binds before/after hashes. Its sole allowed project side effect is
native discovery of the existing root schematic.

Actual initial staging evidence is archived under `design/evidence/initial`.
The final cleanup, DRC, stack readback, snapshot and ECO receipt supersede that
initial stage's limited check scope. The old IRM-10-5/eFuse reports do not validate
this topology. No routing, fabrication or physical commissioning is claimed;
routing may now proceed through the project PCB/Konnect workflow.
