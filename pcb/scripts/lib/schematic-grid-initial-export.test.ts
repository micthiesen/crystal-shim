import { beforeAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createElement } from "react";
import {
  GlobalLabel,
  Junction,
  KicadSch,
  KicadSym,
  LibSymbols,
  NoConnect,
  Pts,
  SchematicSymbol,
  SymbolLibId,
  SymbolPin,
  SymbolPinName,
  SymbolPinNumber,
  SymbolProperty,
  SymbolRectangle,
  Wire,
  Xy,
  parseKicadSch,
  parseKicadSym,
} from "kicadts";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import ControllerCircuit from "../../controller/design/controller.circuit";
import { createControllerInitialGraphs } from "../../controller/design/controller-initial-export";
import { createControllerManifest } from "../../controller/design/design-manifest";
import { mapUsbSchematicForInitialExport } from "../../controller/design/usb-initial-export";
import { applyControllerPinTypesForInitialExport } from "../../controller/design/pin-electrical-initial-export";
import {
  applyControllerProjectSymbolsForInitialExport,
  addControllerPowerFlagsForInitialExport,
} from "../../controller/design/project-symbol-library-initial-export";
import { applyControllerFieldsForInitialExport } from "../../controller/design/fields-initial-export";
import { applyControllerSchematicCleanupForInitialExport } from "../../controller/design/schematic-cleanup-initial-export";
import {
  gridInitialSchematics,
  schematicNativeUnits as iu,
} from "./schematic-grid-initial-export";
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const ref = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")!.value;
const wire = (a: number[], b: number[]) =>
  new Wire({
    uuid: randomUUID(),
    points: new Pts([new Xy(a[0]!, a[1]!), new Xy(b[0]!, b[1]!)]),
  });
function position(s: SchematicSymbol, p: SymbolPin) {
  const x = iu(p.at!.x),
    y = iu(p.at!.y),
    ox = iu(s.at!.x),
    oy = iu(s.at!.y);
  switch (s.at!.angle ?? 0) {
    case 0:
      return [ox + x, oy - y];
    case 90:
      return [ox - y, oy - x];
    case 180:
      return [ox - x, oy + y];
    case 270:
      return [ox + y, oy + x];
    default:
      throw Error("Test pose");
  }
}
function fixture(reference = "U99", angle = 0) {
  const pp = [0, 0.015, 2].map((x, i) => {
    const p = new SymbolPin();
    p.at = [x, 0, 0];
    p.length = 0.01;
    p.pinElectricalType = "passive";
    p.pinGraphicStyle = "line";
    p._sxNumber = new SymbolPinNumber({ value: String(i + 1) });
    p._sxName = new SymbolPinName({ value: String(i + 1) });
    return p;
  });
  const lib = new SchematicSymbol({
    libraryId: `Test:${reference}`,
    subSymbols: [new SchematicSymbol({ libraryId: `${reference}_1_1`, pins: pp })],
  });
  const cache = new LibSymbols();
  cache.symbols = [lib];
  const instance = new SchematicSymbol({
    at: [30.1234, 50.2345, angle],
    unit: 1,
    uuid: randomUUID(),
    properties: [new SymbolProperty({ key: "Reference", value: reference })],
  });
  instance.libraryId = new SymbolLibId(`Test:${reference}`);
  const at = pp.map((p) => position(instance, p).map((v) => v / 10000));
  return new KicadSch({
    version: 20250114,
    uuid: randomUUID(),
    libSymbols: cache,
    symbols: [instance],
    wires: [wire(at[0]!, at[1]!)],
    junctions: [new Junction({ at: [at[0]![0]!, at[0]![1]!], uuid: randomUUID() })],
    noConnects: [new NoConnect({ at: [at[2]![0]!, at[2]![1]!], uuid: randomUUID() })],
    globalLabels: [
      new GlobalLabel({
        value: "LIVE",
        at: [at[0]![0]!, at[0]![1]!, 0],
        uuid: randomUUID(),
      }),
    ],
  });
}
// Independent integer incidence snapshot, including T joints/overlaps and NC
// membership. IDs and pin types are checked rather than substituted from source.
function incidence(s: KicadSch, originalJunctionIds?: Set<string>) {
  const pp = s.symbols.flatMap((i) =>
    pins(s.libSymbols!.symbols.find((l) => l.libraryId === i.libraryId)!).map((p) => ({
      id: `${ref(i)}.${p.numberString}`,
      at: position(i, p),
      type: p.pinElectricalType,
      name: p.name,
    })),
  );
  const anchors = [
    ...pp,
    ...[
      ...s.globalLabels,
      ...s.labels,
      ...s.junctions.filter(
        (j) => !originalJunctionIds || originalJunctionIds.has(j.uuid!.value),
      ),
      ...s.noConnects,
    ].map((a) => ({
      id: a.uuid!.value,
      at: [iu(a.at!.x), iu(a.at!.y)],
    })),
  ];
  const contains = (p: number[], a: number[], b: number[]) =>
    (a[0] === b[0] ? p[0] === a[0] : p[1] === a[1]) &&
    p[0]! >= Math.min(a[0]!, b[0]!) &&
    p[0]! <= Math.max(a[0]!, b[0]!) &&
    p[1]! >= Math.min(a[1]!, b[1]!) &&
    p[1]! <= Math.max(a[1]!, b[1]!);
  const ww = s.wires.map((w) => {
    const [a, b] = (w.points!.points as Xy[]).map((p) => [iu(p.x), iu(p.y)]);
    return { id: w.uuid!.value, a: a!, b: b! };
  });
  return {
    pins: pp.map((p) => ({ id: p.id, type: p.type, name: p.name })),
    members: ww.map((w) => [
      w.id,
      anchors
        .filter((a) => contains(a.at, w.a, w.b))
        .map((a) => a.id)
        .sort(),
    ]),
    contacts: ww.map((w) => [
      w.id,
      ww
        .filter((o) => contains(w.a, o.a, o.b) || contains(w.b, o.a, o.b))
        .map((o) => o.id)
        .sort(),
    ]),
    nc: s.noConnects.map((n) => [
      n.uuid!.value,
      pp
        .filter((p) => p.at[0] === iu(n.at!.x) && p.at[1] === iu(n.at!.y))
        .map((p) => p.id),
    ]),
  };
}
let before: KicadSch[];
let full: ReturnType<typeof createControllerInitialGraphs>;
beforeAll(async () => {
  const c = new Circuit();
  c.add(createElement(ControllerCircuit));
  await c.renderUntilSettled();
  const json = c.getCircuitJson(),
    manifest = createControllerManifest(json);
  full = createControllerInitialGraphs(json);
  const converter = new CircuitJsonToKicadSchConverter(full.circuitJson);
  converter.runUntilFinished();
  before = (Reflect.get(converter, "files") as { kicadSch: KicadSch }[]).map(
    (f) => f.kicadSch,
  );
  mapUsbSchematicForInitialExport(
    before.find((s) => s.symbols.some((i) => ref(i) === "J4"))!,
    ["J4"],
  );
  applyControllerPinTypesForInitialExport(full.circuitJson, before);
  applyControllerProjectSymbolsForInitialExport(full.circuitJson, before, manifest);
  applyControllerFieldsForInitialExport(before, manifest);
  applyControllerSchematicCleanupForInitialExport(before, manifest);
  addControllerPowerFlagsForInitialExport(before, manifest);
}, 30000);

test("native precision canonicalizes float noise but preserves real microstubs", () => {
  expect(iu(1.23455)).toBe(12346);
  expect(iu(-1.23455)).toBe(-12346);
  expect(iu(-1e-15)).toBe(0);
  expect(iu(209.960632)).toBe(iu(209.960632000001));
  expect(iu(210)).not.toBe(iu(209.960632));
  for (const n of [NaN, Infinity, -Infinity, 10001]) expect(() => iu(n)).toThrow();
});
test("cardinal poses keep tiny wires distinct and NC arity correct across overlapping sheets", () => {
  const input = [0, 90, 180, 270].map((a, i) => fixture(`U${90 + i}`, a));
  const original = input.map((s) => s.getString());
  const output = gridInitialSchematics(input);
  expect(input.map((s) => s.getString())).toEqual(original);
  for (const [index, s] of output.sheets.entries()) {
    expect(incidence(s)).toEqual(incidence(input[index]!));
    const [a, b] = s.wires[0]!.points!.points as Xy[];
    expect(Math.hypot(a!.x - b!.x, a!.y - b!.y)).toBeCloseTo(1.27, 8);
    for (const p of pins(s.libSymbols!.symbols[0]!)) {
      expect(p.length).toBeGreaterThan(0);
      for (const v of position(s.symbols[0]!, p)) expect(v % 12700).toBe(0);
    }
    const read = parseKicadSch(s.getString());
    expect(read.wires).toHaveLength(1);
    expect(read.junctions[0]!.at!.angle).toBeUndefined();
    expect(read.noConnects[0]!.at!.angle).toBeUndefined();
    expect(incidence(read)).toEqual(incidence(s));
  }
  expect(gridInitialSchematics(output.sheets).sheets.map((s) => s.getString())).toEqual(
    output.sheets.map((s) => s.getString()),
  );
});
test("late unsupported input rejects atomically, including invalid native at arity", () => {
  for (const mode of [
    "diagonal",
    "angle",
    "mirror",
    "rectangle",
    "junction-angle",
    "nc-angle",
    "shared",
    "bad-stub",
    "nan",
  ] as const) {
    const good = fixture("U98"),
      bad = fixture("U99"),
      p = pins(bad.libSymbols!.symbols[0]!)[0]!;
    if (mode === "diagonal") bad.wires = [wire([1, 2], [3, 4])];
    if (mode === "angle") bad.symbols[0]!.at!.angle = 45;
    if (mode === "mirror") bad.symbols[0]!.mirror = "x";
    if (mode === "rectangle")
      bad.libSymbols!.symbols[0]!.rectangles.push(new SymbolRectangle());
    if (mode === "junction-angle") bad.junctions[0]!.at!.angle = 0;
    if (mode === "nc-angle") bad.noConnects[0]!.at!.angle = 0;
    if (mode === "shared") {
      const extra = new SchematicSymbol({
        unit: 1,
        at: [20, 30, 0],
        properties: [new SymbolProperty({ key: "Reference", value: "U97" })],
      });
      extra.libraryId = new SymbolLibId("Test:U99");
      bad.symbols = [...bad.symbols, extra];
    }
    if (mode === "bad-stub") p.length = 0;
    if (mode === "nan") p.at!.x = NaN;
    const original = [good, bad].map((s) => s.getString());
    expect(() => gridInitialSchematics([good, bad])).toThrow();
    expect([good, bad].map((s) => s.getString())).toEqual(original);
  }
});
test("controller topology, identities, types and standalone cache survive grid alignment", () => {
  const strings = before.map((s) => s.getString());
  const output = gridInitialSchematics(before, {
    joinedInductorLibraryId: "CrystalShim_Controller:Controller_L1",
  });
  expect(before.map((s) => s.getString())).toEqual(strings);
  // The expanded controller keeps all exact endpoint/type memberships below.
  expect({
    wires: output.report.reduce((n, r) => n + r.wires, 0),
    pins: output.report.reduce((n, r) => n + r.pins, 0),
    library: output.library.length,
    junctions: output.report.reduce((n, r) => n + r.addedBranchJunctions, 0),
  }).toEqual({ wires: 489, pins: 319, library: 114, junctions: 7 });
  for (const [index, s] of output.sheets.entries()) {
    const prior = before[index]!;
    expect(incidence(s, new Set(prior.junctions.map((j) => j.uuid!.value)))).toEqual(
      incidence(prior),
    );
    for (const w of s.wires)
      for (const p of w.points!.points as Xy[]) {
        expect(iu(p.x) % 12700).toBe(0);
        expect(iu(p.y) % 12700).toBe(0);
      }
    for (const a of [...s.globalLabels, ...s.labels, ...s.junctions, ...s.noConnects]) {
      expect(iu(a.at!.x) % 12700).toBe(0);
      expect(iu(a.at!.y) % 12700).toBe(0);
    }
    for (const instance of s.symbols) {
      const lib = s.libSymbols!.symbols.find(
        (l) => l.libraryId === instance.libraryId,
      )!;
      for (const p of pins(lib))
        for (const v of position(instance, p)) expect(v % 12700).toBe(0);
      const standalone = parseKicadSym(
        new KicadSym({
          symbols: [
            output.library.find((l) => l.libraryId === lib.libraryId!.split(":")[1])!,
          ],
        }).getString(),
      ).symbols[0]!;
      standalone.libraryId = lib.libraryId;
      expect(standalone.getString()).toBe(lib.getString());
      if (ref(instance).startsWith("#")) {
        expect(lib.getString()).toBe(
          before[index]!.libSymbols!.symbols.find(
            (l) => l.libraryId === lib.libraryId,
          )!.getString(),
        );
        expect(pins(lib)[0]!.length).toBe(0);
      }
    }
  }
  // Hierarchy filename/UUID generation is randomized between compiles. Exact
  // native membership is separately compared in the fresh guarded stage.
  const actual = full.schematicFiles.map((f) => parseKicadSch(f.content));
  expect(actual.reduce((n, s) => n + s.wires.length, 0)).toBe(489);
  const emittedLibrary = parseKicadSym(full.symbolLibraryFile.content);
  for (const sheet of actual) {
    for (const w of sheet.wires)
      for (const p of w.points!.points as Xy[]) {
        expect(iu(p.x) % 12700).toBe(0);
        expect(iu(p.y) % 12700).toBe(0);
      }
    for (const instance of sheet.symbols) {
      const lib = sheet.libSymbols!.symbols.find(
        (l) => l.libraryId === instance.libraryId,
      )!;
      for (const p of pins(lib))
        for (const v of position(instance, p)) expect(v % 12700).toBe(0);
      const entry = parseKicadSym(
        new KicadSym({
          symbols: [
            emittedLibrary.symbols.find(
              (l) => l.libraryId === lib.libraryId!.split(":")[1],
            )!,
          ],
        }).getString(),
      ).symbols[0]!;
      entry.libraryId = lib.libraryId;
      expect(entry.getString()).toBe(lib.getString());
    }
  }
  expect(
    gridInitialSchematics(output.sheets, {
      joinedInductorLibraryId: "CrystalShim_Controller:Controller_L1",
    }).sheets.map((s) => s.getString()),
  ).toEqual(output.sheets.map((s) => s.getString()));
});
test("connected branch dots survive straight-wire merging without joining unconnected crossings", () => {
  const input = new KicadSch({
    version: 20250114,
    uuid: randomUUID(),
    wires: [
      // Overlapping collinear stubs already connect the branch to the trunk.
      wire([0, 0], [5.08, 0]),
      wire([2.54, 0], [7.62, 0]),
      wire([5.08, 0], [5.08, 2.54]),
      // An ordinary endpoint-to-endpoint T needs a persistent dot too.
      wire([0, 5.08], [2.54, 5.08]),
      wire([2.54, 5.08], [5.08, 5.08]),
      wire([2.54, 5.08], [2.54, 7.62]),
      // This branch only touches the trunk interior; do not infer a net tie.
      wire([10.16, 0], [15.24, 0]),
      wire([12.7, 0], [12.7, 2.54]),
      // A plain crossing also remains unjoined.
      wire([20.32, 0], [25.4, 0]),
      wire([22.86, -2.54], [22.86, 2.54]),
      // A pre-existing four-endpoint node remains electrically joined. Its
      // four-way ERC policy is not changed or suppressed by this adapter.
      wire([27.94, 0], [30.48, 0]),
      wire([30.48, 0], [33.02, 0]),
      wire([30.48, -2.54], [30.48, 0]),
      wire([30.48, 0], [30.48, 2.54]),
    ],
  });
  const original = input.getString();
  const output = gridInitialSchematics([input]);
  const s = output.sheets[0]!;
  expect(input.getString()).toBe(original);
  expect(s.wires.map((w) => w.getString())).toEqual(
    input.wires.map((w) => w.getString()),
  );
  expect(output.report[0]!.addedBranchJunctions).toBe(3);
  expect(s.junctions.map((j) => [j.at!.x, j.at!.y])).toEqual([
    [5.08, 0],
    [2.54, 5.08],
    [30.48, 0],
  ]);
  for (const j of s.junctions) expect(j.at!.angle).toBeUndefined();
  const again = gridInitialSchematics(output.sheets);
  expect(again.report[0]!.addedBranchJunctions).toBe(0);
  expect(again.sheets[0]!.getString()).toBe(s.getString());
});
test("L1 display has joined lobes and tails without moving any electrical pin", () => {
  const plain = gridInitialSchematics(before),
    joined = gridInitialSchematics(before, {
      joinedInductorLibraryId: "CrystalShim_Controller:Controller_L1",
    });
  const find = (ss: KicadSch[]) =>
    ss
      .flatMap((s) => s.libSymbols?.symbols ?? [])
      .find((l) => l.libraryId === "CrystalShim_Controller:Controller_L1")!;
  const a = find(plain.sheets),
    b = find(joined.sheets);
  expect(pins(b).map((p) => p.getString())).toEqual(pins(a).map((p) => p.getString()));
  const lines = b.subSymbols
    .flatMap((s) => s.polylines)
    .map((l) => l.points!.points as Xy[]);
  expect(lines).toHaveLength(6);
  const xy = (p: Xy) => [iu(p.x), iu(p.y)];
  for (const [i, p] of pins(b).entries()) {
    expect(xy(lines[4 + i]![0]!)).toEqual([
      iu(p.at!.x) + (i === 0 ? 1 : -1) * iu(p.length!),
      iu(p.at!.y),
    ]);
  }
  expect(xy(lines[4]!.at(-1)!)).toEqual(xy(lines[0]![0]!));
  expect(xy(lines[5]!.at(-1)!)).toEqual(xy(lines[3]!.at(-1)!));
  for (let i = 0; i < 3; i++)
    expect(xy(lines[i]!.at(-1)!)).toEqual(xy(lines[i + 1]![0]!));
  expect(() =>
    gridInitialSchematics(before, { joinedInductorLibraryId: "Test:absent" }),
  ).toThrow("not found");
});
