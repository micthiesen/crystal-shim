import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  At,
  Junction,
  Pts,
  Wire,
  Xy,
  parseKicadSch,
  parseKicadSym,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import MainsCircuit from "./mains.circuit";
import { createMainsManifest } from "./design-manifest";
import { applyMainsPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { applyMainsProjectSymbolsForInitialExport } from "./project-symbol-library-initial-export";
import { applyMainsFieldsForInitialExport } from "./fields-initial-export";
import { applyMainsSchematicCleanupForInitialExport } from "./schematic-cleanup-initial-export";
import { createMainsInitialGraphs } from "./mains-initial-export";
import { gridInitialSchematics } from "../../scripts/lib/schematic-grid-initial-export";

let source: CircuitJson;
let manifest: ReturnType<typeof createMainsManifest>;
let initial: string[];
const reference = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const fresh = () => initial.map(parseKicadSch);
function pinAt(sheets: KicadSch[], ref: string, number: string) {
  const sheet = sheets.find((s) => s.symbols.some((i) => reference(i) === ref))!;
  const instance = sheet.symbols.find((i) => reference(i) === ref)!;
  const library = sheet.libSymbols!.symbols.find(
    (s) => s.libraryId === instance.libraryId,
  )!;
  const pin = pins(library).find((p) => p.numberString === number)!;
  return {
    sheet,
    instance,
    library,
    pin,
    x: instance.at!.x + pin.at!.x,
    y: instance.at!.y - pin.at!.y,
  };
}
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  new Wire({ points: new Pts([new Xy(x1, y1), new Xy(x2, y2)]) });

beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
  manifest = createMainsManifest(source);
  const json = structuredClone(source);
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
  applyMainsPinTypesForInitialExport(json, sheets);
  applyMainsProjectSymbolsForInitialExport(json, sheets, manifest);
  applyMainsFieldsForInitialExport(sheets, manifest);
  initial = sheets.map((s) => s.getString());
});

test("seven exact NC markers survive serialization while every prior object is preserved", () => {
  const sheets = fresh();
  expect(applyMainsSchematicCleanupForInitialExport(sheets, manifest)).toEqual({
    noConnects: 7,
  });
  const unused = ["J2.3", "J3.3", "J3.4", "J4.3", "J4.4", "J4.5", "J4.6"];
  const actual: string[] = [];
  for (const [index, sheet] of sheets.entries()) {
    const read = parseKicadSch(sheet.getString());
    for (const marker of read.noConnects) {
      expect(marker.at?.angle).toBeUndefined();
      expect(marker.uuid?.value).toBeTruthy();
      const matches = unused.filter((id) => {
        const [ref, number] = id.split(".");
        const p = pinAt(sheets, ref!, number!);
        return (
          p.sheet === sheet && Math.hypot(p.x - marker.at!.x, p.y - marker.at!.y) < 1e-8
        );
      });
      expect(matches).toHaveLength(1);
      actual.push(matches[0]!);
    }
    read.noConnects = [];
    expect(read.getString()).toBe(initial[index]!);
  }
  expect(actual.sort()).toEqual(unused.sort());
  const once = sheets.map((s) => s.getString());
  expect(() => applyMainsSchematicCleanupForInitialExport(sheets, manifest)).toThrow(
    "unmodified initial",
  );
  expect(sheets.map((s) => s.getString())).toEqual(once);
});

test("late NC conflicts, source drift and ambiguous geometry reject the complete batch atomically", () => {
  for (const mode of [
    "wire",
    "junction",
    "label",
    "other-pin",
    "source",
    "pin",
    "duplicate-library",
    "instance-pin",
    "rotation",
    "ref",
    "sheet",
  ] as const) {
    const sheets = fresh(),
      changed = structuredClone(manifest);
    const p = pinAt(sheets, "J4", "6");
    if (mode === "wire")
      p.sheet.wires = [...p.sheet.wires, wire(p.x - 1, p.y, p.x + 1, p.y)];
    if (mode === "junction")
      p.sheet.junctions = [...p.sheet.junctions, new Junction({ at: [p.x, p.y] })];
    if (mode === "label") p.sheet.globalLabels[0]!.at = new At([p.x, p.y]);
    if (mode === "other-pin")
      pins(p.library).find((q) => q.numberString === "3")!.at = new At([
        p.pin.at!.x,
        p.pin.at!.y,
        p.pin.at!.angle!,
      ]);
    if (mode === "source")
      changed.nets[0]!.endpoints.push({ component: "mains.component.j4", pad: "6" });
    if (mode === "pin") p.pin.numberString = "UNKNOWN";
    if (mode === "duplicate-library")
      p.sheet.libSymbols!.symbols = [...p.sheet.libSymbols!.symbols, p.library];
    if (mode === "instance-pin") p.instance.pins[0]!.numberString = "UNKNOWN";
    if (mode === "rotation")
      p.instance.at = new At([p.instance.at!.x, p.instance.at!.y, 90]);
    if (mode === "ref")
      p.instance.properties.find((q) => q.key === "Reference")!.value = "U999";
    if (mode === "sheet") sheets.pop();
    const before = sheets.map((s) => s.getString());
    expect(() => applyMainsSchematicCleanupForInitialExport(sheets, changed)).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("native rounding keeps NCs attached and rejects conductors that quantize onto unused pins", () => {
  const sheets = fresh();
  const p = pinAt(sheets, "J4", "6");
  // Each independent coordinate is less than half an IU away. Adding floats
  // first incorrectly rounds the marker by one IU, later enlarged by gridding.
  p.instance.at!.x += 0.000045;
  p.pin.at!.x += 0.000045;
  applyMainsSchematicCleanupForInitialExport(sheets, manifest);
  const gridded = gridInitialSchematics(sheets).sheets;
  const target = pinAt(gridded, "J4", "6");
  expect(
    target.sheet.noConnects.filter(
      (n) => Math.abs(n.at!.x - target.x) < 1e-8 && Math.abs(n.at!.y - target.y) < 1e-8,
    ),
  ).toHaveLength(1);
  for (const mode of ["wire", "label", "junction"] as const) {
    const changed = fresh();
    const t = pinAt(changed, "J4", "6");
    if (mode === "wire")
      t.sheet.wires = [
        ...t.sheet.wires,
        wire(t.x - 1, t.y + 0.00004, t.x + 1, t.y + 0.00004),
      ];
    if (mode === "label")
      t.sheet.globalLabels[0]!.at = new At([t.x + 0.00004, t.y + 0.00004]);
    if (mode === "junction")
      t.sheet.junctions = [
        ...t.sheet.junctions,
        new Junction({ at: [t.x + 0.00004, t.y + 0.00004] }),
      ];
    const before = changed.map((s) => s.getString());
    expect(() => applyMainsSchematicCleanupForInitialExport(changed, manifest)).toThrow(
      "touching electrical geometry",
    );
    expect(changed.map((s) => s.getString())).toEqual(before);
  }
});

test("complete initial graphs refresh all four caches, exact fields, NCs and gridded project library", () => {
  const unchanged = structuredClone(source);
  const result = createMainsInitialGraphs(source);
  expect(source).toEqual(unchanged);
  expect(result.schematicFiles).toHaveLength(4);
  expect(
    result.schematicFiles.filter((f) => f.filename === "mains.kicad_sch"),
  ).toHaveLength(1);
  const sheets = result.schematicFiles.map((f) => parseKicadSch(f.content));
  const parts = sheets
    .flatMap((s) => s.symbols)
    .filter((s) => !reference(s)?.startsWith("#"));
  expect(parts).toHaveLength(22);
  expect(parts.flatMap((s) => s.pins)).toHaveLength(60);
  expect(sheets.flatMap((s) => s.noConnects)).toHaveLength(7);
  expect(
    sheets
      .flatMap((s) => s.symbols)
      .filter((s) => reference(s)?.startsWith("#"))
      .map(reference)
      .sort(),
  ).toEqual(["#FLG0201", "#FLG0202"]);
  expect(result.symbolLibraryFile.filename).toBe("CrystalShim_Mains.kicad_sym");
  const library = parseKicadSym(result.symbolLibraryFile.content);
  expect(library.symbols).toHaveLength(23);
  const ncMatches: string[] = [];
  for (const sheet of sheets) {
    for (const instance of sheet.symbols) {
      const ref = reference(instance)!;
      const cached = sheet.libSymbols!.symbols.find(
        (s) => s.libraryId === instance.libraryId,
      )!;
      const base = instance.libraryId!.split(":").at(-1)!;
      const standalone = library.symbols.filter((s) => s.libraryId === base);
      expect(standalone).toHaveLength(1);
      expect(pins(cached).map((p) => p.getString())).toEqual(
        pins(standalone[0]!).map((p) => p.getString()),
      );
      for (const pin of pins(cached)) {
        for (const value of [instance.at!.x + pin.at!.x, instance.at!.y - pin.at!.y])
          expect(value / 1.27).toBeCloseTo(Math.round(value / 1.27), 7);
      }
      if (ref.startsWith("#")) continue;
      const component = manifest.components.find((c) => c.ref === ref)!;
      expect(instance.libraryId).toBe(component.symbol);
      const fields = component.fields;
      for (const [key, expected] of Object.entries({
        Footprint: component.footprint.kicad,
        MPN:
          "manufacturer_part_number" in fields ? fields.manufacturer_part_number : "",
        Datasheet: "datasheet_url" in fields ? fields.datasheet_url : "",
      }))
        expect(instance.properties.find((p) => p.key === key)?.value).toBe(expected);
    }
    for (const marker of sheet.noConnects) {
      expect(marker.at?.angle).toBeUndefined();
      for (const value of [marker.at!.x, marker.at!.y])
        expect(value / 1.27).toBeCloseTo(Math.round(value / 1.27), 7);
      const matches = sheet.symbols.flatMap((instance) => {
        if (reference(instance)?.startsWith("#")) return [];
        const lib = sheet.libSymbols!.symbols.find(
          (l) => l.libraryId === instance.libraryId,
        )!;
        return pins(lib)
          .filter(
            (p) =>
              Math.abs(instance.at!.x + p.at!.x - marker.at!.x) < 1e-8 &&
              Math.abs(instance.at!.y - p.at!.y - marker.at!.y) < 1e-8,
          )
          .map((p) => `${reference(instance)}.${p.numberString}`);
      });
      expect(matches).toHaveLength(1);
      ncMatches.push(matches[0]!);
    }
  }
  expect(ncMatches.sort()).toEqual(
    ["J2.3", "J3.3", "J3.4", "J4.3", "J4.4", "J4.5", "J4.6"].sort(),
  );
  expect(result.pcb.footprints).toHaveLength(26);
  expect(
    result.pcb.footprints.flatMap((fp) => fp.fpPads).filter((p) => p.number),
  ).toHaveLength(75);
});

test("fresh export splits the SW label trunk instead of leaving the converter orphan stub", () => {
  const graphs = createMainsInitialGraphs(source);
  const sheet = parseKicadSch(
    graphs.schematicFiles.find((f) => f.filename === "secondary.kicad_sch")!.content,
  );
  const spans = sheet.wires.map((w) =>
    (w.points!.points as Xy[]).map((p) => [p.x, p.y]),
  );
  expect(spans).not.toContainEqual([
    [381, 254],
    [382.27, 254],
  ]);
  expect(spans).toContainEqual([
    [332.74, 254],
    [382.27, 254],
  ]);
  expect(spans).toContainEqual([
    [382.27, 254],
    [429.26, 254],
  ]);
});
