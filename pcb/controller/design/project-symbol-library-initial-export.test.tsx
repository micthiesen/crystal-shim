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
import ControllerCircuit from "./controller.circuit";
import { createControllerInitialGraphs } from "./controller-initial-export";
import { createControllerManifest } from "./design-manifest";
import { applyControllerPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { mapUsbSchematicForInitialExport } from "./usb-initial-export";
import { controllerGeometryIdentities } from "./footprint-geometry-identity";
import {
  applyControllerProjectSymbolsForInitialExport,
  addControllerPowerFlagsForInitialExport,
  controllerPowerFlagDefinition,
  controllerPowerFlags,
} from "./project-symbol-library-initial-export";

let source: CircuitJson;
let manifest: ReturnType<typeof createControllerManifest>;
let raw: string[];
let full: ReturnType<typeof createControllerInitialGraphs>;
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
  circuit.add(<ControllerCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
  manifest = createControllerManifest(source);
  full = createControllerInitialGraphs(source);
  const converter = new CircuitJsonToKicadSchConverter(full.circuitJson);
  converter.runUntilFinished();
  const sheets = (Reflect.get(converter, "files") as { kicadSch: KicadSch }[]).map(
    (f) => f.kicadSch,
  );
  mapUsbSchematicForInitialExport(forRef(sheets, "J4"), ["J4"]);
  applyControllerPinTypesForInitialExport(full.circuitJson, sheets);
  raw = sheets.map((s) => s.getString());
}, 30_000);

test("95 unique library entries preserve all symbol geometry, pins, types and instance syntax", () => {
  const sheets = fresh(),
    before = fresh();
  const library = applyControllerProjectSymbolsForInitialExport(
    full.circuitJson,
    sheets,
    manifest,
  );
  expect(library).toHaveLength(95);
  expect(new Set(library.map((s) => s.libraryId)).size).toBe(95);
  for (const [i, sheet] of sheets.entries()) {
    const read = parseKicadSch(sheet.getString());
    expect(read.symbols).toHaveLength(before[i]!.symbols.length);
    for (const [j, instance] of read.symbols.entries()) {
      const prior = before[i]!.symbols[j]!;
      const ref = reference(instance)!;
      expect(instance.libraryId).toBe(`CrystalShim_Controller:Controller_${ref}`);
      const cache = read.libSymbols!.symbols.find(
        (s) => s.libraryId === instance.libraryId,
      )!;
      const standalone = clone(
        library.find((s) => s.libraryId === `Controller_${ref}`)!,
      );
      standalone.libraryId = instance.libraryId;
      expect(standalone.getString()).toBe(cache.getString());
      const restored = clone(cache);
      const base = prior.libraryId!.split(":").at(-1)!;
      for (const child of restored.subSymbols)
        child.libraryId = base + child.libraryId!.slice(`Controller_${ref}`.length);
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
    applyControllerProjectSymbolsForInitialExport(full.circuitJson, sheets, manifest),
  ).toThrow("not a fresh");
});

test("late bad IDs, incompatible duplicate definitions and pin-type edits fail atomically", () => {
  for (const mode of ["id", "geometry", "type", "cache", "reference"] as const) {
    const sheets = fresh();
    const sheet = forRef(sheets, "U9");
    const instance = sheet.symbols.find((s) => reference(s) === "U9")!;
    const lib = sheet.libSymbols!.symbols.find(
      (s) => s.libraryId === instance.libraryId,
    )!;
    if (mode === "id") instance.libraryId = new SymbolLibId("Device:wrong");
    if (mode === "type") pins(lib)[0]!.pinElectricalType = "unspecified";
    if (mode === "reference")
      instance.properties.find((p) => p.key === "Reference")!.value = "U999";
    if (mode === "cache")
      sheet.libSymbols!.symbols = [...sheet.libSymbols!.symbols, clone(lib)];
    if (mode === "geometry") {
      const pair = forRef(sheets, "R60").libSymbols!.symbols.filter(
        (l) => l.libraryId === "Device:boxresistor_down",
      );
      if (pair.length < 2) throw new Error("Expected duplicated resistor cache");
      pins(pair.at(-1)!)[0]!.at!.x += 0.1;
    }
    const before = sheets.map((s) => s.getString());
    expect(() =>
      applyControllerProjectSymbolsForInitialExport(full.circuitJson, sheets, manifest),
    ).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});

test("four declared annotations add zero-length power_out pins and no physical parts or geometry", () => {
  const sheets = fresh();
  const lib = applyControllerProjectSymbolsForInitialExport(
    full.circuitJson,
    sheets,
    manifest,
  );
  const before = sheets.map((s) => s.getString());
  lib.push(addControllerPowerFlagsForInitialExport(sheets, manifest));
  expect(lib).toHaveLength(96);
  const flagLibrary = parseKicadSym(
    new KicadSym({ symbols: [controllerPowerFlagDefinition()] }).getString(),
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
  expect(flags.map(reference).sort()).toEqual(
    controllerPowerFlags.map((f) => f.ref).sort(),
  );
  for (const flag of flags) {
    expect(flag.onBoard).toBe(false);
    expect(flag.inBom).toBe(false);
    expect(flag.inPosFiles).toBe(false);
    expect(flag.dnp).toBe(false);
    expect(flag.properties.find((p) => p.key === "Value")!.hidden).toBe(true);
    expect(flag.excludeFromSim).toBe(true);
    expect(flag.properties.some((p) => p.key === "Footprint")).toBe(false);
    const declaration = controllerPowerFlags.find((d) => d.ref === reference(flag))!;
    const sheet = forRef(sheets, declaration.ref);
    expect(
      sheet.globalLabels.some(
        (l) =>
          l.value === declaration.net &&
          l.at!.x === flag.at!.x &&
          l.at!.y === flag.at!.y,
      ),
    ).toBe(true);
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
  const actual = controllerGeometryIdentities(full.pcb);
  for (const component of manifest.components)
    expect(actual.get(component.ref)).toBe(component.footprint.initial_geometry_sha256);
  expect(parseKicadSym(full.symbolLibraryFile.content).symbols).toHaveLength(96);
});

test("missing power witness, changed rail, preexisting flag and real output conflicts cannot be hidden", () => {
  for (const mode of ["witness", "label", "output", "repeat"] as const) {
    const sheets = fresh();
    applyControllerProjectSymbolsForInitialExport(full.circuitJson, sheets, manifest);
    const changed = structuredClone(manifest);
    if (mode === "witness") changed.nets.find((n) => n.name === "GND")!.endpoints = [];
    if (mode === "label")
      forRef(sheets, "U1")
        .globalLabels.filter((l) => l.value === "GND")
        .forEach((l) => {
          l.value = "wrong";
        });
    if (mode === "output") {
      const sheet = forRef(sheets, "U1");
      const lib = sheet.libSymbols!.symbols.find((s) =>
        s.libraryId?.endsWith(":Controller_U1"),
      )!;
      pins(lib).find((p) => p.numberString === "1")!.pinElectricalType = "power_out";
    }
    if (mode === "repeat") addControllerPowerFlagsForInitialExport(sheets, manifest);
    const before = sheets.map((s) => s.getString());
    expect(() => addControllerPowerFlagsForInitialExport(sheets, changed)).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});
