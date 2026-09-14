# Mains terminal capture basis

J1–J4 each use **Phoenix Contact 1868076, MKDS 5/2-7,62**, a fixed
side-entry screw terminal block with two used positions. This replaces the
2/3/4/6-position Sabre scheme, its seven unused circuits and repeated solder
tails. There are no pluggable mains housings or separate crimp contacts.
J1/J2 face outward left; J3/J4 face outward from the lower edge.

## Electrical assignments

| Ref | Function | Pin 1 | Pin 2 |
| --- | --- | --- | --- |
| J1 | INPUT | AC_L_FUSED | AC_N |
| J2 | FILTER IN | FILTER_LINE_L | AC_N |
| J3 | FILTER OUT | PUMP_L_FILTERED | PUMP_N_FILTERED |
| J4 | PUMP | PUMP_L_SW | PUMP_N_FILTERED |

F3 separates AC_L_FUSED from FILTER_LINE_L. PE bypasses these terminals and
remains continuous. Each circuit has one plated solder tail: eight circuits
and eight tails total, all connected. The board totals are 53 logical pins,
53 numbered lands (31 PTH, 22 SMT), 14 nets and 53 connected endpoints, with
no NC pins. The circuit and protection topology are unchanged.

Fixed wiring removes the old unproven cross-mating scheme. It still requires
correct assembly: mark terminal function and L/N on the board and both wire ends,
keep filter LINE and LOAD pairs apart, then check continuity before energizing.
No mains connection is interchangeable by intended function.

## Drawing and footprint

Authority: [Phoenix product page](https://www.phoenixcontact.com/en-us/products/pcb-terminal-block-mkds-5-2-762-1868076)
and [manufacturer product PDF](https://www.phoenixcontact.com/us/products/1868076/pdf).
The retained drawing source is a [manufacturer PDF mirror](https://static.chipdip.ru/lib/954/DOC034954716.pdf),
SHA-256 `ada027e88b46d2245ef499b6a4ed4edcb2eb3bfa147cb4703733281099163a01`.

- Pin pitch: 7.62 mm; drill: 1.3 mm; copper land diameter: 3.5 mm.
- Body: 15.24 × 12.5 mm; height above PCB: 21.5 mm.
- Pin row: 4.6 mm from the rear. Native pin 1 is the datum, pin 2 is
  (+7.62, 0), body centre is (+3.81, +1.65), and wire entry faces native +Y.
- Source and native models retain these datums, not the old Sabre dimensions.

See [source models](../../pcb/mains/design/mains-headers.tsx),
[footprint audit](footprint-audit.md) and [placement](mains-placement.md).

## Wire termination and service access

The manufacturer specifies **8 mm strip length** and **0.5–0.6 N·m tightening
torque**. Its connection range is AWG 24–10; flexible conductors are
0.2–4 mm² and ferruled conductors 0.25–4 mm². Retain the selected 18 AWG
mains wiring. Support the terminal body or housing during tightening so torque
does not load the solder pins. Verify received wire and termination against the
exact manufacturer instructions; do not leave exposed strands outside the entry.
The cULus use-group B rating is 300 V / 30 A; this does not raise the project's
2 A inlet or 1 A pump-branch limits or establish final assembly insulation.

Retain **35 mm outward wiring access**. The top screw heads require removal of
the controller and insulating separator with mains disconnected. These are
assembly/service terminals, not quick-disconnect plugs accessible under the
installed controller. Their 21.5 mm height fits inside the existing 30.5 mm
lower-board supply envelope; no enclosure reserve geometry change is needed.
Keep the terminal screws, stripped wire, solder joints and routing within the
3.2 mm different-primary-net and 8 mm primary-to-SELV separation requirements.

The current acceptance receipt is linked from [STATE](../STATE.md). Historical
Sabre and enclosure receipts do not validate these terminals. Routing, fabricated
clearance and physical assembly/commissioning remain separate acceptance stages.
