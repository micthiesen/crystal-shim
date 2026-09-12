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
- `relay-drive.tsx` captures the 11-part supervisor, relay gate and MOSFET section.
  `logic-power.tsx` captures the 10-part diode OR and buck section. Their fixed
  references and named boundary nets are for integration into the final controller.
  These are incomplete sections of that board, not separate product boards.
- Compiled tests check physical pin/port identity, translated/rotated geometry,
  exposed-ground and switch pairing, and actual section netlists. Copper checks
  do not establish a final solder process or complete electrical performance.

Run `bun test controller/design` or `bun run render:controller-parts` from `pcb/`.
The latter writes a 22-component review SVG and Circuit JSON under ignored
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
