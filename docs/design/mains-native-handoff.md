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
UUIDs stay fixed. Per-ref local library entries remain work.

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

## Schematic and handoff sequence

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
2. Apply a mains-specific electrical contract. Reuse the exact eFuse, Schottky
   and three-pin Micro-Fit metadata. Relay, MOV, flyback, Sabre and passive-part
   pins remain passive. U1 AC terminals are power inputs; its isolated output
   and return are proposed power outputs. Review that return type explicitly.
   With both output terminals typed as sources, only AC_L_FUSED and AC_N need
   external PWR_FLAG annotations, witnessed at U1.2 and U1.1. Do not copy the
   controller's flags or invent them merely to silence ERC.
3. Restore exact fields/library filters and exactly ten NC markers: J2.3,
   J3.3/4, J4.3/4/5/6 and U2.3/4/10. Check that no conductor/label/other pin
   touches an NC. Preserve U2.3/4 open-collector and U2.10 passive metadata.
   Grid all four sheets and the standalone symbol library with the shared grid
   helper. Do not import controller-only wire repairs or its inductor option.
4. Complete `kicad-augment.json` for the mains board: 8 mm primary/secondary
   separation on every layer, 3.2 mm between distinct primary nets, edge/hardware
   reserves, two-layer stack, U2 mask/paste/thermal process, THT paste exclusion,
   plated-slot capability, polarity/connector marks, routing and final fit.
   Count unused connector metal and solder as conductors. Mask provides no
   insulation credit. Fuse/filter/PE remain off-board.
5. Add an exclusive-create, hash-bound staging wrapper, 27 per-ref footprint
   exports and project-local library registration. Existing controller scripts
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
