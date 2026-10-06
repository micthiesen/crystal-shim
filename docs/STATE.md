# Current state

Last updated: 2026-10-05

## Now

- **All procurement is received.** Michael reported receipt of Mouser
  [40452969](../bom/purchases/40452969/README.md) and the PCBs in hand on
  **2026-10-05 America/Vancouver**. Mouser cancelled the six-spacer line on
  2026-10-01 and shipped the 11 electronics on 2026-10-02 (invoice 92822100).
  All 103 inventory allocations are In stock. That count reconciles the
  2026-09-30 records (DigiKey [101602605](../bom/purchases/101602605/README.md),
  reviewed AliExpress cable, JLCPCB boards/stencils and owner-held stock) with
  this reported receipt; it is not a new physical stocktake. The two spacer
  allocations use owner-held stock, not Mouser parts.
- **The ordered board designs are retained.** Five of each PCB were ordered:
  white controller, blue mains and black sensor. The received board count and
  any bare-board inspection are not recorded. Use the current
  [manufacturing release](design/manufacturing-output.md) and
  [bulk-MOV ECO](design/evidence/mov-bulk-eco/README.md); the earlier mains ZIP
  is superseded. Supplier selections and their verification limits are in the
  [JLC purchase record](../bom/purchases/W2026091502305469/README.md).
- **The assembly booklet is complete and printed.** The
  [17-page bench guide](assembly/README.md) covers all 135 component placements,
  exact purchased MPNs, stencil/hot-bed and iron work, harnesses, mains/PE wiring
  and board combination. Every page was visually reviewed;
  [print job 230 completed](assembly/print-receipt.json).
- **Paste fixtures are modeled for the ordered boards.** The
  [CadQuery source and print files](../cad/stencil-fixtures/README.md) provide
  square PETG trays with flexible locating tabs, 1.8 mm pockets and separate
  nominal 0.2 mm shims. Use the measured PCB/printed pocket depth to select shims
  and verify a flush stencil seat. Physical print fit remains untested.
- **Digital checks passed; physical work remains unmeasured.** The
  [pre-fab evidence](design/evidence/pre-fab-2026-09-14/README.md), MOV ECO and
  [booklet review](assembly/README.md#sources-and-review) retain validation.
  No hardware was flashed or mains energized; assembly has not started and all
  physical commissioning rows remain Not run.
- **Assembly inputs remain partly unverified.** The AliExpress cable's length,
  gauge, pair count and model are unrecorded; check it against the 24 AWG
  three-pair, 203.2 mm harness limit before crimping. Cable receipt does not
  establish a completed harness, and Stillair's completed Hall harness is
  unrelated to this sensor cable. The existing service
  supply's model and ratings are unrecorded and not shown equivalent to
  GST18U05-P1J; the [service input](design/service-input.md) also allows a
  regulated 5 V bench supply with a 1 A limit. JLCPCB selected the stencil foil
  thickness; it remains unknown against the guide's 0.10 mm basis. Internal cut
  lengths are unrecorded. Solder paste, flux and bench tools are not tracked in
  inventory. These are checks, not new purchase requests.

## Next

Start interactive assembly with the [bench guide](assembly/README.md) and
[build sequence](build.md). Before paste work, check the received stencils'
thickness, the sensor cable and the service supply against the limits above;
print the [paste fixtures](../cad/stencil-fixtures/README.md) if desired.

Firmware, power-up, testing and tank mounting stay in interactive sessions;
record actual physical evidence in the [commissioning matrix](../testing/test-matrix.csv).
Receipt confirmation adds no tests or commissioning results.

## Candidates Not Chosen

- Additional purchases or optional replacements: no new purchases authorized.
- Commissioning now: physical assembly and its checks remain unrecorded.
- Further PCB changes: preserve the ordered designs.

## Learned Recently

- [Mouser order record](../bom/purchases/40452969/README.md): spacer line cancelled 2026-10-01; 11 electronics shipped 2026-10-02 and reported received 2026-10-05.
- [Inventory](../bom/inventory.csv): 103/103 In stock by record reconciliation; spacer allocations returned to owner-held stock.
- [Purchased-part mapping](assembly/source/parts.json): exact bag labels and orientations for all 135 placements.
- [JLC purchase record](../bom/purchases/W2026091502305469/order.json): actual order options remain distinct from proposed settings and unperformed CAM checks.
- [MOV capture](design/mov-capture.md): bulk TMOV14RP175E uses the revised slot; assembly fit remains separate from analytical acceptance.
