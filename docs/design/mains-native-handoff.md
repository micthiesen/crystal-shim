# Mains native preparation

The complete source is captured at `pcb/mains/design`. Native preparation acts
on fresh typed graphs before any initial file is emitted. It does not load or
rewrite an adopted board. The mains project has not been adopted; controller
KiCad files remain separate.

## Measured converter behavior

The pinned converter yields 27 footprints: 23 electrical parts and four anonymous
mounting holes. There are 81 numbered lands, comprising 49 PTH and 32 SMT, plus
five NPTHs including J5's locator. All 49 PTH mask margins lose the source's
0.05 mm expansion. The 32 SMT margins survive. Native PTHs have no stencil paste;
the 118 source paste records are different data and must remain bound by the
source-geometry receipt.

The raw four-file schematic parses and has exact 66-pin net membership. Its
initial ERC reports 90 off-grid endpoint warnings, 23 library warnings and ten
unconnected-pin errors. Those ten pins are intentional source NCs needing native
markers, not a reason to weaken their electrical types. The raw export is not
a clean-ERC design. Evidence: `/tmp/crystal-shim-mains-schematic-final-_p3esjyj`.

## Physical preparation

The shared `prepareFootprintOriginsWithPatterns` matcher accepts an explicit
exact-MPN pattern registry. The mains wrapper supplies all eleven asymmetric
THT models, matching the complete numbered-land/locator multiset. It changes
only each derived component centre; copper, holes, outlines, nets and other
source fields stay fixed. Duplicate Sabre tails retain their shared logical
number. U1 uses its drawing datum, K1 pin 3, and RV1 its round-hole pin 1.
RV1's raw copper-box centre is 4.35 mm beyond pin 1, distinct from the 3.75 mm
pad midpoint used by its assembly envelope. A guessed midpoint correction fails.

The controller wrapper retains its exact previous registry and matcher behavior.
Its full generated manifest is byte-identical before and after extraction,
SHA-256 `ec2730407fac833e15c48b17f3dcbec7de0b8e0bf3e04556e261f58044b64aac`.
Source tests cover all four rotations, repeated lands, locator drift and atomic
failure. This reuse does not authorize an ECO on the adopted controller.

`createMainsInitialPcb` composes origin preparation with the existing U2 RPW
anchor and J5 shape/mask adapters and the mains PTH mask adapter. Preserve square
U1.1, K1.1 and D1.1; both Sabre tails; and the RV1 oval 3.7 x 1.3 mm plated slot
with 5.3 x 2.9 mm copper. Require no paste on any PTH/NPTH. The four mounting
footprints gain stable H1-H4 identities and board-only/BOM/CPL exclusions after
their exact 3.2 mm NPTH geometry and positions are validated. Pads, positions and
UUIDs stay fixed. Per-ref native library helpers are implemented but have not
been run on a product stage.

R1 and C1 retain only `100Ω` and `47nF` as converter Values. The wrapper checks
their exact source MPNs and quantities, then binds native MPN properties before
physical validation. Missing, changed or duplicate metadata fails. Property
arrays must be assigned through the typed setter; appending to the getter's
returned array does not change the graph. Tests exercise the serialized result.

The complete wrapper checks the product's 23 refs, 66 pins, fourteen named nets
and ten NCs against both source connections and actual drawn schematic geometry
before conversion. It then checks all 81 native pad instances and their net
names/IDs before physical correction. A coordinated but incorrect source/drawing
rename cannot pass merely because the two representations agree. The physical
mask adapter preserves nets; the complete wrapper owns electrical admission.

U2's corner anchors belong inside its L-shaped lands. This correction does not
implement TI's stencil or thermal design. Declare a 0.100 mm stencil and exact
reduced RPW apertures with native readback. IN5 and OUT6 are separate power
spreading regions; neither is a ground pad. Determine the two-layer copper/via
design from the mains eFuse's power budget. The controller's four-layer thermal
implementation is a reference, not an automatic mains-board requirement.

## Guarded staging implementation

`stage-mains-export.ts` now binds the complete shared handoff environment to a
canonical fresh directory outside the repository. It accepts only the normalized
manifest and augmentation inputs, regenerates and compares the actual source,
and exclusively creates the PCB, four-sheet hierarchy and symbol library.
Input bytes, directory identity and generator hashes are checked again between
the native steps. An incomplete stage has no success receipt and is never reused.

The native helper sequence is implemented but **has not been executed**:

1. `export-native-footprints.py` uses native FootprintSave/FootprintLoad for
   27 per-ref entries, requiring 81 numbered lands, five NPTHs, exact physical
   pad multisets and 108 cardinal-rotation comparisons. The read-only
   `verify-initial-geometry.ts` binds the serialized seed to every manifest hash.
2. `register-mains-library.py` uses the previously verified Konnect 0.2.1 library
   operations for `CrystalShim_Mains`, requiring 27 footprints and 24 symbols
   (23 part definitions plus PWR_FLAG), exact saved tables and unchanged inputs.
3. `apply-mains-initial-rules.py` uses KiCad's native settings manager to create
   only the declared 0.20 mm NPTH clearance. The wrapper binds native receipts,
   file inventories and preserved bytes before recording initial-export success.

Mains fingerprints include borrowed controller component/geometry modules and
both shared origin/grid helpers. The controller fingerprint also now includes
the shared origin matcher, which its previous extraction omitted. No adopted
controller file changed.

The [augmentation draft](../../pcb/mains/design/kicad-augment.json) covers all
14 declared operations. It includes all eight isolated nets and unused
primary blades/tails, the exact copper-free strip transform, the
[thermal/stencil proposal](mains-thermal-stencil.md), and source-owned geometry
preservation. Detailed operations remain declarative: the shared staging tool
only applies coordinate/footprint/alias transformations, and the initial helper
only adds the NPTH preference. JSON validation does not implement isolation,
thermal copper, paste, routing or manufacturing rules.

**Before the first product stage**, finish independent review of the thermal
proposal, wrapper/helpers and integrated augmentation. Reconcile the draft's
initial ignored-check categories against the installed KiCad defaults and actual
mains reports. They currently match observed controller defaults, not measured
mains evidence. No ordinary ERC findings or semantic differences are allowed;
strict saved schematic cleanup must enable all ERC checks before routing.
Do not treat initial default-category declarations as final fabrication waivers.
Add `export:kicad:mains` and `handoff:mains` package commands only after this
review. They are intentionally absent at this wrap point. Do not create an
accepted lock until a reviewed stage is actually adopted.

Host tests exercised exclusive initial hierarchy creation in disposable staging
and removed those files. They did not invoke the native helper chain, perform
product ERC/DRC, register libraries or adopt a mains project. See the
[session receipt](evidence/mains-native/staging-preparation.json).

## Schematic and handoff sequence

`createMainsInitialGraphs` now prepares the complete four-sheet hierarchy in
memory, together with the unchanged initial PCB graph. It normalizes source
power graphics into electrical labels, assigns exact component pin types, binds
23 per-reference project symbols and part fields, annotates ten unused pins,
adds two AC input flags and grids every sheet and standalone library. All four
converter cache strings are refreshed. It performs no native file I/O.

U1 pins 1/2 are `power_in`; isolated return 3 and output 4 are `power_out`.
Independent review confirms that both output types match KiCad's IRM convention
and the manufacturer's terminal functions. U2, D2 and J5 reuse their exact
controller contracts. Other component pins remain passive. Unused eFuse pins
3/4 stay open-collector and pin 10 stays passive, with separate NC markers.
Instance pins retain only their original number/UUID references; electrical
types belong to every cached library definition.

`#FLG0201` and `#FLG0202` attach directly at U1.1/AC_N and
U1.2/AC_L_FUSED. Line carries its global label directly; neutral reaches its
label through one straight wire. Each witness requires the expected label on
that exact path, with no conflicting local/global label. The annotations
are excluded from physical/BOM/assembly outputs. No flags are added to isolated
rails with real power outputs. These declarations describe external AC entry,
not a test of the fuse, supply, isolation or delivered voltage.

NC and flag positions compose the independently rounded native symbol-origin
and local-pin coordinates. NC collision checks also use native integer units.
Adversarial review found that adding floating coordinates first could move a
marker by one native unit, subsequently enlarged by gridding, or miss a nearby
wire that rounds onto the pin. Regression tests cover both cases, labels and
junctions, exact final NC attachment and source immutability. A separate witness
review caught reliance on label order and a changed U1 label hidden by another
same-name label elsewhere; exact pin placement and direct/single-wire admission now
reject both. Native parse, strict ERC and saved-netlist parity remain separate
staging gates. See [the review record](review-log.md).

`createMainsManifest` and `render:mains` now generate the source manifest.
The shared Python normalizer accepts it. It retains 27 initial native geometry
hashes, 66 logical pin names/NC flags, all 81 physical land numbers, five hole
identities and owned/unowned compiled geometry, including 118 source paste
records. Exact part/value/voltage/placement and record-ownership checks reject
inconsistent input. Renaming compiler-generated IDs preserves stable identities;
source-only physical changes still change the receipt even if the converter
ignores them. The [generation receipt](evidence/mains-native/initial-manifest.json)
binds source/tool inputs, generated files and scope. No native file is emitted
by manifest generation.

1. Use the generated manifest with immutable `mains.board.main`,
   `mains.component.<lowercase-ref>` and `mains.net.<lowercase-name>` identities. Bind 27 refs,
   exact MPNs/values/datasheets, all pin/land sets, five holes, 135 x 75 mm outline,
   two layers and nominal 1.6 mm FR4. Preserve compiled source geometry, even
   converter-ignored records. Apply per-ref `CrystalShim_Mains:Mains_<REF>` native
   symbols/footprints so exact instance geometry survives library registration.
2. Run the implemented mains pin-type and project-library adapters on fresh
   converter graphs. Preserve the reviewed contract and two exact AC witnesses
   above; reject any unexpected source, instance or cache identity.
3. Run the implemented field/NC/flag/grid sequence. Preserve exactly J2.3,
   J3.3/4, J4.3/4/5/6 and U2.3/4/10 as unused, with their original electrical
   types. The shared grid helper has no controller-only repair option here.
4. Finish independent review of the draft `kicad-augment.json`: 8 mm primary/secondary
   separation on every layer, 3.2 mm between distinct primary nets, edge/hardware
   reserves, two-layer stack, U2 mask/paste/thermal process, THT paste exclusion,
   plated-slot capability, polarity/connector marks, routing and final fit.
   Count unused connector metal and solder as conductors. Mask provides no
   insulation credit. Fuse/filter/PE remain off-board.
5. Review and exercise the implemented exclusive-create, hash-bound staging
   wrapper, 27 per-ref footprint exports and project-local library registration. Existing controller scripts
   contain board-specific identities/counts and cannot be called unchanged.
   Use their native API pattern; never edit protected KiCad files as text.
6. Validate complete source/native parity, native library parsing, all saved
   schematic sheets and strict ERC; inspect schematic/PCB renders and assess
   ordinary DRC separately from unrouted items. Only actual adoption creates
   a handoff lock. Further changes then use native ECO operations.

Mated Sabre fit, MOV process/containment and complete enclosure fit remain
design-release work. The [J5 partition screen](mains-enclosure-fit.md) supplies a
conditional allocation, with mated J3 isolation and guard/retention still open.
Fabrication and all final-unit
commissioning gates remain open. The detailed probe and ordered plan are in
`/tmp/crystal-shim-mains-native-adaptation-plan`.
