# Controller component source

These are actual selected part models for the final controller. They do not yet
form a complete controller schematic, placement or manufacturing footprint set.
The [controller basis](../../../docs/design/controller-design-basis.md) owns the
circuit contract and [footprint audit](../../../docs/design/footprint-audit.md)
records the manufacturer comparisons.

- `ic-land-patterns.ts` stores checked AP63203, AO3400A and TCA9517A copper lands.
- `esp32-c6-wroom.tsx` stores the WROOM pin map and pinned manufacturer lands,
  including nine separate, internally connected pad-29 lands and the vendor origin.
- `land-pattern.tsx` converts the native top-view +Y-down coordinates once.
- `land-pattern-physical.ts` adds checked body/envelope and explicit courtyard/
  mask declarations for seven exact model IDs. Shared package users stay aligned;
  [the footprint audit](../../../docs/design/footprint-audit.md) lists the scope
  and remaining per-model stencil/thermal obligations.
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
  These are incomplete sections of that board, not separate product boards.
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
  Current section placements overlap and must be replaced by the reviewed full
  layout. The integration test covers electrical boundaries, not placement approval.
- Compiled tests check physical pin/port identity, translated/rotated geometry,
  exposed-ground and switch pairing, and actual section netlists. Copper checks
  do not establish a final solder process or complete electrical performance.

Run `bun test controller/design` or `bun run render:controller-parts` from `pcb/`.
The latter writes a 25-component review SVG and Circuit JSON under ignored
`dist/controller/part-review/`. Its display positions and outline are not a product
board or an additional fabrication design. `bun run render:controller-sections`
renders all seven connected sections separately under
`dist/controller/section-review/`. Their positions remain provisional until all
controller parts and the enclosure/antenna constraints are integrated. No render
here is a fabrication input.

The `CrystalShim:*` footprint metadata names reserve future native library IDs;
those KiCad footprints have not been generated or adopted. Complete body/courtyard,
mask/paste, thermal and antenna declarations, the remaining parts, schematic nets,
board specification and placement before the guarded handoff. No handoff lock or
fabrication outputs exist. The component tests run in the normal project gate.

## Initial export integration

Before running the pinned converters, call `prepareUsbForInitialExport(json, refs)`
and use its returned copy. After conversion, call `mapUsbPcbForInitialExport` and
`mapUsbSchematicForInitialExport` on the initial object graphs, and call
`anchorServiceEfuseForInitialExport` for every TPS259470 instance. Serialize only
after those validations succeed. Multi-sheet conversion places components in
generated child schematic graphs: apply the schematic mapper to the graph that
contains each USB instance and emit the complete `getOutputFiles()` set. An empty
root `getOutputString()` is not a complete export. These adapters are tested with the actual pinned
converters, including rejected drift, rotations and serialized native pins. They
must never load or edit an adopted KiCad design.
For the full controller also call `omitTestPointPasteForInitialExport` on the
initial PCB graph. It validates all eleven pads before removing the converter's
unwanted paste layer; retain BOM/CPL exclusions and source-owned mask openings.

The accepted controller export does not exist yet. Its manifest, source/net checks
and staged native parity must incorporate these adapters and verify every repeated
physical pad, not just unique pin names. Keep tscircuit routing disabled: the
eFuse's source polygon-port centres remain in the L notches. TI's split paste
windows, mask, body/courtyard and native adoption remain required. USB GND wiring
needs explicit source labels as exercised by `usb-connector.test.tsx`; native
netlist checks must retain A1/A12/B1/B12 and all four shell pads on GND.

The pinned schematic renderer can draw signal names as `schematic_text` without
an electrical label. Source sections use explicit `netlabel` elements and inherit
their sheet through a named group. Do not infer connectivity from a readable SVG
or from source traces alone. `schematic-connectivity-check.ts` follows actual
drawn wires and real label anchors, preserving sheet identity and checking unused
pins. Native schematic readback matches all 190 connected pins across the five
sections: 32 relay, 24 buck, 37 service, 51 USB and 46 module. Independent review
checked the preceding 64-component/187-pin set and all 18 unused pins; root then
added the three-pin J1 harness and checked its native netlist. The raw module PCB
seed still has the known unassigned
repeated-pad copies; the complete export must run the shared native augmentation
and verify all nine module ground lands and both lands of each button terminal.
The separate test-pad section adds eleven native-checked pins/pads, including
UART0 RX/TX and an adjacent isolated-ground return. Full-board integration must
preserve short branches and physical probe access. No raw review seed is an
accepted board.

The combined disposable native export has eight schematic files (root plus seven
children). It matches all 254 connected pins and 20 intended unused pins across
51 named nets. PCB readback counts 291 numbered physical pads with exactly the
known 14 repeated-pad net omissions, still awaiting shared augmentation. USB
mapping, eFuse anchors and test-pad paste removal were applied to initial object
graphs before the first stage-file write. No existing native design was edited.
This checks integrated electrical export behavior; overlapping review placements,
missing physical declarations and pending ERC/DRC still prevent handoff.
