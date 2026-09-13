# Controller grid, native save and adoption

## Adopted project status

The reviewed stage has been adopted at
[`pcb/controller/kicad`](../../pcb/controller/kicad/), with
[`design/handoff.lock.json`](../../pcb/controller/design/handoff.lock.json).
The original 113 native files were copied byte-for-byte and verified against the
stage before the lock was created.
[`adoption.json`](../../pcb/controller/kicad/evidence/adoption.json) and the
retained initial receipts record that sequence; their stage paths describe the
original evidence, not the current library location.

Both repository-local libraries now have native-saved `${KIPRJMOD}` URIs:
`footprints/CrystalShim_Controller.pretty` and `CrystalShim_Controller.kicad_sym`.
All eight adopted schematic sheets were saved and pass strict source/net cleanup
with no ignored categories or findings, including exclusion severity. The report
is `/tmp/crystal-shim-controller-adopted-cleanup.json`; its ERC SHA-256 is
`157021c2c89a83522bdcd5703409f6ef180dbc6cd32759f9b0e8c8a343925050`.

Basic native settings have been applied and independently reloaded: eight rule
fields, including the 0.35 mm minimum via diameter and 0.10 mm mask-aperture merge
threshold, plus routing preferences for all 51 nets. Six USB nets use 0.24 mm
width and 0.15 mm pair gap; the remaining 45 retain Default preferences. This does
not enforce the separate 2 mm power-spine or physical mask-web obligations.
`/tmp/crystal-shim-controller-basic-settings` retains the application, fresh
readback and DRC reports. That DRC has **216 unrouted items and zero violations**.

The known vendor nominal stack layers have been entered through the GUI. The
source-owned nominal 1.6 mm board-header correction and final saved-stack readback
remain in progress; this record does not claim complete stackup evidence. The
[stackup contract](controller-stackup.md) tracks the remaining details. Native
thermal/paste/other augmentation, mated enclosure fit, complete design review,
routing and fabrication remain open. Adoption and strict schematic cleanup are
not manufacturing or operating acceptance.

The sections below retain the preceding source and native-save experiments in
order. Their stage-specific counts and limitations are historical evidence.

## Initial grid transform

The fresh initial exporter converts each schematic's electrical anchors onto the
1.27 mm grid while preserving their strict order. It works on cloned typed graphs
before the first serialization; it never edits an existing KiCad document.
Source is [schematic-grid-initial-export.ts](../../pcb/scripts/lib/schematic-grid-initial-export.ts).

The map canonicalizes coordinates to KiCad's 10,000 integer units per millimetre,
including its half-away-from-zero conversion. Each axis sorts unique native
anchors and assigns `g[i] = max(round(k[i]/12700), g[i-1]+1)`. Distinct tiny wire
segments remain distinct. Ordinary nearest-grid rounding had collapsed them and
was rejected. Wires stay orthogonal; symbol pins, instance/local transforms,
labels, NCs and standalone library caches follow the same mapping. Unsupported
hierarchy, noncardinal poses and unhandled drawing types reject atomically.
Junction/NC positions retain the required two-field `(at x y)` syntax. A prior
three-field mistake let KiCad CLI return success while dropping later wires,
which is why exit status alone is insufficient evidence.

Display polylines follow the coordinate map; fonts, strokes and circle radii
remain unchanged. The four joined L1 lobes/tails have an explicit cosmetic
reconstruction that preserves electrical pin positions, lengths and types.
Grid alignment is not a complete legibility or electrical review.

## Native-save defect and fix

An initially clean native netlist lost 13 USB pin memberships after actual GUI
Save. Copies using both old and current format versions reproduced the defect.
Wire coverage, pin positions and UUID uniqueness were unchanged. KiCad merged
collinear wire segments without adding branch dots. A formerly shared endpoint
then met a longer wire's interior without an explicit junction.

For example, the USB_CC1 line became `(87.63,121.92)` to `(102.87,121.92)`, leaving
J4.A5's branch at `(101.6,121.92)` disconnected. A fresh typed experiment replacing
only that merged wire group reproduced the failure. Reversing its endpoints did
not fix it. Adding explicit dots at already connected branch nodes preserved
native connectivity both before and after the exact native wire merges.

The initial grid fix added 16 USB dots only where every incident wire was already
connected by shared endpoints, positive-length collinear overlap or an existing
explicit junction. It does not join an isolated T endpoint on another wire's interior or
a plain crossing. Tests cover those negative cases, four-way branches, unchanged
wire geometry/UUIDs, coordinate arity and idempotence. That version retained all
443 source wires and 34 original junctions, with 16 new dots. Other sheets needed
none.

## Evidence and limits

The initial grid declaration-bound stage was
`/private/tmp/crystal-shim-controller-handoff/stillair-controller.board.main-handoff-g3sx3ru0`.
All eight stage commands pass. The native output retains 95 electrical parts,
99 physical footprints, 274 logical pins, 51 named nets with 254 connected pins
and 20 NC singleton nets. Compared with the prior stage, component source fields,
libpart identities/pin types, board specifications and footprint identities match.
Enabled ERC findings fall from 542 to zero. DRC still has 216 unrouted items.

The actual KiCad 10.0.5 project editor saved a copied final stage at
`/tmp/crystal-shim-controller-final-grid-gui`. All eight sheets were rewritten;
ERC remained clean and all net names/ref/pin/types remained exact.
`native-gui-receipt.json` binds that readback. The implementation evidence,
source hashes, baseline/merged-wire discriminators and inspected full/detail
renders are in `/tmp/crystal-shim-controller-grid-implementation`.

An independent review found no actionable topology or native-serialization
defect. Its six focused tests pass 5,493 assertions, including zero-length
polyline and all-eight-sheet native-save checks. That scope excludes electrical
design, remaining display overlap and downstream routing.

At that stage, single_global_label, four_way_junction, simulation_model_issue
and footprint_filter remained ignored, and J4 legibility was still open. The USB
and module work below subsequently closed those schematic issues. This earlier
native-save proof did not itself authorize adoption or fabrication.

A subsequent native-GUI investigation enabled all four deferred checks in the
same disposable copy, without changing the source stage or its declaration.
`erc-strict.json` has no ignored checks: footprint_filter, four_way_junction and
simulation_model_issue report zero findings. Seven single_global_label findings
remain, all sheet-internal USB net names: USB_CC1, USB_CC2, USB_D_PORT_N,
USB_D_PORT_P, USB_SWITCH_OE_N, USB_D_SWITCH_P and USB_D_SWITCH_N. Their naming and
source-parity treatment required the source-layout correction below.
This evidence does not silently remove the initial stage's declared exceptions.

## USB source layout and label evidence

The USB source now separates CC1/CC2, connector/ESD/switch data sections,
switch-enable and both switch-to-series-resistor nets into sixteen meaningful
labeled wire islands. Paired J4 contacts and paired U9 contacts remain physically
wired together within their respective islands. Each repeated label names a
different wire island; removing one label leaves exactly that island's intended
pins unnamed and preserves every other endpoint. Flat net names are unchanged.
The pinned public netlabel API has no local/global scope option; this layout
uses its native global labels without adding a hierarchy-name adapter.

J4.A1 has a horizontal ground label. J4.A12/B1 share one short branch and one
horizontal ground label, replacing the overlapping annotations. U8.SEL/GND use
separate short horizontal ground stubs, keeping the data labels clear. R46 moves
only on the schematic, beside U8.OE_N. Every physical placement, footprint and
source identity is unchanged. The shorter USB routing leaves 408 wires and six
added branch dots across the complete initial schematic, versus 443 and sixteen
in the earlier grid proof. The grid algorithm and both audited cleanup motifs
are unchanged.

The source-label discriminator and initial CC1-only experiment remain in
`/tmp/crystal-shim-usb-label-plan`. The complete implementation evidence is in
`/tmp/crystal-shim-usb-layout-implementation`. Exact comparisons preserve the
complete source manifest, all 1,194 PCB JSON records, and all native 71 net names
with their 274 ref/pin/function/type memberships. Fifteen focused tests pass
5,689 assertions, including every individual label removal and the shared ground
branch. PCB lint, format, typecheck and 115 tests with 23,491 assertions pass.
Native full-sheet renders and detailed J4/U9/U8/U7 views were inspected for the
changed layout.

The USB-layout declaration-bound stage was
`/private/tmp/crystal-shim-controller-handoff/stillair-controller.board.main-handoff-gae9l3qz`.
All eight stage commands pass. Native schematic parity remains exact, enabled ERC
and DRC violations are zero, and 216 unrouted items remain. Its four initially
ignored ERC categories and augmentation policy are unchanged.

A separate new initial seed uses an unchanged byte-copy of the previously
GUI-saved strict project settings. With `ignored_checks=[]`, all seven
single_global_label findings are eliminated. That unregistered, never-GUI-saved
seed still reports ten four_way_junction, 95 footprint_link_issues and 99
lib_symbol_issues findings; it exits 5 and does not establish clean strict ERC.
`strict-diagnostic.json` records the exact policy hash and unchanged input bytes.
Root then opened a byte-copy of the guarded stage in the KiCad 10.0.5 project
editor at `/tmp/crystal-shim-controller-usb-gui` and saved all eight sheets.
Every component, library definition and all 71 net names with 274 complete pin
memberships remain exact. Through Schematic Setup, all four deferred categories
were enabled and saved. The resulting `erc-strict.json` exits zero, contains
`ignored_checks=[]` and has no violations. `native-gui-receipt.json` binds the
actual rewrite, native readback and strict report; its ERC report SHA-256 is
`59a4aa50d8a3c2c9d74ea4abea015aecb8b2819283bf93304373db92a5df8e90`.

This verified the saved USB schematic under strict policy. Fresh stages retain
KiCad's four explicit default ignored categories, while the before-routing cleanup
gate rejects any ignored category. At this point the gate audit and module-page
label/frame crossings remained open; the next section records their resolution.
The full USB page and J4/U8 details were inspected. This intermediate proof did
not authorize routing or fabrication release.


## Module page and strict cleanup gate

The module source now places button and LED labels on short inward-facing stubs,
uses four distinct CHIP_EN islands, and routes U1's paired grounds above the NC
pin. The complete A3 page was inspected; the former left/right frame crossings
and R53 label/wire crossing are gone. Every physical PCB record, source manifest
field and native net membership remains exact. Removing individual CHIP_EN labels
proves each one serves only C9.1, R53.2, R55.1 or U1.3; the old source fails that
regression. Current initial source has 427 wires and seven added branch dots;
the grid algorithm is unchanged. Evidence is `/tmp/crystal-shim-module-layout`.

The final pre-adoption guarded stage was
`/private/tmp/crystal-shim-controller-handoff/stillair-controller.board.main-handoff-gaya1rm0`.
All eight stage commands pass. Root opened its byte-copy at
`/tmp/crystal-shim-controller-module-gui` through the native project editor,
saved all eight sheets, enabled all four initial default checks in Schematic
Setup, and saved again. Exact components, library definitions and all 71 nets /
274 complete pin memberships survive. The strict report includes error, warning
and exclusion severities, has no ignored checks and no violations. Its SHA-256 is
`20d4b0eb1a38b67944ab6e2b7a08551e7eb80d34e97bdd5a46ef4a2a4e86000f`.
`native-gui-receipt.json` binds that proof; `cleanup-strict-gate.json` also passes
exact source-field and schematic parity through the shared production command.

Independent audit found the cleanup command previously reused the initial ignored
allowlist and could accept a zero-finding report with disabled rules. It now
rejects all ignored categories, requests `--severity-all`, requires proof that
excluded findings were included and rejects every remaining finding. Initial
staging retains its separate declared allowances. CLI regressions cover each of
the four initial ignores, all four together, missing exclusion reporting, an
excluded finding of an initially allowed type and the strict clean case. The
old source fails the ignored-rule regression. Both shared Python suites pass
36 tests. A live excluded marker was not exercised; the current native copy has
no exclusion entries. The initial/default policy and strict cleanup policy remain
separate, explicit stages.

This closed the identified page defects and strict schematic-cleanup check for
the candidate subsequently adopted above. The adopted project retains this strict
policy. Native board augmentation, mated enclosure fit, complete design review,
routing and fabrication remain separate obligations.
