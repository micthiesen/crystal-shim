import { applyControllerProjectSymbolsForInitialExport } from "./project-symbol-library-initial-export";
import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  At,
  Pts,
  Wire,
  Xy,
  parseKicadSch,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import ControllerCircuit from "./controller.circuit";
import { createControllerManifest } from "./design-manifest";
import {
  prepareUsbForInitialExport,
  mapUsbSchematicForInitialExport,
} from "./usb-initial-export";
import { prepareFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { applyControllerPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { applyControllerFieldsForInitialExport } from "./fields-initial-export";
import { applyControllerSchematicCleanupForInitialExport } from "./schematic-cleanup-initial-export";
import { createControllerInitialGraphs } from "./controller-initial-export";

let source: CircuitJson;
let manifest: ReturnType<typeof createControllerManifest>;
let initial: string[];
const ref = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const sheetFor = (sheets: KicadSch[], reference: string) =>
  sheets.find((s) => s.symbols.some((i) => ref(i) === reference))!;
const fresh = () => initial.map(parseKicadSch);
function pinAt(sheets: KicadSch[], reference: string, number: string) {
  const sheet = sheetFor(sheets, reference);
  const instance = sheet.symbols.find((s) => ref(s) === reference)!;
  const library = sheet.libSymbols!.symbols.find(
    (s) => s.libraryId === instance.libraryId,
  )!;
  const pin = pins(library).find((p) => p.numberString === number)!;
  return { sheet, x: instance.at!.x + pin.at!.x, y: instance.at!.y - pin.at!.y };
}
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  new Wire({ points: new Pts([new Xy(x1, y1), new Xy(x2, y2)]) });

beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<ControllerCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
  manifest = createControllerManifest(source);
  const json = prepareFootprintOriginsForInitialExport(
    prepareUsbForInitialExport(source, ["J4"]),
    ["U1", "J1", "J2", "J3", "D4", "SW1", "SW2", "SW3"],
  );
  const powerIds = new Set(
    json
      .filter((e) => e.type === "source_net")
      .filter((e) => e.is_power || e.is_ground || e.is_positive_voltage_source)
      .map((e) => e.source_net_id),
  );
  for (const e of json) {
    if (e.type === "source_net" && powerIds.has(e.source_net_id)) {
      e.is_power = false;
      e.is_ground = false;
      e.is_positive_voltage_source = false;
    }
    if (e.type === "schematic_net_label" && powerIds.has(e.source_net_id))
      delete e.symbol_name;
  }
  const converter = new CircuitJsonToKicadSchConverter(json);
  converter.runUntilFinished();
  const sheets = (Reflect.get(converter, "files") as { kicadSch: KicadSch }[]).map(
    (f) => f.kicadSch,
  );
  mapUsbSchematicForInitialExport(sheetFor(sheets, "J4"), ["J4"]);
  applyControllerPinTypesForInitialExport(json, sheets);
  applyControllerProjectSymbolsForInitialExport(json, sheets, manifest);
  applyControllerFieldsForInitialExport(sheets, manifest);
  initial = sheets.map((s) => s.getString());
}, 30_000);

// Independent geometric union, including every existing overlapping segment.
// UUID changes cannot hide an altered outline or a crossing connected by motion.
function wireUnion(sheet: KicadSch) {
  const lines = new Map<string, [number, number][]>();
  const other: string[] = [];
  const rounded = (n: number) => Number(n.toFixed(7));
  for (const w of sheet.wires) {
    const [a, b] = w.points!.points as Xy[];
    const horizontal = Math.abs(a!.y - b!.y) < 1e-8;
    const vertical = Math.abs(a!.x - b!.x) < 1e-8;
    if (!horizontal && !vertical) {
      other.push(JSON.stringify([a, b]));
      continue;
    }
    const key = `${horizontal ? "y" : "x"}:${rounded(horizontal ? a!.y : a!.x)}`;
    const values = [horizontal ? a!.x : a!.y, horizontal ? b!.x : b!.y]
      .map(rounded)
      .sort((x, y) => x - y);
    lines.set(key, [...(lines.get(key) ?? []), values as [number, number]]);
  }
  return [...lines]
    .map(([key, intervals]) => {
      const merged: [number, number][] = [];
      for (const interval of intervals.sort((a, b) => a[0] - b[0])) {
        const prior = merged.at(-1);
        if (prior && interval[0] <= prior[1])
          prior[1] = Math.max(prior[1], interval[1]);
        else merged.push([...interval]);
      }
      return JSON.stringify([key, merged]);
    })
    .concat(other)
    .sort();
}

test("12 exact NC markers and two wire repairs preserve all physical anchors, pin types and wire union", () => {
  const sheets = fresh();
  const previous = fresh();
  expect(applyControllerSchematicCleanupForInitialExport(sheets, manifest)).toEqual({
    noConnects: 12,
    redundantWiresRemoved: 2,
    trunksSplit: 2,
  });
  const marked: string[] = [];
  for (const [index, sheet] of sheets.entries()) {
    const before = previous[index]!;
    expect(sheet.symbols.map((s) => s.getString())).toEqual(
      before.symbols.map((s) => s.getString()),
    );
    expect(sheet.libSymbols!.getString()).toBe(before.libSymbols!.getString());
    for (const key of [
      "labels",
      "globalLabels",
      "junctions",
      "texts",
      "sheets",
    ] as const)
      expect(sheet[key].map((e) => e.getString())).toEqual(
        before[key].map((e) => e.getString()),
      );
    expect(wireUnion(sheet)).toEqual(wireUnion(before));
    expect(sheet.wires).toHaveLength(before.wires.length);
    for (const marker of parseKicadSch(sheet.getString()).noConnects) {
      expect(marker.uuid?.value).toMatch(/^[0-9a-f-]{36}$/);
      const found = sheet.symbols.flatMap((s) =>
        pins(sheet.libSymbols!.symbols.find((l) => l.libraryId === s.libraryId)!)
          .filter(
            (p) =>
              Math.hypot(
                s.at!.x + p.at!.x - marker.at!.x,
                s.at!.y - p.at!.y - marker.at!.y,
              ) < 1e-8,
          )
          .map((p) => `${ref(s)}.${p.numberString}`),
      );
      expect(found).toHaveLength(1);
      marked.push(found[0]!);
    }
  }
  expect(marked.sort()).toEqual(
    [
      "J4.A8",
      "J4.B8",
      "U1.22",
      "U1.23",
      "U11.1",
      "U11.3",
      "U13.1",
      "U13.3",
      "U4.4",
      "U7.1",
      "U8.8",
      "U8.9",
    ].sort(),
  );
  const changed = sheets.flatMap((s, i) =>
    s.wires.filter((w) => {
      const old = previous[i]!.wires.find((p) => p.uuid?.value === w.uuid?.value);
      return !old || old.getString() !== w.getString();
    }),
  );
  expect(changed).toHaveLength(4); // Two retained UUID pieces and two new pieces.
});

test("full initial export refreshes every child cache with the cleanup", () => {
  const sheets = createControllerInitialGraphs(source).schematicFiles.map((f) =>
    parseKicadSch(f.content),
  );
  expect(sheets.flatMap((s) => s.noConnects)).toHaveLength(12);
  expect(
    sheets.flatMap((s) => s.symbols).filter((s) => !ref(s)?.startsWith("#")),
  ).toHaveLength(113);
  expect(
    sheets.flatMap((s) => s.symbols).filter((s) => ref(s)?.startsWith("#FLG")),
  ).toHaveLength(4);
  const before = sheets.map((s) => s.getString());
  expect(() =>
    applyControllerSchematicCleanupForInitialExport(sheets, manifest),
  ).toThrow("unmodified initial");
  expect(sheets.map((s) => s.getString())).toEqual(before);
});

test("late ambiguous USB branches or wrong labels reject atomically, including earlier power plans and all NCs", () => {
  for (const mode of ["branch", "label", "duplicate", "shifted"] as const) {
    const sheets = fresh();
    const p = pinAt(sheets, "J4", "A4");
    const x = p.x - 24;
    if (mode === "branch")
      p.sheet.wires = [...p.sheet.wires, wire(x, p.y - 2, x, p.y + 2)];
    if (mode === "label")
      p.sheet.globalLabels.find(
        (l) => l.value === "USB_VBUS" && Math.abs(l.at!.x - x) < 1e-8,
      )!.value = "V3V3";
    const target = p.sheet.wires.find(
      (w) =>
        w.points!.points.every((q) => q instanceof Xy && Math.abs(q.y - p.y) < 1e-8) &&
        w.points!.points.some((q) => q instanceof Xy && Math.abs(q.x - x) < 1e-8),
    )!;
    if (mode === "duplicate")
      p.sheet.wires = [...p.sheet.wires, wire(p.x - 6, p.y, x, p.y)];
    if (mode === "shifted") (target.points!.points[0] as Xy).y += 0.01;
    const before = sheets.map((s) => s.getString());
    expect(() =>
      applyControllerSchematicCleanupForInitialExport(sheets, manifest),
    ).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("NC markers cannot conceal a wire, a changed source contract or a moved/unknown pin", () => {
  for (const mode of ["wire", "source", "pin", "rotation", "ref"] as const) {
    const sheets = fresh();
    const changed = structuredClone(manifest);
    const p = pinAt(sheets, "J4", "A8");
    if (mode === "wire")
      p.sheet.wires = [...p.sheet.wires, wire(p.x - 1, p.y, p.x + 1, p.y)];
    if (mode === "source")
      changed.nets[0]!.endpoints.push({
        component: changed.components.find((c) => c.ref === "J4")!.stable_id,
        pad: "A8",
      });
    const instance = p.sheet.symbols.find((s) => ref(s) === "J4")!;
    if (mode === "pin")
      pins(
        p.sheet.libSymbols!.symbols.find((s) => s.libraryId === instance.libraryId)!,
      ).find((p) => p.numberString === "A8")!.numberString = "UNKNOWN";
    if (mode === "rotation") instance.at = new At([instance.at!.x, instance.at!.y, 90]);
    if (mode === "ref")
      instance.properties.find((p) => p.key === "Reference")!.value = "J999";
    const before = sheets.map((s) => s.getString());
    expect(() =>
      applyControllerSchematicCleanupForInitialExport(sheets, changed),
    ).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("coincident geometry on a separate sheet remains independent", () => {
  const sheets = fresh();
  const root = sheets.find((s) => !s.symbols.length)!;
  const p = pinAt(sheets, "J4", "A4");
  root.wires = [wire(p.x - 24, p.y - 2, p.x - 24, p.y + 2)];
  const before = root.getString();
  applyControllerSchematicCleanupForInitialExport(sheets, manifest);
  expect(root.getString()).toBe(before);
});
