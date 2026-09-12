import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { UsbConnector, usbConnectorPattern } from "./usb-connector";
import {
  prepareUsbForInitialExport,
  mapUsbPcbForInitialExport,
  mapUsbSchematicForInitialExport,
} from "./usb-initial-export";

async function fixture(rotation = 0) {
  const circuit = new Circuit();
  circuit.add(
    <board width={35} height={30} routingDisabled>
      <UsbConnector
        name="J4"
        pcbX={2}
        pcbY={1}
        pcbRotation={rotation}
        schX={0}
        schY={0}
        connections={{
          A1: "net.GND",
          B12: "net.GND",
          A12: "net.GND",
          B1: "net.GND",
          SH: "net.GND",
          A4: "net.USB_VBUS",
          B9: "net.USB_VBUS",
          A9: "net.USB_VBUS",
          B4: "net.USB_VBUS",
          A6: "net.USB_DP",
          B6: "net.USB_DP",
          A7: "net.USB_DM",
          B7: "net.USB_DM",
          A5: "net.CC1",
          B5: "net.CC2",
        }}
      />
      {/* Explicit ground labels avoid a disconnected power-net wire island in
          the pinned schematic router. Check the native netlist before handoff. */}
      <netlabel net="GND" connectsTo=".J4 > .pin1" schX={-2} schY={0.8} />
      <netlabel net="GND" connectsTo=".J4 > .pin8" schX={-2} schY={-0.6} />
      <netlabel net="GND" connectsTo=".J4 > .pin9" schX={-2} schY={-0.8} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  return json;
}

test("USB source keeps paired power copper, independent data contacts and four shell stakes", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const json = await fixture(rotation);
    const ports = json.filter((e) => e.type === "source_port");
    const part = json.find((e) => e.type === "source_component");
    expect(part?.manufacturer_part_number).toBe("USB4105-GF-A");
    expect(ports.filter((p) => p.pin_number !== undefined).map((p) => p.name)).toEqual([
      "A1",
      "A4",
      "A5",
      "A6",
      "A7",
      "A8",
      "A9",
      "A12",
      "B1",
      "B4",
      "B5",
      "B6",
      "B7",
      "B8",
      "B9",
      "B12",
      "SH",
    ]);
    const groups = part?.internally_connected_source_port_ids ?? [];
    const names = groups.map((group) =>
      group.map((id) => ports.find((p) => p.source_port_id === id)?.name).sort(),
    );
    for (const name of [
      "A1",
      "B12",
      "A4",
      "B9",
      "A9",
      "B4",
      "A12",
      "B1",
      "A6",
      "B6",
      "A7",
      "B7",
      "A5",
      "B5",
      "A8",
      "B8",
    ]) {
      expect(names.some((group) => group.includes(name))).toBe(false);
    }
    expect(groups.map((g) => g.length)).toEqual([4]);
    const pcbPorts = json.filter((e) => e.type === "pcb_port");
    const pads = json.filter((e) => e.type === "pcb_smtpad");
    expect(pads).toHaveLength(16); // 12 distinct areas, four with two pin numbers.
    for (const [pin, nativeX, width] of [
      ["A1", -3.2, 0.6],
      ["A6", -0.25, 0.3],
      ["B6", 0.75, 0.3],
      ["B7", -0.75, 0.3],
      ["A7", 0.25, 0.3],
    ] as const) {
      const port = ports.find((p) => p.name === pin)!;
      const pp = pcbPorts.find((p) => p.source_port_id === port.source_port_id)!;
      const pad = pads.find((p) => p.pcb_port_id === pp.pcb_port_id)!;
      if (pad.shape !== "rect") throw new Error("USB land must be rectangular");
      const rad = (rotation * Math.PI) / 180;
      expect(pad.x).toBeCloseTo(2 + nativeX * Math.cos(rad) - 3.68 * Math.sin(rad), 6);
      expect(pad.y).toBeCloseTo(1 + nativeX * Math.sin(rad) + 3.68 * Math.cos(rad), 6);
      expect(pad.width).toBeCloseTo(rotation % 180 ? 1.15 : width, 6);
      expect(pad.height).toBeCloseTo(rotation % 180 ? width : 1.15, 6);
      expect(pad.corner_radius ?? pad.rect_border_radius).toBeCloseTo(
        pin === "A1" ? 0.25 : width * 0.25,
        6,
      );
    }
    const shell = json.filter((e) => e.type === "pcb_plated_hole");
    expect(shell).toHaveLength(4);
    for (const pad of shell) {
      if (pad.shape !== "pill") throw new Error("USB stake must retain its slot");
      expect(pad.hole_width).toBe(0.6);
      expect([1.4, 1.7]).toContain(pad.hole_height);
      expect(pad.outer_width).toBe(1);
      expect(pad.outer_height).toBeCloseTo(pad.hole_height + 0.4, 6);
    }
    const locators = json.filter((e) => e.type === "pcb_hole");
    expect(locators).toHaveLength(2);
    for (const hole of locators) {
      if (hole.hole_shape !== "circle") throw new Error("USB locator must be round");
      expect(hole.hole_diameter).toBe(0.65);
    }
  }
});

// Signed distance to an axis-aligned rounded rectangle, less the circular
// locator radius. At cardinal rotations the actual compiled bounds remain
// axis-aligned; measure the corner arc, not the enclosing sharp rectangle.
function locatorClearance(
  pad: { x: number; y: number; width: number; height: number; radius: number },
  hole: { x: number; y: number; radius: number },
) {
  const dx = Math.abs(hole.x - pad.x) - (pad.width / 2 - pad.radius);
  const dy = Math.abs(hole.y - pad.y) - (pad.height / 2 - pad.radius);
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) +
    Math.min(Math.max(dx, dy), 0) -
    pad.radius -
    hole.radius
  );
}

test("project ground corners clear both unchanged locators in compiled and parsed native geometry", async () => {
  const groundPins = ["A1", "B12", "A12", "B1"];
  for (const rotation of [0, 90, 180, 270]) {
    const json = await fixture(rotation);
    const sourcePorts = json.filter((e) => e.type === "source_port");
    const pcbPorts = json.filter((e) => e.type === "pcb_port");
    const smt = json.filter((e) => e.type === "pcb_smtpad");
    const sourceGround = groundPins.map((number) => {
      const port = sourcePorts.find((p) => p.name === number)!;
      const pcbPort = pcbPorts.find((p) => p.source_port_id === port.source_port_id)!;
      const pad = smt.find((p) => p.pcb_port_id === pcbPort.pcb_port_id)!;
      if (pad.shape !== "rect") throw new Error("USB ground pad must be a rectangle");
      const radius = pad.corner_radius ?? pad.rect_border_radius;
      if (radius === undefined) throw new Error("USB ground corner radius is missing");
      return {
        number,
        x: pad.x,
        y: pad.y,
        width: pad.width,
        height: pad.height,
        radius,
      };
    });
    const sourceHoles = json
      .filter((e) => e.type === "pcb_hole")
      .map((hole) => {
        if (hole.hole_shape !== "circle")
          throw new Error("USB locator must be circular");
        return { x: hole.x, y: hole.y, radius: hole.hole_diameter / 2 };
      });

    const converter = new CircuitJsonToKicadPcbConverter(
      prepareUsbForInitialExport(json, ["J4"]),
    );
    converter.runUntilFinished();
    mapUsbPcbForInitialExport(converter.getOutput(), ["J4"]);
    const native = parseKicadPcb(converter.getOutputString());
    const fp = native.footprints[0]!;
    const origin = fp.position;
    if (!(origin instanceof At)) throw new Error("Missing native footprint origin");
    const angle = ((origin.angle ?? 0) * Math.PI) / 180;
    const world = (point: { x: number; y: number }) => ({
      x: origin.x + point.x * Math.cos(angle) + point.y * Math.sin(angle),
      y: origin.y - point.x * Math.sin(angle) + point.y * Math.cos(angle),
    });
    const nativeGround = groundPins.map((number) => {
      const pad = fp.fpPads.find((p) => p.number === number)!;
      if (!pad.at || !pad.size || pad.shape !== "roundrect")
        throw new Error("Missing native rounded USB ground pad");
      expect(pad.net?.name).toBe("GND");
      // Native pad angles are absolute; the footprint angle rotates positions.
      const padAngle = ((pad.at.angle ?? 0) * Math.PI) / 180;
      return {
        number,
        ...world(pad.at),
        width:
          Math.abs(Math.cos(padAngle)) * pad.size.width +
          Math.abs(Math.sin(padAngle)) * pad.size.height,
        height:
          Math.abs(Math.sin(padAngle)) * pad.size.width +
          Math.abs(Math.cos(padAngle)) * pad.size.height,
        radius: (pad.roundrectRatio ?? 0) * Math.min(pad.size.width, pad.size.height),
      };
    });
    const nativeHoles = fp.fpPads
      .filter((p) => p.padType === "np_thru_hole")
      .map((pad) => {
        if (!pad.at || !pad.drill) throw new Error("Missing native USB locator");
        expect(pad.drill.diameter).toBe(0.65);
        return { ...world(pad.at), radius: pad.drill.diameter / 2 };
      });

    for (const [pads, holes] of [
      [sourceGround, sourceHoles],
      [nativeGround, nativeHoles],
    ] as const) {
      expect(pads).toHaveLength(4);
      expect(holes).toHaveLength(2);
      const sharedAreas = new Map<string, string[]>();
      for (const pad of pads) {
        const center = `${pad.x.toFixed(6)},${pad.y.toFixed(6)}`;
        sharedAreas.set(center, [...(sharedAreas.get(center) ?? []), pad.number]);
        expect(Math.min(pad.width, pad.height)).toBeCloseTo(0.6, 7);
        expect(Math.max(pad.width, pad.height)).toBeCloseTo(1.15, 7);
        const clearance = Math.min(...holes.map((hole) => locatorClearance(pad, hole)));
        expect(clearance).toBeGreaterThanOrEqual(0.2);
        expect(clearance).toBeCloseTo(0.218788384899, 7);
        expect(pad.radius).toBeCloseTo(0.25, 7);
        const oldClearance = Math.min(
          ...holes.map((hole) => locatorClearance({ ...pad, radius: 0.15 }, hole)),
        );
        expect(oldClearance).toBeCloseTo(0.194402718847, 7);
        expect(oldClearance).toBeLessThan(0.2);
      }
      // Four logical GND contacts occupy only two physical copper/paste areas.
      expect([...sharedAreas.values()].map((pins) => pins.sort()).sort()).toEqual([
        ["A1", "B12"],
        ["A12", "B1"],
      ]);
    }
    // The project adaptation does not round the VBUS or data contacts further.
    for (const pad of fp.fpPads.filter(
      (p) => p.padType === "smd" && !groundPins.includes(p.number),
    )) {
      if (!pad.size) throw new Error("Missing native USB contact size");
      expect(pad.roundrectRatio).toBe(0.25);
    }
  }
});

test("initial USB export preserves native pin names, nets and symbol/copper identity", async () => {
  const json = prepareUsbForInitialExport(await fixture(), ["J4"]);
  const pcbConverter = new CircuitJsonToKicadPcbConverter(json);
  pcbConverter.runUntilFinished();
  const board = pcbConverter.getOutput();
  const schConverter = new CircuitJsonToKicadSchConverter(json);
  schConverter.runUntilFinished();
  const schematic = schConverter.getOutput();
  mapUsbPcbForInitialExport(board, ["J4"]);
  mapUsbSchematicForInitialExport(schematic, ["J4"]);
  const pads = board.footprints[0]!.fpPads;
  expect(pads.map((p) => p.number).sort()).toEqual([
    "",
    "",
    "A1",
    "A12",
    "A4",
    "A5",
    "A6",
    "A7",
    "A8",
    "A9",
    "B1",
    "B12",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "B9",
    "SH",
    "SH",
    "SH",
    "SH",
  ]);
  for (const [name, net] of [
    ["A6", "USB_DP"],
    ["B6", "USB_DP"],
    ["A7", "USB_DM"],
    ["B7", "USB_DM"],
    ["A5", "CC1"],
    ["B5", "CC2"],
    ["A4", "USB_VBUS"],
    ["B9", "USB_VBUS"],
    ["A9", "USB_VBUS"],
    ["B4", "USB_VBUS"],
    ["A1", "GND"],
    ["B12", "GND"],
    ["A12", "GND"],
    ["B1", "GND"],
  ]) {
    expect(pads.find((p) => p.number === name)?.net?.name).toBe(net);
  }
  for (const name of ["A8", "B8"])
    expect(pads.find((p) => p.number === name)?.net).toBeUndefined();
  for (const pad of pads.filter((p) => p.number === "SH")) {
    expect(pad.net?.name).toBe("GND");
    expect(pad.layers?.layers).toEqual(["*.Cu", "*.Mask", "F.Paste"]);
  }
  const symbol = schematic.symbols.find((s) =>
    s.properties.some((p) => p.key === "Reference" && p.value === "J4"),
  )!;
  const library = schematic.libSymbols!.symbols.find(
    (s) => s.libraryId === symbol.libraryId,
  )!;
  expect(symbol.pins.map((p) => p.numberString).sort()).toEqual(
    [...new Set(pads.map((p) => p.number).filter(Boolean))].sort(),
  );
  expect(
    library.subSymbols.flatMap((s) => s.pins).map((p) => [p.numberString, p.name]),
  ).toEqual(symbol.pins.map((p) => [p.numberString, p.numberString]));
  expect(symbol.properties.find((p) => p.key === "Footprint")?.value).toBe(
    usbConnectorPattern.id,
  );
  expect(pcbConverter.getOutputString()).toContain('(pad "A6"');
  expect(schConverter.getOutputString()).toContain('(number "B6"');
});

test("initial-export mapping rejects stale refs or changed pin sets without partial mutation", async () => {
  const converter = new CircuitJsonToKicadPcbConverter(await fixture());
  converter.runUntilFinished();
  const board = converter.getOutput();
  const before = converter.getOutputString();
  expect(() => mapUsbPcbForInitialExport(board, ["J4", "J99"])).toThrow();
  expect(converter.getOutputString()).toBe(before);
  expect(() => mapUsbPcbForInitialExport(board, ["J4", "J4"])).toThrow();
  board.footprints[0]!.fpPads[0]!.number = "A1";
  const changed = converter.getOutputString();
  expect(() => mapUsbPcbForInitialExport(board, ["J4"])).toThrow("multiset");
  expect(converter.getOutputString()).toBe(changed);
});

test("initial USB export preserves absolute contacts at every cardinal rotation", async () => {
  for (const rotation of [0, 90, 180, 270]) {
    const input = await fixture(rotation);
    const before = JSON.stringify(input);
    const prepared = prepareUsbForInitialExport(input, ["J4"]);
    expect(JSON.stringify(input)).toBe(before);
    const component = prepared.find((e) => e.type === "pcb_component")!;
    expect(component.center.x).toBeCloseTo(2, 6);
    expect(component.center.y).toBeCloseTo(1, 6);
    const converter = new CircuitJsonToKicadPcbConverter(prepared);
    converter.runUntilFinished();
    const board = converter.getOutput();
    mapUsbPcbForInitialExport(board, ["J4"]);
    const pads = board.footprints[0]!.fpPads;
    for (const [number, x, y] of [
      ["A1", -3.2, -3.68],
      ["A6", -0.25, -3.68],
      ["A7", 0.25, -3.68],
      ["B6", 0.75, -3.68],
      ["B7", -0.75, -3.68],
      ["B1", 3.2, -3.68],
    ] as const) {
      const pad = pads.find((p) => p.number === number)!;
      expect(pad.at?.x).toBeCloseTo(x, 6);
      expect(pad.at?.y).toBeCloseTo(y, 6);
    }
  }
});
