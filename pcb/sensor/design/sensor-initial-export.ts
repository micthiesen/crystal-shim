import { randomUUID } from "node:crypto";
import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  At,
  KicadSch,
  KicadSym,
  NoConnect,
  SymbolProperty,
  SymbolLibId,
  SymbolPin,
  SchematicSymbol,
  SymbolInstances,
  SymbolInstancesProject,
  SymbolInstancePath,
  parseKicadSym,
} from "kicadts";
import { gridInitialSchematics } from "../../scripts/lib/schematic-grid-initial-export";
import { controllerPowerFlagDefinition } from "../../controller/design/project-symbol-library-initial-export";
import {
  createSensorManifest,
  sensorExpectedNc,
  sensorNativeFootprint,
  sensorProjectSymbol,
} from "./design-manifest";
import { createSensorInitialPcb, prepareSensorInitialJson } from "./sensor-initial-pcb";
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const clone = (s: SchematicSymbol) =>
  parseKicadSym(new KicadSym({ symbols: [s] }).getString()).symbols[0]!;
const ref = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
export const sensorSymbolLibraryFilename = "CrystalShim_Sensor.kicad_sym";
function electricalType(
  reference: string,
  number: string,
): SymbolPin["pinElectricalType"] {
  if (reference === "U1")
    return (
      (
        {
          "1": "output",
          "2": "input",
          "3": "input",
          "4": "input",
          "5": "input",
          "6": "output",
          "7": "power_in",
          "8": "power_in",
          "9": "bidirectional",
          "10": "input",
        } as const
      )[number as "1"] ?? "passive"
    );
  if (reference === "U2")
    return (
      (
        {
          "1": "power_in",
          "2": "power_in",
          "3": "input",
          "4": "passive",
          "5": "power_out",
        } as const
      )[number as "1"] ?? "passive"
    );
  return "passive";
}
// Fresh typed converter objects only. No existing native artifact is accepted.
export function createSensorInitialGraphs(input: CircuitJson) {
  const manifest = createSensorManifest(input);
  const json = prepareSensorInitialJson(input);
  const power = new Set<string>();
  for (const e of json) {
    if (
      e.type === "source_net" &&
      (e.is_power || e.is_ground || e.is_positive_voltage_source)
    ) {
      power.add(e.source_net_id);
      e.is_power = false;
      e.is_ground = false;
      e.is_positive_voltage_source = false;
    }
  }
  for (const e of json)
    if (e.type === "schematic_net_label" && power.has(e.source_net_id))
      delete e.symbol_name;
  const converter = new CircuitJsonToKicadSchConverter(json);
  converter.runUntilFinished();
  const files = Reflect.get(converter, "files") as {
    kicadSch: KicadSch;
    content: string;
  }[];
  if (
    !Array.isArray(files) ||
    files.length !== 2 ||
    files.some((f) => !(f.kicadSch instanceof KicadSch))
  )
    throw new Error("Expected root plus one sensor sheet");
  const sheets = files.map((f) => f.kicadSch);
  const visited = new Set<string>();
  for (const sheet of sheets) {
    const cache = sheet.libSymbols?.symbols ?? [];
    const library: SchematicSymbol[] = [];
    for (const instance of sheet.symbols) {
      const reference = ref(instance);
      const component = manifest.components.find((c) => c.ref === reference);
      if (
        !reference ||
        !component ||
        visited.has(reference) ||
        !instance.at ||
        (instance.at.angle ?? 0) !== 0
      )
        throw new Error("Unexpected sensor initial symbol");
      visited.add(reference);
      const oldId = instance.libraryId;
      const old = cache.find((l) => l.libraryId === oldId);
      if (!old) throw new Error(`${reference}: missing library`);
      const lib = clone(old);
      const expected = component.footprint.pad_numbers;
      const actual = pins(lib)
        .map((p) => p.numberString)
        .sort();
      if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
        throw new Error(`${reference}: pin set differs`);
      const oldBase = oldId!.split(":").at(-1)!;
      const id = sensorProjectSymbol(reference);
      for (const sub of lib.subSymbols) {
        if (!sub.libraryId?.startsWith(`${oldBase}_`))
          throw new Error("Unexpected child name");
        sub.libraryId = id.split(":")[1] + sub.libraryId.slice(oldBase.length);
      }
      lib.libraryId = id;
      for (const pin of pins(lib)) {
        pin.pinElectricalType = electricalType(reference, pin.numberString!);
        if (sensorExpectedNc.includes(`${reference}.${pin.numberString}`)) {
          if (!pin.at) throw new Error("Missing NC location");
          sheet.noConnects = [
            ...sheet.noConnects,
            new NoConnect({
              at: new At([instance.at.x + pin.at.x, instance.at.y - pin.at.y]),
              uuid: randomUUID(),
            }),
          ];
        }
      }
      instance.libraryId = new SymbolLibId(id);
      instance.inBom = !["E1", "J1"].includes(reference!);
      instance.inPosFiles = !["E1", "J1"].includes(reference!);
      lib.inBom = instance.inBom;
      lib.inPosFiles = instance.inPosFiles;
      const footprintFilter = lib.properties.find((p) => p.key === "ki_fp_filters");
      if (footprintFilter) footprintFilter.value = `Sensor_${reference}`;
      for (const [key, value] of Object.entries({
        Value: component.value,
        Footprint: sensorNativeFootprint(reference),
        MPN: component.fields.manufacturer_part_number,
        Datasheet: component.fields.datasheet_url,
        StableID: component.stable_id,
      })) {
        for (const target of [instance, lib]) {
          const prop = target.properties.find((p) => p.key === key);
          if (prop) prop.value = value;
          else
            target.properties = [
              ...target.properties,
              new SymbolProperty({
                key,
                value,
                at: new At([
                  target === instance ? instance.at.x : 0,
                  target === instance ? instance.at.y : 0,
                  0,
                ]),
                hidden: true,
              }),
            ];
        }
      }
      library.push(lib);
    }
    if (sheet.libSymbols) sheet.libSymbols.symbols = library;
  }
  if (visited.size !== 16) throw new Error("Incomplete initial symbols");
  // Explicit external supply witnesses: J1 brings both5 V and its ground return.
  const sheet = sheets.find((s) => s.symbols.some((s) => ref(s) === "J1"))!;
  const witness = sheet.symbols.find((s) => ref(s) === "J1")!;
  const flagId = "CrystalShim_Sensor:PWR_FLAG";
  const definition = controllerPowerFlagDefinition();
  definition.libraryId = flagId;
  sheet.libSymbols!.symbols = [...sheet.libSymbols!.symbols, definition];
  for (const [i, net] of ["V5_SENSOR", "GND"].entries()) {
    const anchor = sheet.globalLabels.find((l) => l.value === net);
    if (!anchor?.at || !witness.instances)
      throw new Error(`${net}: missing flag witness`);
    const pin = new SymbolPin();
    pin.numberString = "1";
    pin.uuid = randomUUID();
    const flagRef = `#FLG0${i + 1}`;
    const flag = new SchematicSymbol({
      at: new At([anchor.at.x, anchor.at.y, 0]),
      unit: 1,
      uuid: randomUUID(),
      pins: [pin],
      inBom: false,
      inPosFiles: false,
      onBoard: false,
      excludeFromSim: true,
      properties: [
        new SymbolProperty({
          key: "Reference",
          value: flagRef,
          at: new At([anchor.at.x, anchor.at.y - 3, 0]),
          hidden: true,
        }),
        new SymbolProperty({
          key: "Value",
          value: "PWR_FLAG",
          at: new At([anchor.at.x, anchor.at.y - 4, 0]),
          hidden: true,
        }),
      ],
    });
    flag.libraryId = new SymbolLibId(flagId);
    const paths = new SymbolInstances();
    paths.projects = witness.instances.projects.map((p) => {
      const project = new SymbolInstancesProject(p.name);
      project.paths = p.paths.map((old) => {
        const path = new SymbolInstancePath(old.value);
        path.reference = flagRef;
        path.unit = 1;
        return path;
      });
      return project;
    });
    flag.instances = paths;
    sheet.symbols = [...sheet.symbols, flag];
  }
  const grid = gridInitialSchematics(sheets);
  for (const [i, file] of files.entries()) {
    file.kicadSch = grid.sheets[i]!;
    file.content = file.kicadSch.getString();
  }
  return {
    circuitJson: json,
    pcb: createSensorInitialPcb(input),
    symbolLibraryFile: {
      filename: sensorSymbolLibraryFilename,
      content: new KicadSym({
        version: 20231120,
        generator: "tscircuit",
        symbols: grid.library,
      }).getString(),
    },
    schematicFiles: converter.getOutputFiles({ schematicFilename: "sensor.kicad_sch" }),
  };
}
