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
- `land-pattern.test.tsx` compiles the JSX and checks physical pad/port identity,
  coordinate transforms and exposed-ground grouping.

Run `bun test controller/design` or `bun run render:controller-parts` from `pcb/`.
The latter writes an explicitly labelled component review SVG and Circuit JSON
under ignored `dist/controller/part-review/`. Its display positions and outline
are not a product board or an additional fabrication design.

The `CrystalShim:*` footprint metadata names reserve future native library IDs;
those KiCad footprints have not been generated or adopted. Complete body/courtyard,
mask/paste, thermal and antenna declarations, the remaining parts, schematic nets,
board specification and placement before the guarded handoff. No handoff lock or
fabrication outputs exist. The component tests run in the normal project gate.
