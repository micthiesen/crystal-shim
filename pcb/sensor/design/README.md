# Sensor source and placement

`SensorCircuit` in `sensor.circuit.tsx` owns the 16 schematic components,
including copper-only E1, the 18 × 64 mm four-layer board and explicit placement.
`components.tsx` records exact TI lands and source receipts. `electrodes.tsx`
owns 32 mask-covered copper primitives on thirteen schematic terminals with no assembly paste. E1 is not a
purchased or placed accessory: its numbered lands let native parity track each
piece and net. Common-net spines connect the bars. Native preparation owns the
short CIN/shield breakout connections and their tented vias. J1 is an outward-face
solder pigtail, also excluded from the purchased/placed parts list.

Run from `pcb`: `bun sensor/design/render-sensor.tsx` and
`bun test sensor/design`. Outputs are in `dist/sensor/design` and include both
copper views, schematic, Circuit JSON and the source manifest. The render rejects
source errors and actual drawn-pin/net mismatches.

`sensor-initial-pcb.ts` creates a fresh typed initial KiCad graph in memory,
preserves the outward pigtail lands and removes
mask/paste exposure from electrode lands. It does not read, write or replace an
adopted native project. Stage/adopt only under the project's guarded workflow.

`stage-sensor-export.ts` exports the full two-sheet schematic, board and native
libraries into fresh guarded staging. `apply-sensor-routing-rules.py` then adds
the declared sensing-window rule area through KiCad's native API. The initial
stage report still requires the coordinated strict ERC settings check before
adoption; a clean report with default ignored categories does not close that gate.

The sensor accepts 5 V at J1 and budgets 10 mA normal. It uses ordinary 1% resistors,
a fixed TPS7A2433 LDO, short-harness signal ESD protection and one discharge diode.
There is no LT3042 precision network, duplicate local powerTVS, dry-reference
high-water exclusion or additional expansion controller board.

[Design/routing basis](../../../docs/design/sensor-design-basis.md) and
[calculation](../../../docs/design/calculations/sensor-power.py) own the physical
requirements and unmeasured commissioning limits.
