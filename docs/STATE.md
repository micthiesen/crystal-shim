# Current state

Last updated: 2026-09-14

## Now

- **Purchasing complete; waiting for hardware delivery**, as requested by the owner.
  [JLCPCB W2026091502305469](../bom/purchases/W2026091502305469/README.md)
  covers five each of controller, mains and sensor. Actual colours: white/black
  controller, blue/white mains, black/white sensor. Corrected minimum via option
  is 0.20 mm on controller/sensor and 0.30 mm on mains.
- All 103 component/material allocations are ordered or in stock:
  79 status On the way, 24 In stock. Two in-stock spacer allocations also have
  newly ordered quantities. [Inventory](../bom/inventory.csv) is authoritative.
  On the way includes backorders and undispatched purchases, not confirmed receipt.
- [DigiKey 101602605](../bom/purchases/101602605/README.md) has 72 lines;
  [Mouser 40452969](../bom/purchases/40452969/README.md) has seven lines/17 items,
  CAD61.06 total. Mouser AP63203WU-7 is backordered and six spacers show shipment
  in 20 days. Sensor twisted cable is ordered from AliExpress, exact specifications
  not yet recorded. Enclosure and existing cords remain In stock without tracking.
- Three routed native boards and production exports are retained. Controller and
  mains are 150 × 110 mm; sensor is 18 × 64 mm. Mains RV1 selects TMOV14RP175E
  with a 4.5 × 1.3 mm plated slot. All 89 mains tracks and 11 vias were preserved.
  Use the [MOV ECO evidence](design/evidence/mov-bulk-eco/README.md) and mains
  `fabrication/2026-09-14-mov-bulk/` release; earlier mains ZIP is superseded.
- Source/native parity, strict ERC, prepared native/routing checks, full project
  checks and exported CAM checks passed at release. See
  [pre-fab release](design/evidence/pre-fab-2026-09-14/README.md) and the MOV ECO.
  Those checks do not establish supplier CAM approval or physical performance.
- Actual JLC order differs from the baseline: white/black mask, plugged four-layer
  vias, sensor edge rounding Yes, and production-file confirmation No. The
  [purchase record](../bom/purchases/W2026091502305469/order.json) preserves all
  reported options and verification limits. Upload bytes, layer sequence and
  colour-specific supplier mask changes were not independently inspected.
  Stencil inclusion and order amount were not supplied; do not infer them.

## Next

Wait for the ordered hardware. The owner explicitly closed the purchasing phase;
no further design changes or purchases are requested. When deliveries arrive,
record actual receipts, then follow [build](build.md) and the
[commissioning matrix](../testing/test-matrix.csv) for assembly and commissioning.

All physical test rows remain Not run. Sensor calibration, adhesive response,
load startup, temperature, EMI, USB, RF and HomeKit operation remain unmeasured.
No hardware has been flashed or mains energized by this work. The existing
service supply's suitability and actual sensor-cable specification remain checks
at assembly, not reasons to reopen the completed purchasing session.

## Candidates not chosen

- Additional purchases or optional hardware replacements: owner considers all
  procurement covered and requests waiting.
- Physical assembly/commissioning: requires the final boards and received parts.
- Further PCB changes: no new change requested; preserve the ordered designs.

## Learned recently

- [Mouser receipt](../bom/purchases/40452969/README.md): actual quantities increased
  for five electronic parts; line calculations reconcile to CAD34.52 merchandise.
- [JLC order](../bom/purchases/W2026091502305469/README.md): retain actual selections
  separately from proposed settings and do not imply unperformed CAM approval.
- [MOV capture](design/mov-capture.md): bulk part fits the revised lead-capture
  geometry under standard tolerance assumptions; whole-body assembly acceptance
  remains separate from analytical fit.
- [Manufacturing profile](design/manufacturing-output.md) identifies current files,
  process baseline and stencil specifications. Never export fresh source seeds
  over the routed native KiCad projects.
- Earlier interface/routing work remains documented in the
  [connector ECO](design/evidence/connector-eco/),
  [sensor acceptance](design/evidence/sensor-routing-acceptance/README.md),
  [routing guardrails](design/routing-guardrails.md) and
  [checked workflow](../pcb/tools/README.md).
