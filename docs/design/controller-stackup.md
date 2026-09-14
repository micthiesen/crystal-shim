# Controller fabrication and routing contract

The controller orders the standard four-layer **No requirement** construction,
nominal 1.6 mm FR4, 1 oz outer / 0.5 oz inner copper, green mask and
ENIG. USB operates at full speed (12 Mbps). The owner accepted the reviewed
F.Cu/B.Cu routing and through vias on 2026-09-14, with **no paid impedance
control and no 81-99 ohm fabrication acceptance requirement**.
See [the accepted USB decision](controller-routing-review.md).
The removed service eFuse requires no via-in-pad process. U1 uses
four **0.20/0.45 mm tented ground vias** with no added paste apertures.

These are reviewed design choices for native layout. They are not fabricated
measurements or an accepted board order. The [augmentation declaration](../../pcb/controller/design/kicad-augment.json)
records application and verification obligations; every native operation still
needs saved-board evidence. No routing, detailed stackup or thermal/paste
augmentation is complete merely because it appears in that declaration.

## Retained native stack basis

The prior adopted [KiCad project](../../pcb/controller/kicad/README.md) contained
the reviewed copper/dielectric thicknesses, material labels and Er values below,
with green mask, white silk and ENIG. KiCad's GUI saved the detailed stack;
native readback verifies the basic rules and Default/USB90 routing preferences.
The current ECO must preserve and reverify these settings; current native status
is recorded in [STATE](../STATE.md). This page does not declare routing readiness.

The known nominal copper and dielectric layers sum to **1.5862 mm**. KiCad adds
its still-unverified **0.010 mm mask on each side**, giving a consistent saved
stack and native board thickness of **1.6062 mm**. The tscircuit **1.6 mm** value
continues to mean nominal ordering thickness. Do not force only the native header
to 1.6 mm while retaining a different stack sum: mechanical exports and via-length
calculations must describe the same native stack. Neither value proves the
fabricated thickness; use the selected vendor tolerance for mechanical clearance.

KiCad also retains an unverified **0.02 dielectric loss tangent**. Its dielectric
constraints flag remains disabled. These placeholders are not supplier acceptance
values and do not replace the separately recorded USB solver mask model. Their
output treatment is fixed: retain them only as CAD visualization metadata; exclude
native/Gerber-job default mask thickness and loss tangent from supplier order
constraints. The native User.Comments fabrication note now states No requirement stack,
no impedance control, no PCB assembly and tented vias without filling/capping/plugging.
The saved native note and release archive agree; native defaults are not measured values.

Basic rules now read back as 0.15 mm clearance/minimum track, 0.20 mm minimum via
drill, 0.35 mm minimum via diameter, 0.075 mm annulus, 0.20 mm hole-to-copper,
0.09 mm mask-opening-to-other-copper and 0.10 mm mask merging threshold.
The last setting merges close mask apertures when plotting; it does not independently
prove a physical 0.10 mm mask web. Default uses 0.25 mm routing width and
0.30/0.60 mm drill/pad preferences. All six USB nets use USB90's 0.24 mm width
and 0.15 mm differential gap while retaining 0.15 mm ordinary clearance.
The former **0.50 mm grounded side spacing** is historical USB design guidance.
Net-class routing preferences are not hard minimum-width enforcement.

## Stack and USB geometry

The selected vendor template is `30726297697b4c18a0946278a48fb7d8`, displayed as
`JLC04161H-7628(Standard/Finished thickness1.59mm±10%)`. Its nominal 1.6 mm ordering
selection is historical. The separate “No requirement” template has the same
published nominal layer geometry and is the current order choice. The retained
[template data](evidence/controller-stackup/selected-stackup.json) identifies it.

| Layer | Nominal thickness | Purpose |
| --- | ---: | --- |
| F.Cu | 0.035 mm | Components, signals, local ground/power |
| Pressed 7628 prepreg | 0.21040 mm, Er 4.4 | USB reference spacing |
| In1.Cu | 0.0152 mm | Continuous GND |
| Core | 1.065 mm, Er 4.6 | Symmetric four-layer core |
| In2.Cu | 0.0152 mm | Power and limited routing |
| Pressed 7628 prepreg | 0.21040 mm, Er 4.4 | Bottom spacing |
| B.Cu | 0.035 mm | Ground/thermal spreading and limited routing |

Do not rescale the pressed dielectric to force an exact 1.600 mm sum. The vendor
line solver uses **0.04064 mm finished outer copper**, while the stack table uses
nominal copper. Board thickness includes manufacturing tolerance and mask.
[JLC stackups](https://jlcpcb.com/impedance) and
[calculator guide](https://jlcpcb.com/help/article/user-guide-to-the-jlcpcb-impedance-calculator)
are the fabrication references.

The original uniform F.Cu line model used 0.24 mm width, 0.15 mm pair gap
and 0.50 mm side-ground clearance. Its recorded calculation was
[vendor calculation](evidence/controller-stackup/selected-usb-calculation.json); that model
is historical design evidence, not a prediction for the accepted routed board.
The USB90 netclass name and routing preferences may remain as useful defaults.

The owner accepts the saved F.Cu/B.Cu USB paths, connector crossover and through
vias without paid impedance control. The former F.Cu-only, no-via, exact pair-gap,
0.5 mm mismatch and mandatory side-ground/stitch-pitch requirements are superseded
for the reviewed paths. Preserve connectivity, absence of shorts, ground returns
and short connector branches. No functional failure was identified during review;
actual USB operation remains unmeasured until final-board commissioning.

## USB locator correction

The stock-derived R0.15 ground-pad corners left only **0.194403 mm** to J4's
0.65 mm locating holes, below JLC's published 0.20 mm NPTH-to-copper minimum.
Use **R0.25** on A1+B12 and A12+B1, yielding **0.218788 mm**. Preserve every pad
centre, 0.60 x 1.15 mm bound and locating hole. GCT does not specify the corner
radius; this is an explicit project DFM adaptation of its
[USB4105 B4 drawing](https://gct.co/files/drawings/usb4105.pdf).

There are four logical pad objects but two physical ground areas and two stencil
apertures. Each area changes from 0.670686 to 0.636350 mm², a 5.12% reduction.
At a 0.100 mm stencil, matching nominal paste volume is 0.063635 mm³ per area.
Shared VBUS and separate signal pads retain their existing geometry. Native
initial rules enforce 0.20 mm hole-to-copper spacing without a subminimum waiver.

![USB locator and thermal-via review](evidence/controller-stackup/geometry-review.svg)

## Saved stencil and assembly preparation

The selected process is a **0.100 mm laser-cut stencil** with the source-shaped,
1:1 apertures on active SMT lands. This preserves the package land patterns and
nine independent U1 ground windows; it does not reproduce TI's separate 0.125 mm
DBV stencil example. J4's four shell slots have neither front nor back paste and
are hand soldered. Overlapping USB contacts carry one aperture per physical area:
A1/A4/A9/A12 retain paste, while B12/B9/B4/B1 suppress duplicate openings. Copper,
mask, drills, pad identities and nets are unchanged.

Saved native readback and diagnostic Gerbers contain **271 front apertures and no
back apertures**. The minimum aperture area divided by wall area at 0.100 mm
thickness is **1.2275**, above the 0.66 release screen in
[Indium's stencil guidance](https://www.indium.com/wp-content/uploads/2025/03/Powder-Choice-and-Stencil-Design-Guidelines-APPNOTE-97742-R4-1.pdf).
That calculation screens release geometry, not actual paste transfer or solder
beading. Indium also discusses aperture reductions for discrete/fine-pitch parts;
this board explicitly retains its package-derived apertures instead of applying
a blanket reduction. Paste chemistry and reflow execution remain assembly-process
verification, with actual joints inspected after assembly.

Native silk now identifies all external connector functions and input pin-1
voltages, USB and RESET/BOOT/MAINTENANCE buttons. Existing test-point function
labels remain. The [pre-routing preparation evidence](../../pcb/controller/kicad/evidence/pre-routing-preparation/)
records the saved aperture readback, diagnostic plots, native DRC and acceptance.
These are preparation checks, not production fabrication files.

## Thermal copper and vias

**U2 AP63203:** reserve bottom GND beneath source X=-32..-2, Y=-5..15 mm,
600 mm² before clearances, connected to the wider ground plane. Place at least
two 0.30/0.60 mm GND vias beside each C1/C2/C3/C4/C7 ground land and two near
U2 pin 4. Keep SW compact and FB tied to the quiet output-capacitor node. There
is no exposed ground pad to invent under U2.

At 3.3 V, 0.6 A and the 80% efficiency allowance, total converter loss is
**0.495 W**. Allocating all of that assumed loss to U2 is conservative within
that assumption, not a guaranteed loss maximum. Diodes recommends 2 oz copper;
this 1 oz layout needs its own thermal acceptance. The
[AP63203 datasheet](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf)
quotes 89°C/W on a single-layer, 2 oz minimum-land fixture. Reusing it only as
a sensitivity example gives 94.1°C at 50°C air. Meeting the more restrictive
125°C thermal-design ceiling at that power/ambient requires an actual effective
thermal resistance below 151.5°C/W. Neither calculation measures this board.

**Future motor outputs:** route the 12 V input and common return with at least
2 mm copper width for the 2 A continuous allocation, and each 1 A output with
at least 1 mm width. Short package-pad necks need individual review. Keep each
Q/D/J flyback loop compact and return motor current directly to J6, away from
the sensor and 5 V harness return. These are routing requirements, not measured
thermal results. See the [refill contract](refill-expansion.md).

**U1 ESP module:** retain nine separate 0.8 mm ground lands and paste apertures.
Use four 0.20/0.45 mm GND vias at native x=-2.130/-0.880 and
y=-3.165/-1.915 mm, plus close returns at perimeter GND pins 1 and 28. The
interstitial drill-to-paste gap is 0.218198 mm; drill-to-existing-mask-opening
gap is 0.147487 mm. Specify top/bottom tenting and no added apertures. Do not
substitute ink plugging at this proximity under
[JLC's covering rules](https://jlcpcb.com/help/article/pcb-via-covering).
Preserve the [Espressif land pattern and antenna exclusion](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf).

## Release evidence and commissioning

The [2026-09-14 review](evidence/pre-fab-2026-09-14/) records current native
stack/netclass, zone, via, mask/paste and routed-geometry checks, together with
exported CAM and stencil inspection. The saved copper is preserved.

Final-board commissioning still covers minimum-input/full-load regulation,
closed-enclosure radio heating, the 50°C internal-air limit, motor-branch loading,
USB operation and actual manufacturing process. The approximate 2.8 W controller
power screen excludes other enclosure loads and does not prove ambient temperature.

The independent review used the retained
[primary-source hashes](evidence/controller-stackup/review-sources.json) and
[research-source hashes](evidence/controller-stackup/research-sources.json).
Raw downloaded PDFs/HTML and solver captures remain in
`/tmp/crystal-shim-controller-stackup-research` and
`/tmp/crystal-shim-stackup-adversarial`. The checked-in extracts preserve selected
numeric evidence; they are not an assertion that every external document is
archived in this repository. No fabrication or operating release gate passes here.
