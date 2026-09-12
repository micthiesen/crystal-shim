import {
  At,
  Junction,
  KicadSym,
  Pts,
  SymbolCircleCenter,
  SymbolPolyline,
  Xy,
  parseKicadSch,
  parseKicadSym,
  type KicadSch,
  type SchematicSymbol,
  type SymbolPin,
  type Wire,
} from "kicadts";
import { randomUUID } from "node:crypto";

type Point = { x: number; y: number };
type Position = Point & { angle?: number };
type Axis = ReturnType<typeof gridAxis>;
export type GridSheetReport = {
  uuid: string;
  pins: number;
  wires: number;
  xCoordinates: number;
  yCoordinates: number;
  maxShiftMm: Point;
  anchorWireChecks: number;
  addedBranchJunctions: number;
};
const GRID = 12700;
// KiCad 10.0.5 include/base_units.h: SCH_IU_PER_MM=10000, half away from zero.
// https://raw.githubusercontent.com/KiCad/kicad-source-mirror/10.0.5/include/base_units.h
// SHA256 eccd8253ca2512a6833b456160b60220ef0bc40ac360f8da68d74a5be3b23dc9.
// Convert the independently serialized origin and local pin before composing.
export function schematicNativeUnits(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 10000)
    throw new Error("Grid coordinate is non-finite or outside the initial page bound");
  return Math.trunc(value * 10000 + (value < 0 ? -0.5 : 0.5)) + 0;
}
const mm = (value: number) => Number((value / 10000).toFixed(4));
const point = (p: Point | undefined): Point => {
  if (!p) throw new Error("Grid input is missing a coordinate");
  return { x: schematicNativeUnits(p.x), y: schematicNativeUnits(p.y) };
};
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const bodies = (s: SchematicSymbol): SchematicSymbol[] => [
  s,
  ...s.subSymbols.flatMap(bodies),
];
const reference = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
function cardinal(angle: number | undefined) {
  if (angle !== undefined && ![0, 90, 180, 270].includes(angle))
    throw new Error("Grid transform requires cardinal angles");
  return angle ?? 0;
}
function pose(origin: Point, angle: number, p: Point): Point {
  const c = Math.round(Math.cos((angle * Math.PI) / 180));
  const s = Math.round(Math.sin((angle * Math.PI) / 180));
  return { x: origin.x + c * p.x - s * p.y, y: origin.y - s * p.x - c * p.y };
}
function local(origin: Point, angle: number, p: Point) {
  return pose({ x: 0, y: 0 }, angle, { x: p.x - origin.x, y: p.y - origin.y });
}
function movedAt(old: Position, next: Point) {
  // Junctions and NCs require (at x y), without an angle. KiCad can return
  // CLI success while discarding later wires after an invalid three-field at.
  return new At(
    old.angle === undefined
      ? [mm(next.x), mm(next.y)]
      : [mm(next.x), mm(next.y), old.angle],
  );
}
function gridAxis(values: number[]) {
  const keys = [...new Set(values)].sort((a, b) => a - b);
  const table = new Map<number, number>();
  let previous = -Infinity;
  for (const key of keys) {
    const index = Math.max(Math.round(key / GRID), previous + 1);
    table.set(key, index * GRID);
    previous = index;
  }
  const map = (value: number): number => {
    if (table.has(value)) return table.get(value)!;
    const index = keys.findIndex((key) => key > value);
    if (index === 0) return table.get(keys[0]!)! + value - keys[0]!;
    if (index < 0) return table.get(keys.at(-1)!)! + value - keys.at(-1)!;
    const a = keys[index - 1]!,
      b = keys[index]!;
    return Math.round(
      table.get(a)! + ((table.get(b)! - table.get(a)!) * (value - a)) / (b - a),
    );
  };
  return { keys, table, map };
}
function wireEnds(w: Wire): [Point, Point] {
  const points = w.points?.points;
  if (points?.length !== 2 || points.some((p) => !(p instanceof Xy)))
    throw new Error("Grid transform requires two-point wires");
  const a = point(points[0] as Xy),
    b = point(points[1] as Xy);
  if ((a.x !== b.x && a.y !== b.y) || (a.x === b.x && a.y === b.y))
    throw new Error("Grid transform rejects diagonal or zero-length wires");
  return [a, b];
}
function onSegment(p: Point, a: Point, b: Point) {
  return a.x === b.x
    ? p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
    : p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
}
// KiCad Save merges collinear wires. An initially connected overlapping stub
// can then become a T endpoint on a wire interior, which requires a dot. Add
// one only when all incident wires are already connected by shared endpoints,
// positive-length collinear overlap, or an existing explicit junction. Merely
// touching a wire interior or crossing it is not evidence of a connection.
function preserveConnectedBranches(sheet: KicadSch): number {
  const lines = sheet.wires.map(wireEnds);
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!;
    return i;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
  for (const [i, [a, b]] of lines.entries())
    for (let j = i + 1; j < lines.length; j++) {
      const [c, d] = lines[j]!;
      const sharedEnd = [a, b].some((p) => [c, d].some((q) => same(p, q)));
      const axis = a.x === b.x ? "y" : "x";
      const collinear =
        axis === "y" ? a.x === c.x && a.x === d.x : a.y === c.y && a.y === d.y;
      const overlap =
        collinear &&
        Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis])) <
          Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]));
      if (sharedEnd || overlap) union(i, j);
    }
  const incident = (p: Point) =>
    lines.flatMap(([a, b], i) => (onSegment(p, a, b) ? [i] : []));
  const existing = sheet.junctions.map((j) => point(j.at));
  for (const p of existing) {
    const ids = incident(p);
    for (const i of ids.slice(1)) union(ids[0]!, i);
  }
  const endpoints = new Map(lines.flat().map((p) => [`${p.x},${p.y}`, p]));
  const added: Junction[] = [];
  for (const p of endpoints.values()) {
    if (existing.some((q) => same(p, q))) continue;
    const ids = incident(p),
      rays = new Set<string>();
    for (const i of ids)
      for (const q of lines[i]!) {
        if (q.x < p.x) rays.add("W");
        if (q.x > p.x) rays.add("E");
        if (q.y < p.y) rays.add("N");
        if (q.y > p.y) rays.add("S");
      }
    if (rays.size < 3 || new Set(ids.map(find)).size !== 1) continue;
    added.push(new Junction({ at: [mm(p.x), mm(p.y)], uuid: randomUUID() }));
  }
  sheet.junctions = [...sheet.junctions, ...added];
  return added.length;
}
function cloneLibrary(symbol: SchematicSymbol) {
  return parseKicadSym(new KicadSym({ symbols: [symbol] }).getString()).symbols[0]!;
}
function validateSheet(sheet: KicadSch) {
  const allowed = new Set([
    "version",
    "generator",
    "generator_version",
    "uuid",
    "paper",
    "title_block",
    "lib_symbols",
    "sheet_instances",
    "embedded_fonts",
    "property",
    "sheet",
    "symbol",
    "text",
    "label",
    "global_label",
    "wire",
    "junction",
    "no_connect",
  ]);
  if (
    sheet.getChildren().some((c) => !allowed.has(c.token)) ||
    sheet.sheets.some((s) => s.getChildren().some((c) => c.token === "pin")) ||
    (sheet.sheets.length && (sheet.symbols.length || sheet.wires.length))
  )
    throw new Error("Unsupported initial schematic geometry or electrical hierarchy");
  for (const anchor of [...sheet.junctions, ...sheet.noConnects]) {
    if (!anchor.at || anchor.at.angle !== undefined)
      throw new Error("Junction and NC coordinates require two-field at syntax");
  }
  if (sheet.globalLabels.some((label) => label.properties.length))
    throw new Error("Unsupported global-label property positions");
  for (const lib of sheet.libSymbols?.symbols ?? []) {
    const base = lib.libraryId?.split(":").at(-1);
    if (
      lib.subSymbols.some(
        (body) =>
          ![`${base}_0_0`, `${base}_0_1`, `${base}_1_0`, `${base}_1_1`].includes(
            body.libraryId ?? "",
          ) || body.subSymbols.length,
      )
    )
      throw new Error("Grid transform requires a single active symbol unit");
    for (const body of bodies(lib)) {
      if (body.rectangles.length || body.arcs.length || body.textBoxes.length)
        throw new Error("Unsupported symbol display geometry");
      for (const circle of body.circles) {
        if (
          circle.getChildren().filter((c) => c instanceof SymbolCircleCenter).length !==
          1
        )
          throw new Error("Unsupported symbol circle centre");
      }
    }
  }
}
function mapPolyline(
  line: SymbolPolyline,
  oldOrigin: Point,
  nextOrigin: Point,
  angle: number,
  x: Axis,
  y: Axis,
) {
  const points = line.points?.points;
  if (!points || points.length < 2 || points.some((p) => !(p instanceof Xy)))
    throw new Error("Unsupported symbol polyline");
  const world = points.map((p) => pose(oldOrigin, angle, point(p as Xy)));
  const out: Point[] = [];
  for (let index = 0; index < world.length - 1; index++) {
    const a = world[index]!,
      b = world[index + 1]!;
    const cuts = [0, 1];
    for (const [axis, keys] of [
      ["x", x.keys],
      ["y", y.keys],
    ] as const) {
      const delta = b[axis] - a[axis];
      if (delta)
        for (const key of keys) {
          const t = (key - a[axis]) / delta;
          if (t > 0 && t < 1) cuts.push(t);
        }
    }
    for (const t of [...new Set(cuts)].sort((a, b) => a - b)) {
      const p = local(nextOrigin, angle, {
        x: x.map(Math.round(a.x + t * (b.x - a.x))),
        y: y.map(Math.round(a.y + t * (b.y - a.y))),
      });
      if (out.at(-1)?.x !== p.x || out.at(-1)?.y !== p.y) out.push(p);
    }
  }
  line.points = new Pts(out.map((p) => new Xy(mm(p.x), mm(p.y))));
}

// The exported L1's sampled graphic only approximately touches its pins. A
// strict map exposes that former sub-0.05 mm drawing mismatch. Rebuild this
// explicitly selected passive inductor's four lobes and joined display tails;
// electrical pin endpoints, directions, lengths, names and types are untouched.
function joinInductorDisplay(lib: SchematicSymbol) {
  const pp = pins(lib);
  const graphics = bodies(lib).filter((s) => s.polylines.length);
  if (
    pp.length !== 2 ||
    pp[0]?.numberString !== "1" ||
    pp[1]?.numberString !== "2" ||
    pp.some((p) => p.pinElectricalType !== "passive" || !p.at || !p.length) ||
    pp[0].at!.angle !== 0 ||
    pp[1].at!.angle !== 180 ||
    graphics.length !== 1 ||
    graphics[0]!.polylines.length !== 6 ||
    bodies(lib).some((s) => s.circles.length || s.texts.length)
  )
    throw new Error("Selected inductor display contract changed");
  const left = point(pp[0].at),
    right = point(pp[1].at);
  left.x += schematicNativeUnits(pp[0].length!);
  right.x -= schematicNativeUnits(pp[1].length!);
  const span = right.x - left.x;
  if (span <= 0) throw new Error("Inductor display pin order changed");
  const base = Math.round((left.y + right.y) / 2);
  const a = left.x + Math.round(span / 8),
    b = right.x - Math.round(span / 8);
  const radius = (b - a) / 8;
  const template = graphics[0]!.polylines[0]!;
  const make = (points: Point[]) =>
    new SymbolPolyline({
      points: new Pts(points.map((p) => new Xy(mm(p.x), mm(p.y)))),
      stroke: template.stroke,
      fill: template.fill,
    });
  const lobes = Array.from({ length: 4 }, (_, lobe) =>
    make(
      Array.from({ length: 81 }, (_, index) => {
        const t = (Math.PI * index) / 80;
        return {
          x: Math.round(a + radius * (2 * lobe + 1 - Math.cos(t))),
          y: Math.round(base + radius * Math.sin(t)),
        };
      }),
    ),
  );
  graphics[0]!.polylines = [
    ...lobes,
    make([left, { x: a, y: left.y }, { x: a, y: base }]),
    make([right, { x: b, y: right.y }, { x: b, y: base }]),
  ];
}

// Pure, initial-export-only transform. Caller graphs never change, including
// on failure. Native files are neither read nor written here. Every non-power
// library must be instance-specific; shared zero-length power glyphs stay rigid.
export function gridInitialSchematics(
  input: readonly KicadSch[],
  options: {
    joinedInductorLibraryId?: string;
  } = {},
) {
  for (const sheet of input) validateSheet(sheet);
  const sheets = input.map((sheet) => parseKicadSch(sheet.getString()));
  const report: GridSheetReport[] = [];
  const references = new Set<string>();
  const usedLibraries = new Set<string>();
  const repaired = new Set<string>();
  for (const sheet of sheets) {
    validateSheet(sheet);
    const libs = sheet.libSymbols?.symbols ?? [];
    if (new Set(libs.map((l) => l.libraryId)).size !== libs.length)
      throw new Error("Ambiguous grid symbol cache");
    const infos = sheet.symbols.map((instance) => {
      const ref = reference(instance),
        lib = libs.find((l) => l.libraryId === instance.libraryId);
      if (
        !ref ||
        references.has(ref) ||
        !lib ||
        instance.mirror ||
        !instance.at ||
        instance.unit !== 1 ||
        instance.bodyStyle !== undefined ||
        !lib.libraryId
      )
        throw new Error("Unsupported grid symbol identity or pose");
      references.add(ref);
      const pp = pins(lib);
      if (!pp.length || new Set(pp.map((p) => p.numberString)).size !== pp.length)
        throw new Error("Ambiguous grid pin set");
      for (const pin of pp) {
        cardinal(pin.at?.angle);
        point(pin.at);
        if (
          !pin.numberString ||
          pin.length === undefined ||
          schematicNativeUnits(pin.length) < 0 ||
          pin.hidden ||
          pin.alternates.length
        )
          throw new Error("Unsupported grid pin geometry");
      }
      const rigid =
        !!lib._sxPower &&
        pp.length === 1 &&
        pp[0]!.length === 0 &&
        point(pp[0]!.at).x === 0 &&
        point(pp[0]!.at).y === 0;
      if (
        !rigid &&
        (usedLibraries.has(lib.libraryId) || pp.some((p) => p.length === 0))
      )
        throw new Error("Shared or zero-length non-power grid symbol");
      usedLibraries.add(lib.libraryId);
      return {
        instance,
        lib,
        pp,
        rigid,
        origin: point(instance.at),
        angle: cardinal(instance.at.angle),
      };
    });
    if (libs.some((l) => !infos.some((i) => i.lib === l)))
      throw new Error("Unused grid cache definition");
    const anchors = [
      ...sheet.labels,
      ...sheet.globalLabels,
      ...sheet.junctions,
      ...sheet.noConnects,
    ];
    const pinPoints = infos.flatMap((i) =>
      i.pp.map((p) => pose(i.origin, i.angle, point(p.at))),
    );
    const electrical = [...anchors.map((a) => point(a.at)), ...pinPoints];
    const wires = sheet.wires.map((wire) => ({ wire, ends: wireEnds(wire) }));
    const all = [
      ...electrical,
      ...infos.map((i) => i.origin),
      ...wires.flatMap((w) => w.ends),
    ];
    if (!all.length) continue;
    const x = gridAxis(all.map((p) => p.x)),
      y = gridAxis(all.map((p) => p.y));
    const map = (p: Point): Point => ({ x: x.map(p.x), y: y.map(p.y) });
    for (const anchor of electrical)
      for (const {
        ends: [a, b],
      } of wires)
        if (onSegment(anchor, a, b) !== onSegment(map(anchor), map(a), map(b)))
          throw new Error("Grid transform changed electrical anchor membership");
    for (const i of infos) {
      const nextOrigin = map(i.origin);
      const moveLocal = (p: Point) =>
        local(nextOrigin, i.angle, map(pose(i.origin, i.angle, point(p))));
      if (!i.rigid) {
        for (const pin of i.pp) {
          const before = point(pin.at),
            length = schematicNativeUnits(pin.length!);
          const a = (cardinal(pin.at!.angle) * Math.PI) / 180;
          const body = {
            x: before.x + Math.round(Math.cos(a)) * length,
            y: before.y + Math.round(Math.sin(a)) * length,
          };
          const endpoint = local(
            nextOrigin,
            i.angle,
            map(pose(i.origin, i.angle, before)),
          );
          const tail = local(nextOrigin, i.angle, map(pose(i.origin, i.angle, body)));
          pin.at = movedAt(pin.at!, endpoint);
          pin.length = mm(
            Math.abs(tail.x - endpoint.x) + Math.abs(tail.y - endpoint.y),
          );
          if (pin.length <= 0) throw new Error("Grid transform collapsed a pin stub");
        }
        for (const body of bodies(i.lib)) {
          for (const line of body.polylines)
            mapPolyline(line, i.origin, nextOrigin, i.angle, x, y);
          for (const circle of body.circles) {
            const centre = circle
              .getChildren()
              .find((c): c is SymbolCircleCenter => c instanceof SymbolCircleCenter)!;
            const p = moveLocal(centre);
            centre.x = mm(p.x);
            centre.y = mm(p.y);
            // A display circle remains circular with its original radius.
          }
          for (const text of body.texts)
            text.at = movedAt(text.at!, moveLocal(text.at!));
          for (const property of body.properties)
            if (property.at) property.at = movedAt(property.at, moveLocal(property.at));
        }
        if (i.lib.libraryId === options.joinedInductorLibraryId) {
          joinInductorDisplay(i.lib);
          repaired.add(i.lib.libraryId!);
        }
      }
      for (const property of i.instance.properties)
        if (property.at) property.at = movedAt(property.at, map(point(property.at)));
      i.instance.at = movedAt(i.instance.at!, nextOrigin);
    }
    for (const {
      wire,
      ends: [a, b],
    } of wires) {
      const p = map(a),
        q = map(b);
      wire.points = new Pts([new Xy(mm(p.x), mm(p.y)), new Xy(mm(q.x), mm(q.y))]);
    }
    for (const anchor of anchors)
      anchor.at = movedAt(anchor.at!, map(point(anchor.at)));
    for (const text of sheet.texts) text.at = movedAt(text.at!, map(point(text.at)));
    report.push({
      uuid: sheet.uuid?.value ?? "",
      pins: pinPoints.length,
      wires: wires.length,
      xCoordinates: x.keys.length,
      yCoordinates: y.keys.length,
      maxShiftMm: {
        x: mm(Math.max(...all.map((p) => Math.abs(map(p).x - p.x)))),
        y: mm(Math.max(...all.map((p) => Math.abs(map(p).y - p.y)))),
      },
      anchorWireChecks: electrical.length * wires.length,
      addedBranchJunctions: preserveConnectedBranches(sheet),
    });
  }
  if (options.joinedInductorLibraryId && !repaired.has(options.joinedInductorLibraryId))
    throw new Error("Selected inductor display was not found");
  const library = new Map<string, SchematicSymbol>();
  for (const sheet of sheets)
    for (const lib of sheet.libSymbols?.symbols ?? []) {
      const copy = cloneLibrary(lib),
        id = lib.libraryId;
      if (!id || id.split(":").length !== 2)
        throw new Error("Grid library needs a project nickname");
      copy.libraryId = id.split(":")[1]!;
      const prior = library.get(id);
      if (prior && prior.getString() !== copy.getString())
        throw new Error("Shared grid library drift");
      library.set(id, copy);
    }
  return { sheets, library: [...library.values()], report };
}
