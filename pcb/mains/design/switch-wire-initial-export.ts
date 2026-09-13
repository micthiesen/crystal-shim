import { randomUUID } from "node:crypto";
import { KicadSch, Pts, Wire, Xy } from "kicadts";

// Only fresh, gridded converter graphs. Repair the audited AP63205 SW label
// overlap without changing the geometric union or touching any other wiring.
export function repairMainsSwitchWire(sheets: readonly KicadSch[]) {
  const selected = sheets.filter((s) =>
    s.symbols.some((c) =>
      c.properties.some((p) => p.key === "Reference" && p.value === "U2"),
    ),
  );
  if (selected.length !== 1) throw new Error("Mains switch sheet changed");
  const sheet = selected[0]!;
  type Point = { x: number; y: number };
  const same = (a: Point, b: Point) =>
    Math.abs(a.x - b.x) < 1e-7 && Math.abs(a.y - b.y) < 1e-7;
  const a = { x: 332.74, y: 254 },
    b = { x: 429.26, y: 254 },
    split = { x: 382.27, y: 254 };
  const on = (p: Point) =>
    Math.abs(p.y - 254) < 1e-7 && p.x >= a.x - 1e-7 && p.x <= b.x + 1e-7;
  const exact = (p: Point, q: Point) => {
    const result = sheet.wires.filter((w) => {
      const ps = w.points?.points as Xy[];
      return (
        ps?.length === 2 &&
        ((same(ps[0]!, p) && same(ps[1]!, q)) || (same(ps[1]!, p) && same(ps[0]!, q)))
      );
    });
    if (result.length !== 1) throw new Error("Mains audited SW wire motif changed");
    return result[0]!;
  };
  const trunk = exact(a, b),
    overlap = exact({ x: 381, y: 254 }, split);
  const branches = [
    exact(b, { x: 429.26, y: 252.73 }),
    exact(split, { x: 382.27, y: 256.54 }),
    exact({ x: 382.27, y: 256.54 }, { x: 379.73, y: 256.54 }),
  ];
  const allowed = new Set([trunk, overlap, ...branches]);
  if (
    sheet.wires.some((w) => {
      const points = w.points?.points as Xy[] | undefined;
      if (!points) throw new Error("Mains wire points are missing");
      return !allowed.has(w) && points.some(on);
    })
  )
    throw new Error("Unexpected SW trunk contact");
  const labels = [...sheet.labels, ...sheet.globalLabels].filter(
    (l) =>
      l.value === "BUCK5_SW" &&
      l.at &&
      Math.abs(l.at.x - 379.73) < 5 &&
      Math.abs(l.at.y - 256.54) < 5,
  );
  if (
    labels.length !== 1 ||
    !labels[0]!.at ||
    !same(labels[0]!.at, { x: 379.73, y: 256.54 })
  )
    throw new Error("SW label anchor changed");
  const junctions = sheet.junctions.filter((j) => j.at && on(j.at));
  if (junctions.length !== 2 || junctions.some((j) => !same(j.at!, split)))
    throw new Error("SW junction motif changed");
  if (trunk.stroke?.getString() !== overlap.stroke?.getString())
    throw new Error("SW wire styles differ");
  sheet.wires = sheet.wires.flatMap((w) =>
    w === overlap
      ? []
      : w === trunk
        ? [
            new Wire({
              points: new Pts([new Xy(a.x, a.y), new Xy(split.x, split.y)]),
              stroke: trunk.stroke,
              uuid: trunk.uuid,
            }),
            new Wire({
              points: new Pts([new Xy(split.x, split.y), new Xy(b.x, b.y)]),
              stroke: trunk.stroke,
              uuid: randomUUID(),
            }),
          ]
        : [w],
  );
  return { overlapsRemoved: 1, trunksSplit: 1 };
}
