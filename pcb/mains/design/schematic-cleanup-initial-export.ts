import { randomUUID } from "node:crypto";
import {
  At,
  NoConnect,
  Xy,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import type { createMainsManifest } from "./design-manifest";
import { mainsExpectedNc, mainsExpectedPins } from "./schematic-connectivity-check";
import { schematicNativeUnits } from "../../scripts/lib/schematic-grid-initial-export";

// All collision coordinates are KiCad integer units, not source floats. KiCad
// rounds a symbol origin and local pin independently before adding them.
type Point = { x: number; y: number };
type Pin = Point & { sheet: KicadSch; ref: string; number: string };
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const native = (p: Point): Point => ({
  x: schematicNativeUnits(p.x),
  y: schematicNativeUnits(p.y),
});
const equal = (a: readonly string[], b: readonly string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function pins(symbol: SchematicSymbol): SymbolPin[] {
  return [...symbol.pins, ...symbol.subSymbols.flatMap(pins)];
}
function onSegment(p: Point, a: Point, b: Point) {
  return (
    (p.x - a.x) * (b.y - a.y) === (p.y - a.y) * (b.x - a.x) &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}

// Fresh converter graphs only, after project symbols and fields, before flags
// and grid conversion. This annotates deliberate unused pins without altering
// a wire, symbol, library, field or pin. All validation precedes mutation.
export function applyMainsSchematicCleanupForInitialExport(
  sheets: readonly KicadSch[],
  manifest: ReturnType<typeof createMainsManifest>,
) {
  const components = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  const connected = new Set(
    manifest.nets.flatMap((net) => net.endpoints.map((e) => `${e.component}.${e.pad}`)),
  );
  const unused = components.flatMap((c) =>
    c.footprint.pad_numbers
      .filter((number) => !connected.has(`${c.stable_id}.${number}`))
      .map((number) => `${c.ref}.${number}`),
  );
  if (
    sheets.length !== 4 ||
    !equal(
      components.map((c) => c.ref),
      Object.keys(mainsExpectedPins),
    ) ||
    !equal(unused, mainsExpectedNc)
  )
    throw new Error("Mains cleanup NC/source contract changed");

  const allPins: Pin[] = [];
  const seen = new Set<string>();
  for (const sheet of sheets) {
    if (sheet.noConnects.length)
      throw new Error("Mains cleanup requires an unmodified initial graph");
    for (const wire of sheet.wires) {
      const points = wire.points?.points;
      if (points?.length !== 2 || points.some((p) => !(p instanceof Xy)))
        throw new Error("Mains cleanup requires straight two-point initial wires");
    }
    for (const instance of sheet.symbols) {
      const refs = instance.properties.filter((p) => p.key === "Reference");
      const ref = refs[0]?.value;
      const component = components.find((c) => c.ref === ref);
      if (
        refs.length !== 1 ||
        !ref ||
        !component ||
        seen.has(ref) ||
        !instance.at ||
        !Number.isFinite(instance.at.x) ||
        !Number.isFinite(instance.at.y) ||
        (instance.at.angle ?? 0) !== 0 ||
        instance.mirror ||
        instance.libraryId !== `CrystalShim_Mains:Mains_${ref}`
      )
        throw new Error("Mains cleanup symbol identity or orientation changed");
      seen.add(ref);
      const libraries =
        sheet.libSymbols?.symbols.filter((s) => s.libraryId === instance.libraryId) ??
        [];
      if (libraries.length !== 1)
        throw new Error(`${ref}: ambiguous initial pin geometry`);
      const physical = pins(libraries[0]!);
      const expected =
        mainsExpectedPins[ref as keyof typeof mainsExpectedPins].map(String);
      if (
        !equal(
          physical.map((p) => p.numberString ?? ""),
          expected,
        ) ||
        !equal(component.footprint.pad_numbers, expected) ||
        !equal(
          instance.pins.map((p) => p.numberString ?? ""),
          expected,
        )
      )
        throw new Error(`${ref}: initial logical pin map changed`);
      for (const pin of physical) {
        if (!pin.at || !Number.isFinite(pin.at.x) || !Number.isFinite(pin.at.y))
          throw new Error(`${ref}: missing physical pin anchor`);
        allPins.push({
          sheet,
          ref,
          number: pin.numberString!,
          x: schematicNativeUnits(instance.at.x) + schematicNativeUnits(pin.at.x),
          y: schematicNativeUnits(instance.at.y) - schematicNativeUnits(pin.at.y),
        });
      }
    }
  }
  if (seen.size !== 22 || allPins.length !== 60)
    throw new Error("Mains cleanup requires all 60 logical symbol pins");
  const markers = mainsExpectedNc.map((id) => {
    const p = allPins.find((pin) => `${pin.ref}.${pin.number}` === id);
    if (
      !p ||
      p.sheet.wires.some((wire) => {
        const [a, b] = wire.points!.points as Xy[];
        return onSegment(p, native(a!), native(b!));
      }) ||
      [...p.sheet.labels, ...p.sheet.globalLabels, ...p.sheet.junctions].some(
        (e) => e.at && same(p, native(e.at)),
      ) ||
      allPins.some((q) => q !== p && q.sheet === p.sheet && same(p, q))
    )
      throw new Error(`${id}: source NC is touching electrical geometry`);
    return {
      sheet: p.sheet,
      marker: new NoConnect({
        at: new At([p.x / 10000, p.y / 10000]),
        uuid: randomUUID(),
      }),
    };
  });
  for (const { sheet, marker } of markers)
    sheet.noConnects = [...sheet.noConnects, marker];
  return { noConnects: markers.length };
}
