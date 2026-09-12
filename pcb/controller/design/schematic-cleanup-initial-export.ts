import {
  At,
  NoConnect,
  Pts,
  Wire,
  Xy,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
} from "kicadts";
import type { createControllerManifest } from "./design-manifest";
import { randomUUID } from "node:crypto";

type Point = { x: number; y: number };
type Pin = Point & { sheet: KicadSch; ref: string; number: string };
const same = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
const offset = (p: Point, x: number, y: number): Point => ({ x: p.x + x, y: p.y + y });
const unusedPins = [
  "J4.A8",
  "J4.B8",
  "U1.22",
  "U1.23",
  "U1.26",
  "U1.27",
  "U1.4",
  "U1.5",
  "U1.6",
  "U1.7",
  "U1.9",
  "U10.10",
  "U10.3",
  "U10.4",
  "U11.1",
  "U11.3",
  "U4.4",
  "U7.1",
  "U8.8",
  "U8.9",
].sort();

function pins(symbol: SchematicSymbol): SymbolPin[] {
  return [...symbol.pins, ...symbol.subSymbols.flatMap(pins)];
}
function ends(wire: Wire): [Xy, Xy] {
  const points = wire.points?.points;
  if (points?.length !== 2 || !(points[0] instanceof Xy) || !(points[1] instanceof Xy))
    throw new Error("Controller cleanup requires straight two-point initial wires");
  return [points[0], points[1]];
}
function onSegment(p: Point, a: Point, b: Point) {
  const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  return (
    Math.abs(cross) < 1e-8 &&
    p.x >= Math.min(a.x, b.x) - 1e-8 &&
    p.x <= Math.max(a.x, b.x) + 1e-8 &&
    p.y >= Math.min(a.y, b.y) - 1e-8 &&
    p.y <= Math.max(a.y, b.y) + 1e-8
  );
}
function touchesHorizontal(wire: Wire, a: Point, b: Point) {
  const [p, q] = ends(wire);
  if (Math.abs(p.y - q.y) < 1e-8)
    return (
      Math.abs(p.y - a.y) < 1e-8 &&
      Math.max(p.x, q.x) >= Math.min(a.x, b.x) - 1e-8 &&
      Math.min(p.x, q.x) <= Math.max(a.x, b.x) + 1e-8
    );
  const t = (a.y - p.y) / (q.y - p.y);
  return (
    t >= -1e-8 && t <= 1 + 1e-8 && onSegment({ x: p.x + t * (q.x - p.x), y: a.y }, a, b)
  );
}

// Only the two audited converter motifs are repaired. This is deliberately not
// a global wire merger: other overlaps, crossings and sheets are untouched.
function overlapPlan(
  sheet: KicadSch,
  allPins: Pin[],
  a: Point,
  b: Point,
  redundant: [Point, Point],
  split: Point,
  branches: [Point, Point][],
  expectedPins: string[],
  labels: { at: Point; value: string }[],
  expectedJunctions: number,
) {
  const exactWire = (p: Point, q: Point) => {
    const found = sheet.wires.filter((wire) => {
      const [u, v] = ends(wire);
      return (same(p, u) && same(q, v)) || (same(p, v) && same(q, u));
    });
    if (found.length !== 1)
      throw new Error("Controller overlap motif changed or is ambiguous");
    return found[0]!;
  };
  const trunk = exactWire(a, b);
  const overlap = exactWire(...redundant);
  const allowed = new Set([
    trunk,
    overlap,
    ...branches.map(([p, q]) => exactWire(p, q)),
  ]);
  const existingJunctions = sheet.junctions.filter(
    (j) => j.at && onSegment(j.at, a, b),
  );
  const ambiguousContact = (wire: Wire) => {
    if (allowed.has(wire) || !touchesHorizontal(wire, a, b)) return false;
    const [p, q] = ends(wire);
    // Existing unsplit crossings remain electrically separate. Reject any
    // extra endpoint/overlap or a crossing at the new split instead of turning
    // it into a new T connection. USB has two such unchanged CC crossings.
    return (
      onSegment(p, a, b) ||
      onSegment(q, a, b) ||
      onSegment(split, p, q) ||
      Math.abs(p.y - q.y) < 1e-8
    );
  };
  if (
    same(split, a) ||
    same(split, b) ||
    !onSegment(split, a, b) ||
    !redundant.every((p) => onSegment(p, a, b)) ||
    trunk.stroke?.getString() !== overlap.stroke?.getString() ||
    sheet.wires.some(ambiguousContact) ||
    existingJunctions.length !== expectedJunctions ||
    existingJunctions.some((j) => !same(j.at!, split))
  )
    throw new Error(
      "Controller overlap has an unexpected branch, crossing or junction",
    );
  const actualPins = allPins
    .filter((p) => p.sheet === sheet && onSegment(p, a, b))
    .map((p) => `${p.ref}.${p.number}`)
    .sort();
  if (JSON.stringify(actualPins) !== JSON.stringify([...expectedPins].sort()))
    throw new Error("Controller overlap pin anchors changed");
  const actualLabels = [...sheet.labels, ...sheet.globalLabels].filter(
    (label) => label.at && onSegment(label.at, a, b),
  );
  if (
    actualLabels.length !== labels.length ||
    labels.some(
      (expected) =>
        actualLabels.filter(
          (label) =>
            label.value === expected.value && label.at && same(label.at, expected.at),
        ).length !== 1,
    )
  )
    throw new Error("Controller overlap electrical label anchors changed");
  const segment = (p: Point, q: Point, retainUuid: boolean) =>
    new Wire({
      points: new Pts([new Xy(p.x, p.y), new Xy(q.x, q.y)]),
      stroke: trunk.stroke,
      uuid: retainUuid ? trunk.uuid : randomUUID(),
    });
  return {
    sheet,
    // Geometric union is identical. Keep the trunk UUID on the first piece;
    // the redundant segment disappears and the second piece gets a new UUID.
    wires: sheet.wires.flatMap((wire) =>
      wire === overlap
        ? []
        : wire === trunk
          ? [segment(a, split, true), segment(split, b, false)]
          : [wire],
    ),
  };
}

// Fresh typed converter graphs only, after physical pin numbering and fields.
// Validate every sheet and both repairs before mutating anything. No native
// file is loaded here, and this is not an ECO or general schematic editor.
export function applyControllerSchematicCleanupForInitialExport(
  sheets: readonly KicadSch[],
  manifest: ReturnType<typeof createControllerManifest>,
) {
  const components = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  const connected = new Map(
    manifest.nets.flatMap((net) =>
      net.endpoints.map((e) => [`${e.component}.${e.pad}`, net.name] as const),
    ),
  );
  const unused = components
    .flatMap((c) =>
      c.footprint.pad_numbers
        .filter((number) => !connected.has(`${c.stable_id}.${number}`))
        .map((number) => `${c.ref}.${number}`),
    )
    .sort();
  if (
    sheets.length !== 8 ||
    components.length !== 95 ||
    JSON.stringify(unused) !== JSON.stringify(unusedPins)
  )
    throw new Error("Controller cleanup NC/source contract changed");
  const allPins: Pin[] = [];
  const seen = new Set<string>();
  for (const sheet of sheets) {
    if (sheet.noConnects.length)
      throw new Error("Controller cleanup requires an unmodified initial graph");
    for (const instance of sheet.symbols) {
      const ref = instance.properties.find((p) => p.key === "Reference")?.value;
      const component = components.find((c) => c.ref === ref);
      if (
        !ref ||
        !component ||
        seen.has(ref) ||
        !instance.at ||
        (instance.at.angle ?? 0) !== 0 ||
        instance.mirror
      )
        throw new Error("Controller cleanup symbol identity or orientation changed");
      seen.add(ref);
      const libraries =
        sheet.libSymbols?.symbols.filter((s) => s.libraryId === instance.libraryId) ??
        [];
      const library = libraries[0];
      if (
        !library ||
        libraries.some(
          (s) =>
            JSON.stringify(pins(s).map((p) => [p.numberString, p.at?.x, p.at?.y])) !==
            JSON.stringify(
              pins(library).map((p) => [p.numberString, p.at?.x, p.at?.y]),
            ),
        )
      )
        throw new Error(`${ref}: ambiguous initial pin geometry`);
      const physical = pins(library);
      if (
        JSON.stringify(physical.map((p) => p.numberString).sort()) !==
        JSON.stringify([...component.footprint.pad_numbers].sort())
      )
        throw new Error(`${ref}: initial physical pin map changed`);
      for (const pin of physical) {
        if (!pin.at) throw new Error(`${ref}: missing physical pin anchor`);
        allPins.push({
          sheet,
          ref,
          number: pin.numberString!,
          x: instance.at.x + pin.at.x,
          y: instance.at.y - pin.at.y,
        });
      }
    }
  }
  if (seen.size !== 95 || allPins.length !== 274)
    throw new Error("Controller cleanup requires all 274 physical symbol pins");
  const pin = (ref: string, number: string) =>
    allPins.find((p) => p.ref === ref && p.number === number)!;
  const markers = unusedPins.map((id) => {
    const [ref, number] = id.split(".");
    const p = pin(ref!, number!);
    if (
      !p ||
      p.sheet.wires.some((w) => onSegment(p, ...ends(w))) ||
      [...p.sheet.labels, ...p.sheet.globalLabels, ...p.sheet.junctions].some(
        (e) => e.at && same(p, e.at),
      ) ||
      allPins.some((q) => q !== p && q.sheet === p.sheet && same(p, q))
    )
      throw new Error(`${id}: source NC is touching electrical geometry`);
    return {
      sheet: p.sheet,
      marker: new NoConnect({ at: new At([p.x, p.y]), uuid: randomUUID() }),
    };
  });
  const sw = pin("U2", "5");
  const inductor = pin("L1", "1");
  const vbus = pin("J4", "A4");
  const vbus2 = pin("J4", "A9");
  const netAt = (p: Pin) =>
    connected.get(`${components.find((c) => c.ref === p.ref)!.stable_id}.${p.number}`);
  if (
    sw.sheet !== inductor.sheet ||
    netAt(sw) !== "BUCK_SW" ||
    netAt(inductor) !== "BUCK_SW" ||
    vbus.sheet !== vbus2.sheet ||
    netAt(vbus) !== "USB_VBUS" ||
    netAt(vbus2) !== "USB_VBUS" ||
    !same(vbus2, offset(vbus, 0, 15))
  )
    throw new Error("Controller overlap source net contract changed");
  const powerEnd = { x: inductor.x, y: sw.y };
  const midpoint = { x: (sw.x + inductor.x) / 2, y: sw.y };
  const powerT = offset(midpoint, 0.75, 0);
  const powerLabel = offset(powerT, -1.515, 1.5);
  if (
    sw.sheet.globalLabels.filter(
      (l) => l.value === "BUCK_SW" && l.at && same(l.at, powerLabel),
    ).length !== 1
  )
    throw new Error("Controller BUCK_SW branch label changed");
  const repairs = [
    overlapPlan(
      sw.sheet,
      allPins,
      sw,
      powerEnd,
      [midpoint, powerT],
      powerT,
      [
        [powerEnd, inductor],
        [powerT, offset(powerT, 0, 1.5)],
      ],
      ["U2.5"],
      [],
      2,
    ),
    overlapPlan(
      vbus.sheet,
      allPins,
      offset(vbus, -24.915, 0),
      vbus,
      [offset(vbus, -6, 0), offset(vbus, -24, 0)],
      offset(vbus, -24, 0),
      [[offset(vbus, -24.915, 0), offset(vbus, -24.915, 12)]],
      ["J4.A4"],
      [{ at: offset(vbus, -24, 0), value: "USB_VBUS" }],
      0,
    ),
  ];
  for (const repair of repairs) {
    repair.sheet.wires = repair.wires;
  }
  for (const { sheet, marker } of markers)
    sheet.noConnects = [...sheet.noConnects, marker];
  return { noConnects: markers.length, redundantWiresRemoved: 2, trunksSplit: 2 };
}
