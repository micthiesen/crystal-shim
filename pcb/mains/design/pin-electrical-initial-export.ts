import type { CircuitJson } from "circuit-json";
import type { KicadSch, SchematicSymbol, SymbolPin } from "kicadts";
import type { ElectricalPin } from "../../controller/design/pin-electrical-contract";
import { mainsChipElectricalContracts } from "./pin-electrical-contract";
import { mainsSchematicConnectivityErrors } from "./schematic-connectivity-check";

const chipMpns: Readonly<Record<string, string>> = {
  J1: "1868076",
  J2: "1868076",
  J3: "1868076",
  J4: "1868076",
  J5: "43650-0300",
  U1: "IRM-45-12",
  U2: "AP63205WU-7",
  K1: "G5RL-1A-TV8 DC5",
  RV1: "TMOV14RP175EL2T7",
  D1: "1N4007-E3/54",
  F2: "0451003.MRL",
  F3: "0215001.MXEP",
  J6: "43045-0200",
};
// Ref-bound population. A different known resistor/capacitor is not an admitted
// replacement merely because its electrical pin types would also be passive.
const passives = {
  R1: ["simple_resistor", "PR02FS0201000KA100", "100Ω", 100],
  C1: ["simple_capacitor", "B32921C3473K000", "47nF", 47e-9],
  C2: ["simple_capacitor", "GRM32ER71E226ME15L", "22uF", 22e-6],
  C3: ["simple_capacitor", "GRM32ER71E226ME15L", "22uF", 22e-6],
  C4: ["simple_capacitor", "GRM32ER71E226ME15L", "22uF", 22e-6],
  C5: ["simple_capacitor", "C1608X7R1H104K080AA", "100nF", 100e-9],
  C6: ["simple_capacitor", "GRM32ER71E226ME15L", "22uF", 22e-6],
  C7: ["simple_capacitor", "C1608X7R1H104K080AA", "100nF", 100e-9],
  L1: ["simple_inductor", "SRP5030TA-4R7M", "4.7µH", "4.7uH"],
} as const;
const passivePair = {
  "1": { name: "1", type: "passive" },
  "2": { name: "2", type: "passive" },
} as const;
const pins = (symbol: SchematicSymbol): SymbolPin[] => [
  ...symbol.pins,
  ...symbol.subSymbols.flatMap(pins),
];
function sameNumbers(actual: string[], expected: string[], ref: string) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
    throw new Error(`${ref}: electrical pin multiset changed`);
}
function property(symbol: SchematicSymbol, key: string) {
  const properties = symbol.properties.filter((p) => p.key === key);
  if (properties.length !== 1 || !properties[0]!.value.trim())
    throw new Error(`Initial mains symbol needs one nonempty ${key}`);
  return properties[0]!.value;
}

// Fresh initial typed graphs only, after power-label normalization and before
// project-library renaming or any native emission. Supply root plus all three
// child sheets together. Instance pins remain UUID references; only library
// definitions carry electrical types. No mutation precedes complete admission.
export function applyMainsPinTypesForInitialExport(
  json: CircuitJson,
  sheets: readonly KicadSch[],
) {
  const errors = mainsSchematicConnectivityErrors(json);
  if (errors.length) throw new Error(`Invalid mains source: ${JSON.stringify(errors)}`);
  if (sheets.length !== 4 || new Set(sheets).size !== 4)
    throw new Error("Initial mains electrical types require four distinct sheets");
  const sources = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const byRef = new Map(sources.map((s) => [s.name, s]));
  if (
    sources.length !== 22 ||
    byRef.size !== 22 ||
    ports.length !== 53 ||
    sources.some((s) => !s.source_component_id?.trim()) ||
    ports.some((p) => !p.source_port_id?.trim())
  )
    throw new Error(
      "Mains electrical source must contain 22 parts and 53 identified pins",
    );

  const declarations = new Map<string, Readonly<Record<string, ElectricalPin>>>();
  const seen = new Set<string>();
  const uuids = new Set<string>();
  let logicalPins = 0;
  for (const sheet of sheets) {
    for (const instance of sheet.symbols) {
      const ref = property(instance, "Reference");
      const source = byRef.get(ref);
      if (!source || seen.has(ref))
        throw new Error(`Unexpected or duplicate mains electrical instance: ${ref}`);
      seen.add(ref);
      const value = property(instance, "Value");
      const mpn = source.manufacturer_part_number ?? "";
      const libraryId = instance.libraryId ?? "";
      let expected: Readonly<Record<string, ElectricalPin>>;
      let sourceNames: Readonly<Record<string, string>>;
      const chipMpn = chipMpns[ref];
      if (chipMpn) {
        const contract = mainsChipElectricalContracts[chipMpn];
        const initialId = `Device:U_${chipMpn.replace(/[^A-Za-z0-9_-]+/g, "_")}`;
        if (
          source.ftype !== "simple_chip" ||
          mpn !== chipMpn ||
          value !== chipMpn ||
          !contract ||
          libraryId !== initialId
        )
          throw new Error(`${ref}: exact initial chip identity changed`);
        expected = contract.pins;
        sourceNames = Object.fromEntries(
          Object.entries(expected).map(([n, p]) => [n, p.name]),
        );
      } else {
        const part = passives[ref as keyof typeof passives];
        if (!part || source.ftype !== part[0] || mpn !== part[1] || value !== part[2])
          throw new Error(`${ref}: exact passive population changed`);
        const quantity =
          source.ftype === "simple_resistor"
            ? source.resistance
            : source.ftype === "simple_capacitor"
              ? source.capacitance
              : source.ftype === "simple_inductor"
                ? source.inductance
                : undefined;
        const family =
          part[0] === "simple_resistor"
            ? "boxresistor"
            : part[0] === "simple_inductor"
              ? "inductor"
              : "capacitor";
        if (
          quantity !== part[3] ||
          !["up", "down", "left", "right"].some(
            (side) => libraryId === `Device:${family}_${side}`,
          )
        )
          throw new Error(`${ref}: initial passive value/library changed`);
        expected = passivePair;
        sourceNames = { "1": "pin1", "2": "pin2" };
      }
      const sourcePorts = ports.filter(
        (p) => p.source_component_id === source.source_component_id,
      );
      sameNumbers(
        sourcePorts.map((p) => String(p.pin_number)),
        Object.keys(sourceNames),
        ref,
      );
      if (sourcePorts.some((p) => p.name !== sourceNames[String(p.pin_number)]))
        throw new Error(`${ref}: source electrical pin names changed`);
      const instancePins = pins(instance);
      if (instance.subSymbols.length)
        throw new Error(`${ref}: initial instance contains a library subsymbol`);
      sameNumbers(
        instancePins.map((p) => p.numberString ?? ""),
        Object.keys(expected),
        ref,
      );
      for (const pin of instancePins) {
        if (
          !pin.uuid ||
          uuids.has(pin.uuid) ||
          pin.pinElectricalType !== undefined ||
          pin.pinGraphicStyle !== undefined ||
          pin.name !== undefined ||
          pin.at !== undefined ||
          pin.length !== undefined ||
          pin.alternates.length !== 0 ||
          pin.hidden ||
          pin.getChildren().length !== 1 ||
          pin.getChildren()[0]!.token !== "uuid"
        )
          throw new Error(
            `${ref}.${pin.numberString}: instance pin is not a unique UUID reference`,
          );
        uuids.add(pin.uuid);
      }
      logicalPins += instancePins.length;
      if (!sheet.libSymbols?.symbols.some((l) => l.libraryId === libraryId))
        throw new Error(`${ref}: missing local electrical library`);
      const prior = declarations.get(libraryId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(expected))
        throw new Error(`${ref}: conflicting shared electrical library`);
      declarations.set(libraryId, expected);
    }
  }
  if (seen.size !== 22 || logicalPins !== 53)
    throw new Error("Initial mains electrical coverage must be 22 parts and 53 pins");

  const plans = new Map<SymbolPin, ElectricalPin["type"]>();
  // The pinned converter caches repeated passive definitions, including copies
  // on other sheets. Check every cache entry, even one without a local instance.
  for (const sheet of sheets) {
    for (const library of sheet.libSymbols?.symbols ?? []) {
      const id = library.libraryId ?? "";
      const expected = declarations.get(id);
      if (!expected) throw new Error(`Unexpected initial mains library ${id}`);
      const libraryPins = pins(library);
      sameNumbers(
        libraryPins.map((p) => p.numberString ?? ""),
        Object.keys(expected),
        id,
      );
      for (const pin of libraryPins) {
        const declaration = expected[pin.numberString!]!;
        if (pin.name !== declaration.name || pin.pinElectricalType !== "passive")
          throw new Error(
            `${id}.${pin.numberString}: initial electrical name/type changed`,
          );
        const prior = plans.get(pin);
        if (prior && prior !== declaration.type)
          throw new Error(`${id}: conflicting shared pin declaration`);
        plans.set(pin, declaration.type);
      }
    }
  }
  for (const [pin, type] of plans) pin.pinElectricalType = type;
  return { components: seen.size, logicalPins, libraryPins: plans.size };
}
