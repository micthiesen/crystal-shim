# Current state

Last updated: 2026-09-14

## Now

- **Purchasing is complete; waiting for delivery.** All 103 allocations are
  covered: 79 On the way and 24 In stock. [Inventory](../bom/inventory.csv) owns
  status; orders are [DigiKey 101602605](../bom/purchases/101602605/README.md),
  [Mouser 40452969](../bom/purchases/40452969/README.md) and
  [JLCPCB W2026091502305469](../bom/purchases/W2026091502305469/README.md).
  On the way includes backorders, not confirmed receipt.
- **The ordered board designs are retained.** Five of each PCB were ordered:
  white controller, blue mains and black sensor. Use the current
  [manufacturing release](design/manufacturing-output.md) and
  [bulk-MOV ECO](design/evidence/mov-bulk-eco/README.md); the earlier mains ZIP
  is superseded. Actual supplier selections and their verification limits are
  preserved in the JLC purchase record.
- **The assembly booklet is complete and printed.** The
  [17-page bench guide](assembly/README.md) covers all 135 component placements,
  exact purchased MPNs, stencil/hot-bed and iron work, harnesses, mains/PE wiring
  and board combination. ImageGen art, native placement geometry and the builder
  are tracked. Every page was visually reviewed. Executor submitted one duplex
  Letter copy; [job 230 completed successfully](assembly/print-receipt.json).
- **Digital checks passed; physical work remains unmeasured.** The
  [pre-fab evidence](design/evidence/pre-fab-2026-09-14/README.md), MOV ECO and
  [booklet review](assembly/README.md#sources-and-review) retain validation.
  The booklet work changed no native board. No hardware was flashed or mains
  energized; all physical commissioning rows remain Not run.
- **Receipt and assembly details remain open.** The Mouser receipt records
  AP63203WU-7 on backorder and delayed spacer blanks. Actual AliExpress cable
  specifications, internal cut lengths, stencil purchase and the existing service
  supply's suitability remain unconfirmed. See the
  [assembly limits](assembly/README.md#sources-and-review) and
  [service input](design/service-input.md). These are not new purchase requests.

## Next

Wait for hardware, then record actual receipts and assemble interactively using
the [bench guide](assembly/README.md) and [build sequence](build.md).

The owner closed procurement, and assembly requires the received boards and
parts. Firmware, power-up, testing and tank mounting stay in interactive sessions;
record physical evidence in the [commissioning matrix](../testing/test-matrix.csv).

## Candidates Not Chosen

- Additional purchases or optional replacements: procurement is covered and
  the owner requested waiting.
- Assembly or commissioning now: requires delivered hardware.
- Further PCB changes: no new issue or change was requested; preserve the
  ordered designs.

## Learned Recently

- [Purchased-part mapping](assembly/source/parts.json): exact bag labels and orientations for all 135 placements.
- [Booklet review](assembly/README.md): native geometry controls placement; ImageGen supplies generic technique and package illustrations.
- [Print receipt](assembly/print-receipt.json): Executor lost its response, but a read-only completed-job query confirmed success without a duplicate print.
- [JLC purchase record](../bom/purchases/W2026091502305469/order.json): actual order options remain distinct from proposed settings and unperformed CAM checks.
- [MOV capture](design/mov-capture.md): bulk TMOV14RP175E uses the revised slot; assembly fit remains separate from analytical acceptance.
