# Standard fabrication and mechanical review

Reviewed 2026-09-14. Scope: ordinary bare-board JLCPCB order options, native
construction, plated slots, mounting and retained assembly-envelope evidence.
No PCB assembly order, custom construction request, paid impedance control,
board mutation or purchase was performed. Final export-layer, drill-file and
all-severity native checks belong to the companion release evidence.

## Result and order values

No special fabrication process or PCB-outline change is indicated by this audit.
Use three separate single-design orders with the following values. Select PCB
assembly **No**; quantities are the owner's purchase choice. These are order
instructions, not evidence that an uploaded quote or supplier CAM review occurred.

| Field | Controller | Sensor | Mains |
| --- | --- | --- | --- |
| Material | FR-4 | FR-4 | FR-4 |
| Layers | 4 | 4 | 2 |
| Dimensions | 150 × 110 mm | 18 × 64 mm | 150 × 110 mm |
| Delivery | Single PCB | Single PCB | Single PCB |
| Thickness | 1.6 mm | 1.6 mm | 1.6 mm |
| Outer copper | 1 oz | 1 oz | 1 oz |
| Inner copper | Default 0.5 oz | Default 0.5 oz | Not applicable |
| Mask / silk | Green / white | Green / white | Green / white |
| Finish | ENIG | ENIG | ENIG |
| Via covering | Tented | Tented | Tented |
| Impedance control | No | No | No |
| Stackup | No requirement, standard geometry below | Same | Standard two-layer |
| Filling, capping, blind vias, edge plating, castellations | None | None | None |

The public [JLCPCB quote form](https://cart.jlcpcb.com/quote) exposes single-board
FR-4 orders, layer count, thickness, copper and finish selections. Its unconfigured
page does not prove a particular uploaded-order price or complete conditional
option availability. No assembly-specific panelization is needed for this scope.

## Stack selection without a custom request

The current [JLCPCB stackup page](https://jlcpcb.com/impedance) lists its four-layer
**No requirement** construction with 35 µm outer copper, 15.2 µm inner copper,
0.21040 mm outer dielectrics and a 1.065 mm central dielectric. Its separately
named **JLC04161H-7628** entry shows exactly the same nominal layer thicknesses.
Their displayed copper/dielectric sum is 1.5862 mm; the native 1.6062 mm total
also includes two nonbinding 0.010 mm mask layers. Thus the standard construction
matches the design's nominal geometry without requesting impedance measurement
or a custom laminate. This is construction equivalence, not an impedance claim.

The sensor's existing loading screen uses a conservative 0.18 mm outer dielectric;
the published nominal construction is thicker. Native locked thickness fields do
not command fabrication tolerances. The existing sensor calibration/response gate
remains physical commissioning. Selecting an unrelated thin-outer-dielectric
stack such as 3313 would invalidate that screen.

The two-layer mains core thickness in CAD is nominal bookkeeping for a 1.6 mm
FR-4 order, not a separate special-core instruction.

## Native geometry and process screen

Native API reads confirmed actual edge centerlines of 18 × 64 mm for sensor and
150 × 110 mm for both other boards. Stroke-expanded bounding boxes are larger;
do not enter those expanded dimensions in the order form.

[JLCPCB's current rigid-board capabilities](https://jlcpcb.com/capabilities/pcb-capabilities)
permit these dimensions, including the small unpanelized sensor. Published ordinary
via thresholds include 0.20 mm drills with 0.45 mm pads. Two-layer plated slots
need at least 0.5 mm width; multilayer slots support 0.35 mm. Finished 1.6 mm
thickness has ±10% tolerance. Green mask supports 0.10 mm dams, and nominal 1:1
pad openings are supported. These process limits do not replace final Gerber checks.

Native findings:

- Sensor/controller vias use 0.20/0.45 and 0.30/0.60 mm drill/pad pairs. Mains
  vias use 0.30/0.60 mm. All saved vias are tented on both outer faces.
- Controller J4 has plated shell slots 0.60 × 1.40 mm and 0.60 × 1.70 mm,
  with 0.20 mm nominal pad annuli. Mains RV1.2 has a 1.30 × 3.70 mm plated slot
  and 0.80 mm nominal annuli. These are ordinary rounded plated slots, not blind
  slots or edge plating. Export separate plated/nonplated drills with routed ovals.
- Sensor E1's six inner-only shield primitives are ordinary inner-layer copper
  artwork. They need neither buried vias nor component assembly. The pads'
  unusual KiCad classification does not imply a special manufacturing process.
  Preserve their exact In2 copper and the mask-covered B.Cu electrodes.

[JLCPCB's via-covering guidance](https://jlcpcb.com/help/article/pcb-via-covering)
describes tenting as the ordinary mask-covered process and prefers holes no larger
than 0.4 mm. The actual 0.2/0.3 mm holes fit that recommendation. Tenting does not
promise a filled, planar or hermetically sealed hole. No plugged/capped process
is needed by the present construction. Final mask plots must retain the intended
covered sensing face and exposed solder lands.

## Mounting, insulation and enclosure

Both large native boards retain four 3.2 mm NPTH mounting holes at native
(32,52), (168,52), (32,148), (168,148) mm. This is the required 136 × 96 mm
pattern with 7 mm edge offsets. No hole relocation or new support hole is needed.

The retained [enclosure fit screen](../../../../cad/shared-enclosure/README.md)
uses matching boards with 45 mm clear board-face separation, an intact
158 × 118 × 2 mm separator, 35 mm connector/wiring reserves, 5.40 mm nominal
filter-envelope clearance and 4.00 mm under its sensitivity allowance. Native
routing does not change those board outlines or component placements.

This is an envelope screen, not exact fitted cable or component-solid acceptance.
The existing design still requires insulating M3 hardware within the 8 mm diameter
reserves, secured separator/supports, and maintained 8 mm primary-to-SELV and
3.2 mm different-primary-net separation including wires and solder tails. Exact
spacers, washers, carrier retention and cable/gland details remain assembly work.
They do not require a changed bare PCB on the evidence reviewed here. The retained
antenna envelope, separator RF effect, temperatures and mechanical loading remain
physical commissioning items. This audit does not certify insulation or mains use.

## Remaining release evidence

No independent standard-fabrication blocker was identified. The release owner
must still bind this review to final native/output hashes and finish copper,
mask, silk, drill, clearance and archive checks. Live quote/CAM acceptance is not
claimed. No additional supplier communication or paid process is prescribed.
