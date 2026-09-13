import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  KicadSym,
  SymbolLibId,
  parseKicadSch,
  parseKicadSym,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import MainsCircuit from "./mains.circuit";
import { createMainsManifest } from "./design-manifest";
import { applyMainsPinTypesForInitialExport } from "./pin-electrical-initial-export";
import {
  applyMainsProjectSymbolsForInitialExport,
  addMainsPowerFlagsForInitialExport,
  mainsPowerFlagDefinition,
  mainsPowerFlags,
} from "./project-symbol-library-initial-export";
import { gridInitialSchematics } from "../../scripts/lib/schematic-grid-initial-export";

let source: CircuitJson;
let manifest: ReturnType<typeof createMainsManifest>;
let raw: string[];
const reference = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const clone = (s: SchematicSymbol) =>
  parseKicadSym(new KicadSym({ symbols: [s] }).getString()).symbols[0]!;
const fresh = () => raw.map(parseKicadSch);
const forRef = (sheets: KicadSch[], ref: string) =>
  sheets.find((s) => s.symbols.some((i) => reference(i) === ref))!;
beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
  manifest = createMainsManifest(source);
  // Match the source-only power-label normalization used by initial orchestration.
  const powerIds = new Set<string>();
  for (const e of source) {
    if (
      e.type === "source_net" &&
      (e.is_power || e.is_ground || e.is_positive_voltage_source)
    ) {
      powerIds.add(e.source_net_id);
      e.is_power = false;
      e.is_ground = false;
      e.is_positive_voltage_source = false;
    }
  }
  for (const e of source)
    if (e.type === "schematic_net_label" && powerIds.has(e.source_net_id))
      delete e.symbol_name;
  const converter = new CircuitJsonToKicadSchConverter(source);
  converter.runUntilFinished();
  const sheets = (Reflect.get(converter, "files") as { kicadSch: KicadSch }[]).map(
    (f) => f.kicadSch,
  );
  applyMainsPinTypesForInitialExport(source, sheets);
  raw = sheets.map((s) => s.getString());
}, 30_000);

test("22 unique library entries preserve all symbol geometry, pins, types and instance syntax", () => {
  const sheets = fresh(),
    before = fresh();
  const library = applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
  expect(library).toHaveLength(22);
  expect(new Set(library.map((s) => s.libraryId)).size).toBe(22);
  expect(library.some((s) => s.getString().includes("Controller"))).toBe(false);
  for (const [i, sheet] of sheets.entries()) {
    const read = parseKicadSch(sheet.getString());
    expect(read.symbols).toHaveLength(before[i]!.symbols.length);
    for (const [j, instance] of read.symbols.entries()) {
      const prior = before[i]!.symbols[j]!;
      const ref = reference(instance)!;
      expect(instance.libraryId).toBe(`CrystalShim_Mains:Mains_${ref}`);
      const cache = read.libSymbols!.symbols.find(
        (s) => s.libraryId === instance.libraryId,
      )!;
      const standalone = clone(library.find((s) => s.libraryId === `Mains_${ref}`)!);
      standalone.libraryId = instance.libraryId;
      expect(standalone.getString()).toBe(cache.getString());
      const restored = clone(cache);
      const base = prior.libraryId!.split(":").at(-1)!;
      for (const child of restored.subSymbols)
        child.libraryId = base + child.libraryId!.slice(`Mains_${ref}`.length);
      restored.libraryId = prior.libraryId!;
      const oldLibrary = before[i]!.libSymbols!.symbols.find(
        (s) => s.libraryId === prior.libraryId,
      )!;
      restored.properties = oldLibrary.properties;
      restored.inBom = oldLibrary.inBom;
      restored.excludeFromSim = oldLibrary.excludeFromSim;
      expect(restored.getString()).toBe(oldLibrary.getString());
      const expected = manifest.components.find((c) => c.ref === ref)!;
      for (const [key, value] of Object.entries({
        Reference: ref.replace(/\d+$/, ""),
        Value: expected.value,
        Footprint: expected.footprint.kicad,
        ki_fp_filters: expected.footprint.kicad,
        MPN:
          "manufacturer_part_number" in expected.fields
            ? (expected.fields.manufacturer_part_number ?? "")
            : "",
        Datasheet:
          "datasheet_url" in expected.fields
            ? (expected.fields.datasheet_url ?? "")
            : "",
      })) {
        expect(
          cache.properties.filter((p) => p.key === key).map((p) => p.value),
        ).toEqual([value]);
      }
      expect(cache.inBom).toBe(prior.inBom);
      expect(cache.excludeFromSim).toBe(prior.excludeFromSim);
      instance.libraryId = new SymbolLibId(prior.libraryId!);
      expect(instance.getString()).toBe(prior.getString());
    }
    // No wire, label, marker, sheet or other page attribute may change.
    read.symbols = before[i]!.symbols;
    if (read.libSymbols) read.libSymbols.symbols = before[i]!.libSymbols!.symbols;
    expect(read.getString()).toBe(before[i]!.getString());
  }
  expect(() =>
    applyMainsProjectSymbolsForInitialExport(source, sheets, manifest),
  ).toThrow("not a fresh");
});

test("late bad IDs, incompatible duplicate definitions and pin-type edits fail atomically", () => {
  for (const mode of [
    "id",
    "geometry",
    "type",
    "cache",
    "reference",
    "value",
    "assembly",
    "manifest-footprint",
    "manifest-mpn",
  ] as const) {
    const sheets = fresh();
    const changed = structuredClone(manifest);
    const original = sheets.map((s) => s.getString());
    const sheet = forRef(sheets, "RV1");
    const instance = sheet.symbols.find((s) => reference(s) === "RV1")!;
    const lib = sheet.libSymbols!.symbols.find(
      (s) => s.libraryId === instance.libraryId,
    )!;
    if (mode === "id") instance.libraryId = new SymbolLibId("Device:wrong");
    if (mode === "type") pins(lib)[0]!.pinElectricalType = "unspecified";
    if (mode === "reference")
      instance.properties.find((p) => p.key === "Reference")!.value = "U999";
    if (mode === "value")
      instance.properties.find((p) => p.key === "Value")!.value = "wrong";
    if (mode === "assembly") instance.inBom = false;
    if (mode === "manifest-footprint")
      changed.components.find((c) => c.ref === "RV1")!.footprint.kicad =
        "CrystalShim_Controller:Controller_RV1";
    if (mode === "manifest-mpn") {
      const fields = changed.components.find((c) => c.ref === "RV1")!.fields;
      if ("manufacturer_part_number" in fields)
        fields.manufacturer_part_number = "wrong";
    }
    if (mode === "cache")
      sheet.libSymbols!.symbols = [...sheet.libSymbols!.symbols, clone(lib)];
    if (mode === "geometry") {
      const secondary = forRef(sheets, "C2");
      const resistor = secondary.symbols.find((s) => reference(s) === "C2")!;
      const pair = secondary.libSymbols!.symbols.filter(
        (l) => l.libraryId === resistor.libraryId,
      );
      if (pair.length < 2) throw new Error("Expected duplicated resistor cache");
      pins(pair.at(-1)!)[0]!.at!.x += 0.1;
    }
    const before = sheets.map((s) => s.getString());
    expect(JSON.stringify([before, changed])).not.toBe(
      JSON.stringify([original, manifest]),
    );
    expect(() =>
      applyMainsProjectSymbolsForInitialExport(source, sheets, changed),
    ).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("two declared annotations add zero-length power_out pins and no physical parts or geometry", () => {
  expect(mainsPowerFlags.map((f) => [f.ref, f.net, f.witness, f.pin])).toEqual([
    ["#FLG0201", "AC_N", "U1", "1"],
    ["#FLG0202", "AC_L_FUSED", "U1", "2"],
  ]);
  const sheets = fresh();
  const lib = applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
  const before = sheets.map((s) => s.getString());
  lib.push(addMainsPowerFlagsForInitialExport(sheets, manifest));
  expect(lib).toHaveLength(23);
  const flagLibrary = parseKicadSym(
    new KicadSym({ symbols: [mainsPowerFlagDefinition()] }).getString(),
  ).symbols[0]!;
  expect(
    pins(flagLibrary).map((p) => [
      p.numberString,
      p.pinElectricalType,
      p.length,
      p.at!.x,
      p.at!.y,
    ]),
  ).toEqual([["1", "power_out", 0, 0, 0]]);
  const flags = sheets
    .flatMap((s) => parseKicadSch(s.getString()).symbols)
    .filter((s) => reference(s)?.startsWith("#"));
  expect(flags.map(reference).sort()).toEqual(mainsPowerFlags.map((f) => f.ref).sort());
  for (const flag of flags) {
    expect(flag.onBoard).toBe(false);
    expect(flag.inBom).toBe(false);
    expect(flag.inPosFiles).toBe(false);
    expect(flag.dnp).toBe(false);
    expect(flag.properties.find((p) => p.key === "Value")!.hidden).toBe(true);
    expect(flag.excludeFromSim).toBe(true);
    expect(flag.properties.some((p) => p.key === "Footprint")).toBe(false);
    const declaration = mainsPowerFlags.find((d) => d.ref === reference(flag))!;
    const sheet = forRef(sheets, declaration.ref);
    const witness = sheet.symbols.find((s) => reference(s) === declaration.witness)!;
    const definition = sheet.libSymbols!.symbols.find(
      (s) => s.libraryId === witness.libraryId,
    )!;
    const endpoint = pins(definition).find((p) => p.numberString === declaration.pin)!;
    expect(flag.at!.x).toBe(witness.at!.x + endpoint.at!.x);
    expect(flag.at!.y).toBe(witness.at!.y - endpoint.at!.y);
    expect(
      flag.instances!.projects.every((p) =>
        p.paths.every((path) => path.reference === declaration.ref && path.unit === 1),
      ),
    ).toBe(true);
  }
  for (const sheet of sheets) {
    sheet.symbols = sheet.symbols.filter((s) => !reference(s)?.startsWith("#"));
    if (sheet.libSymbols)
      sheet.libSymbols.symbols = sheet.libSymbols.symbols.filter(
        (s) => !s.libraryId?.endsWith(":PWR_FLAG"),
      );
  }
  expect(sheets.map((s) => s.getString())).toEqual(before);
});

test("power annotations remain on exact witness pins after native rounding and label reordering", () => {
  const sheets = fresh();
  applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
  const sheet = forRef(sheets, "U1");
  const witness = sheet.symbols.find((s) => reference(s) === "U1")!;
  const library = sheet.libSymbols!.symbols.find(
    (s) => s.libraryId === witness.libraryId,
  )!;
  witness.at!.x += 0.000045;
  for (const pin of pins(library)) pin.at!.x += 0.000045;
  sheet.globalLabels = [...sheet.globalLabels].reverse();
  addMainsPowerFlagsForInitialExport(sheets, manifest);
  const gridded = gridInitialSchematics(sheets).sheets;
  for (const declaration of mainsPowerFlags) {
    const s = forRef(gridded, declaration.ref);
    const flag = s.symbols.find((i) => reference(i) === declaration.ref)!;
    const w = s.symbols.find((i) => reference(i) === declaration.witness)!;
    const lib = s.libSymbols!.symbols.find((l) => l.libraryId === w.libraryId)!;
    const p = pins(lib).find((p) => p.numberString === declaration.pin)!;
    expect(flag.at!.x).toBeCloseTo(w.at!.x + p.at!.x, 7);
    expect(flag.at!.y).toBeCloseTo(w.at!.y - p.at!.y, 7);
  }
});

test("neutral witness needs its actual attached label, not another matching label on the page", () => {
  for (const mode of ["rename", "disconnect", "conflicting-label"] as const) {
    const sheets = fresh();
    applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
    const sheet = forRef(sheets, "U1");
    const witness = sheet.symbols.find((s) => reference(s) === "U1")!;
    const library = sheet.libSymbols!.symbols.find(
      (l) => l.libraryId === witness.libraryId,
    )!;
    const pin = pins(library).find((p) => p.numberString === "1")!;
    const x = witness.at!.x + pin.at!.x,
      y = witness.at!.y - pin.at!.y;
    const label = sheet.globalLabels.find(
      (l) => l.at && Math.abs(l.at.x - x) < 1e-8 && Math.abs(l.at.y - y) < 1e-8,
    )!;
    expect(label.value).toBe("AC_N");
    if (mode === "rename") label.value = "AC_L_FUSED";
    if (mode === "disconnect") label.at!.x += 0.0001;
    if (mode === "conflicting-label")
      sheet.globalLabels.find((l) => l !== label && l.value === "AC_L_FUSED")!.at =
        label.at;
    const before = sheets.map((s) => s.getString());
    expect(() => addMainsPowerFlagsForInitialExport(sheets, manifest)).toThrow(
      "power witness",
    );
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("missing power witness, changed rail, preexisting flag and real output conflicts cannot be hidden", () => {
  for (const mode of [
    "witness",
    "label",
    "output",
    "repeat",
    "hierarchy",
    "duplicate-net",
    "identity",
    "late-passive-witness",
    "witness-rotation",
    "witness-anchor",
    "witness-label",
    "witness-label-shift",
    "witness-label-conflict",
  ] as const) {
    const sheets = fresh();
    applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
    const changed = structuredClone(manifest);
    const original = sheets.map((s) => s.getString());
    if (mode === "witness")
      changed.nets.find((n) => n.name === "AC_L_FUSED")!.endpoints = [];
    if (mode === "label")
      forRef(sheets, "U1")
        .globalLabels.filter((l) => l.value === "AC_L_FUSED")
        .forEach((l) => {
          l.value = "wrong";
        });
    if (mode === "output") {
      const sheet = forRef(sheets, "U1");
      const lib = sheet.libSymbols!.symbols.find((s) =>
        s.libraryId?.endsWith(":Mains_U1"),
      )!;
      pins(lib).find((p) => p.numberString === "2")!.pinElectricalType = "power_out";
    }
    if (mode === "late-passive-witness") {
      const sheet = forRef(sheets, "U1");
      const lib = sheet.libSymbols!.symbols.find((s) =>
        s.libraryId?.endsWith(":Mains_U1"),
      )!;
      pins(lib).find((p) => p.numberString === "2")!.pinElectricalType = "passive";
    }
    if (mode === "hierarchy")
      forRef(sheets, "U1").symbols.find(
        (s) => reference(s) === "U1",
      )!.instances!.projects[0]!.paths = [];
    if (mode === "witness-rotation")
      forRef(sheets, "U1").symbols.find((s) => reference(s) === "U1")!.at!.angle = 90;
    if (mode === "witness-anchor")
      forRef(sheets, "U1").symbols.find((s) => reference(s) === "U1")!.at = undefined;
    if (
      ["witness-label", "witness-label-shift", "witness-label-conflict"].includes(mode)
    ) {
      const sheet = forRef(sheets, "U1");
      const witness = sheet.symbols.find((s) => reference(s) === "U1")!;
      const lib = sheet.libSymbols!.symbols.find(
        (l) => l.libraryId === witness.libraryId,
      )!;
      const pin = pins(lib).find((p) => p.numberString === "2")!;
      const label = sheet.globalLabels.find(
        (l) =>
          l.at &&
          Math.abs(l.at.x - witness.at!.x - pin.at!.x) < 1e-8 &&
          Math.abs(l.at.y - witness.at!.y + pin.at!.y) < 1e-8,
      )!;
      expect(label.value).toBe("AC_L_FUSED");
      if (mode === "witness-label") label.value = "AC_N";
      if (mode === "witness-label-shift") label.at!.x += 0.0001;
      if (mode === "witness-label-conflict")
        sheet.globalLabels.find((l) => l !== label && l.value === "AC_N")!.at =
          label.at;
    }
    if (mode === "duplicate-net")
      changed.nets.push(
        structuredClone(changed.nets.find((n) => n.name === "AC_L_FUSED")!),
      );
    if (mode === "identity")
      forRef(sheets, "C1").symbols.find((s) => reference(s) === "C1")!.libraryId =
        new SymbolLibId("CrystalShim_Controller:Controller_C1");
    if (mode === "repeat") addMainsPowerFlagsForInitialExport(sheets, manifest);
    const before = sheets.map((s) => s.getString());
    expect(JSON.stringify([before, changed])).not.toBe(
      JSON.stringify([original, manifest]),
    );
    expect(() => addMainsPowerFlagsForInitialExport(sheets, changed)).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});
