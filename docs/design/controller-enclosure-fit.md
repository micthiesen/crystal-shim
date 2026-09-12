# Controller enclosure fit

Nominal CAD proposal reviewed 2026-09-12. It preserves the complete controller
placement and 70 x 110 x 1.6 mm board. The [drawing](../../cad/controller-fit/mechanical-fit.svg)
and [measured distances](../../cad/controller-fit/fit-results.json) record the
screen. These are design allocations, not released machining files or an ingress
rating for the modified enclosure.

## Datums and mounting

Use enclosure planning coordinates **X=186.5+pcbX, Y=90-pcbY**, with Z measured
up from the flat inside base floor. This shifts the previous mounting proposal
0.5 mm west without moving any component on the board. PCB underside is **Z20.0**,
top Z21.6; its envelope is X151.5..221.5, Y35..145. The low-voltage partition face
remains X151. The four PCB hole centres become (156.5,64), (216.5,64),
(156.5,140) and (216.5,140).

The official Hammond STEP is a 2016 model, while the current dimensional drawing
is dated 2020. STEP height is 90 mm; the drawing states 90.50 mm. The drawing
explicitly limits solid models to locating references rather than modification
locating data. Do not treat sectional inside dimensions as constant cavity walls
or invent a moulding tolerance. This CAD screen includes drafted walls, corner
structures, lid and hardware, but does not guarantee every current-production
enclosure fits these nominal allocations.

The project's 231 x 146 planning rectangle is centred at (115.5,73). The exact
STEP transform is X=STEP.X+8.224014147315, Y=140.873357910844-STEP.Z,
Z=STEP.Y+67. The flat inside base face is native Y=-67. At PCB top Z21.6, the
straight south wall near J2/J4 is Y149.4057..152.4057, and the right wall near
the antenna is X231.9057..234.9057. Corner features intrude farther.

| Nominal solid-distance screen | Previous X187 mounting | Adopted X186.5 allocation |
| --- | ---: | ---: |
| Board to base/corner structure | 0.385 mm | 0.885 mm |
| Maximum antenna package envelope to complete housing | 15.604 mm | 16.104 mm |
| J1/J3 header and mate envelope to housing | 21.600 mm | 21.600 mm |
| J2 enlarged mate envelope to south wall | 1.586 mm | 1.586 mm |
| USB overmold intersection with uncut wall | 226.8 mm³ | 226.8 mm³ |

The nominal board-to-partition gap is only **0.5 mm**. Specify carrier location
within ±0.20 mm XY and finished board dimensions within ±0.10 mm. These are
project acceptance limits, not Hammond tolerances. Check at least 0.25 mm actual
board-to-partition clearance, no board/corner contact through the allowed locating
range, and at least 15.0 mm antenna clearance to housing, metal and wires. Retain
carrier adjustment to absorb enclosure variation without altering PCB geometry.
Confirm current modification datums before releasing the carrier machining file.

The maximum antenna envelope is X197.6..215.8, Y28.9..35.1, Z21.6..24.0. Its
15 mm expanded reserve is X182.6..230.8, Y13.9..50.1, Z6.6..39.0. No carrier,
metal or harness may enter that reserve. Preserve Espressif's prescribed baseboard
edge geometry and ground under the non-antenna portion. This allocation does not
establish RF performance.

## Harness mating and service access

Molex's exact housing drawings establish a nominal 14.00 mm female body length
and 17.56 mm right-angle mated depth. The latter is not a pin-one-origin coordinate
or a specified withdrawal stroke. The 43025 drawing gives 10.81 mm mated height
and 11.0 mm latch clearance. Housing STEP retrieval failed; this analysis uses
manufacturer drawing dimensions and conservative rectangular envelopes, not an
invented latch mesh.

- J1 pin 1 is (157.5,49), mating centre X160.5; J3 pin 1 is (172.5,49), mating
  centre X175.5. Both face north. Their 9.68 mm locator-to-board-edge distance
  retains Molex's 10.16 mm maximum. The two nominal 9.85 mm mate widths and 15 mm
  centre spacing leave 5.15 mm between mates before tolerances.
- Allocate 14 mm straight northward withdrawal before lifting, plus a 10 x 12 mm
  vertical tool column over each latch up to Z60 for a 3 mm blunt insulated tool.
  The withdrawal allocation equals the nominal female body length; it is not a
  manufacturer disengagement stroke. Header-wide swept boxes have zero housing
  intersection, with J1/J3 minimum distances 19.41/21.25 mm.
- J1's three selected Alpha 6713 conductors depart north then left toward the
  isolated partition crossing. Allocate 10 mm bend radius and keep them coupled.
  This is a routing allowance, not a new manufacturer bend-radius claim.
- J3's cable departs north along X175.5, left of the antenna. Reserve up to 6 mm
  cable OD and a separate strain-relief exit. Releasing the clamp must permit the
  withdrawal stroke. Exact three-pair cable, gland, minimum bend radius and installed
  reach remain to select. **Total harness length remains at most 203.2 mm**,
  including internal routing; straight enclosure-to-tank separation is not enough.
  The [sensor harness study](sensor-harness.md) records cable/gland candidates
  and a sideways sensor-header route within 200 mm. Crimp manufacture, actual
  mated/support datums, gland fit and drip handling remain release checks.
- J2 pin 1 is (165.5,131), facing south. Its nominal wire exit is around Y147.57;
  the enlarged envelope reaches Y147.82. Its 1.586 mm wall gap does not accommodate
  a wire bend. The shared service opening below clears an 8 x 12 mm straight
  connector/wire sweep from Y139.5..185 with 4.60 mm residual distance to housing.
  Use the already selected maximum 100 mm Tensility pigtail. Its 4 mm OD and
  24 mm minimum bend radius require an external clamp and an external bend;
  keep the barrel coupling insulated.

## USB and covered opening

The GCT receptacle mouth is at Y145, with USB axis Z23.33. Its mating view requires
at least 1.85 mm between the receptacle front and plug shoulder. The shoulder
therefore reaches Y146.85, and the overmold must pass through the south wall.
A nose-sized cutout fails the actual CAD interference test.

Use **StarTech USB2AC1M** as the removable service-cable mechanical gauge, subject
to incoming fit. Its manufacturer drawing gives a Type-C overmold 12 x 6.3 mm,
32 mm long, and a 6.65±0.2 mm nose. The drawing does not specify tolerances for
the overmold dimensions. The project instead permits at most **14 x 8 mm** and
checks that larger insertion envelope; it does not claim a StarTech tolerance.

Allocate one **55 x 23 mm opening, R2.5 corners**, through the south low-voltage
wall at **X155..210, Z17..40**. The 14 x 8 mm USB sweep from Y145..200 has zero
intersection after this cut and 2.33 mm minimum distance to remaining housing.
The nominal plug overmold ends near Y178.85, outside the enclosure. Support the
cable externally and keep its first 30 mm straight so cable pull cannot load
the short GF-A shell stakes.

Allocate an external removable cover at least **65 x 33 mm**, X150..215,
Z12..45, with continuous gasket land, retained hardware and a downward drip edge.
Close and seal it for normal splash exposure; service cables are temporary.
The cover material, gasket/compression, fasteners and external strain relief
still require exact selection and drawing. The original enclosure ingress rating
does not automatically survive this modification. The independent mains guard
must prevent access through the service opening even with the cover removed.

## Retained insulating carrier

Allocate a 3 mm UL94V-0 insulating FR4 carrier at Z6..9. Its frame consists of
two transverse strips X151.5..221.5 at Y60..68 and Y136..144, a right spine
X213..221.5 at Y60..144, and two ears X213..227 at Y69..77 and Y106.5..114.5.
The ears locate on the enclosure's existing right-hand #6 bosses centred at
(223.5,73) and (223.5,110.5), nominal tops Z6. Confirm the actual bosses before
selecting manufacturer-style #6 x 1/4 self-tapping retention. Do not drill the
floor or share mains-side panel fixings.

Four 11 mm insulating standoffs support the PCB underside at Z20, retaining
the existing 4 mm screw-head/tool reserves. Add captured 6 mm insulating feet
below the two left standoff positions so button/probe loads reach the floor.
The separated right anchors retain the assembly against connector forces;
the left feet support load. The nominal support envelopes have zero material
intersection with the base and 24.960 mm antenna separation. Intended boss-top
and floor contact is retained. About 9 mm remains between carrier top and the
worst reviewed THT tail extremity away from mounting contacts.

The frame avoids the lower-right factory M3 insert at (216.25,142.25), which is
too near the PCB hole at (216.5,140) for a separate pair of plate holes. Exact
M3 hardware, thread engagement, carrier stiffness, connector-force retention,
LED standoff and sealed button access remain mechanical design work. A collision
test is not a stress or assembly-force calculation.

## Sources and reproduction

Independent analysis used CadQuery 2.8.0 / OCP 7.9.3.1.1 in
`/tmp/crystal-shim-controller-mechanical-fit`. `fit.py`, `check_support.py` and
`draw.py` produced the measured JSON, support envelope and inspected drawing.
The repository retains the diagram and measurements; the scratch STEP proposals
are not production modifications. Source hashes below identify the nominal input.

| Primary source | Revision and SHA-256 |
| --- | --- |
| [Hammond exact-part STEP ZIP](https://www.hammfg.com/files/parts/stp/1554V2GY.zip?v=1697661989) | 2016-08-11; ZIP `36b6b25f5353118e797aa5ac131733897d7a720942c1738a6c3571ab07989e9e`; `1554V.stp` `f7baa2bc11586616cab7917a449a8d683e9d542ec7e0a5ad0aa8310acb3bac6e` |
| [Hammond drawing](https://www.hammfg.com/files/parts/pdf/1554V2GY.pdf?v=1697661937) | Rev 28.02.2020; `d78fc8beb66d1eba627408fb19ff8dafe63cea62e5febefe2ad4b0bc1bbd5a1e` |
| [Molex 43025 manufacturer drawing via RS](https://docs.rs-online.com/6c6c/A700000011520331.pdf) | 430250000-SD A, 2018-06-01; covers 43025-0200/0600; `3fa78847433b382fa07609fb9f44b5e8b017804b9b491250dc493eef9e029e28` |
| [Molex 43645 manufacturer drawing via Official Electronic](https://www.official.cz/static/_dokumenty/5/0/6/1/2/436451100_sd.pdf) | 436450000-SD A1, 2022-10-17; covers 43645-0300; `c0e7d9ece7015607e24884333cab556213730d8d343262ca1323ad47a9fffa7d` |
| [GCT USB4105 drawing](https://gct.co/files/drawings/usb4105.pdf) | B4, 2023-12-18; `fb331fbabee8392ed2937ed757c1610cb0f174b84625147c0b580a18eea8c0e5` |
| [StarTech USB2ACxM drawing](https://sgcdn.startech.com/005329/media/sets/usb2acxm/diagram/usb2acxm_diagram.pdf) | 2020-11-26; `ff7c49496f41ab4dad448d5123a3f576418fe52ce4dcc27581248d8bdbb523b2` |

[Espressif module-placement guidance](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/pcb-layout-design.html#general-principles-of-pcb-layout-for-modules-positioning-a-module-on-a-base-board)
supports antenna overhang and the 15 mm housing allocation. The exact header and
module package datums remain the checked source models. No female-housing CAD
hash or mould tolerance is claimed. Final antenna range, splash protection,
installed cable reach, latch access and enclosure temperature remain their
existing physical acceptance checks.
