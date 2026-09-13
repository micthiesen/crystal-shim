# Routing with the prepared KiCad projects

Open each production `.kicad_pro`, keeping its `.kicad_dru` beside it. The boards
have filled ground copper, ground/thermal vias, and routing constraints. Component
placement and electrical connections are preserved. Draw the remaining traces,
press **B** to refill, save, and run:

```sh
sh scripts/check-routing.sh
```

An optional board name limits the check, for example `sh scripts/check-routing.sh
controller`. Add `--final` when routing is complete to require zero unconnected
items as well. The command checks copper DRC, schematic parity and the additional
routing policy. It calculates fresh fills for checking without overwriting an open
editor. During routing, unconnected items are expected; other findings must be
resolved. This is a routing check, not the fabrication release gate.

## Copper already present

| Board | Ground copper | Ground vias |
| --- | --- | --- |
| Controller | F.Cu, continuous In1.Cu reference, B.Cu thermal/return copper | 25, including four specified module vias, buck vias and three beside each pump transistor |
| Mains | F.Cu/B.Cu only inside the isolated secondary region | 11 beside buck ground/decoupling |
| Sensor | F.Cu/B.Cu only above the sensing window | 7 beside local ground/decoupling |

SMD pads and vias connect solidly. Ordinary through-hole pads use 0.5 mm thermal
spokes with 0.3 mm gaps. Motor-return connector pads and the mains supply return
connect solidly. Floating copper islands are removed. Existing antenna, mounting,
sensor-window and mains-barrier exclusions remain. In2.Cu stays available for
power and limited signals; no speculative split power plane was added.

The controller has broad bottom copper beneath the buck, joined to the board
return rather than an isolated thermal rectangle. Final trace placement can cut
into any pour, so inspect the refilled return paths after routing. Keep motor
return paths broad and direct to their supply return; keep buck loops compact.

## Automatic sizes and enforced limits

The editor was verified with **Track: use netclass width** and **Via: use netclass
sizes** selected. Keep these selected. Rule `opt` values provide the routing
width, including narrower approaches inside named `Neck` areas. DRC minimums
still apply if a toolbar override is selected.

| Route | Default / main-route minimum |
| --- | --- |
| Controller ordinary signal | 0.25 mm default; 0.15 mm fabrication minimum allows fine-pitch escapes |
| Controller 5 V rails, 12 V trunk | 2 mm |
| Controller pump drains, 3.3 V trunk | 1 mm |
| USB | 0.24 mm width, 0.15 mm pair gap, F.Cu only |
| Mains input/MOV and 12 V motor trunks | 3 mm |
| Other mains primary and 5 V trunk | 2 mm |
| Both buck switch nodes | 1 mm preferred, 0.3 mm minimum for their short lead escapes |
| Mains coil command | 0.3 mm |
| Sensor signals | 0.20 mm default; electrode geometry retains 0.15 mm minimum |
| Ordinary through via | 0.60 mm diameter / 0.30 mm drill minimum |
| Four installed controller module ground vias | 0.45 / 0.20 mm, only at their declared locations |

The exact power-pad approach allowances are in
[`routing-policy.json`](../../pcb/tools/routing-policy.json). Most extend 1 mm
beyond their pad; the few explicit sense/enable approaches extend 3 mm. Native
DRC selects the local width; the custom check requires the **entire** narrow copper
segment to fit the allowed region. A long track merely crossing a region fails.

The 5 V/12 V/primary trunks and pump drains use outer copper without individual
vias. Their present current allocation does not assume that a single ordinary
signal via carries the trunk current. Ordinary signal and 3.3 V branch vias remain
available. Non-ground traces/zones cannot occupy the controller In1 reference;
signal vias may pass through it with an antipad. Blind/micro/buried vias are blocked.

USB port/switch names now end in `_N`/`_P`, so KiCad recognizes all three pairs.
Their stable source identities and endpoints did not change. Use differential-pair
routing. Add adjacent ground stitching at the specified maximum 5 mm pitch as
the actual USB path takes shape. The 0.5 mm front-side ground spacing applies to routed copper, with the
existing component pads retaining their package clearance. Inspect pad transitions,
keep the pair over In1 ground, and meet the 0.5 mm mismatch target. The final
custom check also compares total routed copper length for each pair; inspect
branch/pad transitions as well. The fixed stack
and geometry are the existing impedance design basis, not measured impedance.

Mains DRC still enforces 3.2 mm between different primary nets and 8 mm between
primary and isolated copper. The sensor custom check rejects unrelated tracks in
the sensing window, while its native rule area blocks vias and pours there.

## Verification and limits

Each board's `kicad/evidence/routing-guardrails/` contains before/after snapshots,
ECO acceptance, strict ERC/parity, filled DRC and copper renders. Native negative
checks add intentionally bad routes only to temporary project copies. The geometry
checker also tests short escapes, crossing segments and gaps between allowances.

Rules catch measurable geometry mistakes. They do not decide the best path, prove
motor return-current distribution, prevent all possible plane bottlenecks, or
replace the final USB/thermal/EMI review. No component, protection bank, refill
firmware or extra PCB was added. Final fabrication and physical commissioning
remain separate.

The [validation record](evidence/routing-guardrails/validation.json) includes the
source CLI’s existing generic pin-metadata and J6 nearest-edge heuristic warnings.
Exact part/manifest checks and native ERC/DRC pass; accepted placement is retained.

Native rule semantics follow the [KiCad 10 PCB Editor manual](https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html#custom-design-rules).
