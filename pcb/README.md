# PCB workspace

All three product boards have complete schematic/source placement and selected
interfaces. The [controller](controller/kicad/README.md) has an accepted native
ECO and is ready for routing. The sensor is also accepted: 16 footprints,
41 unrouted connections and zero strict ERC/ordinary DRC/parity findings. The
mains board is accepted with 26 footprints, 39 unrouted connections and the same
clean checks. All three boards are ready for routing; [STATE](../docs/STATE.md)
records per-board receipts.
The shared enclosure fit and fixed accessory-power provisions are documented.
Routing, copper/return-path inspection, final DRC and fabrication outputs follow
this handoff; no board is fabrication-ready merely because it is ready to route.

Design the three boards as one final-use set for a single fabrication cycle.
Complete part, interface, enclosure and source/layout reviews before release.
There is no separate sensor prototype or planned board respin. Sensor calibration
and actual-load verification use the final boards after assembly; they do not
block the complete design's fabrication release. See [build order](../docs/build.md).

| Board | Role | Requirements |
| --- | --- | --- |
| [sensor](sensor/README.md) | External active capacitance sensor stick | [Sensor](../docs/sensor.md) |
| [controller](controller/README.md) | Low-voltage ESP, relay and future pump drivers, two sensor ports and USB | [Electrical](../docs/electrical.md) |
| [mains](mains/README.md) | Protected power input, isolated supply and pump switching | [Electrical](../docs/electrical.md) |

Use the local [PCB skill](../.agents/skills/pcb/SKILL.md) for product authoring, then
[Konnect](../.agents/skills/konnect/SKILL.md) and
[fabrication](../.agents/skills/kicad-manufacture/SKILL.md) for downstream work.
Tscircuit owns schematic, specifications, and placement; KiCad owns routing
and declared manufacturing additions. Do not create a fabrication profile before
the corresponding board and order requirements exist.

## Tooling validation

Versions and Oxc conventions come from Stillair. TypeScript is pinned to 5.9.3.
The root `.bun-version` and `.node-version` record the verified CLI runtimes;
`tsci` uses Node even though Bun manages dependencies and scripts.
From this directory:

```bash
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run check:smoke
bun run test
bun run test:handoff
```

`fixtures/tooling-smoke.circuit.tsx` is a TOOLING-only, arbitrary RC circuit. Its
parts, values, dimensions and nets are unrelated to Crystal Shim. It checks that
the installed TSX compiler, placement, netlist and multi-file KiCad schematic
export work. Fixture outputs go under ignored `dist/`; they are unrelated to the
adopted controller. `bun run dev:smoke` opens the local fixture viewer when needed.

The Python tests exercise generic handoff protections using self-contained
synthetic fixtures. Passing this gate proves tooling behavior, not electrical
safety, sensor performance, real KiCad handoff parity, ERC/DRC, or fabrication
readiness. Native handoff requires the local KiCad macOS bundle and separate
evidence for each actual board. See [tools](tools/README.md).

The pinned build currently emits missing schematic reference-designator styling
warnings for the fixture's built-in R1/C1 symbols. The exported KiCad sheet is
tested to contain both reference fields. These warnings remain visible; future
product schematics require the separate render and parity review gates.
