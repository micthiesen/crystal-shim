import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import type { CircuitJson } from "circuit-json";
import SensorCircuit from "./sensor.circuit";
import {
  createSensorManifest,
  sensorSchematicConnectivityErrors,
} from "./design-manifest";
import { createSensorInitialPcb } from "./sensor-initial-pcb";
import { electrodeRectangles } from "./electrodes";
let json: CircuitJson;
beforeAll(async () => {
  const c = new Circuit();
  c.add(<SensorCircuit />);
  await c.renderUntilSettled();
  json = c.getCircuitJson();
});
test("complete source has no capture or placement errors and only two sensing channels", () => {
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  expect(sensorSchematicConnectivityErrors(json)).toEqual([]);
  const manifest = createSensorManifest(json);
  expect(manifest.components).toHaveLength(16);
  expect(manifest.board.width_mm).toBe(38);
  expect(manifest.board.height_mm).toBe(86);
  const u = json.find((e) => e.type === "source_component" && e.name === "U1");
  if (!u || u.type !== "source_component") throw new Error("U1 missing");
  expect(
    json
      .filter(
        (e) =>
          e.type === "source_port" &&
          e.source_component_id === u.source_component_id &&
          e.do_not_connect,
      )
      .map((e) => (e.type === "source_port" ? e.pin_number : 0)),
  ).toEqual([4, 5]);
});
test("drawn-net checking catches an altered sensor signal label", () => {
  const mutated = structuredClone(json);
  const n = mutated.find(
    (e) => e.type === "schematic_net_label" && e.text === "CIN_RL",
  );
  if (!n || n.type !== "schematic_net_label") throw new Error("RL label missing");
  n.text = "CIN_LEVEL";
  expect(sensorSchematicConnectivityErrors(mutated).length).toBeGreaterThan(0);
});
test("electrode copper uses exact rim transform, same-net overlaps, covered mask and no paste", () => {
  const e = json.find((e) => e.type === "source_component" && e.name === "E1");
  if (!e || e.type !== "source_component") throw new Error("E1");
  const p = json.find(
    (e2) =>
      e2.type === "pcb_component" && e2.source_component_id === e.source_component_id,
  );
  if (!p || p.type !== "pcb_component") throw new Error("placement");
  const pads = json.filter(
    (e) => e.type === "pcb_smtpad" && e.pcb_component_id === p.pcb_component_id,
  );
  expect(pads).toHaveLength(13);
  for (const [i, [, , layer, x0, x1, y0, y1]] of electrodeRectangles.entries()) {
    const pad = pads[i];
    if (!pad || pad.type !== "pcb_smtpad" || pad.shape !== "rect")
      throw new Error("rectangle");
    expect(pad.x).toBeCloseTo(19 - (x0 + x1) / 2, 8);
    expect(pad.y).toBeCloseTo(21 - (y0 + y1) / 2, 8);
    expect(pad.width).toBeCloseTo(x1 - x0, 8);
    expect(pad.height).toBeCloseTo(y1 - y0, 8);
    expect(pad.layer).toBe(layer);
    expect(pad.is_covered_with_solder_mask).toBe(true);
  }
  const board = createSensorInitialPcb(json);
  const ep = board.footprints.find((e) => e.properties.some((p) => p.value === "E1"));
  expect(ep).toBeDefined();
  for (const pad of ep!.fpPads) {
    expect(pad.layers?.layers).toHaveLength(1);
    expect(pad.layers?.layers[0]).toMatch(/^[FB]\.Cu$/);
    expect(pad.net?.name).not.toBe("");
  }
});
test("ordinary source changes do not mutate original Circuit JSON during native preparation", () => {
  const before = JSON.stringify(json);
  createSensorInitialPcb(json);
  expect(JSON.stringify(json)).toBe(before);
});

test("fresh schematic export has full fields, real pin types and only declared no-connects", async () => {
  const { createSensorInitialGraphs } = await import("./sensor-initial-export");
  const { parseKicadSym, parseKicadSch } = await import("kicadts");
  const graphs = createSensorInitialGraphs(json);
  const library = parseKicadSym(graphs.symbolLibraryFile.content);
  expect(library.symbols).toHaveLength(17);
  const files = graphs.schematicFiles;
  expect(files).toHaveLength(2);
  const sheets = files.map((f) => parseKicadSch(f.content));
  expect(sheets.flatMap((s) => s.noConnects)).toHaveLength(4);
  expect(
    sheets
      .flatMap((s) => s.symbols)
      .filter((s) => !s.properties.some((p) => p.value.startsWith("#FLG"))),
  ).toHaveLength(16);
  const fdc = library.symbols.find((s) => s.libraryId?.endsWith("Sensor_U1"))!;
  const all = [...fdc.pins, ...fdc.subSymbols.flatMap((s) => s.pins)];
  expect(all.find((p) => p.numberString === "8")?.pinElectricalType).toBe("power_in");
  expect(all.find((p) => p.numberString === "9")?.pinElectricalType).toBe(
    "bidirectional",
  );
});

test("each electrode copper island reaches the head without a via on the glass face", () => {
  const remaining = new Set(electrodeRectangles.map((_, i) => i));
  while (remaining.size) {
    const first = remaining.values().next().value!;
    const reachable = new Set([first]);
    remaining.delete(first);
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of remaining) {
        const a = electrodeRectangles[i]!;
        if (
          [...reachable].some((j) => {
            const b = electrodeRectangles[j]!;
            return (
              a[1] === b[1] &&
              a[2] === b[2] &&
              a[3] <= b[4] &&
              a[4] >= b[3] &&
              a[5] <= b[6] &&
              a[6] >= b[5]
            );
          })
        ) {
          reachable.add(i);
          remaining.delete(i);
          changed = true;
        }
      }
    }
    expect([...reachable].some((i) => electrodeRectangles[i]![5] === 0)).toBe(true);
  }
});

test("stage writer refuses repository and incomplete guard inputs", async () => {
  const { sensorStageGuard } = await import("./stage-sensor-export");
  await expect(sensorStageGuard({})).rejects.toThrow();
  await expect(
    sensorStageGuard({
      STILLAIR_HANDOFF_STAGE: import.meta.dir,
      STILLAIR_HANDOFF_BOARD: "sensor.board.main",
    }),
  ).rejects.toThrow();
});
