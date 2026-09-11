# Tscircuit authoring

Use the pinned toolchain in `pcb/package.json`. No real board source exists yet.
Keep the TOOLING-only fixture separate from product work.

## Per-board files

Create `pcb/<board>/design/` with:

- `<board>.circuit.tsx`: circuit and schematic source;
- `design-manifest.ts`: stable identities, fields, pin maps, exact footprint
  mappings and normalized handoff input;
- `board-spec.ts`: physical and fabrication specifications;
- `manual-edits.json`: reviewed viewer edits, if used;
- `kicad-augment.json`: declared downstream additions;
- `handoff.lock.json`: baseline created only after actual adoption.

Raw Circuit JSON and previews belong under ignored `pcb/dist/`.

## Modeling rules

Use fixed refs and immutable stable IDs. Record exact KiCad footprints with
`kicad:<library>/<footprint>` strings and the expected pad-number set separately.
Record placement (`pcbX`, `pcbY`, `pcbRotation`, `layer`) and reflect accepted
viewer edits in the normalized manifest. Declare the centered X-right/Y-up to
KiCad X-right/Y-down transform explicitly; never derive it from current placement.

Name every net, preserve intentional unused pins in parity checks, and keep
schematic sections readable. Tscircuit traces describe connectivity; use KiCad
for production routing. Source dimensions and component choices require the
actual board requirements and exact datasheets, not the arbitrary smoke fixture.

## Commands

The installed tooling gate, from `pcb/`, is:

```bash
bun run check
bun run typecheck
bun run check:smoke
bun run test
bun run test:handoff
```

For each real board, add `build:<board>`, `check:<board>`, `dev:<board>`,
`manifest:<board>`, `export:kicad:<board>` and `handoff:<board>` scripts before
claiming authoring is ready. Include the board's design files in TypeScript,
Oxc and CI gates. Run the pinned local `tsci` source, netlist, pin_specification,
schematic-placement and placement checks against the board, then inspect both
schematic and PCB renders. JSON checks alone do not prove visual layout or
connector orientation.

`bun run dev:smoke` opens the tooling fixture viewer locally. Product viewers must
read the actual source/manual edits. Export scripts use the shared
`STILLAIR_HANDOFF_STAGE` compatibility variable documented in
[PCB tools](../../../../pcb/tools/README.md), and may never overwrite production.
