import { beforeAll, expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import { Circuit } from "tscircuit";
import {
  KicadSym,
  parseKicadSym,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import { chipElectricalContracts } from "../../controller/design/pin-electrical-contract";
import MainsCircuit from "./mains.circuit";
import { mainsChipElectricalContracts } from "./pin-electrical-contract";
import { applyMainsPinTypesForInitialExport } from "./pin-electrical-initial-export";

let source: CircuitJson;
const pins = (symbol: SchematicSymbol): SymbolPin[] => [
  ...symbol.pins,
  ...symbol.subSymbols.flatMap(pins),
];
const reference = (symbol: SchematicSymbol) =>
  symbol.properties.find((p) => p.key === "Reference")?.value;
const cloneLibrary = (symbol: SchematicSymbol) =>
  parseKicadSym(new KicadSym({ symbols: [symbol] }).getString()).symbols[0]!;
const instanceFor = (sheets: KicadSch[], ref: string) =>
  sheets.flatMap((s) => s.symbols).find((s) => reference(s) === ref)!;
const sheetFor = (sheets: KicadSch[], ref: string) =>
  sheets.find((s) => s.symbols.some((i) => reference(i) === ref))!;
const librariesFor = (sheets: KicadSch[], ref: string) => {
  const sheet = sheetFor(sheets, ref);
  return sheet.libSymbols!.symbols.filter(
    (l) => l.libraryId === instanceFor(sheets, ref).libraryId,
  );
};
const sourceFor = (json: CircuitJson, ref: string) =>
  json.find((s) => s.type === "source_component" && s.name === ref)! as Extract<
    CircuitJson[number],
    { type: "source_component" }
  >;
const sourcePort = (json: CircuitJson, ref: string, number: number) =>
  json.find(
    (p) =>
      p.type === "source_port" &&
      p.source_component_id === sourceFor(json, ref).source_component_id &&
      p.pin_number === number,
  )! as Extract<CircuitJson[number], { type: "source_port" }>;

const snapshot = (json: CircuitJson, sheets: KicadSch[]) =>
  JSON.stringify({
    source: json,
    sheets: sheets.map((s) => s.getString()),
    // kicadts intentionally does not serialize library fields placed on an
    // instance pin. Observe those fields too so negative controls cannot be inert.
    instances: sheets
      .flatMap((s) => s.symbols)
      .flatMap(pins)
      .map((p) => ({
        at: p.at?.getString(),
        length: p.length,
        name: p.name,
        type: p.pinElectricalType,
        style: p.pinGraphicStyle,
        alternates: p.alternates.map((a) => a.getString()),
      })),
  });

beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
});

function fresh(normalize = true) {
  const json = structuredClone(source);
  if (normalize) {
    // Orchestration precondition: keep actual net labels, not extra unconnected
    // Custom:rail_up/down symbols emitted by the pinned converter.
    const powerIds = new Set<string>();
    for (const e of json) {
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
    for (const e of json) {
      if (e.type === "schematic_net_label" && powerIds.has(e.source_net_id))
        delete e.symbol_name;
    }
  }
  const converter = new CircuitJsonToKicadSchConverter(json);
  converter.runUntilFinished();
  const sheets = (Reflect.get(converter, "files") as { kicadSch: KicadSch }[]).map(
    (f) => f.kicadSch,
  );
  return { json, sheets };
}

test("all 23 parts and 66 logical pins receive component ERC semantics, only in libraries", () => {
  const { json, sheets } = fresh();
  const sourceBefore = structuredClone(json);
  const before = sheets.map((s) => s.getString());
  const instances = sheets.flatMap((s) => s.symbols).map((i) => i.getString());
  expect(sheets).toHaveLength(4);
  expect(applyMainsPinTypesForInitialExport(json, sheets)).toEqual({
    components: 23,
    logicalPins: 66,
    libraryPins: 66,
  });
  const expectedActive = {
    "U1.1": "power_in",
    "U1.2": "power_in",
    "U1.3": "power_out",
    "U1.4": "power_out",
    "U2.1": "input",
    "U2.2": "input",
    "U2.3": "open_collector",
    "U2.4": "open_collector",
    "U2.5": "power_in",
    "U2.6": "power_out",
    "U2.8": "power_in",
  } as const;
  for (const instance of sheets.flatMap((s) => s.symbols)) {
    const ref = reference(instance)!;
    const libPins = pins(librariesFor(sheets, ref)[0]!);
    for (const pin of libPins) {
      expect(pin.pinElectricalType).toBe(
        expectedActive[`${ref}.${pin.numberString}` as keyof typeof expectedActive] ??
          "passive",
      );
    }
    for (const pin of instance.pins) {
      expect(pin.pinElectricalType).toBeUndefined();
      expect(pin.getChildren().map((c) => c.token)).toEqual(["uuid"]);
    }
  }
  expect(pins(librariesFor(sheets, "K1")[0]!).map((p) => p.numberString)).toEqual([
    "1",
    "3",
    "4",
    "5",
  ]);
  for (const number of [3, 4, 10])
    expect(sourcePort(json, "U2", number).do_not_connect).toBe(true);
  expect(
    pins(librariesFor(sheets, "U2")[0]!).find((p) => p.numberString === "10")!
      .pinElectricalType,
  ).toBe("passive");
  expect(sheets.flatMap((s) => s.symbols).map((i) => i.getString())).toEqual(instances);
  expect(json).toEqual(sourceBefore);
  expect(() => applyMainsPinTypesForInitialExport(json, sheets)).toThrow(
    "initial electrical name/type changed",
  );
  // Reverse only the requested fields and compare the complete graph, including
  // all graphics, wires, labels, NC markers, poses, properties and instance UUIDs.
  for (const sheet of sheets)
    for (const lib of sheet.libSymbols?.symbols ?? [])
      for (const pin of pins(lib)) pin.pinElectricalType = "passive";
  expect(sheets.map((s) => s.getString())).toEqual(before);
});

test("exact shared parts reuse controller contracts and source names match every chip", () => {
  for (const mpn of ["TPS259470ARPWR", "STPS2L40U", "43650-0300"])
    expect(mainsChipElectricalContracts[mpn]).toBe(chipElectricalContracts[mpn]);
  const chips = source.filter(
    (e) => e.type === "source_component" && e.ftype === "simple_chip",
  );
  expect(chips).toHaveLength(11);
  expect(Object.keys(mainsChipElectricalContracts)).toHaveLength(11);
  for (const chip of chips) {
    const contract = mainsChipElectricalContracts[chip.manufacturer_part_number!]!;
    const sourcePins = source
      .filter((p) => p.type === "source_port")
      .filter((p) => p.source_component_id === chip.source_component_id);
    expect(
      Object.fromEntries(sourcePins.map((p) => [String(p.pin_number), p.name])),
    ).toEqual(
      Object.fromEntries(Object.entries(contract.pins).map(([n, p]) => [n, p.name])),
    );
    expect(contract.basis.length).toBeGreaterThan(20);
  }
});

test("valid extra cached copies on other sheets are all typed", () => {
  const { json, sheets } = fresh();
  const extra = cloneLibrary(librariesFor(sheets, "U1")[0]!);
  const last = sheetFor(sheets, "D1");
  last.libSymbols!.symbols = [...last.libSymbols!.symbols, extra];
  expect(applyMainsPinTypesForInitialExport(json, sheets).libraryPins).toBe(70);
  expect(pins(extra).map((p) => p.pinElectricalType)).toEqual([
    "power_in",
    "power_in",
    "power_out",
    "power_out",
  ]);
});

test("source, instance and late cache drift fail without partial typing", () => {
  const cases: Record<string, (json: CircuitJson, sheets: KicadSch[]) => void> = {
    "source MPN": (j) => {
      sourceFor(j, "U1").manufacturer_part_number = "IRM-10-12";
    },
    "missing source MPN": (j) => {
      delete sourceFor(j, "R1").manufacturer_part_number;
    },
    "known wrong passive": (j) => {
      sourceFor(j, "R2").manufacturer_part_number = "ERA3AEB103V";
    },
    "source ftype": (j) => {
      sourceFor(j, "D1").ftype = "simple_resistor";
    },
    "source quantity": (j) => {
      const s = sourceFor(j, "R1");
      if (s.ftype === "simple_resistor") s.resistance = 101;
    },
    "source label": (j) => {
      sourcePort(j, "U1", 3).name = "AC_N";
    },
    "source number": (j) => {
      sourcePort(j, "K1", 5).pin_number = 2;
    },
    "source NC": (j) => {
      sourcePort(j, "U2", 3).do_not_connect = false;
    },
    "source net": (j) => {
      const n = j.find((e) => e.type === "source_net")!;
      if (n.type === "source_net") n.name = "CHANGED";
    },
    "source duplicate component": (j) => {
      j.push(structuredClone(sourceFor(j, "U1")));
    },
    "source duplicate port": (j) => {
      j.push(structuredClone(sourcePort(j, "U1", 1)));
    },
    "source missing ID": (j) => {
      sourcePort(j, "U1", 1).source_port_id = "";
    },
    "missing sheet": (_j, s) => {
      s.pop();
    },
    "duplicate sheet": (_j, s) => {
      s[0] = s[1]!;
    },
    "missing instance": (_j, s) => {
      const sh = sheetFor(s, "D1");
      sh.symbols = sh.symbols.filter((i) => reference(i) !== "D1");
    },
    "duplicate instance": (_j, s) => {
      const sh = sheetFor(s, "D1");
      sh.symbols = [...sh.symbols, instanceFor(s, "D1")];
    },
    "unknown reference": (_j, s) => {
      instanceFor(s, "D1").properties.find((p) => p.key === "Reference")!.value = "D9";
    },
    "duplicate reference property": (_j, s) => {
      const i = instanceFor(s, "D1");
      i.properties = [
        ...i.properties,
        i.properties.find((p) => p.key === "Reference")!,
      ];
    },
    "duplicate value property": (_j, s) => {
      const i = instanceFor(s, "R1");
      i.properties = [...i.properties, i.properties.find((p) => p.key === "Value")!];
    },
    "wrong value": (_j, s) => {
      instanceFor(s, "C1").properties.find((p) => p.key === "Value")!.value = "100nF";
    },
    "already renamed": (_j, s) => {
      instanceFor(s, "D1").libraryId = "CrystalShim_Mains:Mains_D1";
    },
    "wrong passive library": (_j, s) => {
      instanceFor(s, "R1").libraryId = "Device:capacitor_right";
    },
    "missing library": (_j, s) => {
      const sh = sheetFor(s, "D1");
      sh.libSymbols!.symbols = sh.libSymbols!.symbols.filter(
        (l) => l.libraryId !== instanceFor(s, "D1").libraryId,
      );
    },
    "instance type": (_j, s) => {
      instanceFor(s, "D1").pins[0]!.pinElectricalType = "passive";
    },
    "instance geometry": (_j, s) => {
      instanceFor(s, "D1").pins[0]!.at = { x: 0, y: 0 };
    },
    "instance missing UUID": (_j, s) => {
      instanceFor(s, "D1").pins[0]!.uuid = undefined;
    },
    "instance duplicate UUID": (_j, s) => {
      instanceFor(s, "D1").pins[0]!.uuid = instanceFor(s, "U1").pins[0]!.uuid;
    },
    "instance missing pin": (_j, s) => {
      const i = instanceFor(s, "D1");
      i.pins = i.pins.slice(1);
    },
    "library wrong number": (_j, s) => {
      pins(librariesFor(s, "D1")[0]!)[0]!.numberString = "3";
    },
    "library wrong name": (_j, s) => {
      pins(librariesFor(s, "D1")[0]!)[0]!.name = "A";
    },
    "late duplicate passive cache": (_j, s) => {
      pins(librariesFor(s, "R2").at(-1)!)[0]!.name = "changed";
    },
    "late remote cache": (_j, s) => {
      const l = cloneLibrary(librariesFor(s, "U2")[0]!);
      pins(l)[2]!.pinElectricalType = "no_connect";
      const sh = sheetFor(s, "D1");
      sh.libSymbols!.symbols = [...sh.libSymbols!.symbols, l];
    },
    "unowned cache": (_j, s) => {
      const l = cloneLibrary(librariesFor(s, "D1")[0]!);
      l.libraryId = "Device:unexpected";
      const sh = sheetFor(s, "D1");
      sh.libSymbols!.symbols = [...sh.libSymbols!.symbols, l];
    },
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const { json, sheets } = fresh();
    const pristine = snapshot(json, sheets);
    mutate(json, sheets);
    const changed = snapshot(json, sheets);
    expect(changed === pristine, name).toBe(false);
    expect(() => applyMainsPinTypesForInitialExport(json, sheets), name).toThrow();
    expect(snapshot(json, sheets) === changed, name).toBe(true);
  }
});

test("raw converter power graphic instances are refused until label normalization", () => {
  const { json, sheets } = fresh(false);
  const before = sheets.map((s) => s.getString());
  expect(() => applyMainsPinTypesForInitialExport(json, sheets)).toThrow(
    "Unexpected or duplicate",
  );
  expect(sheets.map((s) => s.getString())).toEqual(before);
});
