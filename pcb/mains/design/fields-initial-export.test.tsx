import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  KicadSym,
  SymbolProperty,
  parseKicadSch,
  parseKicadSym,
  type KicadSch,
  type SchematicSymbol,
} from "kicadts";
import MainsCircuit from "./mains.circuit";
import { createMainsManifest } from "./design-manifest";
import { applyMainsPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { applyMainsProjectSymbolsForInitialExport } from "./project-symbol-library-initial-export";
import { applyMainsFieldsForInitialExport } from "./fields-initial-export";

let manifest: ReturnType<typeof createMainsManifest>;
let raw: string[];
const reference = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
const clone = (s: SchematicSymbol) =>
  parseKicadSym(new KicadSym({ symbols: [s] }).getString()).symbols[0]!;
const fresh = () => raw.map(parseKicadSch);
const instance = (sheets: readonly KicadSch[], ref: string) =>
  sheets.flatMap((s) => s.symbols).find((s) => reference(s) === ref)!;
beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  const source = circuit.getCircuitJson();
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
  applyMainsProjectSymbolsForInitialExport(source, sheets, manifest);
  raw = sheets.map((s) => s.getString());
});

test("exact fields survive serialization and preserve every other property, UUID, pin and sheet attribute", () => {
  const sheets = fresh(),
    before = fresh();
  applyMainsFieldsForInitialExport(sheets, manifest);
  expect(sheets).toHaveLength(4);
  for (const [i, sheet] of sheets.entries()) {
    const read = parseKicadSch(sheet.getString());
    for (const [j, current] of read.symbols.entries()) {
      const prior = before[i]!.symbols[j]!;
      const component = manifest.components.find((c) => c.ref === reference(current))!;
      const fields = component.fields;
      expect("manufacturer_part_number" in fields).toBe(true);
      for (const [key, value] of Object.entries({
        Footprint: component.footprint.kicad,
        MPN:
          "manufacturer_part_number" in fields ? fields.manufacturer_part_number : "",
        Datasheet: "datasheet_url" in fields ? fields.datasheet_url : "",
      })) {
        const actual = current.properties.filter((p) => p.key === key);
        expect(actual).toHaveLength(1);
        expect(actual[0]!.value).toBe(value);
        const old = prior.properties.find((p) => p.key === key);
        if (old) {
          const restored = clone(current);
          restored.properties.find((p) => p.key === key)!.value = old.value;
          expect(restored.properties.find((p) => p.key === key)!.getString()).toBe(
            old.getString(),
          );
        } else expect(actual[0]!.hidden).toBe(true);
      }
      current.properties = prior.properties;
      expect(current.getString()).toBe(prior.getString());
    }
    read.symbols = before[i]!.symbols;
    expect(read.getString()).toBe(before[i]!.getString());
  }
  const once = sheets.map((s) => s.getString());
  applyMainsFieldsForInitialExport(sheets, manifest);
  expect(sheets.map((s) => s.getString())).toEqual(once);
});

test("late field conflicts and wrong manifest identities reject the whole batch without mutation", () => {
  for (const mode of [
    "mpn",
    "datasheet",
    "duplicate",
    "value",
    "reference",
    "position",
    "count",
    "manifest-id",
    "manifest-footprint",
    "missing-mpn",
  ] as const) {
    const sheets = fresh(),
      changed = structuredClone(manifest),
      last = instance(sheets, "RV1");
    const original = sheets.map((s) => s.getString());
    if (mode === "mpn")
      last.properties.push(new SymbolProperty({ key: "MPN", value: "wrong" }));
    if (mode === "datasheet")
      last.properties.find((p) => p.key === "Datasheet")!.value =
        "https://example.invalid/wrong.pdf";
    if (mode === "duplicate")
      last.properties.push(new SymbolProperty({ key: "Datasheet", value: "~" }));
    if (mode === "value")
      last.properties.find((p) => p.key === "Value")!.value = "wrong";
    if (mode === "reference")
      last.properties.find((p) => p.key === "Reference")!.value = "U2";
    if (mode === "position") last.at = undefined;
    if (mode === "count") sheets.pop();
    if (mode === "manifest-id")
      changed.components.find((c) => c.ref === "RV1")!.stable_id =
        "controller.component.rv1";
    if (mode === "manifest-footprint")
      changed.components.find((c) => c.ref === "RV1")!.footprint.kicad =
        "CrystalShim_Controller:Controller_RV1";
    if (mode === "missing-mpn") {
      const f = changed.components.find((c) => c.ref === "RV1")!.fields;
      if ("manufacturer_part_number" in f) f.manufacturer_part_number = "";
    }
    const before = sheets.map((s) => s.getString());
    expect(JSON.stringify([before, changed])).not.toBe(
      JSON.stringify([original, manifest]),
    );
    expect(() => applyMainsFieldsForInitialExport(sheets, changed)).toThrow();
    expect(sheets.map((s) => s.getString())).toEqual(before);
  }
});
