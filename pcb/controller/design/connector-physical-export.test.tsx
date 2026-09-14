import { ServicePowerHeader } from "./service-power-header";
import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { applyConnectorPhysicalForInitialExport } from "./connector-physical-initial-export";
import { SensorHeader, PsuHeader } from "./micro-fit-components";
import { StatusLed, ControllerButton } from "./assembly-components";
import { UsbConnector } from "./usb-connector";
import {
  mapUsbPcbForInitialExport,
  prepareUsbForInitialExport,
} from "./usb-initial-export";

type Point = { x: number; y: number };
type Land = Point & {
  number: string;
  width: number;
  height: number;
  shape: "circle" | "oval" | "roundrect" | "rect";
  drill?: [number, number];
  radius?: number;
};
type Outline = { center: Point; width: number; height: number };

// Independent native top-view reference values. Do not derive these from the
// new physical registry or courtyard helper: that would repeat its mistakes.
const cases: { ref: string; body: Outline; court: Outline; lands: Land[] }[] = [
  {
    ref: "J1",
    body: { center: { x: 3, y: -3.965 }, width: 13.15, height: 9.91 },
    court: { center: { x: 3, y: -2.675 }, width: 15, height: 14.15 },
    lands: [
      ...Array.from({ length: 6 }, (_, i): Land => ({
        number: String(i + 1),
        x: (i % 3) * 3,
        y: Math.floor(i / 3) * 3,
        width: 1.5,
        height: 1.5,
        drill: [1.02, 1.02],
        shape: i === 0 ? "roundrect" : "circle",
        radius: i === 0 ? 0.25 : 0,
      })),
      {
        number: "",
        x: 3,
        y: -4.32,
        width: 3,
        height: 3,
        drill: [3, 3],
        shape: "circle",
      },
    ],
  },
  {
    ref: "J2",
    body: { center: { x: 1.25, y: 3.45 }, width: 7.4, height: 11.5 },
    court: { center: { x: 1.25, y: 3.45 }, width: 9.4, height: 13.5 },
    lands: [
      {
        number: "1",
        x: 0,
        y: 0,
        width: 1.7,
        height: 2,
        drill: [1, 1],
        shape: "roundrect",
        radius: 0.25,
      },
      {
        number: "2",
        x: 2.5,
        y: 0,
        width: 1.7,
        height: 2,
        drill: [1, 1],
        shape: "oval",
      },
    ],
  },
  {
    ref: "J3",
    body: { center: { x: 3, y: -3.97 }, width: 12.65, height: 9.9 },
    court: { center: { x: 3, y: -3.825 }, width: 14, height: 12.05 },
    lands: [
      ...Array.from({ length: 3 }, (_, i): Land => ({
        number: String(i + 1),
        x: i * 3,
        y: 0,
        width: 1.5,
        height: 2.02,
        drill: [1.02, 1.02],
        shape: i === 0 ? "roundrect" : "oval",
        radius: i === 0 ? 0.25 : 0,
      })),
      {
        number: "",
        x: 3,
        y: -4.32,
        width: 3,
        height: 3,
        drill: [3, 3],
        shape: "circle",
      },
    ],
  },
  {
    ref: "J4",
    body: { center: { x: 0, y: 0 }, width: 8.94, height: 7.35 },
    court: { center: { x: 0, y: -0.275 }, width: 10.7, height: 9.05 },
    lands: [
      ...(
        [
          ["A1", -3.2, 0.6],
          ["A4", -2.4, 0.6],
          ["A5", -1.25, 0.3],
          ["A6", -0.25, 0.3],
          ["A7", 0.25, 0.3],
          ["A8", 1.25, 0.3],
          ["A9", 2.4, 0.6],
          ["A12", 3.2, 0.6],
          ["B1", 3.2, 0.6],
          ["B4", 2.4, 0.6],
          ["B5", 1.75, 0.3],
          ["B6", 0.75, 0.3],
          ["B7", -0.75, 0.3],
          ["B8", -1.75, 0.3],
          ["B9", -2.4, 0.6],
          ["B12", -3.2, 0.6],
        ] as const
      ).map(([number, x, width]): Land => ({
        number,
        x,
        y: -3.68,
        width,
        height: 1.15,
        shape: "roundrect",
        radius: ["A1", "B12", "A12", "B1"].includes(number) ? 0.25 : width / 4,
      })),
      ...[-4.32, 4.32].flatMap((x): Land[] => [
        {
          number: "SH",
          x,
          y: -3.105,
          width: 1,
          height: 2.1,
          drill: [0.6, 1.7],
          shape: "oval",
        },
        {
          number: "SH",
          x,
          y: 1.075,
          width: 1,
          height: 1.8,
          drill: [0.6, 1.4],
          shape: "oval",
        },
      ]),
      ...[-2.89, 2.89].map((x): Land => ({
        number: "",
        x,
        y: -2.605,
        width: 0.65,
        height: 0.65,
        drill: [0.65, 0.65],
        shape: "circle",
      })),
    ],
  },
  {
    ref: "D1",
    body: { center: { x: 1.27, y: 0 }, width: 3.2, height: 3.2 },
    court: { center: { x: 1.275, y: 0 }, width: 5.35, height: 4.5 },
    lands: [
      {
        number: "1",
        x: 0,
        y: 0,
        width: 1.8,
        height: 1.8,
        drill: [0.9, 0.9],
        shape: "rect",
        radius: 0,
      },
      {
        number: "2",
        x: 2.54,
        y: 0,
        width: 1.8,
        height: 1.8,
        drill: [0.9, 0.9],
        shape: "circle",
      },
    ],
  },
  {
    ref: "SW1",
    body: { center: { x: 3.25, y: 2.25 }, width: 6, height: 6 },
    court: { center: { x: 3.25, y: 2.25 }, width: 9.5, height: 7.5 },
    lands: [0, 4.5].flatMap((y, i): Land[] =>
      [0, 6.5].map((x) => ({
        number: String(i + 1),
        x,
        y,
        width: 2,
        height: 2,
        drill: [1.1, 1.1],
        shape: "circle",
      })),
    ),
  },
];

function rotateNative(point: Point, rotation: number): Point {
  const rad = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(rad) + point.y * Math.sin(rad),
    y: -point.x * Math.sin(rad) + point.y * Math.cos(rad),
  };
}
function corners(outline: Outline): Point[] {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ].map(([x, y]) => ({
    x: outline.center.x + (x! * outline.width) / 2,
    y: outline.center.y + (y! * outline.height) / 2,
  }));
}
function closePoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 7);
  expect(actual.y).toBeCloseTo(expected.y, 7);
}

async function gallery(rotation: number) {
  const circuit = new Circuit();
  const placement = (index: number) => ({
    pcbX: -75 + index * 30,
    pcbY: 6,
    pcbRotation: rotation,
    schX: -30 + index * 12,
  });
  circuit.add(
    <board width={210} height={60} pcbRelative routingDisabled>
      <SensorHeader name="J1" {...placement(0)} />
      <ServicePowerHeader name="J2" {...placement(1)} />
      <PsuHeader name="J3" {...placement(2)} />
      <UsbConnector
        name="J4"
        {...placement(3)}
        connections={{
          SH: "net.GND",
          A1: "net.GND",
          B12: "net.GND",
          A12: "net.GND",
          B1: "net.GND",
          A4: "net.USB_VBUS",
          B9: "net.USB_VBUS",
          A9: "net.USB_VBUS",
          B4: "net.USB_VBUS",
        }}
      />
      <StatusLed name="D1" {...placement(4)} />
      <ControllerButton name="SW1" {...placement(5)} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const source = circuit.getCircuitJson();
  expect(source.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  const unchanged = JSON.stringify(source);
  const prepared = prepareUsbForInitialExport(source, ["J4"]);
  expect(JSON.stringify(source)).toBe(unchanged);
  const converter = new CircuitJsonToKicadPcbConverter(prepared);
  converter.runUntilFinished();
  const initial = converter.getOutput();
  mapUsbPcbForInitialExport(initial, ["J4"]);
  return { source, initial };
}

for (const rotation of [0, 90, 180, 270]) {
  test(`connector graphics preserve every absolute pad and NPTH in native export at ${rotation} degrees`, async () => {
    const { source, initial } = await gallery(rotation);
    const expectedGraph = parseKicadPcb(initial.getString());
    // A mutation whitelist independently proves all positions, drills, nets,
    // layers, paste and unrelated graph state survive the adapter byte-for-byte.
    for (const fp of expectedGraph.footprints) {
      for (const pad of fp.fpPads.filter((p) => p.padType === "thru_hole")) {
        pad.solderMaskMargin = 0.05;
        const ref = fp.properties.find((p) => p.key === "Reference")?.value;
        if (["J1", "J2", "J3"].includes(ref ?? "") && pad.number === "1") {
          pad.shape = "roundrect";
          pad.roundrectRatio = ref === "J2" ? 0.25 / 1.7 : 1 / 6;
        }
      }
    }
    applyConnectorPhysicalForInitialExport(
      initial,
      cases.map((entry) => entry.ref),
    );
    expect(initial.getString()).toBe(expectedGraph.getString());
    applyConnectorPhysicalForInitialExport(
      initial,
      cases.map((entry) => entry.ref),
    );
    expect(initial.getString()).toBe(expectedGraph.getString());
    // Serialize then parse, so assertions exercise the actual native file form.
    const native = parseKicadPcb(initial.getString());
    for (const [index, entry] of cases.entries()) {
      const placementPoint = { x: -75 + index * 30, y: 6 };
      const expectedNative = (point: Point) => {
        const rotated = rotateNative(point, rotation);
        return {
          x: 100 + placementPoint.x + rotated.x,
          y: 100 - placementPoint.y + rotated.y,
        };
      };
      const component = source.find(
        (e) => e.type === "source_component" && e.name === entry.ref,
      );
      if (!component || component.type !== "source_component")
        throw new Error("Missing source component");
      const pcb = source.find(
        (e) =>
          e.type === "pcb_component" &&
          e.source_component_id === component.source_component_id,
      );
      if (!pcb || pcb.type !== "pcb_component")
        throw new Error("Missing source PCB component");
      const fp = native.footprints.find((f) =>
        f.properties.some((p) => p.key === "Reference" && p.value === entry.ref),
      )!;
      expect(fp).toBeDefined();
      const at = fp.position;
      if (!(at instanceof At)) throw new Error("Missing native placement");
      expect(at.angle ?? 0).toBe(rotation);
      const fromLocal = (point: Point) => {
        const rotated = rotateNative(point, at.angle ?? 0);
        return { x: at.x + rotated.x, y: at.y + rotated.y };
      };
      const body = source
        .filter((e) => e.type === "pcb_fabrication_note_path")
        .filter((e) => e.pcb_component_id === pcb.pcb_component_id);
      const court = source
        .filter((e) => e.type === "pcb_courtyard_outline")
        .filter((e) => e.pcb_component_id === pcb.pcb_component_id);
      expect(body).toHaveLength(1);
      expect(court).toHaveLength(1);
      const fabLines = fp.fpLines.filter((l) => l.layer?.names.includes("F.Fab"));
      const courtPolys = fp.fpPolys.filter((p) => p.layer?.names.includes("F.CrtYd"));
      expect(fabLines).toHaveLength(4);
      expect(courtPolys).toHaveLength(1);
      const nativeCourt = courtPolys[0]!.points!.points;
      expect(nativeCourt).toHaveLength(5);
      for (const [outline, sourcePoints, nativePoints] of [
        [entry.body, body[0]!.route, fabLines.map((l) => l.start!)],
        [entry.court, court[0]!.outline, nativeCourt],
      ] as const) {
        expect(sourcePoints).toHaveLength(5);
        for (const [i, expected] of corners(outline).entries()) {
          const point = expectedNative(expected);
          closePoint(
            { x: 100 + sourcePoints[i]!.x, y: 100 - sourcePoints[i]!.y },
            point,
          );
          if (i < nativePoints.length) {
            const vertex = nativePoints[i]!;
            if (!("x" in vertex && "y" in vertex)) throw new Error("Unexpected arc");
            closePoint(fromLocal(vertex), point);
          }
        }
      }
      const physicalSource = source
        .filter(
          (e) =>
            e.type === "pcb_smtpad" ||
            e.type === "pcb_plated_hole" ||
            e.type === "pcb_hole",
        )
        .filter((e) => e.pcb_component_id === pcb.pcb_component_id);
      expect(physicalSource).toHaveLength(entry.lands.length);
      expect(fp.fpPads).toHaveLength(entry.lands.length);
      const remaining = new Set(fp.fpPads);
      for (const land of entry.lands) {
        const expected = expectedNative(land);
        const pad = [...remaining].find(
          (p) =>
            p.number === land.number &&
            p.at &&
            Math.hypot(fromLocal(p.at).x - expected.x, fromLocal(p.at).y - expected.y) <
              1e-7,
        );
        expect(pad).toBeDefined();
        if (!pad?.at || !pad.size) throw new Error("Missing native physical pad");
        remaining.delete(pad);
        closePoint(fromLocal(pad.at), expected);
        const matchingSource = physicalSource.filter((p) => {
          if (!("x" in p) || !("y" in p))
            throw new Error("Unexpected polygon or unpositioned pad");
          return Math.hypot(100 + p.x - expected.x, 100 - p.y - expected.y) < 1e-7;
        });
        expect(matchingSource.length).toBeGreaterThan(0);
        if (!land.number) {
          expect(pad.padType).toBe("np_thru_hole");
          expect(pad.net).toBeUndefined();
          expect(pad.solderMaskMargin ?? 0).toBe(0);
          expect(pad.layers?.layers).not.toContain("F.Paste");
          expect(matchingSource.every((p) => p.type === "pcb_hole")).toBe(true);
        } else {
          expect(pad.padType).toBe(land.drill ? "thru_hole" : "smd");
          for (const p of matchingSource) {
            if (p.type !== "pcb_hole")
              expect(
                p.soldermask_margin,
                `${entry.ref}.${land.number} source mask`,
              ).toBe(0.05);
          }
          expect(pad.solderMaskMargin, `${entry.ref}.${land.number} native mask`).toBe(
            0.05,
          );
        }
        // Pad rotations in the native file are absolute, unlike pad positions.
        const angle = ((pad.at.angle ?? 0) * Math.PI) / 180;
        const width =
          Math.abs(Math.cos(angle)) * pad.size.width +
          Math.abs(Math.sin(angle)) * pad.size.height;
        const height =
          Math.abs(Math.sin(angle)) * pad.size.width +
          Math.abs(Math.cos(angle)) * pad.size.height;
        expect(width).toBeCloseTo(rotation % 180 ? land.height : land.width, 7);
        expect(height).toBeCloseTo(rotation % 180 ? land.width : land.height, 7);
        expect(pad.shape).toBe(land.shape);
        if (land.shape === "roundrect")
          expect(
            (pad.roundrectRatio ?? 0) * Math.min(pad.size.width, pad.size.height),
          ).toBeCloseTo(land.radius ?? 0, 7);
        if (land.drill) {
          expect(pad.drill).toBeDefined();
          expect(pad.drill!.diameter).toBeCloseTo(land.drill[0], 7);
          expect(pad.drill!.width ?? pad.drill!.diameter).toBeCloseTo(land.drill[1], 7);
          expect(pad.drill!.offset).toBeUndefined();
        } else expect(pad.drill).toBeUndefined();
      }
      expect(remaining.size).toBe(0);
    }
  });
}

test("connector initial adapter rejects drift across the complete batch before mutating", async () => {
  const { initial } = await gallery(90);
  const baseline = initial.getString();
  const refs = cases.map((entry) => entry.ref);
  for (const invalidRefs of [
    [...refs, "MISSING"],
    [...refs, "J1"],
  ]) {
    expect(() =>
      applyConnectorPhysicalForInitialExport(initial, invalidRefs),
    ).toThrow();
    expect(initial.getString()).toBe(baseline);
  }
  for (const change of [
    (board: typeof initial) => {
      board.footprints.at(-1)!.fpPads[0]!.number = "99";
    },
    (board: typeof initial) => {
      board.footprints.at(-1)!.libraryLink = "unknown-model";
    },
    (board: typeof initial) => {
      board.footprints.at(-1)!.properties.find((p) => p.key === "Value")!.value =
        "wrong-part";
    },
    (board: typeof initial) => {
      board.footprints.at(-1)!.fpPads[0]!.solderMaskMargin = 0.1;
    },
    (board: typeof initial) => {
      board.footprints[0]!.fpPads.find((p) => !p.number)!.solderMaskMargin = 0.05;
    },
    (board: typeof initial) => {
      board.footprints[0]!.fpPads.find((p) => p.number === "1")!.roundrectRatio = 0.25;
    },
    (board: typeof initial) => {
      board.footprints[0]!.fpPads.find((p) => p.number === "1")!.size!.width += 0.1;
    },
    (board: typeof initial) => {
      board.footprints[0]!.fpPads.find((p) => p.number === "1")!.drill!.diameter = 1.2;
    },
    (board: typeof initial) => {
      board.footprints[3]!.fpPads.find((p) => p.number === "A1")!.solderMaskMargin =
        undefined;
    },
  ]) {
    const changed = parseKicadPcb(baseline);
    change(changed);
    const before = changed.getString();
    expect(() => applyConnectorPhysicalForInitialExport(changed, refs)).toThrow();
    expect(changed.getString()).toBe(before);
  }
});
