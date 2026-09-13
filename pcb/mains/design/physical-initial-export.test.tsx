import { beforeAll, expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, Layer, PadNet, Property, parseKicadPcb, type KicadPcb } from "kicadts";
import { PsuHeader, ServiceHeader } from "../../controller/design/micro-fit-components";
import MainsCircuit from "./mains.circuit";
import { MainsHeader } from "./mains-headers";
import { IsolatedSupply, PumpRelay, BranchFuse } from "./power-components";
import {
  CoilFlyback,
  SnubberCapacitor,
  SnubberResistor,
} from "./suppression-components";
import { ThermallyProtectedMov } from "./mov-component";
import { prepareMainsFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { applyMainsPhysicalForInitialExport } from "./physical-initial-export";

const refs = ["J1", "J2", "J3", "J4", "U1", "K1", "RV1", "D1", "R1", "C1", "F3"];
function footprint(board: KicadPcb, ref: string) {
  const fp = board.footprints.find((f) =>
    f.properties.some((p) => p.key === "Reference" && p.value === ref),
  );
  if (!fp) throw new Error(`Missing ${ref}`);
  return fp;
}

function convert(json: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  const board = converter.getOutput();
  // Explicit input precondition: the orchestration binds source-validated MPNs
  // because native passive Values contain only resistance/capacitance.
  for (const [ref, part] of [
    ["R1", "PR02FS0201000KA100"],
    ["C1", "B32921C3473K000"],
  ] as const) {
    const fp = footprint(board, ref);
    fp.properties = [...fp.properties, new Property({ key: "MPN", value: part })];
  }
  return board;
}

let completeSource: CircuitJson;
beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  completeSource = prepareMainsFootprintOriginsForInitialExport(
    circuit.getCircuitJson(),
  );
});

function verifyMaskOnly(board: KicadPcb) {
  const expected = parseKicadPcb(board.getString());
  let changed = 0;
  for (const ref of refs) {
    for (const pad of footprint(expected, ref).fpPads) {
      expect(pad.solderMaskMargin).toBeUndefined();
      pad.solderMaskMargin = 0.05;
      changed++;
    }
  }
  expect(changed).toBe(48);
  applyMainsPhysicalForInitialExport(board);
  // Whitelist only the 48 margins. This checks all UUIDs, nets, pad centres,
  // angles, sizes, drills, layers, shapes, outlines and unrelated graph state.
  expect(board.getString()).toBe(expected.getString());
  applyMainsPhysicalForInitialExport(board);
  expect(board.getString()).toBe(expected.getString());
}

test("complete mains conversion restores exactly 48 PTH masks and preserves every other native field", () => {
  const sourceSnapshot = JSON.stringify(completeSource);
  const board = convert(completeSource);
  expect(board.footprints).toHaveLength(26);
  const pads = board.footprints.flatMap((fp) => fp.fpPads);
  expect(pads.filter((pad) => pad.number)).toHaveLength(75);
  expect(pads.filter((pad) => pad.padType === "thru_hole")).toHaveLength(53);
  expect(pads.filter((pad) => pad.padType === "np_thru_hole")).toHaveLength(6);
  verifyMaskOnly(board);
  expect(JSON.stringify(completeSource)).toBe(sourceSnapshot);
  expect(completeSource.filter((e) => e.type === "pcb_solder_paste")).toHaveLength(118);
  for (const pad of pads.filter((p) => p.padType !== "smd"))
    expect(pad.layers?.layers.some((layer) => layer.endsWith(".Paste"))).toBe(false);
  expect(
    footprint(board, "J5").fpPads.every((p) => p.solderMaskMargin === undefined),
  ).toBe(true);
  for (const ref of ["U1", "K1", "D1"])
    expect(footprint(board, ref).fpPads.find((p) => p.number === "1")!.shape).toBe(
      "rect",
    );
  const unusedTails = ["J2", "J3", "J4"].flatMap((ref) =>
    footprint(board, ref).fpPads.filter((pad) => Number(pad.number) > 2),
  );
  expect(unusedTails).toHaveLength(14);
  expect(unusedTails.every((pad) => pad.net === undefined)).toBe(true);
  const mov = footprint(board, "RV1");
  expect(mov.fpLines.filter((line) => line.layer?.names.includes("F.Fab"))).toEqual([]);
  expect(mov.fpPolys.filter((poly) => poly.layer?.names.includes("F.Fab"))).toEqual([]);
  const courtyard = mov.fpPolys.find((poly) => poly.layer?.names.includes("F.CrtYd"))!;
  expect(
    courtyard.points!.points.map((point) => {
      if (!("x" in point)) throw new Error("Unexpected courtyard arc");
      return [point.x, point.y];
    }),
  ).toEqual([
    [-10.75, 14.5],
    [18.25, 14.5],
    [18.25, -14.5],
    [-10.75, -14.5],
    [-10.75, 14.5],
  ]);
});

async function gallery(rotation: number) {
  const place = (i: number) => ({
    pcbX: -180 + (i % 6) * 70,
    pcbY: 60 - Math.floor(i / 6) * 100,
    pcbRotation: rotation,
    schX: i * 12,
  });
  const circuit = new Circuit();
  circuit.add(
    <board width={750} height={500} routingDisabled pcbRelative>
      <MainsHeader name="J1" {...place(0)} />
      <MainsHeader name="J2" {...place(1)} />
      <MainsHeader name="J3" {...place(2)} />
      <MainsHeader name="J4" {...place(3)} />
      <IsolatedSupply name="U1" {...place(4)} />
      <PumpRelay name="K1" {...place(5)} />
      <ThermallyProtectedMov name="RV1" {...place(6)} />
      <CoilFlyback name="D1" {...place(7)} />
      <SnubberResistor name="R1" {...place(8)} />
      <SnubberCapacitor name="C1" {...place(9)} />
      <PsuHeader name="J5" {...place(10)} />
      <BranchFuse name="F3" {...place(11)} />
      <ServiceHeader name="J6" {...place(12)} />
    </board>,
  );
  await circuit.renderUntilSettled();
  return prepareMainsFootprintOriginsForInitialExport(circuit.getCircuitJson());
}

// Independent literal component-side pad geometry, not the adapter's model table.
type Land = [
  number: string,
  x: number,
  y: number,
  drill: number,
  width: number,
  height: number,
  shape: string,
  drillWidth?: number,
];
const lands: Record<string, Land[]> = {
  F3: [
    ["1", 0, 0, 1.1, 2.5, 2.5, "circle"],
    ["2", 30.48, 0, 1.1, 2.5, 2.5, "circle"],
  ],
  ...Object.fromEntries(
    ([2, 3, 4, 6] as const).map((count, i) => [
      `J${i + 1}`,
      Array.from({ length: count }, (_, n) =>
        [-3.18, 0].map((y): Land => [
          String(n + 1),
          n * 7.493,
          y,
          1.78,
          3.5,
          3.5,
          "circle",
        ]),
      ).flat(),
    ]),
  ),
  U1: [
    ["1", 5.3, 11.75, 1.5, 3, 3, "rect"],
    ["2", 5.3, 5, 1.5, 3, 3, "circle"],
    ["3", 81.3, 40.75, 2.5, 4.5, 4.5, "circle"],
    ["4", 81.3, 46.25, 2.5, 4.5, 4.5, "circle"],
  ],
  K1: [
    ["1", 23.5, 0, 1.3, 2.8, 2.8, "rect"],
    ["3", 0, 0, 1.3, 2.8, 2.8, "circle"],
    ["4", 3.5, 7.5, 1.3, 2.8, 2.8, "circle"],
    ["5", 23.5, 7.5, 1.3, 2.8, 2.8, "circle"],
  ],
  RV1: [
    ["1", 0, 0, 1.3, 2.9, 2.9, "circle"],
    ["2", 7.5, 0, 3.7, 5.3, 2.9, "oval", 1.3],
  ],
  D1: [
    ["1", 0, 0, 1.1, 2.6, 2.6, "rect"],
    ["2", 10.16, 0, 1.1, 2.6, 2.6, "circle"],
  ],
  R1: [
    ["1", 0, 0, 1.1, 2.6, 2.6, "circle"],
    ["2", 15.24, 0, 1.1, 2.6, 2.6, "circle"],
  ],
  C1: [
    ["1", 0, 0, 1.3, 2.9, 2.9, "circle"],
    ["2", 10, 0, 1.3, 2.9, 2.9, "circle"],
  ],
};

for (const rotation of [0, 90, 180, 270]) {
  test(`mains PTH mask adaptation preserves exact geometry at ${rotation} degrees`, async () => {
    const source = await gallery(rotation);
    const board = convert(source);
    verifyMaskOnly(board);
    const native = parseKicadPcb(board.getString());
    for (const [refIndex, ref] of refs.entries()) {
      const index = ref === "F3" ? 11 : refIndex;
      const fp = footprint(native, ref);
      const at = fp.position;
      if (!(at instanceof At)) throw new Error("Missing native placement");
      expect(at.x).toBeCloseTo(100 - 180 + (index % 6) * 70, 7);
      expect(at.y).toBeCloseTo(100 - 60 + Math.floor(index / 6) * 100, 7);
      expect(at.angle ?? 0).toBe(rotation);
      const remaining = new Set(fp.fpPads);
      for (const [number, x, y, drill, width, height, shape, drillWidth] of lands[
        ref
      ]!) {
        const matches = [...remaining].filter(
          (pad) =>
            pad.number === number && Math.hypot(pad.at!.x - x, pad.at!.y - y) < 1e-7,
        );
        expect(matches).toHaveLength(1);
        const pad = matches[0]!;
        remaining.delete(pad);
        expect(pad.shape).toBe(shape);
        expect(pad.size!.width).toBeCloseTo(width, 7);
        expect(pad.size!.height).toBeCloseTo(height, 7);
        expect(pad.drill!.diameter).toBe(drill);
        expect(pad.drill!.width).toBe(drillWidth);
        expect(pad.drill!.oval).toBe(drillWidth !== undefined);
        expect(pad.drill!.offset).toBeUndefined();
        expect(pad.at!.angle ?? 0).toBe(shape === "circle" ? 0 : rotation);
        expect(pad.layers!.layers).toEqual(["*.Cu", "*.Mask"]);
        expect(pad.solderMaskMargin).toBe(0.05);
      }
      expect(remaining.size).toBe(0);
    }
  });
}

test("mains physical adapter rejects geometry, identity and paste drift before any mask changes", () => {
  const cases: [string, (board: KicadPcb) => void][] = [
    [
      "missing passive MPN",
      (b) => {
        const fp = footprint(b, "C1");
        fp.properties = fp.properties.filter((p) => p.key !== "MPN");
      },
    ],
    [
      "incorrect passive MPN",
      (b) => {
        footprint(b, "R1").properties.find((p) => p.key === "MPN")!.value =
          "wrong-part";
      },
    ],
    [
      "duplicate passive MPN",
      (b) => {
        const fp = footprint(b, "C1");
        fp.properties = [...fp.properties, fp.properties.find((p) => p.key === "MPN")!];
      },
    ],
    [
      "missing final footprint",
      (b) => {
        b.footprints = b.footprints.filter((fp) => fp !== footprint(b, "C1"));
      },
    ],
    [
      "duplicate footprint",
      (b) => {
        b.footprints = [...b.footprints, footprint(b, "C1")];
      },
    ],
    [
      "duplicate value",
      (b) => {
        const fp = footprint(b, "C1");
        fp.properties = [
          ...fp.properties,
          fp.properties.find((p) => p.key === "Value")!,
        ];
      },
    ],
    [
      "passive value",
      (b) => {
        footprint(b, "C1").properties.find((p) => p.key === "Value")!.value =
          "wrong-part";
      },
    ],
    [
      "footprint",
      (b) => {
        footprint(b, "C1").libraryLink = "wrong-footprint";
      },
    ],
    [
      "bottom footprint",
      (b) => {
        footprint(b, "C1").layer = new Layer(["B.Cu"]);
      },
    ],
    [
      "unsupported rotation",
      (b) => {
        (footprint(b, "C1").position as At).angle = 45;
      },
    ],
    [
      "changed mask",
      (b) => {
        footprint(b, "C1").fpPads[1]!.solderMaskMargin = 0.1;
      },
    ],
    [
      "moved final pad",
      (b) => {
        footprint(b, "C1").fpPads[1]!.at!.x += 0.1;
      },
    ],
    [
      "wrong pad number",
      (b) => {
        footprint(b, "C1").fpPads[1]!.number = "3";
      },
    ],
    [
      "wrong drill",
      (b) => {
        footprint(b, "C1").fpPads[1]!.drill!.diameter += 0.1;
      },
    ],
    [
      "offset drill",
      (b) => {
        footprint(b, "C1").fpPads[1]!.drill!.offset = { x: 0.1, y: 0 };
      },
    ],
    [
      "wrong copper",
      (b) => {
        footprint(b, "C1").fpPads[1]!.size!.width += 0.1;
      },
    ],
    [
      "wrong copper layer",
      (b) => {
        footprint(b, "C1").fpPads[1]!.layers = ["F.Cu", "*.Mask"];
      },
    ],
    [
      "PTH paste",
      (b) => {
        footprint(b, "C1").fpPads[1]!.layers = ["*.Cu", "*.Mask", "B.Paste"];
      },
    ],
    [
      "THT paste line",
      (b) => {
        footprint(b, "C1").fpLines[0]!.layer = new Layer(["F.Paste"]);
      },
    ],
    [
      "THT paste polygon",
      (b) => {
        footprint(b, "RV1").fpPolys[0]!.layer = new Layer(["B.Paste"]);
      },
    ],
    [
      "J5 paste",
      (b) => {
        footprint(b, "J5").fpPads[0]!.layers = ["*.Cu", "*.Mask", "*.Paste"];
      },
    ],
    [
      "NPTH paste",
      (b) => {
        const pad = b.footprints
          .flatMap((fp) => fp.fpPads)
          .find((p) => p.padType === "np_thru_hole")!;
        pad.layers = [...pad.layers!.layers, "F.Paste"];
      },
    ],
    [
      "missing unused Sabre tail",
      (b) => {
        const fp = footprint(b, "J4");
        fp.fpPads = fp.fpPads.slice(0, -1);
      },
    ],
    [
      "duplicated Sabre tail",
      (b) => {
        const pads = footprint(b, "J4").fpPads;
        pads[1]!.at = pads[0]!.at;
      },
    ],
    [
      "Sabre tail nets differ",
      (b) => {
        footprint(b, "J4").fpPads[1]!.net = new PadNet(999, "WRONG_NET");
      },
    ],
    [
      "Sabre pin 1 is round",
      (b) => {
        footprint(b, "J4").fpPads[0]!.shape = "rect";
      },
    ],
    [
      "U1 square preserved",
      (b) => {
        footprint(b, "U1").fpPads[0]!.shape = "roundrect";
      },
    ],
    [
      "D1 square preserved",
      (b) => {
        footprint(b, "D1").fpPads[0]!.roundrectRatio = 0.25;
      },
    ],
    [
      "K1 square preserved",
      (b) => {
        footprint(b, "K1").fpPads[0]!.shape = "circle";
      },
    ],
    [
      "MOV slot drill",
      (b) => {
        footprint(b, "RV1").fpPads[1]!.drill!.width = 1.4;
      },
    ],
    [
      "MOV slot axis",
      (b) => {
        footprint(b, "RV1").fpPads[1]!.at!.angle = 90;
      },
    ],
    [
      "MOV slot plating",
      (b) => {
        footprint(b, "RV1").fpPads[1]!.padType = "np_thru_hole";
      },
    ],
    [
      "MOV oval shape",
      (b) => {
        footprint(b, "RV1").fpPads[1]!.shape = "rect";
      },
    ],
  ];
  for (const [name, mutate] of cases) {
    const board = convert(completeSource);
    const original = board.getString();
    mutate(board);
    const snapshot = board.getString();
    expect(snapshot, `${name} injection changed the graph`).not.toBe(original);
    expect(() => applyMainsPhysicalForInitialExport(board), name).toThrow();
    expect(board.getString(), name).toBe(snapshot);
  }
});
