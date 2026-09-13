# Controller component source

The [future refill interface](../../../docs/design/refill-expansion.md) is a new
pre-routing requirement, not part of this accepted source/handoff. GPIO1/2/3 remain
NC and no expansion connector/power branch exists yet. Follow the declared ECO
workflow to close that reservation before fabrication.

The controller is adopted at [`../kicad/`](../kicad/) with
[`handoff.lock.json`](handoff.lock.json). The original 113 native files were
copied byte-for-byte from the reviewed stage and verified before lock creation;
[`adoption.json`](../kicad/evidence/adoption.json) retains that sequence. Both
repository-local libraries now use native-saved `${KIPRJMOD}` paths. All eight
schematic sheets pass strict cleanup, and basic rules plus all 51 net-class
preferences pass native readback. There are 216 unrouted items and zero DRC
violations. Adoption does not complete native augmentation, routing or manufacture.
See [the current native record](../../../docs/design/controller-grid.md).

## Guarded initial handoff

For a fresh source-comparison stage, run `bun run handoff:controller` from `pcb/`
on the verified macOS KiCad host. Preserve the adopted project and lock; later
source changes follow the declared ECO workflow.
It rebuilds source and stages a fresh initial board, eight schematic files,
99 per-reference footprints and a 96-entry project symbol library.
`export:kicad:controller` is an internal command:
it requires all four shared handoff environment guards, exact normalized inputs
and an empty canonical stage outside the repository. It cannot overwrite a seed.

The wrapper binds the freshly regenerated manifest, generator source hashes,
native footprint preservation, project-scoped Konnect library registration and
native initial project rules. It applies the declared 0.20 mm hole-clearance rule
through KiCad's settings manager; `.kicad_pro` and any native `.kicad_prl` output
are bound in receipts. Fresh-stage library tables name their exact stage paths.
The adopted project's native relocation has separately replaced those paths with
`${KIPRJMOD}/footprints/CrystalShim_Controller.pretty` and
`${KIPRJMOD}/CrystalShim_Controller.kicad_sym`.

The shared stage then checks hierarchy, source parity, initial ERC/DRC finding
policy and actual schematic/PCB renders. A successful **initial handoff stage**
can still contain the explicitly declared schematic cleanup and unrouted items.
Initial staging alone does not establish strict cleanup or manufacturing
readiness; the adoption and saved cleanup evidence above are separate steps.
Native cleanup has resolved unconnected pins, redundant wire overlaps, library
identity and missing power-source annotations. The initial grid transform now
removes all 542 off-grid findings. The revised USB source uses sixteen meaningful
signal islands and six explicit branch dots, preserving every native connection
through actual KiCad Save. Initial ERC has zero enabled findings; DRC has 216
unrouted items with zero other violations. A disposable copy saved through KiCad
passes all ERC categories with no ignored checks and exact component/net parity.
The module source now keeps its labels inside the A3 frame and clear of wires.
The adopted project passes the stricter before-routing cleanup command, which
includes excluded findings and rejects every ignored category. Fresh stages
retain their separate declared initial defaults. Eight basic fabrication-rule
fields and all 51 net preferences have been applied and reloaded. Known vendor
nominal stack layers have been entered through the GUI; nominal thickness
correction and final saved stack readback remain in progress. Further native
augmentation, complete design review and mated enclosure fit remain required. See
[the native evidence](../../../docs/design/controller-grid.md) and
[STATE](../../../docs/STATE.md).

The [augmentation contract](kicad-augment.json) and
[fabrication design basis](../../../docs/design/controller-stackup.md) retain
the native stackup, USB, thermal/via, stencil, antenna and assembly obligations.

`project-symbol-library-initial-export.ts` derives one symbol per source reference
and preserves pin types, numbers, geometry and placed instance identity. The
project entries carry the exact source defaults and project footprint filters.
Four explicit `PWR_FLAG` annotations identify V5_LOGIC, V3V3, V5_SERVICE_RAW and
GND as supplied nets; they have no board, BOM or position-file presence. Native
XML must still contain exactly 95 electrical parts, 51 named nets, 254 connected
pins and 20 NCs. A power annotation does not prove that a supply works.

These are actual selected part models for the final controller. They now form the complete
controller schematic and explicit board placement; enclosure fit, native assembly
and manufacturing delivery remain work.
The [controller basis](../../../docs/design/controller-design-basis.md) owns the
circuit contract and [footprint audit](../../../docs/design/footprint-audit.md)
records the manufacturer comparisons.

- `ic-land-patterns.ts` stores checked AP63203, AO3400A and TCA9517A copper lands.
- `esp32-c6-wroom.tsx` stores the WROOM pin map and pinned manufacturer lands,
  including nine separate, internally connected pad-29 lands and the vendor origin.
- `land-pattern.tsx` converts the native top-view +Y-down coordinates once.
- `land-pattern-physical.ts` adds checked body/envelope and explicit courtyard/
  mask declarations for all 27 purchased-part model IDs. Shared package users stay aligned;
  [the footprint audit](../../../docs/design/footprint-audit.md) lists the scope
  and remaining per-model stencil/thermal obligations. Passive, semiconductor and
  connector tables keep source evidence separate from the common geometry renderer.
- `ic-components.tsx` binds exact MPNs, pin functions and copper models for capture.
- `logic-land-patterns.ts` and `logic-components.tsx` add the supervisor, sensor
  feed, relay gate, USB detector and USB data switch with checked TI/onsemi lands.
- `protection-components.tsx` adds exact ST Schottky/USB ESD models, including
  the ESD part's two internal straight-through data paths.
- `passive-components.tsx` binds exact resistor values and capacitor ordering codes
  to Panasonic, TDK and Murata reflow lands. `assembly-components.tsx` adds the
  Bourns inductor, LED and button, preserving native THT origins and button pairs.
- `tht-footprint.tsx` and `micro-fit-components.tsx` reproduce the three selected
  headers' copper, round drills, NPTH locators and component-side circuit numbering.
- `usb-connector.tsx` captures USB4105-GF-A, including its 16 contact numbers,
  four shared shell pads and two locators. `usb-initial-export.ts` restores the
  body origin, alphanumeric native pins, all shell nets and paste layers.
- `service-protection-components.tsx` and `service-protection-land-patterns.ts`
  capture TPS259470ARPWR and bidirectional SMBJ8.0CA. The eFuse initial-export
  adapter moves custom-pad anchors inside copper without changing the L outlines.
- `relay-drive.tsx` captures the 12-part supervisor, relay gate, MOSFET and mains/LV harness section.
  `logic-power.tsx` captures the 10-part diode OR and buck section.
  `service-input.tsx` captures the 16-part protected service input,
  `usb-interface.tsx` the 13-part self-powered data interface and
  `module-controls.tsx` the 14-part module/boot/reset/maintenance/LED section. Their fixed
  references and named boundary nets are for integration into the final controller.
  They are integrated sections of the one controller board.
- `test-points.tsx` adds eleven unpopulated supply, I2C, relay and UART probe pads.
  They have explicit mask openings, no paste and no purchased BOM/CPL entries;
  [the pad contract](../../../docs/design/controller-test-points.md) records access and export rules.
- `sensor-interface.tsx` captures the 19-part protected feed, buffered I2C and
  sensor connector. `cable-protection-components.tsx` binds the selected ESD and
  TVS parts; the source preserves both bus domains and the power RC boundary.
- `controller.circuit.tsx` joins all seven sections into one 95-component,
  seven-sheet schematic. The 84 purchased parts agree with the controller BOM
  allocation; the other eleven components are test pads. `pcbRelative` disables
  automatic group packing that otherwise moves and rotates explicit placements.
  `placements.ts` supplies all 95 manufacturer-origin positions. The board also
  owns four 3.2 mm mounting holes and a four-layer, 1.6 mm FR4 specification.
  The integration test checks every source/native position, compiled courtyards
  and mounting reserves. Enclosure mating/access and routing review remain open.
- Compiled tests check physical pin/port identity, translated/rotated geometry,
  exposed-ground and switch pairing, and actual section netlists. Copper checks
  do not establish a final solder process or complete electrical performance.

Run `bun test controller/design` and `bun run render:controller` from `pcb/` for
the complete source checks and board/schematic previews under `dist/controller/design`.
`bun run render:controller-parts` writes a 25-component review SVG and Circuit JSON under ignored
`dist/controller/part-review/`. Its display positions and outline are not a product
board or an additional fabrication design. `bun run render:controller-sections`
renders all seven connected sections separately under
`dist/controller/section-review/`, using their positions from the complete board.
Final enclosure mating and routing review remain required. No render
here is a fabrication input.

The source `CrystalShim:*` model identities map through the manifest to adopted
`CrystalShim_Controller:Controller_REF` native entries. Body/courtyard and mask
output exists for every purchased controller part. The
[augmentation contract](kicad-augment.json) declares the stackup, USB, thermal/via,
paste, antenna, rule and manufacturing obligations. The handoff lock now exists;
remaining native application, assembly process closure, full enclosure fit and
fabrication outputs are still owed. Component tests run in the normal project gate.

## Initial export integration

Before running the pinned converters, call `prepareUsbForInitialExport(json, ["J4"])`
and `prepareFootprintOriginsForInitialExport` for U1/J1/J2/J3/D4/SW1/SW2/SW3,
using each returned copy. The latter validates the complete numbered-land/locator
multiset against the selected manufacturer pattern before restoring its origin;
absolute geometry is unchanged. After conversion, call `mapUsbPcbForInitialExport` and
`mapUsbSchematicForInitialExport` on the initial object graphs, and call
`anchorServiceEfuseForInitialExport` for every TPS259470 instance. Serialize only
after those validations succeed. Multi-sheet conversion places components in
generated child schematic graphs: apply the schematic mapper to the graph that
contains each USB instance and emit the complete `getOutputFiles()` set. An empty
root `getOutputString()` is not a complete export. These adapters are tested with the actual pinned
converters, including rejected drift, rotations and serialized native pins. They
must never load or edit an adopted KiCad design.
Also call `applyConnectorPhysicalForInitialExport` after the USB PCB mapper for
J1/J2/J3/J4, D4 and SW1/SW2/SW3. The pinned converter drops PTH mask margins
and rounded pin-one corners; this guarded adapter restores those source fields
without changing pads, holes, nets, layers or paste. It checks the complete batch
before mutation and preserves NPTHs. Four-angle tests compare native geometry
and permitted changes. Micro-Fit corner radius is 0.25 mm, ratio 1/6 on the
1.5 mm short side, not a 0.25 ratio.

For the full controller also call `omitTestPointPasteForInitialExport` on the
initial PCB graph. It validates all eleven pads before removing the converter's
unwanted paste layer; retain BOM/CPL exclusions and source-owned mask openings.

The adopted controller export includes these adapters, manifest/source checks
and repeated-physical-pad parity. Keep tscircuit routing disabled: the eFuse's
source polygon-port centres remain in the L notches. TI's split paste windows
remain a native augmentation obligation; body/courtyard and mask emit from the
source model. USB GND wiring
needs explicit source labels as exercised by `usb-connector.test.tsx`; native
netlist checks must retain A1/A12/B1/B12 and all four shell pads on GND.

The pinned schematic renderer can draw signal names as `schematic_text` without
an electrical label. Source sections use explicit `netlabel` elements and inherit
their sheet through a named group. Do not infer connectivity from a readable SVG
or from source traces alone. `schematic-connectivity-check.ts` follows actual
drawn wires and real label anchors, preserving sheet identity and checking unused
pins. Earlier five-section native schematic readback matched 190 connected pins:
32 relay, 24 buck, 37 service, 51 USB and 46 module. Independent review
checked the preceding 64-component/187-pin set and all 18 unused pins; root then
added the three-pin J1 harness and checked its native netlist. Raw module PCB
seeds have known unassigned repeated-pad copies; the complete guarded export
restores and verifies all nine module ground lands and both lands of each button
terminal through shared native augmentation.
The separate test-pad section adds eleven native-checked pins/pads, including
UART0 RX/TX and an adjacent isolated-ground return. Full-board integration must
preserve short branches and physical probe access. No raw review seed is an
accepted board.

The combined export has eight schematic files (root plus seven children). It
matches all 254 connected pins and 20 intended unused pins across 51 named nets.
Raw initial PCB readback counts 291 numbered physical pads with exactly the known
14 repeated-pad net omissions before augmentation. The new source-derived
library and shared native augmentation now restore every pad net; full strict
board and schematic parity passed before adoption. USB mapping, eFuse anchors
and test-pad paste removal were applied to initial object graphs before the first
stage-file write. No existing native design was edited.
The adopted placed export contains H1..H4 mounting-hole footprints, four copper
layers and nine total NPTHs. Source/native renders were inspected. Final enclosure
fit, native assembly details and routed-board verification remain open after
handoff. `createControllerInitialGraphs` composes all adapters and
refreshes every child schematic cache; it creates fresh graphs without reading
or writing any native file. Its caller must use guarded staging/adoption.

## Electrical metadata and physical datums

`pin-electrical-contract.ts` owns exact chip pin names/types. The pinned converter
emits passive library pins even when source ports request `kicadPinMetadata`.
Call `applyControllerPinTypesForInitialExport(json, allInitialSchematicGraphs)`
after power-label normalization and USB numbering, before serializing any file.
Refresh the converter's cached `file.content` from each typed `file.kicadSch`
before `getOutputFiles()`. The adapter validates every source component, exact
chip MPN, pin multiset/name and shared library copy before any mutation. Instance
pins retain UUID-only syntax. Unknown parts or incomplete batches fail closed.
The full-board test and actual KiCad XML readback cover all 95 components.

The initial exporter now adds the four reviewed supply flags and derives
per-reference project symbols, avoiding the earlier repeated-library-ID default
conflicts. Passive bootstrap/timing/programming terminals do not replace analogue
circuit checks. Pin metadata alone does not establish clean ERC; the adopted
project's separate strict cleanup does.

Physical bodies and courtyards use independent centres where necessary. The
WROOM native body centre is (0,-3); its compiled copper bounding-box centre is
(0,-0.005). The initial origin adapter restores that vendor datum and the THT
pin-one origins without moving actual source pads or bodies. Four-angle tests
and complete native pcbnew readback confirm the corrected datums and unchanged
absolute geometry. `createControllerInitialGraphs` now invokes that adapter;
the source manifest now passes strict native parity. The guarded handoff command
and augmentation declaration above integrate this into a fresh, verified stage.
Connector envelopes include rear tails and
latches, but harness bends, mating sweep and enclosure access remain separate.
The Molex 10.16 mm maximum edge datum is measured from the locator centre at
y=-4.32, not pin 1. See `connectorMechanicalConstraints` before placement.

## Source manifest and initial instance fields

[design-manifest.ts](design-manifest.ts) derives immutable reference-based IDs,
all 99 physical items, 274 logical pins, 51 nets and nine distinct holes from the
checked complete source. It retains the exact source model and gives each native
footprint a per-reference library ID. A compiled physical-geometry digest and an
effective initial-footprint digest bind copper, mask, paste, bodies, courtyards,
text and attributes even when a model ID stays the same. Shared normalization
retains both digests and classifies changes as high-risk footprint ECOs. Unknown
component owners fail. Unowned physical elements (including 50 compiler-emitted
THT paste records) and the complete compiled board record have board-level
digests, so changes to them require board-specification review. Unknown parts,
source errors, changed board
specifications or placement drift fail before export. The renderer emits
`dist/controller/design/design-manifest.json` beside the Circuit JSON.

[fields-initial-export.ts](fields-initial-export.ts) adds exact Footprint, MPN
and Datasheet properties to every initial schematic instance before serialization.
It accepts only empty fields, the pinned converter's `~` datasheet placeholder
and the exact expected source/native footprint identities. Whole-batch validation
precedes mutation. The manifest accounts for the pinned converter's symbol-name
sanitization, while preserving exact MPN values. Tests check late-batch rejection,
all 95 emitted instances and preservation of everything except those properties.
H1..H4 are board-only mechanical items excluded from schematic, BOM and CPL.

The earlier library-preservation proof used
`/tmp/crystal-shim-native-library-plan/geometry-stage-gtJYOj`.
`final-production-parity.json` records zero strict board/schematic parity errors,
zero intrinsic geometry drift and zero physical-pad net drift after shared
augmentation. All 99 native library entries were independently reloaded and hashed.
The shared `FromMM` conversion translates C22 and R35 by -1 internal unit in Y
(one nanometre); it remains within the declared parity tolerance. This is a
conversion proof, not an accepted handoff or clean ERC/DRC result.

### Source-derived native footprint library

`createControllerInitialGraphs` and `createControllerManifest` supply the fresh
seed and source manifest. [export-native-footprints.py](export-native-footprints.py)
reads those files and creates `CrystalShim_Controller.pretty` under a new staged
output root. Every reference gets its own `Controller_REF` entry, including
H1..H4. Shared model IDs contain different source-baked rotations and test-point
text, so selecting one instance per model ID would lose geometry.

Run from the repository root, with all paths below the same fresh stage:

```sh
sh pcb/tools/kicad_python.sh pcb/controller/design/export-native-footprints.py \
  --board /tmp/controller-stage/controller.kicad_pcb \
  --manifest /tmp/controller-stage/design-manifest.json \
  --stage /tmp/controller-stage \
  --output-root /tmp/controller-stage/footprints
```

The output root must not exist. If `STILLAIR_HANDOFF_STAGE` is set, it must equal
`--stage`. The exporter validates all 99 references, exact source/per-reference
library IDs, logical pad sets, 291 physical numbered lands and nine NPTHs before
creating output. The read-only Bun verifier uses the same pinned typed footprint
projection to compare every serialized initial seed against the manifest digest.
UUIDs, assigned nets, instance placement and metadata values are separate domains;
their geometry/styles remain in the digest. Compiled geometry uses coordinates
relative to the manufacturer datum; baked rotation can conservatively trigger
footprint review. Converter-ignored physical intent such as paste still changes
the compiled-source digest. Native save/load then compares complete physical-pad multisets,
copper, rounded corners, custom polygons, drills, mask/paste, body/courtyard
and text at all four cardinal rotations. The 0.25 mm PTH corner radius stays exact;
KiCad's ten-decimal ratio serialization is accounted for separately.

`native-footprints-receipt.json` is written only after every entry passes. It
records native/tool versions, verifier/canonicalizer hashes, both source geometry
identities, seed and manifest byte hashes, per-entry byte and
geometry hashes, and the 396 rotation comparisons. An interrupted or failed
output has no completion receipt and cannot be overwritten or resumed. The tool
never saves the seed, assigns production nets, registers libraries or adopts a
board. Shared staged augmentation consumes this output via
`--staged-footprint-root footprints` and remains responsible for every repeated
pad's source net, placement and complete board parity.

The native readback contract covers the current front-side controller, normal
pad stacks and front-side SMD custom copper. Models, footprint zones, per-layer
pad stacks, back-side footprints and unsupported graphic shapes fail closed
until their validation is implemented. This proves source geometry preservation,
not ERC/DRC or manufacturing readiness. The exporter itself does not register or
adopt a library. The adopted controller's footprint and symbol tables were
subsequently saved through the native project-library dialogs with `${KIPRJMOD}`
URIs. This tool does not text-write either library table.
