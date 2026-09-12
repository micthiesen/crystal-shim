# Initial controller grid and native save

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

The source adds 16 USB dots only where every incident wire was already connected
by shared endpoints, positive-length collinear overlap or an existing explicit
junction. It does not join an isolated T endpoint on another wire's interior or
a plain crossing. Tests cover those negative cases, four-way branches, unchanged
wire geometry/UUIDs, coordinate arity and idempotence. All 443 source wires and
34 original junctions remain, with 16 new dots. Other sheets need none.

## Evidence and limits

The declaration-bound stage is
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

The four initial ignored checks remain single_global_label, four_way_junction,
simulation_model_issue and footprint_filter. Enabling them, J4 label legibility,
remaining native augmentation, mechanics and routing are still required before
adoption/release. Neither a clean enabled ERC nor this native-save proof is a
fabrication authorization. No production board or handoff lock is adopted.

A subsequent native-GUI investigation enabled all four deferred checks in the
same disposable copy, without changing the source stage or its declaration.
`erc-strict.json` has no ignored checks: footprint_filter, four_way_junction and
simulation_model_issue report zero findings. Seven single_global_label findings
remain, all sheet-internal USB net names: USB_CC1, USB_CC2, USB_D_N_PORT,
USB_D_P_PORT, USB_SWITCH_OE_N, USB_D_P_SWITCH and USB_D_N_SWITCH. Their naming and
source-parity treatment need explicit resolution before promoting the policy.
This evidence does not silently remove the initial stage's declared exceptions.

## Next source layout

A source-only CC1 experiment separates J4.A5 and R40.1 into two short labeled
wire islands. Removing either sole label unnames only that island's endpoint,
so these are meaningful connections rather than duplicate annotations on one
wire. The complete manifest and native 71-net/274-node memberships remain exact;
strict ERC with identical settings reduces single-global-label findings from
seven to six, with only USB_CC1 removed. A second source experiment uses a
horizontal A1 ground label and one horizontal A12/B1 ground branch. It removes
the visible J4 overlap while preserving the complete manifest/native netlist.

Apply that source pattern to CC1/CC2, connector/ESD/switch data sections,
switch-enable and both switch-to-series-resistor nets. Keep paired J4 and U9
contacts explicitly connected within their islands, all source net names and
physical placements unchanged. The proposed sixteen labels represent actual
component-level islands. Use negative label-removal tests, full native renders,
strict ERC and native Save readback to validate the complete implementation.
The pinned public netlabel API has no local/global scope option; an additional
local-label adapter would introduce hierarchy naming work and leave crowding.

The scratch evidence is `/tmp/crystal-shim-usb-label-plan`. Those unregistered,
never-GUI-saved initial experiments also retain the same nine four-way-junction
and library-link findings; only the CC1 warning delta is proven. They do not
supersede the guarded stage or establish complete strict ERC. The other six
signal layouts and final native validation remain the next implementation task.
