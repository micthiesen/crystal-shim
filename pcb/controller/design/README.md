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
- `relay-drive.tsx` captures the 11-part supervisor, relay gate and MOSFET section.
  `logic-power.tsx` captures the 10-part diode OR and buck section. Their fixed
  references and named boundary nets are for integration into the final controller.
  These are incomplete sections of that board, not separate product boards.
- Compiled tests check physical pin/port identity, translated/rotated geometry,
  exposed-ground and switch pairing, and actual section netlists. Copper checks
  do not establish a final solder process or complete electrical performance.

Run `bun test controller/design` or `bun run render:controller-parts` from `pcb/`.
The latter writes a 25-component review SVG and Circuit JSON under ignored
`dist/controller/part-review/`. Its display positions and outline are not a product
board or an additional fabrication design. `bun run render:controller-sections`
renders the connected relay and logic-power sections separately under
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
after those validations succeed. These adapters are tested with the actual pinned
converters, including rejected drift, rotations and serialized native pins. They
must never load or edit an adopted KiCad design.

The complete controller export does not exist yet. Its manifest, source/net checks
and staged native parity must incorporate these adapters and verify every repeated
physical pad, not just unique pin names. Keep tscircuit routing disabled: the
eFuse's source polygon-port centres remain in the L notches. TI's split paste
windows, mask, body/courtyard and native adoption remain required. USB GND wiring
needs explicit source labels as exercised by `usb-connector.test.tsx`; native
netlist checks must retain A1/A12/B1/B12 and all four shell pads on GND.
