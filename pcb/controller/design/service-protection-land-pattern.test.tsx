import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, PadPrimitiveGrPoly, Xy, parseKicadPcb, type KicadPcb } from "kicadts";
import { BidirectionalSupplyTvs, ServiceEfuse } from "./service-protection-components";
import { anchorServiceEfuseForInitialExport } from "./service-protection-initial-export";
import { tps259470a } from "./service-protection-land-patterns";

type Point = { x: number; y: number };

function area(points: Point[]) {
  return Math.abs(
    points.reduce((sum, a, index) => {
      const b = points[(index + 1) % points.length]!;
      return sum + a.x * b.y - b.x * a.y;
    }, 0) / 2,
  );
}

function contains(points: Point[], point: Point) {
  let inside = false;
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

test("TPS259470A RPW has ten functional lands, long IN/OUT and single concave corner pads", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={40} height={30} routingDisabled>
      <ServiceEfuse name="U_SERVICE" pcbX={-6} pcbY={3} schX={-7} />
      <ServiceEfuse name="U_ROTATED" pcbX={6} pcbY={3} pcbRotation={90} schX={7} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((entry) => entry.type === "source_component");
  const ports = json.filter((entry) => entry.type === "source_port");
  const pcbPorts = json.filter((entry) => entry.type === "pcb_port");
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  expect(components).toHaveLength(2);
  expect(pads).toHaveLength(20);
  expect(pcbPorts).toHaveLength(20);

  // Independent transcription of Rev C p5 and RPW0010A copper drawing.
  const functions = [
    "EN_UVLO",
    "OVLO",
    "AUXOFF",
    "FLT_N",
    "IN",
    "OUT",
    "DVDT",
    "GND",
    "ILM",
    "ITIMER",
  ];
  const rectangularLands = [
    [2, -0.9, -0.225, 0.6, 0.25],
    [3, -0.9, 0.225, 0.6, 0.25],
    [5, -0.25, 0, 0.3, 2.4],
    [6, 0.25, 0, 0.3, 2.4],
    [8, 0.9, 0.225, 0.6, 0.25],
    [9, 0.9, -0.225, 0.6, 0.25],
  ] as const;

  for (const [name, centreX, rotation] of [
    ["U_SERVICE", -6, 0],
    ["U_ROTATED", 6, 90],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    expect(component?.manufacturer_part_number).toBe("TPS259470ARPWR");
    expect(component?.internally_connected_source_port_ids ?? []).toEqual([]);
    const partPorts = ports.filter(
      (entry) => entry.source_component_id === component?.source_component_id,
    );
    expect(partPorts).toHaveLength(10);
    const partPads = new Map(
      partPorts.map((source) => {
        expect(source.name).toBe(functions[source.pin_number! - 1]);
        const physical = pcbPorts.find(
          (entry) => entry.source_port_id === source.source_port_id,
        );
        const matches = pads.filter(
          (entry) => entry.pcb_port_id === physical?.pcb_port_id,
        );
        expect(matches).toHaveLength(1);
        return [source.pin_number, matches[0]!] as const;
      }),
    );

    for (const [number, x, y, width, height] of rectangularLands) {
      const pad = partPads.get(number);
      if (pad?.shape !== "rect") throw new Error(`Missing ${name} rectangle ${number}`);
      expect(pad.x).toBeCloseTo(centreX + (rotation === 0 ? x : y), 6);
      expect(pad.y).toBeCloseTo(3 + (rotation === 0 ? -y : x), 6);
      expect(pad.width).toBeCloseTo(rotation === 0 ? width : height, 6);
      expect(pad.height).toBeCloseTo(rotation === 0 ? height : width, 6);
      expect(pad.corner_radius).toBeCloseTo(0.05, 6);
    }

    for (const [number, mirrorX, mirrorY] of [
      [1, 1, 1],
      [4, 1, -1],
      [7, -1, -1],
      [10, -1, 1],
    ] as const) {
      const pad = partPads.get(number);
      if (pad?.shape !== "polygon")
        throw new Error(`Missing ${name} polygon ${number}`);
      // Undo placement and rotation, return to native +Y down, then reflect
      // every corner onto pin 1 for independent bounds/shape measurements.
      const points = pad.points.map(({ x, y }) => ({
        x: (rotation === 0 ? x - centreX : y - 3) * mirrorX,
        y: (rotation === 0 ? 3 - y : x - centreX) * mirrorY,
      }));
      expect(Math.min(...points.map((point) => point.x))).toBeCloseTo(-1.2, 6);
      expect(Math.max(...points.map((point) => point.x))).toBeCloseTo(-0.6, 6);
      expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-1.2, 6);
      expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(-0.55, 6);
      expect(contains(points, { x: -0.9, y: -0.7 })).toBe(true);
      expect(contains(points, { x: -0.725, y: -1.1 })).toBe(true);
      expect(contains(points, { x: -1.05, y: -1.05 })).toBe(false);
      // The near-corner point is outside an R0.05 fillet but inside a sharp box.
      expect(contains(points, { x: -0.601, y: -0.551 })).toBe(false);
      const exactRoundedArea =
        0.6 * 0.3 + 0.25 * 0.65 - 0.25 * 0.3 - 5 * 0.05 ** 2 * (1 - Math.PI / 4);
      expect(Math.abs(area(points) - exactRoundedArea)).toBeLessThan(0.00002);
    }
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});

test("SMBJ8.0CA compiles as a nonpolar two-terminal clamp with Littelfuse limit-based lands", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={40} height={30} routingDisabled>
      <BidirectionalSupplyTvs name="D_INPUT" pcbX={-7} pcbY={2} schX={-7} />
      <BidirectionalSupplyTvs
        name="D_ROTATED"
        pcbX={7}
        pcbY={2}
        pcbRotation={90}
        schX={7}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((entry) => entry.type === "source_component");
  const ports = json.filter((entry) => entry.type === "source_port");
  const pcbPorts = json.filter((entry) => entry.type === "pcb_port");
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  expect(pads).toHaveLength(4);
  for (const [name, centreX, rotation] of [
    ["D_INPUT", -7, 0],
    ["D_ROTATED", 7, 90],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    expect(component?.manufacturer_part_number).toBe("SMBJ8.0CA");
    expect(component?.internally_connected_source_port_ids ?? []).toEqual([]);
    const partPorts = ports.filter(
      (entry) => entry.source_component_id === component?.source_component_id,
    );
    expect(partPorts).toHaveLength(2);
    for (const [number, x] of [
      [1, -2.45],
      [2, 2.45],
    ] as const) {
      const source = partPorts.find((entry) => entry.pin_number === number);
      expect(source?.name).toBe(`TERMINAL_${number}`);
      const physical = pcbPorts.find(
        (entry) => entry.source_port_id === source?.source_port_id,
      );
      const matches = pads.filter(
        (entry) => entry.pcb_port_id === physical?.pcb_port_id,
      );
      expect(matches).toHaveLength(1);
      const pad = matches[0];
      if (pad?.shape !== "rect") throw new Error(`Missing ${name} pad ${number}`);
      expect(pad.x).toBeCloseTo(centreX + (rotation === 0 ? x : 0), 6);
      expect(pad.y).toBeCloseTo(2 + (rotation === 0 ? 0 : x), 6);
      expect(pad.width).toBeCloseTo(rotation === 0 ? 2.16 : 2.26, 6);
      expect(pad.height).toBeCloseTo(rotation === 0 ? 2.26 : 2.16, 6);
      expect(pad.corner_radius ?? 0).toBe(0);
    }
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});

const exportRefs = ["U0", "U90", "U180", "U270"] as const;

async function exportFixture() {
  const circuit = new Circuit();
  circuit.add(
    <board width={40} height={40} routingDisabled>
      {exportRefs.map((name, index) => (
        <ServiceEfuse
          key={name}
          name={name}
          pcbX={index * 7 - 11}
          pcbY={3}
          pcbRotation={index * 90}
          schX={index * 8 - 12}
          connections={{
            EN_UVLO: "net.ENABLE",
            OVLO: "net.OVLO",
            AUXOFF: "net.AUXOFF",
            FLT_N: "net.FAULT",
            IN: "net.INPUT",
            OUT: "net.OUTPUT",
            DVDT: "net.SLEW",
            GND: "net.GND",
            ILM: "net.LIMIT",
            ITIMER: "net.TIMER",
          }}
        />
      ))}
      <BidirectionalSupplyTvs name="D_OTHER" pcbY={-8} schY={-8} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  return converter.getOutput();
}

// Snapshot all serialized object attributes, omitting ONLY coordinates that this
// adapter may change. Private serialization keys here are pinned-converter test
// evidence, never a production mutation API or a native-file text transformation.
function unrelatedGraph(board: KicadPcb) {
  const snapshot = JSON.parse(JSON.stringify(board)) as {
    _footprints: {
      _properties: { _key: string; _value: string }[];
      _fpPads: {
        _number: string;
        _sxAt: { x?: number; y?: number };
        _sxPrimitives?: {
          _graphics: { _contours: { points: { x?: number; y?: number }[] }[] }[];
        };
      }[];
    }[];
  };
  for (const fp of snapshot._footprints) {
    if (
      !fp._properties.some(
        (p) =>
          p._key === "Reference" &&
          exportRefs.includes(p._value as (typeof exportRefs)[number]),
      )
    )
      continue;
    for (const pad of fp._fpPads.filter((p) =>
      ["1", "4", "7", "10"].includes(p._number),
    )) {
      delete pad._sxAt.x;
      delete pad._sxAt.y;
      for (const point of pad._sxPrimitives!._graphics[0]!._contours[0]!.points) {
        delete point.x;
        delete point.y;
      }
    }
  }
  return snapshot;
}

function nativeRotate(point: Point, angle: number): Point {
  const radians = (angle * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) + point.y * Math.sin(radians),
    y: -point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

test("initial eFuse export anchors preserve complete world polygons, nets and unrelated graph at four rotations", async () => {
  const board = await exportFixture();
  const before = unrelatedGraph(board);
  const beforePolygons = new Map<string, Point[]>();
  for (const fp of board.footprints) {
    const ref = fp.properties.find((p) => p.key === "Reference")?.value;
    if (!exportRefs.includes(ref as (typeof exportRefs)[number])) continue;
    const fpAt = fp.position;
    if (!(fpAt instanceof At)) throw new Error("Missing placement");
    for (const pad of fp.fpPads.filter((p) => p.shape === "custom")) {
      const polygon = pad.primitives?.graphics[0];
      if (!(polygon instanceof PadPrimitiveGrPoly)) throw new Error("Missing polygon");
      const anchor = nativeRotate(pad.at!, fpAt.angle ?? 0);
      beforePolygons.set(
        `${ref}.${pad.number}`,
        polygon.contours[0]!.points.map((point) => {
          if (!(point instanceof Xy)) throw new Error("Unexpected arc");
          return { x: fpAt.x + anchor.x + point.x, y: fpAt.y + anchor.y + point.y };
        }),
      );
    }
  }
  anchorServiceEfuseForInitialExport(board, exportRefs);
  expect(unrelatedGraph(board)).toEqual(before);
  for (const fp of board.footprints) {
    const ref = fp.properties.find((p) => p.key === "Reference")?.value;
    if (!exportRefs.includes(ref as (typeof exportRefs)[number])) continue;
    const fpAt = fp.position;
    if (!(fpAt instanceof At)) throw new Error("Missing placement");
    for (const pad of fp.fpPads.filter((p) => p.shape === "custom")) {
      const land = tps259470a.pads.find((p) => p.number === pad.number);
      const polygon = pad.primitives?.graphics[0];
      if (land?.shape !== "polygon" || !(polygon instanceof PadPrimitiveGrPoly))
        throw new Error("Missing polygon");
      const localAnchor = pad.at!;
      const expectedAnchor = {
        x: ["1", "4"].includes(pad.number) ? -0.9 : 0.9,
        y: ["1", "10"].includes(pad.number) ? -0.7 : 0.7,
      };
      expect(localAnchor.x).toBeCloseTo(expectedAnchor.x, 7);
      expect(localAnchor.y).toBeCloseTo(expectedAnchor.y, 7);
      expect(pad.net?.name).toBeDefined();
      const anchorOffset = nativeRotate(localAnchor, fpAt.angle ?? 0);
      const points = polygon.contours[0]!.points.map((point) => {
        if (!(point instanceof Xy)) throw new Error("Unexpected arc");
        return {
          x: fpAt.x + anchorOffset.x + point.x,
          y: fpAt.y + anchorOffset.y + point.y,
        };
      });
      const oldPoints = beforePolygons.get(`${ref}.${pad.number}`)!;
      const expected = land.points.map((point) => {
        const offset = nativeRotate(point, fpAt.angle ?? 0);
        return { x: fpAt.x + offset.x, y: fpAt.y + offset.y };
      });
      // Every ordered vertex, not just the bounds, must retain its world position.
      expect(
        points.every(
          (p, i) => Math.hypot(p.x - oldPoints[i]!.x, p.y - oldPoints[i]!.y) < 1e-10,
        ),
      ).toBe(true);
      expect(
        points.every(
          (p, i) => Math.hypot(p.x - expected[i]!.x, p.y - expected[i]!.y) < 1e-10,
        ),
      ).toBe(true);
      // Centre is inside and the complete diameter-0.2 circle lies inside the L:
      // check its analytic .1 radius against every polygon boundary segment.
      expect(contains(land.points, localAnchor)).toBe(true);
      const distances = land.points.map((a, i) => {
        const b = land.points[(i + 1) % land.points.length]!;
        const dx = b.x - a.x,
          dy = b.y - a.y;
        const t = Math.max(
          0,
          Math.min(
            1,
            ((localAnchor.x - a.x) * dx + (localAnchor.y - a.y) * dy) /
              (dx * dx + dy * dy),
          ),
        );
        return Math.hypot(localAnchor.x - a.x - t * dx, localAnchor.y - a.y - t * dy);
      });
      expect(Math.min(...distances)).toBeGreaterThan(0.149999);
    }
  }
  const corrected = board.getString();
  const readback = parseKicadPcb(corrected);
  for (const ref of exportRefs) {
    const fp = readback.footprints.find((footprint) =>
      footprint.properties.some((p) => p.key === "Reference" && p.value === ref),
    )!;
    const placement = fp.position;
    if (!(placement instanceof At)) throw new Error("Missing native placement");
    const body = fp.fpLines.filter((line) => line.layer?.names.includes("F.Fab"));
    const courts = fp.fpPolys.filter((poly) => poly.layer?.names.includes("F.CrtYd"));
    expect(body).toHaveLength(4);
    expect(courts).toHaveLength(1);
    expect(courts[0]!.points!.points).toHaveLength(5);
    for (const [vertices, half] of [
      [body.map((line) => line.start!), 1],
      [courts[0]!.points!.points.slice(0, 4), 1.7],
    ] as const) {
      for (const [index, [x, y]] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].entries()) {
        const vertex = vertices[index]!;
        if (!("x" in vertex && "y" in vertex)) throw new Error("Unexpected arc");
        const actual = nativeRotate(vertex, placement.angle ?? 0);
        const expected = nativeRotate(
          { x: x! * half, y: y! * half },
          placement.angle ?? 0,
        );
        expect(actual.x).toBeCloseTo(expected.x, 7);
        expect(actual.y).toBeCloseTo(expected.y, 7);
      }
    }
    expect(fp.fpPads).toHaveLength(10);
    for (const pad of fp.fpPads) expect(pad.solderMaskMargin).toBe(0.05);
  }
  expect(() => anchorServiceEfuseForInitialExport(board, exportRefs)).toThrow(
    "anchor changed",
  );
  expect(board.getString()).toBe(corrected);
});

test("initial eFuse export validates the whole batch before any mutation", async () => {
  const board = await exportFixture();
  const baseline = board.getString();
  expect(() => anchorServiceEfuseForInitialExport(board, ["U0", "U0"])).toThrow(
    "Duplicate",
  );
  expect(() => anchorServiceEfuseForInitialExport(board, ["U0", "MISSING"])).toThrow(
    "mismatched",
  );
  expect(board.getString()).toBe(baseline);
  const late = board.footprints.find((fp) =>
    fp.properties.some((p) => p.key === "Reference" && p.value === "U270"),
  )!;
  const last = late.fpPads.find((pad) => pad.number === "10")!;
  last.number = "11";
  const renumbered = board.getString();
  expect(() => anchorServiceEfuseForInitialExport(board, exportRefs)).toThrow(
    "multiset",
  );
  expect(board.getString()).toBe(renumbered);
  last.number = "10";
  const polygon = last.primitives?.graphics[0];
  if (!(polygon instanceof PadPrimitiveGrPoly)) throw new Error("Missing polygon");
  const point = polygon.contours[0]!.points[0];
  if (!(point instanceof Xy)) throw new Error("Missing point");
  point.x += 0.01;
  const distorted = board.getString();
  expect(() => anchorServiceEfuseForInitialExport(board, exportRefs)).toThrow(
    "copper changed",
  );
  expect(board.getString()).toBe(distorted);
});
