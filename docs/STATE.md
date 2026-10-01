# Current state

Last updated: 2026-09-30

## Now

- **Most procurement is received; Mouser release remains open.** Michael's
  procurement reconciliation request on **2026-09-30 America/Vancouver** confirms
  DigiKey [101602605](../bom/purchases/101602605/README.md) (72 order lines),
  JLCPCB [W2026091502305469](../bom/purchases/W2026091502305469/README.md)
  boards/stencils and reviewed AliExpress cable received. Of 103 inventory
  allocations, 97 are In stock and six Mouser electronics allocations remain
  On the way, meaning not received and awaiting release. Existing spacer stock
  allocations are distinct from the ordered six spacers.
- **Mouser 40452969 / sales 282002229 remains not received.** Six M0599-4-N
  spacers hold 11 in-stock electronics, 17 ordered pieces total. Removal of all
  six spacers was requested, not split shipment. Email sent to
  canadasales@mouser.com **2026-10-01 01:41 UTC (September 30 Vancouver)**;
  vendor confirmation is pending. See the [order record](../bom/purchases/40452969/README.md).
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
- **Paste fixtures are modeled for the ordered boards.** The
  [CadQuery source and print files](../cad/stencil-fixtures/README.md) provide
  square PETG trays with flexible locating tabs, 1.8 mm pockets and separate
  nominal 0.2 mm shims. The two large trays are 210 mm square; the sensor tray
  is 130 mm square. Use the measured PCB/printed pocket depth to select shims
  and verify a flush stencil seat. CAD/export checks, independent review and
  visual review passed; physical print fit remains untested.
- **Assembly details remain open.** Actual AliExpress cable specifications,
  internal cut lengths and the existing service supply's suitability remain
  unconfirmed. Cable receipt does not establish a completed harness. Stillair's
  completed Hall harness is unrelated to Crystal Shim's external sensor cable.
  See the [assembly limits](assembly/README.md#sources-and-review) and
  [service input](design/service-input.md). These are not new purchase requests.
  The owner confirmed all three top stencils: 170 × 130 mm for controller/mains,
  40 × 90 mm for sensor. JLCPCB selected the foil thickness; its actual value
  remains unknown, distinct from the printed guide's 0.10 mm design basis.

## Next

Print the [paste fixtures](../cad/stencil-fixtures/README.md) if desired, and
prepare interactive assembly using the [bench guide](assembly/README.md) and
[build sequence](build.md). Mouser electronics remain unavailable until released
and received; no new purchase or substitute is requested.

Firmware, power-up, testing and tank mounting stay in interactive sessions;
record actual physical evidence in the [commissioning matrix](../testing/test-matrix.csv).
Owner receipt confirmation adds no new tests or commissioning results.

## Candidates Not Chosen

- Additional purchases or optional replacements: no new purchases authorized.
- Commissioning now: physical assembly and its checks remain unrecorded.
- Further PCB changes: preserve the ordered designs.

## Learned Recently

- [Purchased-part mapping](assembly/source/parts.json): exact bag labels and orientations for all 135 placements.
- [Booklet review](assembly/README.md): native geometry controls placement; ImageGen supplies generic technique and package illustrations.
- [Print receipt](assembly/print-receipt.json): Executor lost its response, but a read-only completed-job query confirmed success without a duplicate print.
- [JLC purchase record](../bom/purchases/W2026091502305469/order.json): actual order options remain distinct from proposed settings and unperformed CAM checks.
- [MOV capture](design/mov-capture.md): bulk TMOV14RP175E uses the revised slot; assembly fit remains separate from analytical acceptance.
