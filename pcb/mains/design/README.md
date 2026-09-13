# Mains source design

Tscircuit owns this 180 ×110 mm, two-layer, 1.6 mm FR4 shared-supply source.
The four-file schematic hierarchy is root plus Primary, Secondary and Suppression.
It contains 22 exact electrical parts, 60 logical pins, 75 numbered physical lands,
14 nets with 53 endpoints and seven unused Sabre pins. Four mounting footprints
make 26 native footprints; four mounts and J5/J6 locators make six NPTHs.

- `mains.circuit.tsx`, `primary.tsx`, `secondary-power.tsx`, `suppression.tsx`:
  product circuit and named nets.
- `power-components.tsx`, `secondary-components.tsx`: IRM-45-12, relay, branch
  T1A fuse, AP63205 buck and 3 A motor-feed fuse geometry.
- `placements.ts`: source component datums and four board mounts.
- `design-manifest.ts`, `schematic-connectivity-check.ts`: exact source identity,
  net/pin and source/native geometry contracts.
- `kicad-augment.json`: declared native routing/clearance/assembly work.

Run `bun run render:mains`, the project source checks and focused `bun test
mains/design`. In-memory native preparation preserves geometry and exact fields;
actual native staging/adoption requires project PCB/Konnect handoff. Existing
old IRM-10-5/eFuse evidence does not verify the new topology. No native file is
an authoring source here. See the [current design basis](../../../docs/design/mains-design-basis.md).
