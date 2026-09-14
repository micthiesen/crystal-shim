# Mains placement allocation

The stacked revision uses **150 × 110 mm**, two copper layers and nominal 1.6 mm
FR4, below the matching controller with 45 mm clear board-face separation.
It retains the IRM-45-12, AP63205, relay, suppression and all circuit connections;
J1–J4 use two-position **Phoenix Contact 1868076** fixed side-entry screw
terminals. Both positions are used; no mating housing or unused metal remains.
The former 180 × 110 mm placement and J1 (-73,-42) clearance measurements are
superseded and do not establish this placement's fit.

The authoritative component datums are in
[`placements.ts`](../../pcb/mains/design/placements.ts), millimetres with +X
right/+Y up. U1 uses its drawing origin, not body centre; K1 uses contact pin 3.
Both boards share four 3.2 mm NPTH mounts at **(±68,±48)**, 7 mm from each edge,
with at least 4 mm radius reserved for insulating M3 hardware. All components
mount on top. J5/J6 retain their connector locator holes and side-facing access.

Place U1, primary connectors, MOV, fuse and relay contacts in their declared
primary allocation; keep the buck/secondary harness region on the isolated side.
Leave routing channels around the 87 × 52 mm supply body. Retain 8 mm
primary-to-isolated and 3.2 mm different-primary-net separation for pads, traces,
filled zones and occupied metal. Soldermask is not insulation. Source/native
checks use the current terminal geometry, including screw and wire occupancy.

Keep filter LINE and LOAD harnesses apart. Reserve 35 mm outward wire access
for primary terminals. Their top screws require removal of the controller and
separator with mains disconnected. J5/J6 retain outward mating, latch and
withdrawal access under the upper PCB. Route the
VIN bypass/GND and SW–L1–output loops tightly; FB senses after L1 with a quiet
return. Keep the fused 12 V motor path broad and its return near U1 rather than
through the logic return. Preserve prepared isolated ground pours and the
mains/SELV exclusion boundaries during routing.

The four mount reservations are copper-free and use insulating screws, washers
and standoffs with an 8 mm maximum occupied diameter. Native rule areas allow
their own NPTH mounting pads but prohibit tracks, vias and fills. Source/parity
checks prevent additional pads occupying these reservations. Support the 195 g
supply and preserve separator/airflow clearances in the assembled stack.

The [canonical mechanical specification](../mechanical.md) owns the stack,
mounts, retained image and enclosure constraints. Prior enclosure/placement
receipts remain historical. New native acceptance and checks are recorded in
[STATE](../STATE.md); none establishes fabrication or physical commissioning.
