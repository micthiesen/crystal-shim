# Routing with the prepared KiCad projects

Open each production `.kicad_pro`, keeping its `.kicad_dru` beside it. The boards
have filled ground copper, ground/thermal vias, and routing constraints. Component
placement follows the compact redesign; current acceptance is recorded in
[STATE](../STATE.md). Draw the remaining traces,
press **B** to refill, save, and run:

```sh
sh scripts/check-routing.sh
```

An optional board name limits the check, for example `sh scripts/check-routing.sh
controller`. Add `--final` when routing is complete to require zero unconnected
items as well. The command checks copper DRC, schematic parity and the additional
routing policy. It calculates fresh fills for checking without overwriting an open
editor. During routing, unconnected items are expected; other findings must be
resolved. Follow the [manufacturing output profile](manufacturing-output.md) for the
separate final ERC/parity, fabrication checks and export recipe.

## Copper already present

| Board | Copper arrangement |
| --- | --- |
| Controller | Four layers: F.Cu signals/ground, continuous In1.Cu ground reference, In2.Cu power/limited signals, B.Cu ground/thermal return |
| Mains | Two layers: isolated-secondary F.Cu/B.Cu ground pours, no ground pour across primary/SELV boundary |
| Sensor | Four layers: outward F.Cu electronics/signals, In1.Cu ground/limited routing, split driven SHLD1/SHLD2 backing on In2.Cu, glass-facing mask-covered B.Cu electrodes |

Prepared ground/thermal vias and pours are native-owned routing geometry. Use
actual saved zones and the current augmentation for their positions; old via
counts and coordinates are not a placement specification. The sensor's inner
driven shields are fixed electrode copper, not ground planes to refill over.

SMD pads and vias connect solidly. Ordinary through-hole pads use 0.5 mm thermal
spokes with 0.3 mm gaps. Motor-return connector pads and the mains supply return
connect solidly. Floating copper islands are removed. Existing antenna, mounting,
sensor-field and mains-barrier exclusions remain. Controller In2.Cu stays available
for power and limited signals; sensor In2.Cu has a different driven-shield role.

The controller has broad bottom copper beneath the buck, joined to the board
return rather than an isolated thermal rectangle. Final trace placement can cut
into any pour, so inspect the refilled return paths after routing. Keep motor
return paths broad and direct to their supply return; keep buck loops compact.

## High-level routing order

[Open the routing cheat sheet](https://mcp.syas.ca/boris/artifacts/art_e9fv40epjxmu078n9c).

| Board | Route first | Then | Main tips |
| --- | --- | --- | --- |
| Controller | Compact buck power loops | USB pairs, broad power/motor paths, remaining signals | Reviewed USB F.Cu/B.Cu paths and through vias accepted; keep In1.Cu ground intact; use In2.Cu/B.Cu for ordinary signals as permitted |
| Mains | Buck loops and broad isolated supply paths | Primary input/filter/relay paths, then coil/control | Keep power trunks on outer copper without vias; preserve primary/SELV gaps and separate filter LINE/LOAD paths |
| Sensor | Local regulator and decoupling | I2C and pigtail; inspect the prepared CIN/shield connections | Preserve the fixed glass-side electrodes and inner driven shields; use permitted outward/inner routing and existing field restrictions |

Refill and inspect ground returns as routes are added. Keep pair members together,
use the prepared widths, and make any narrow pad escape short before returning
to trunk width. Finish by running the final check and reviewing filled copper.

## Automatic sizes and enforced limits

The editor was verified with **Track: use netclass width** and **Via: use netclass
sizes** selected. Keep these selected, with connected-track width inheritance
disabled. Rule `opt` values keep the full trunk width even when starting at a
small pad. Select a smaller width only for a short pad escape, then return to
netclass width. DRC minimums still apply if a toolbar override is selected.

These are editor-session choices. The native board API's in-memory defaults do
not prove the GUI choices were saved; available `.kicad_prl` preferences are
reported separately by the preparation audit. Netclass values and native rule
minimums/optimums are checked from the saved project and rules. A session
preference report does not prove which width an unsaved open editor will choose.

| Route | Default / main-route minimum |
| --- | --- |
| Controller ordinary signal | 0.25 mm default; 0.15 mm fabrication minimum allows fine-pitch escapes |
| Controller 5 V rails, 12 V trunk | 2 mm |
| Controller pump drains, 3.3 V trunk | 1 mm |
| USB | 0.24 mm width / 0.15 mm gap remain defaults; reviewed F.Cu/B.Cu paths and vias accepted |
| Mains input/MOV and 12 V motor trunks | 3 mm |
| Other mains primary and 5 V trunk | 2 mm |
| Both buck switch nodes | 1 mm preferred, 0.3 mm minimum for their short lead escapes |
| Mains coil command | 0.3 mm |
| Sensor signals | 0.20 mm default; electrode geometry retains 0.15 mm minimum |
| Controller/mains ordinary through via | 0.60 mm diameter / 0.30 mm drill minimum |
| Sensor through via | 0.45 mm diameter / 0.20 mm drill minimum |
| Four installed controller module ground vias | 0.45 / 0.20 mm, only at their declared locations |

The exact power-pad approach allowances are in
[`routing-policy.json`](../../pcb/tools/routing-policy.json). Most extend 1 mm
beyond their pad; the few explicit sense/enable approaches extend 3 mm. Native
DRC uses `enclosedByArea` to require the **entire** narrow copper segment to fit
one named region. A long track merely crossing a region fails ordinary KiCad
DRC. The supplemental check independently verifies the swept copper, including
gaps between escape regions. These rules permit necks; they do not automatically
create a width transition or enlarge a small pad.

The 5 V/12 V/primary trunks and pump drains use outer copper without individual
vias. Their present current allocation does not assume that a single ordinary
signal via carries the trunk current. Ordinary signal and 3.3 V branch vias remain
available. Non-ground traces/zones cannot occupy the controller In1 reference;
signal vias may pass through it with an antipad. Blind/micro/buried vias are blocked.

USB port/switch names now end in `_N`/`_P`, so KiCad recognizes all three pairs.
Their stable source identities and endpoints did not change. The owner's
2026-09-14 [USB decision](controller-routing-review.md) accepts the reviewed
full-speed routing without paid impedance control. Existing no-via/front-only,
pair-gap and mismatch checks are legacy policy findings for these paths, not
requests to reroute. Native rules and checker policy still need reconciliation
before formal handoff acceptance; retain all short/clearance/connectivity checks.

Mains DRC still enforces 3.2 mm between different primary nets and 8 mm between
primary and isolated copper. The sensor field rules follow its four-layer stack and declared breakouts. Do not
apply the superseded blanket two-layer above-rim via/ground rule to this board.

## Verification and limits

Current compact-layout acceptance and final native-preparation receipts are linked
from [STATE](../STATE.md) and each board's native README. The earlier
`routing-guardrails` receipts describe the previous outlines. Native negative
checks add intentionally bad routes only to temporary project copies. The geometry
checker also tests short escapes, crossing segments and gaps between allowances.

The sensor has six exact UUID-bound exclusions for intentional In2-only shield
pads, reported by KiCad as “SMD pad has no outer layers”. The supplemental audit
checks their dimensions, net, count and layer, plus the fixed bars and breakouts.
No other padstack finding is waived. This representation has no soldermask or
paste openings on either sensor electrode layer.

Rules catch measurable geometry mistakes. They do not decide the best path, prove
motor return-current distribution, prevent all possible plane bottlenecks, or
replace the final USB/thermal/EMI review. No component, protection bank, refill
firmware or extra PCB was added. Final fabrication and physical commissioning
remain separate.

The [current validation record](evidence/compact-redesign/validation.json) includes
native checks and focused review. Generic source pin-metadata warnings and the
previously reviewed nearest-edge heuristic do not replace exact manifest/part
checks or native ERC/DRC.

Native rule semantics follow the [KiCad 10 PCB Editor manual](https://docs.kicad.org/10.0/en/pcbnew/pcbnew.html#custom-design-rules).
