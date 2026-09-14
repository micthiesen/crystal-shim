# Thermally protected MOV capture

Use **Littelfuse TMOV14RP175EL2T7** as the preferred capture candidate for RV1.
It preserves the 175 VAC thermally protected device but selects factory outer-crimp,
in-line tape/reel leads. This replaces the unsuffixed straight/staggered bulk part.
The exact formed order code appears in Littelfuse PCN 4925E; it is not inferred
solely by composing suffixes. Stock and final assembly fit remain unverified.

RV1 connects fused input `AC_L_FUSED` to `AC_N`, before the supply/filter split.
Its thermal disconnect does not replace the upstream fuse. Electrical ratings and
fault-containment obligations remain in [the mains basis](mains-design-basis.md).

## Primary drawing correction

Root and an independent reviewer inspected the actual manufacturer drawings,
including the side view that shows the original part's lead stagger. The standard
bulk part's lead spacing has two components: `e = 6.5..8.5 mm` in the disc plane
and `e1 = 1.5..4.0 mm` perpendicular to it for the 115..175 V group. Straight
leads are not necessarily in line. Two 1.1 mm round holes at a fixed 7.5 mm pitch
cannot accept the published tolerance envelope. The prior footprint proposal is
withdrawn; the installed diagonal varistor near match is not an exact footprint.

The selected L2T7 form has a defined crimp seating plane and reduces `e1` to
**0..2.0 mm**. It retains `e = 6.5..8.5 mm` and lead diameter **0.76..0.86 mm**.
The 2019 sheet gives maximum disc diameter **17 mm**, thickness **9 mm** at
175 V, and height above the crimp seating plane **22.5 mm**. None of those values
establishes the precise body centre relative to either lead. Do not place a
nominal centred 17 x 9 mm box and call it a verified occupied envelope.

## Proposed fit without reshaping leads

The following is an engineering footprint proposal, not a manufacturer land
pattern or an adopted native footprint. Give the part room to turn until its
actual two-lead vector aligns with the pair of board holes. Use nominal centres
at `(0, 0)` and `(7.5, 0)` mm:

| Feature | Finished dimensions / copper |
| --- | --- |
| Pad 1 round PTH | 1.3 mm finished diameter; 2.9 mm circular copper |
| Pad 2 plated slot, long axis along X | 3.7 x 1.3 mm finished capsule; 5.3 x 2.9 mm capsule copper |
| Finished hole/slot size tolerance | ±0.10 mm, subject to chosen fabricator acceptance |
| Differential hole-centre position error | At most 0.10 mm, project requirement to verify with fabrication process |

The lead-pair length spans 6.5 to `sqrt(8.5² + 2²) = 8.732125 mm`.
At minimum finished dimensions and maximum lead diameter, available displacement
along the pair is `(1.2 - 0.86)/2 + (3.6 - 0.86)/2 = 1.54 mm`.
Maximum required displacement including hole-position error is
`8.732125 - 7.5 + 0.10 = 1.332125 mm`, leaving **0.207875 mm**.
The short-span case requires 1.10 mm. The part may need to turn by as much as
`atan(2/6.5) = 17.103 degrees`, before fabrication and assembly angular allowance.

Nominal copper annulus is 0.8 mm and the nearest pad-to-pad copper gap is 3.4 mm.
Those are nominal geometry, not guaranteed solder-fillet or insulation clearances.
All physical metal, solder and fabrication tolerance must still satisfy the
3.2 mm mains-net rule and the separate 8 mm primary/secondary barrier. A finished
slot process and paste exclusion need verification.
Both lead terminations require hand soldering with adequate fill, lead heat sinking
and an assembly support that does not load the coating or thermal disconnect.
The drawing does not prove that the crimp automatically bridges the entire slot;
hold the intended seating height independently during soldering.

The installed acceptance contract below provides the project-owned occupied
volume. It must be checked on the final unit; the lead-fit calculation does not
prove the coating/crimp position. Review board thickness, seating, trimmed tails,
solderability and the manufacturer's thermal guidance before fabrication release.
The published wave profiles do not establish a hand-iron temperature/time limit.

Root separately compiled the proposed round/slot copper in a disposable component
canvas and loaded each fresh exporter seed through KiCad 10.0.5's native API.
All four cardinal rotations retain the 7.5 mm signed pin vector, slot-axis
orientation, 3.7 x 1.3 mm plated drill, 5.3 x 2.9 mm copper and line/neutral nets.
This validates the installed exporter's slot capability, not a complete MOV model
or fabrication process. Evidence is `/tmp/crystal-shim-mov-slot-probe`.

## Further body-datum constraints

The inspected tape drawing on page 7 provides a qualified in-plane centre:
feed-hole to first insertion lead `P1=8.95±0.7 mm` and to component centre
`P2=12.7±0.7 mm` imply `Cx=P2−P1=3.75±1.4 mm` relative to lead 1. This does
not establish the perpendicular common body offset `Cy`, outer-crimp width or
installed lean. The separate tape-alignment excursions need clear interpretation
before this qualified X interval becomes a guaranteed occupied-body bound.

For subsequent fit work, a body rectangle with half-sizes 8.5 and 4.5 mm is
centred at `(Cx,Cy)`, then unioned with the crimp/lead geometry and transformed
through allowed yaw and insertion travel. Size-only projection at 17.102729
degrees is 18.895016 x 13.601471 mm; that does not locate the rectangle relative
to the PCB. Maximum-hole/minimum-lead motion is 0.32 mm, whereas the lead-fit
proof above uses the opposite tolerance corner. Top height is `s+22.5 mm`, where
`s` is the controlled crimp-seat height above the PCB.

The 28 x 28 mm placement reserve remains conditional. Under explicitly assumed
zero additional lean/crimp motion, the qualified X range, 0.32 mm free motion
and 0.50 mm edge margin, its Y inequality gives `abs(Cy)≤5.089799 mm`. This is
an illustrative assembly acceptance limit, not a manufacturer datum. Do not use
it to mark occupied-envelope or placement review complete. Exact missing inputs,
formulas and source identities are in `/tmp/crystal-shim-mains-fit-closure`.

## Source and final-assembly contract

`pcb/mains/design/mov-component.tsx` now captures the exact two-pin part and
round/slot footprint. It uses a **project-owned assembly acceptance volume**,
not an inferred manufacturer body position. No located 17 x 9 mm F.Fab body is
invented. The complete mains source places pad 1 at `(-36.25, 4.5)` mm with
rotation zero; local pad midpoint is `(3.75, 0)` mm.

| Requirement | Limit |
| --- | --- |
| Complete installed body, factory crimps, leads and solder, at every height | 27 x 27 mm XY centred on the pad midpoint |
| Reserved volume for placement/enclosure screening | 28 x 28 mm XY, top at most 26.5 mm above finished PCB top |
| Source courtyard | 29 x 29 mm centred on the pad midpoint |
| Actual installed top | At most 26.0 mm above PCB top |
| Crimp seat | 0.5..1.0 mm above PCB top, independently supported during soldering |
| Tail and solder below board | At most 2.0 mm below the actual board underside |
| Yaw / lean | Within 20 degrees of the pad-pair direction, modulo 180; at most 5 degrees from upright |

All acceptance limits include measurement and fixture registration error. The
whole-volume check controls; yaw, lean and seating limits alone do not prove fit.
The 0.5 mm margin per XY side and above the accepted top remain reserved space.
The manufacturer does not guarantee every supplied part fits this allocation.

Use an adjustable removable support on bare leads without reshaping the factory
form or loading the coating. The crimp need not bridge the slot. Inspect loose
unpowered fit on the final board before soldering, then repeat after soldering
and removing the fixture. A board-referenced non-contact gauge must include its
own verified error budget. For example, indicated XY faces within 13.25 mm of
the midpoint with at most 0.25 mm total error establish the 13.5 mm actual limit;
an indicated top of 25.75 mm with the same error establishes the 26.0 mm ceiling.
Do not push the part into the gauge or relax insulation distances if it fails.

Hand solder after reflow with independent lead heat sinks and a qualified
process. Fixture/heat-sink access may require fitting RV1 before adjacent tall
headers. No permanent support or adhesive is assumed. Complete process capability,
actual solder clearance, enclosure containment and exact-part procurement remain
release work; final-unit fit is not a separate prototype phase.

The retained reserve has 10.782 mm to the nearest isolated body and 10.976 mm to
isolated copper in the current 2D placement screen. Increasing it to 30 mm leaves
only 0.120 mm courtyard clearance to J1; 32 mm overlaps J1/J2. A larger box cannot
turn the unpublished body datum into a manufacturer guarantee. The existing
3.40 mm nominal pad gap still requires a tolerance/solder check against 3.2 mm.
The [acceptance drawing](evidence/mains-integration/mov-acceptance-envelope.svg),
[calculations](evidence/mains-integration/mov-acceptance-calculations.json) and
[primary-source receipts](evidence/mains-integration/mov-primary-sources.json)
are retained. Extended research is in `/tmp/crystal-shim-mov-final-capture-basis`.

## Sources and evidence

| Manufacturer-authored source | Identity |
| --- | --- |
| [Littelfuse TMOV/iTMOV datasheet via IC-Components](https://ae.ic-components.com/files/28/TMOV14RP140E.pdf) | Revised 10/01/19, drawing page 6, tape page 7 and suffix page 8; SHA-256 `039bf6182ec4e86bce375c1935716375361cefe365a1f8515b030bdd343fbea5` |
| [Littelfuse PCN 4925E via Anglia](https://www.anglia.com/registration/pcn_ptn/docs/pcn/lfu_PCN_4925E_Republish.pdf) | 04/10/2019 with 06/14/2019 delay letter; exact L2T7 order code on page 3; SHA-256 `b9d3184c7444360a685f10237abfa86e856746c808ab24a3e11b9ce330047ab1` |
| [Current Littelfuse family sheet](https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05) | Parsed 2025 table corroborates the used maximum dimensions, pitch and lead diameter; current PDF bytes were not recovered, so no current-file hash or visual inspection is claimed |

The mirror filename names another voltage in the same series; the actual
manufacturer document includes the selected 175 V type. The older primary PDF
is used for inspected geometry, not a current availability claim. Scratch
drawings, source hashes and calculations are in
`/tmp/crystal-shim-mov-independent-research`. No MOV footprint has been adopted
and no procurement, soldering, mains or physical fit test has been performed.
