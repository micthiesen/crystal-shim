import { beforeAll, expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, Layer, PadNet, Property, parseKicadPcb, type KicadPcb } from "kicadts";
import {
  PsuHeader,
  psuHeaderPattern,
} from "../../controller/design/micro-fit-components";
import { prepareFootprintOriginsWithPatterns } from "../../scripts/lib/footprint-origin-initial-export";
import { applyConnectorPhysicalForInitialExport } from "../../controller/design/connector-physical-initial-export";
import { assertMainsJ5PhysicalForInitialExport } from "./j5-physical-initial-export";

function footprint(board: KicadPcb) {
  const fp = board.footprints.find((f) =>
    f.properties.some((p) => p.key === "Reference" && p.value === "J5"),
  );
  if (!fp) throw new Error("Missing J5 test footprint");
  return fp;
}
function pad(board: KicadPcb, number: string) {
  return footprint(board).fpPads.find((p) => p.number === number)!;
}
async function raw(rotation: number) {
  const circuit = new Circuit();
  circuit.add(
    <board width={60} height={60} pcbRelative routingDisabled>
      <PsuHeader
        name="J5"
        pcbX={10}
        pcbY={-5}
        pcbRotation={rotation}
        connections={{
          V5_PSU: "net.V5_PSU",
          GND: "net.GND_ISO",
          COIL_DRAIN: "net.COIL_DRAIN",
        }}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const source = circuit.getCircuitJson();
  const sourceBefore = JSON.stringify(source);
  const prepared = prepareFootprintOriginsWithPatterns(source, ["J5"], {
    "43650-0300": psuHeaderPattern,
  });
  const converter = new CircuitJsonToKicadPcbConverter(prepared);
  converter.runUntilFinished();
  const board = converter.getOutput();
  expect(JSON.stringify(source)).toBe(sourceBefore);
  return board;
}

for (const rotation of [0, 90, 180, 270]) {
  test(`J5 raw admission preserves exact lands, drill axes and locator at ${rotation} degrees`, async () => {
    const board = await raw(rotation);
    const before = board.getString();
    assertMainsJ5PhysicalForInitialExport(board);
    assertMainsJ5PhysicalForInitialExport(board);
    expect(board.getString()).toBe(before);
    const parsed = parseKicadPcb(before);
    assertMainsJ5PhysicalForInitialExport(parsed);
    expect(parsed.getString()).toBe(before);
    const fp = footprint(board);
    expect(fp.position).toBeInstanceOf(At);
    expect(fp.position!.x).toBeCloseTo(110, 7);
    expect(fp.position!.y).toBeCloseTo(105, 7);
    expect((fp.position as At).angle ?? 0).toBe(rotation);
    expect(fp.fpPads).toHaveLength(4);
    // Independent literals prevent silently following a changed source pattern.
    for (const [number, x] of [
      ["1", 0],
      ["2", 3],
      ["3", 6],
    ] as const) {
      const p = pad(board, number);
      expect(p.at!.x).toBeCloseTo(x, 7);
      expect(p.at!.y).toBeCloseTo(0, 7);
      expect(p.at!.angle ?? 0).toBe(rotation);
      expect([p.size!.width, p.size!.height]).toEqual([1.5, 2.02]);
      expect(p.drill!.diameter).toBe(1.02);
      expect(p.drill!.width).toBe(number === "1" ? undefined : 1.02);
      expect(p.drill!.oval).toBe(number !== "1");
      expect(p.shape).toBe(number === "1" ? "rect" : "oval");
      expect(p.padType).toBe("thru_hole");
      expect(p.layers!.layers).toEqual(["*.Cu", "*.Mask"]);
      expect(p.solderMaskMargin).toBeUndefined();
    }
    const hole = pad(board, "");
    expect(hole.at!.x).toBeCloseTo(3, 7);
    expect(hole.at!.y).toBeCloseTo(-4.32, 7);
    expect(hole.at!.angle ?? 0).toBe(0);
    expect([hole.size!.width, hole.size!.height, hole.drill!.diameter]).toEqual([
      3, 3, 3,
    ]);
    expect(hole.drill!.width).toBeUndefined();
    expect(hole.drill!.oval).toBe(false);
    expect(hole.padType).toBe("np_thru_hole");
    expect(hole.net).toBeUndefined();

    // The existing adapter still owns exactly these permitted changes.
    const expected = parseKicadPcb(before);
    for (const p of footprint(expected).fpPads.filter((p) => p.number))
      p.solderMaskMargin = 0.05;
    pad(expected, "1").shape = "roundrect";
    pad(expected, "1").roundrectRatio = 0.25 / 1.5;
    applyConnectorPhysicalForInitialExport(board, ["J5"]);
    expect(board.getString()).toBe(expected.getString());
    expect(() => assertMainsJ5PhysicalForInitialExport(board)).toThrow();
    expect(board.getString()).toBe(expected.getString());
  });
}

let rawSeed: string;
beforeAll(async () => {
  rawSeed = (await raw(270)).getString();
});

const changes: [string, (board: KicadPcb) => void][] = [
  [
    "missing J5",
    (b) => {
      b.footprints = [];
    },
  ],
  [
    "duplicate J5",
    (b) => {
      b.footprints = [...b.footprints, footprint(b)];
    },
  ],
  [
    "duplicate reference",
    (b) => {
      const f = footprint(b);
      f.properties = [...f.properties, new Property({ key: "Reference", value: "J5" })];
    },
  ],
  [
    "duplicate value",
    (b) => {
      const f = footprint(b);
      f.properties = [
        ...f.properties,
        new Property({ key: "Value", value: "43650-0300" }),
      ];
    },
  ],
  [
    "wrong part",
    (b) => {
      footprint(b).properties.find((p) => p.key === "Value")!.value = "wrong";
    },
  ],
  [
    "conflicting MPN",
    (b) => {
      const f = footprint(b);
      f.properties = [...f.properties, new Property({ key: "MPN", value: "wrong" })];
    },
  ],
  [
    "duplicate MPN",
    (b) => {
      const f = footprint(b);
      f.properties = [
        ...f.properties,
        new Property({ key: "MPN", value: "43650-0300" }),
        new Property({ key: "MPN", value: "43650-0300" }),
      ];
    },
  ],
  [
    "wrong footprint",
    (b) => {
      footprint(b).libraryLink = "wrong";
    },
  ],
  [
    "bottom layer",
    (b) => {
      footprint(b).layer = new Layer(["B.Cu"]);
    },
  ],
  [
    "noncardinal placement",
    (b) => {
      (footprint(b).position as At).angle = 45;
    },
  ],
  [
    "nonfinite placement",
    (b) => {
      (footprint(b).position as At).x = Number.NaN;
    },
  ],
  [
    "missing position",
    (b) => {
      footprint(b).position = undefined;
    },
  ],
  [
    "missing land",
    (b) => {
      const f = footprint(b);
      f.fpPads = f.fpPads.filter((p) => p.number !== "2");
    },
  ],
  [
    "repeated land",
    (b) => {
      const f = footprint(b);
      f.fpPads = [...f.fpPads, pad(b, "2")];
    },
  ],
  [
    "wrong land number",
    (b) => {
      pad(b, "2").number = "4";
    },
  ],
  [
    "duplicate land number",
    (b) => {
      pad(b, "2").number = "1";
    },
  ],
  [
    "pad 2 shifted X",
    (b) => {
      pad(b, "2").at!.x += 0.2;
    },
  ],
  [
    "pad 3 shifted Y",
    (b) => {
      pad(b, "3").at!.y += 0.2;
    },
  ],
  [
    "pad 2 copper width",
    (b) => {
      pad(b, "2").size!.width += 0.2;
    },
  ],
  [
    "pad 3 copper height",
    (b) => {
      pad(b, "3").size!.height += 0.2;
    },
  ],
  [
    "swapped copper dimensions",
    (b) => {
      pad(b, "2").size = { width: 2.02, height: 1.5 };
    },
  ],
  [
    "pad 2 shape",
    (b) => {
      pad(b, "2").shape = "rect";
    },
  ],
  [
    "rounded raw pin 1",
    (b) => {
      pad(b, "1").shape = "roundrect";
    },
  ],
  [
    "PTH made SMT",
    (b) => {
      pad(b, "2").padType = "smd";
    },
  ],
  [
    "pad 2 drill diameter",
    (b) => {
      pad(b, "2").drill!.diameter += 0.2;
    },
  ],
  [
    "pad 3 slot axis",
    (b) => {
      pad(b, "3").drill!.width = 1.3;
    },
  ],
  [
    "changed raw drill encoding",
    (b) => {
      pad(b, "2").drill!.oval = false;
    },
  ],
  [
    "offset drill",
    (b) => {
      pad(b, "1").drill!.offset = { x: 0.1, y: 0 };
    },
  ],
  [
    "wrong pad angle",
    (b) => {
      pad(b, "2").at!.angle = 0;
    },
  ],
  [
    "one-sided copper",
    (b) => {
      pad(b, "1").layers = ["F.Cu", "*.Mask"];
    },
  ],
  [
    "missing mask layer",
    (b) => {
      pad(b, "2").layers = ["*.Cu"];
    },
  ],
  [
    "repeated layer",
    (b) => {
      pad(b, "2").layers = ["*.Cu", "*.Mask", "*.Mask"];
    },
  ],
  [
    "raw pad mask override",
    (b) => {
      pad(b, "3").solderMaskMargin = 0.05;
    },
  ],
  [
    "footprint mask override",
    (b) => {
      footprint(b).solderMaskMargin = 0.05;
    },
  ],
  [
    "footprint paste override",
    (b) => {
      footprint(b).solderPasteMargin = 0.1;
    },
  ],
  [
    "pad paste override",
    (b) => {
      pad(b, "2").solderPasteMarginRatio = 0.1;
    },
  ],
  [
    "PTH paste layer",
    (b) => {
      pad(b, "2").layers = ["*.Cu", "*.Mask", "F.Paste"];
    },
  ],
  [
    "NPTH paste layer",
    (b) => {
      pad(b, "").layers = ["*.Cu", "*.Mask", "B.Paste"];
    },
  ],
  [
    "paste line",
    (b) => {
      footprint(b).fpLines[0]!.layer = new Layer(["F.Paste"]);
    },
  ],
  [
    "paste polygon",
    (b) => {
      footprint(b).fpPolys[0]!.layer = new Layer(["B.Paste"]);
    },
  ],
  [
    "raw rounding override",
    (b) => {
      pad(b, "2").roundrectRatio = 0.25;
    },
  ],
  [
    "trapezoid delta",
    (b) => {
      pad(b, "2").rectDelta = { x: 0.1, y: 0 };
    },
  ],
  [
    "chamfer override",
    (b) => {
      pad(b, "2").chamferRatio = 0.2;
    },
  ],
  [
    "remove unused copper",
    (b) => {
      pad(b, "2").removeUnusedLayer = true;
    },
  ],
  [
    "missing locator",
    (b) => {
      const f = footprint(b);
      f.fpPads = f.fpPads.filter((p) => p.number);
    },
  ],
  [
    "repeated locator",
    (b) => {
      const f = footprint(b);
      f.fpPads = [...f.fpPads, pad(b, "")];
    },
  ],
  [
    "locator X",
    (b) => {
      pad(b, "").at!.x += 0.1;
    },
  ],
  [
    "locator Y",
    (b) => {
      pad(b, "").at!.y += 0.1;
    },
  ],
  [
    "locator angle",
    (b) => {
      pad(b, "").at!.angle = 90;
    },
  ],
  [
    "locator size",
    (b) => {
      pad(b, "").size!.height = 3.2;
    },
  ],
  [
    "locator drill",
    (b) => {
      pad(b, "").drill!.diameter = 3.2;
    },
  ],
  [
    "locator drill width",
    (b) => {
      pad(b, "").drill!.width = 3;
    },
  ],
  [
    "locator plated",
    (b) => {
      pad(b, "").padType = "thru_hole";
    },
  ],
  [
    "locator shape",
    (b) => {
      pad(b, "").shape = "oval";
    },
  ],
  [
    "locator copper net",
    (b) => {
      pad(b, "").net = new PadNet(999, "UNEXPECTED");
    },
  ],
];

for (const [name, change] of changes) {
  test(`J5 admission rejects effective ${name} drift without mutation`, () => {
    const board = parseKicadPcb(rawSeed);
    const before = board.getString();
    change(board);
    const changed = board.getString();
    expect(changed).not.toBe(before);
    expect(() => assertMainsJ5PhysicalForInitialExport(board)).toThrow();
    expect(board.getString()).toBe(changed);
  });
}
