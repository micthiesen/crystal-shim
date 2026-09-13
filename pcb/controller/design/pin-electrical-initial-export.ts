import type { CircuitJson } from "circuit-json";
import type { KicadSch, SchematicSymbol, SymbolPin } from "kicadts";
import { chipElectricalContracts, type ElectricalPin } from "./pin-electrical-contract";
import {
  controllerCapacitors,
  controllerResistors,
  precisionResistors,
} from "./passive-components";

const resistors = new Set<string>(
  [...Object.values(controllerResistors), ...Object.values(precisionResistors)].map(
    (p) => p.mpn,
  ),
);
const capacitors = new Set<string>(
  Object.values(controllerCapacitors).map((p) => p.mpn),
);
const passivePair = {
  "1": { name: "1", type: "passive" },
  "2": { name: "2", type: "passive" },
} as const;
function symbolPins(symbol: SchematicSymbol): SymbolPin[] {
  return [...symbol.pins, ...symbol.subSymbols.flatMap(symbolPins)];
}
function sameNumbers(actual: string[], expected: string[], context: string) {
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort()))
    throw new Error(`${context}: electrical pin multiset changed`);
}

// Only fresh, in-memory converter graphs, after USB's native-number adapter and
// power-label normalization, before any initial-stage file is written. This is
// not a loader, general symbol editor or a post-handoff ECO mechanism.
// All sheets and source parts must be supplied together. Validate the complete
// batch before any mutation so bad later sheets cannot leave half-typed output.
export function applyControllerPinTypesForInitialExport(
  json: CircuitJson,
  schematics: readonly KicadSch[],
) {
  const sources = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const byRef = new Map(sources.map((s) => [s.name, s]));
  if (sources.length === 0 || byRef.size !== sources.length)
    throw new Error("Electrical metadata requires unique, nonempty source references");
  const allInstances = schematics.flatMap((s) => s.symbols);
  const seen = new Set<string>();
  const plans = new Map<SymbolPin, ElectricalPin["type"]>();
  for (const schematic of schematics) {
    for (const instance of schematic.symbols) {
      const refs = instance.properties.filter((p) => p.key === "Reference");
      const ref = refs[0]?.value;
      const source = ref ? byRef.get(ref) : undefined;
      if (refs.length !== 1 || !ref || !source || seen.has(ref))
        throw new Error(`Unexpected, duplicate or absent electrical source: ${ref}`);
      seen.add(ref);
      const mpn = source.manufacturer_part_number ?? "";
      let expected: Readonly<Record<string, ElectricalPin>>;
      let sourceNames: Readonly<Record<string, string>>;
      if (source.ftype === "simple_chip") {
        const contract = chipElectricalContracts[mpn];
        if (
          !contract ||
          !instance.properties.some((p) => p.key === "Value" && p.value === mpn)
        )
          throw new Error(`${ref}: unsupported or mismatched exact chip MPN ${mpn}`);
        expected = contract.pins;
        // USB's source ports remain indices 1..17. Native pins have already
        // become A/B/SH; validate both namespaces without renumbering either.
        sourceNames = Object.fromEntries(
          Object.entries(expected).map(([n, p], i) => [
            mpn === "USB4105-GF-A" ? String(i + 1) : n,
            p.name,
          ]),
        );
      } else {
        const supported =
          (source.ftype === "simple_resistor" && resistors.has(mpn)) ||
          (source.ftype === "simple_capacitor" && capacitors.has(mpn)) ||
          (source.ftype === "simple_inductor" && mpn === "SRP5030TA-4R7M");
        const testpoint =
          source.ftype === "simple_test_point" && !mpn && /^TP\d+$/.test(ref);
        if (!supported && !testpoint)
          throw new Error(
            `${ref}: electrical metadata missing for ${source.ftype}/${mpn}`,
          );
        expected = testpoint ? { "1": passivePair["1"] } : passivePair;
        sourceNames = Object.fromEntries(
          Object.keys(expected).map((n) => [n, `pin${n}`]),
        );
      }
      const sourcePorts = ports.filter(
        (p) =>
          p.source_component_id === source.source_component_id && p.pin_number != null,
      );
      sameNumbers(
        sourcePorts.map((p) => String(p.pin_number)),
        Object.keys(sourceNames),
        ref,
      );
      if (sourcePorts.some((p) => sourceNames[String(p.pin_number)] !== p.name))
        throw new Error(`${ref}: source electrical pin names changed`);
      const libraries =
        schematic.libSymbols?.symbols.filter(
          (s) => s.libraryId === instance.libraryId,
        ) ?? [];
      if (libraries.length === 0)
        throw new Error(`${ref}: missing electrical library symbol`);
      const expectedNumbers = Object.keys(expected);
      sameNumbers(
        symbolPins(instance).map((p) => p.numberString ?? ""),
        expectedNumbers,
        ref,
      );
      // The pinned converter repeats built-in resistor/capacitor libraries,
      // sometimes with different default Value properties. Validate and type
      // every copy; deduplicating library definitions remains native cleanup.
      const pins = libraries.flatMap((library) => {
        const pins = symbolPins(library);
        sameNumbers(
          pins.map((p) => p.numberString ?? ""),
          expectedNumbers,
          ref,
        );
        return pins;
      });
      for (const pin of pins) {
        const declaration = expected[pin.numberString!]!;
        if (pin.name !== declaration.name || pin.pinElectricalType !== "passive")
          throw new Error(`${ref}.${pin.numberString}: initial pin name/type changed`);
        const prior = plans.get(pin);
        if (prior && prior !== declaration.type)
          throw new Error(
            `${ref}: shared library has conflicting electrical declarations`,
          );
        plans.set(pin, declaration.type);
      }
    }
  }
  if (seen.size !== sources.length || allInstances.length !== sources.length)
    throw new Error(
      "Electrical metadata did not cover every source component exactly once",
    );
  // Instance pins contain UUID references only. Adding an electrical type there
  // would change KiCad's instance syntax; only the library pin owns this field.
  for (const [pin, type] of plans) pin.pinElectricalType = type;
  return { components: seen.size, libraryPins: plans.size };
}
