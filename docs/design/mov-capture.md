# Thermally protected MOV capture

Use **Littelfuse TMOV14RP175E**, the stocked bulk two-lead thermally protected
175 VAC MOV, for RV1. The owner authorized the sourcing/footprint ECO on
2026-09-14. It replaces the unavailable factory-crimped TMOV14RP175EL2T7.
The electrical ratings and fused line-to-neutral connection are unchanged:
175 VAC / 225 VDC continuous, 70 J at 2 ms, 6 kA single 8/20 us surge and
455 V maximum clamp at 50 A. It retains its internal thermal disconnect and
the separate upstream fuse. See the [mains basis](mains-design-basis.md).

## Unformed lead capture

The [Littelfuse family datasheet](https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05),
revision 10/15/25, gives bulk lead spacing components e=6.5..8.5 mm in the
disc plane and e1=1.5..4.0 mm transverse, and lead diameter 0.76..0.86 mm.
The lead-pair length is therefore 6.670832..9.394147 mm. Rotate the upright
part to align its two unbent leads with the hole/slot axis; do not reshape them.

| Feature | Source-local centre | Finished drill | Copper |
| --- | --- | --- | --- |
| Pin 1, fused line | (0, 0) mm | 1.3 mm round | 2.9 mm round |
| Pin 2, neutral | (7.9, 0) mm | 4.5 x 1.3 mm plated capsule | 6.1 x 2.9 mm capsule |

The slot and copper extend 0.8 mm only to the right of their former outlines.
Their left edges and the 3.4 mm nominal inter-pad copper gap remain unchanged.
The fit calculation conservatively allows finished hole/slot size tolerance
+/-0.15 mm and differential centre error at most 0.15 mm.
[JLCPCB standard capabilities](https://jlcpcb.com/capabilities/pcb-capabilities)
list plated hole/slot +0.13/-0.08 mm and hole position +/-0.05 mm. The calculation
covers those published limits, including a 0.1414 mm diagonal differential error
if the position tolerance applies independently to X and Y. No tighter custom
tolerance is requested. At maximum lead diameter, the worst-size available longitudinal
movement is (1.15-0.86)/2 + (4.35-0.86)/2 = 1.89 mm. Including centre error,
permitted lead spans are 6.16..9.64 mm. Minimum and maximum lead-pair spans have
0.510832 and 0.245853 mm margin respectively. Worst yaw is atan(4/6.5)=31.608
degrees; a conservative transverse position-error allowance adds 1.289 degrees.
The 35-degree installed yaw limit covers this without lead bending or body lean.
Source tests check both span extremes, all published spacing corners, rotation,
exported slot geometry and unchanged left copper/drill edges.

## Installed assembly contract

The source courtyard and placement reserve stay centred at local (3.75, 0) mm,
not at the new hole/slot midpoint. This preserves the existing placement allocation.

| Requirement | Limit |
| --- | --- |
| Entire body, coating, leads and solder at every height | 27 x 27 mm XY centred at local (3.75, 0) |
| Placement reserve | 28 x 28 mm, top at most 26.5 mm above PCB |
| Courtyard | 29 x 29 mm |
| Installed top | At most 26.0 mm above PCB |
| Supported body seating above PCB | 0.5..1.0 mm |
| Tail and solder below actual board underside | At most 2.0 mm |
| Upright part yaw relative to pad axis, modulo 180 | At most 35 degrees |
| Lean from upright | At most 5 degrees |

The manufacturer bounds body diameter at 17 mm, thickness at 9 mm and height A
at 22 mm for this part. It does not fully locate the body relative to the leads.
The lead-fit proof is not a universal occupied-body guarantee. The same whole-volume
final-unit inspection remains required; the part must fit loosely without loading
the coating. All acceptance limits include measurement/fixture error. Preserve
3.2 mm mains-net clearance and the separate 8 mm primary/secondary barrier,
including trimmed leads and solder. Do not enlarge the solder envelope into these gaps.

Use a removable fixture to support the unformed part independently while soldering.
Keep it upright, adjust its yaw to the supplied lead stagger, and do not force the
leads into the holes. Inspect the unpowered fit before soldering and after fixture
removal. Hand solder after reflow with independent lead heat sinks. No stencil paste
or permanent adhesive/support is added. These instructions replace the obsolete
crimp-seat procedure; this bulk part has no factory crimp to seat against the PCB.
Actual solder-process, fit and operating tests remain commissioning evidence.

## Evidence

[Current ECO](evidence/mov-bulk-eco/) records source/native parity, preservation,
DRC, renders and fabrication review. The [previous capture](evidence/mov-bulk-eco/previous-mov-capture.txt)
retains the earlier L2T7 analysis as history, not as the assembly instruction.
The [sourcing review](../../bom/mov-sourcing-2026-09-14.md) records why the part changed.
