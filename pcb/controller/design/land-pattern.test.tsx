import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { Fragment } from "react";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { Esp32C6Wroom, wroomPattern, wroomPins } from "./esp32-c6-wroom";
import { ap63203, ao3400a, tca9517a } from "./ic-land-patterns";
import { ControllerBuck, RelayMosfet, SensorBusBuffer } from "./ic-components";
import {
  PsuSupervisor,
  SensorPowerFeed,
  RelayPermissionGate,
  UsbPresenceDetector,
  UsbDataSwitch,
} from "./logic-components";
import { dbv5, dbv6, fsusb42 } from "./logic-land-patterns";
import { stps2l40u, usblc6_2sc6 } from "./protection-land-patterns";
import { smbj8_0ca } from "./service-protection-land-patterns";
import { esds312, smbj7_0a } from "./cable-protection-land-patterns";
import {
  tdk10uf,
  vishay2512hp,
  panasonic0603,
  panasonic0805,
  tdkC1608,
  tdk1uf,
  murata22uf,
} from "./passive-land-patterns";
import { buckInductorPattern } from "./assembly-components";
import { LandPatternFootprint } from "./land-pattern";
import { landPatternPhysicalGeometry } from "./land-pattern-physical";

for (const rotation of [0, 90, 180, 270] as const) {
  test(`physical package declarations preserve native body, courtyard and mask at ${rotation} degrees`, async () => {
    // Independently fixed nominal-body, max-height and outward-rounded courtyard
    // dimensions. TI courtyards include permitted mold flash, not just nominal body.
    const cases = [
      [tca9517a, 3, 3, 1.1, 6.8, 4.4],
      [dbv6, 1.6, 2.9, 1.45, 4.7, 4.6],
      [dbv5, 1.6, 2.9, 1.45, 4.7, 4.6],
      [esds312, 1.6, 2.9, 1.45, 4.7, 4.6],
      [smbj7_0a, 4.75, 3.94, 2.61, 8.1, 5],
      [vishay2512hp, 6.3, 3.15, 0.7, 8.5, 4.4],
      [tdk10uf, 3.2, 1.6, 1.8, 5.4, 2.8],
      [panasonic0603, 1.6, 0.8, 0.55, 3.1, 2],
      [panasonic0805, 2, 1.25, 0.6, 4.5, 2.4],
      [tdkC1608, 1.6, 0.8, 0.9, 3.1, 1.9],
      [tdk1uf, 2, 1.25, 1.45, 3.7, 2.5],
      [murata22uf, 3.2, 2.5, 2.7, 5.4, 3.7],
      [buckInductorPattern, 5.3, 5.2, 3, 7.5, 6.4],
      [wroomPattern, 18, 25.5, 3.25, 20, 26.7],
      [ap63203, 1.6, 2.9, 1, 4.2, 4],
      [ao3400a, 1.6, 2.9, 1.25, 4.2, 4.4],
      [fsusb42, 3, 3, 1.1, 6.8, 4.1],
      [stps2l40u, 4.6, 3.95, 2.65, 6.9, 5],
      [usblc6_2sc6, 1.75, 3.05, 1.45, 4.5, 4.1],
      [smbj8_0ca, 4.75, 3.94, 2.61, 8.1, 5],
    ] as const;
    const pitch = 25;
    const firstX = (-pitch * (cases.length - 1)) / 2;
    const circuit = new Circuit();
    circuit.add(
      <board width={pitch * cases.length + 10} height={40} pcbRelative routingDisabled>
        {cases.map(([pattern], index) => (
          <Fragment key={pattern.id}>
            <chip
              name={`U${index + 1}`}
              pcbX={firstX + pitch * index}
              pcbY={4}
              pcbRotation={rotation}
              schX={-30 + 10 * index}
              footprint={<LandPatternFootprint pattern={pattern} />}
              pinLabels={Object.fromEntries(
                pattern.pads.map((p) => [`pin${p.number}`, `P${p.number}`]),
              )}
            />
          </Fragment>
        ))}
      </board>,
    );
    await circuit.renderUntilSettled();
    const json = circuit.getCircuitJson();
    const converter = new CircuitJsonToKicadPcbConverter(json);
    converter.runUntilFinished();
    const native = parseKicadPcb(converter.getOutputString());
    const rotate = ({ x, y }: { x: number; y: number }) => ({
      x:
        x * Math.cos((rotation * Math.PI) / 180) +
        y * Math.sin((rotation * Math.PI) / 180),
      y:
        -x * Math.sin((rotation * Math.PI) / 180) +
        y * Math.cos((rotation * Math.PI) / 180),
    });
    for (const [
      index,
      [pattern, bodyW, bodyH, thickness, courtW, courtH],
    ] of cases.entries()) {
      const declaration = landPatternPhysicalGeometry(pattern)!;
      const packageY = pattern === wroomPattern ? -3 : 0;
      expect(declaration.bodyCenter).toEqual({ x: 0, y: packageY });
      expect(declaration.courtyard.center.x).toBeCloseTo(0, 7);
      expect(declaration.courtyard.center.y).toBeCloseTo(packageY, 7);
      expect(declaration.declaration.body.thicknessMax).toBe(thickness);
      expect(declaration.courtyard.width).toBeCloseTo(courtW, 7);
      expect(declaration.courtyard.height).toBeCloseTo(courtH, 7);
      expect(declaration.declaration.nativeAssembly.paste).toContain("KiCad");
      const component = json
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === `U${index + 1}`)!;
      const pcb = json
        .filter((e) => e.type === "pcb_component")
        .find((e) => e.source_component_id === component.source_component_id)!;
      const body = json
        .filter((e) => e.type === "pcb_fabrication_note_path")
        .find((e) => e.pcb_component_id === pcb.pcb_component_id)!;
      const court = json
        .filter((e) => e.type === "pcb_courtyard_outline")
        .find((e) => e.pcb_component_id === pcb.pcb_component_id)!;
      expect(body.route).toHaveLength(5);
      expect(court.outline).toHaveLength(5);
      const origin = { x: firstX + pitch * index, y: 4 };
      // The compiler reports copper bbox center, not the source placement
      // anchor. Espressif's perimeter spans y=-8.26..8.25, so its bbox center
      // is -0.005 native Y. Physical outlines still use the unchanged origin.
      const copperCenter = rotate({ x: 0, y: pattern === wroomPattern ? -0.005 : 0 });
      expect(pcb.center.x).toBeCloseTo(origin.x + copperCenter.x, 7);
      expect(pcb.center.y).toBeCloseTo(origin.y - copperCenter.y, 7);
      for (const [points, width, height] of [
        [body.route, bodyW, bodyH],
        [court.outline, courtW, courtH],
      ] as const) {
        for (const [corner, [sx, sy]] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ].entries()) {
          const expected = rotate({
            x: (sx * width) / 2,
            y: packageY + (sy * height) / 2,
          });
          expect(points[corner]!.x - origin.x).toBeCloseTo(expected.x, 7);
          expect(origin.y - points[corner]!.y).toBeCloseTo(expected.y, 7);
        }
      }
      const pads = json
        .filter((e) => e.type === "pcb_smtpad")
        .filter((e) => e.pcb_component_id === pcb.pcb_component_id);
      expect(pads).toHaveLength(pattern.pads.length);
      for (const pad of pads) expect(pad.soldermask_margin).toBe(0.05);
      const footprint = native.footprints.find((e) =>
        e.properties.some((p) => p.key === "Reference" && p.value === `U${index + 1}`),
      )!;
      const position = footprint.position;
      if (!(position instanceof At)) throw new Error("Missing native placement");
      expect(position.x).toBeCloseTo(100 + pcb.center.x, 7);
      expect(position.y).toBeCloseTo(100 - pcb.center.y, 7);
      expect(position.angle ?? 0).toBeCloseTo(rotation, 7);
      const nativeBody = footprint.fpLines.filter((line) =>
        line.layer?.names.includes("F.Fab"),
      );
      expect(nativeBody).toHaveLength(4);
      const nativeCourts = footprint.fpPolys.filter((poly) =>
        poly.layer?.names.includes("F.CrtYd"),
      );
      expect(nativeCourts).toHaveLength(1);
      const nativeCourt = nativeCourts[0]!.points!.points;
      expect(nativeCourt).toHaveLength(5);
      // Validate all native global vertices, not only an axis-aligned bbox.
      for (const [nativePoints, sourcePoints] of [
        [nativeBody.map((line) => line.start!), body.route.slice(0, 4)],
        [nativeCourt, court.outline],
      ] as const) {
        for (const [pointIndex, point] of nativePoints.entries()) {
          if (!("x" in point && "y" in point)) throw new Error("Unexpected native arc");
          const world = rotate(point);
          expect(position.x + world.x).toBeCloseTo(
            100 + sourcePoints[pointIndex]!.x,
            7,
          );
          expect(position.y + world.y).toBeCloseTo(
            100 - sourcePoints[pointIndex]!.y,
            7,
          );
        }
      }
      for (const pad of footprint.fpPads) expect(pad.solderMaskMargin).toBe(0.05);
    }
    expect(
      landPatternPhysicalGeometry({ ...ap63203, id: "unknown-model" }),
    ).toBeUndefined();
    expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
      [],
    );
  });
}

test("supervisor, feed, relay gate and USB models bind each physical pin correctly", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={100} height={60} routingDisabled>
      <PsuSupervisor name="U4" pcbX={-30} pcbY={10} schX={-30} schY={0} />
      <SensorPowerFeed name="U5" pcbX={-15} pcbY={10} schX={-15} schY={0} />
      <RelayPermissionGate name="U6" pcbX={0} pcbY={10} schX={0} schY={0} />
      <UsbPresenceDetector name="U7" pcbX={15} pcbY={10} schX={15} schY={0} />
      <UsbDataSwitch name="U8" pcbX={30} pcbY={10} schX={30} schY={0} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((entry) => entry.type === "source_component");
  const ports = json.filter((entry) => entry.type === "source_port");
  const pcbPorts = json.filter((entry) => entry.type === "pcb_port");
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  for (const [name, x, expected, halfSpan, width] of [
    ["U4", -30, ["RESET_N", "GND", "MR_N", "CT", "SENSE", "VDD"], 1.3, 1.1],
    ["U5", -15, ["IN", "GND", "EN", "FAULT_N", "ILIM", "OUT"], 1.3, 1.1],
    ["U6", 0, ["A", "B", "GND", "Y", "VCC"], 1.3, 1.1],
    ["U7", 15, ["NC", "A", "GND", "Y", "VCC"], 1.3, 1.1],
    [
      "U8",
      30,
      [
        "VCC",
        "SEL",
        "D_P",
        "D_N",
        "GND",
        "HSD1_N",
        "HSD1_P",
        "HSD2_N",
        "HSD2_P",
        "OE_N",
      ],
      2.2,
      1.4,
    ],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    const partPorts = ports
      .filter((entry) => entry.source_component_id === component?.source_component_id)
      .sort((a, b) => (a.pin_number ?? 0) - (b.pin_number ?? 0));
    expect(partPorts.map((entry) => entry.name)).toEqual([...expected]);
    for (const port of partPorts) {
      const physical = pcbPorts.find(
        (entry) => entry.source_port_id === port.source_port_id,
      );
      const pad = pads.find((entry) => entry.pcb_port_id === physical?.pcb_port_id);
      expect(pad?.shape).toBe("rect");
      if (!pad || pad.shape !== "rect")
        throw new Error(`Missing rectangular pad for ${name}.${port.name}`);
      expect(Math.abs(pad.x - x)).toBeCloseTo(halfSpan, 6);
      expect(pad.width).toBeCloseTo(width, 6);
      expect(pad.height).toBeCloseTo(name === "U8" ? 0.3 : 0.6, 6);
      // Pin1 is always upper-left in the adopted electrical top view.
      if (port.pin_number === 1) {
        expect(pad.x).toBeCloseTo(x - halfSpan, 6);
        expect(pad.y).toBeCloseTo(name === "U8" ? 11 : 10.95, 6);
      }
    }
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});

test("regulator, relay and sensor-buffer lands preserve pin identity after rotation", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <ControllerBuck
        name="U2"
        pcbX={-15}
        pcbY={5}
        pcbRotation={90}
        schX={-10}
        schY={0}
      />
      <RelayMosfet name="Q1" pcbX={0} pcbY={5} pcbRotation={180} schX={0} schY={0} />
      <SensorBusBuffer
        name="U3"
        pcbX={15}
        pcbY={5}
        pcbRotation={270}
        schX={10}
        schY={0}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((entry) => entry.type === "source_component");
  const sourcePorts = json.filter((entry) => entry.type === "source_port");
  const physicalPorts = json.filter((entry) => entry.type === "pcb_port");
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  for (const [name, pattern, x, rotation] of [
    ["U2", ap63203, -15, 90],
    ["Q1", ao3400a, 0, 180],
    ["U3", tca9517a, 15, 270],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    const rad = (rotation * Math.PI) / 180;
    for (const expected of pattern.pads) {
      const source = sourcePorts.find(
        (entry) =>
          entry.source_component_id === component?.source_component_id &&
          entry.pin_number === Number(expected.number),
      );
      expect(source).toBeDefined();
      const physical = physicalPorts.find(
        (entry) => entry.source_port_id === source?.source_port_id,
      );
      expect(physical).toBeDefined();
      expect(physical?.x).toBeCloseTo(
        x + expected.x * Math.cos(rad) + expected.y * Math.sin(rad),
        6,
      );
      expect(physical?.y).toBeCloseTo(
        5 + expected.x * Math.sin(rad) - expected.y * Math.cos(rad),
        6,
      );
      expect(
        pads.filter((entry) => entry.pcb_port_id === physical?.pcb_port_id),
      ).toHaveLength(1);
    }
  }
  // Independently fixed critical pin/function expectations from the datasheets.
  const names = (name: string) => {
    const component = components.find((entry) => entry.name === name);
    return sourcePorts
      .filter((entry) => entry.source_component_id === component?.source_component_id)
      .sort((a, b) => (a.pin_number ?? 0) - (b.pin_number ?? 0))
      .map((entry) => entry.name);
  };
  expect(names("U2")).toEqual(["FB", "EN", "VIN", "GND", "SW", "BST"]);
  expect(names("Q1")).toEqual(["G", "S", "D"]);
  expect(names("U3")).toEqual([
    "VCCA",
    "SCLA",
    "SDAA",
    "GND",
    "EN",
    "SDAB",
    "SCLB",
    "VCCB",
  ]);
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});

test("WROOM module pads retain the selected firmware functions and NC", () => {
  expect(wroomPins.pin11).toBe("IO10");
  expect(wroomPins.pin12).toBe("IO11");
  expect(wroomPins.pin13).toBe("IO12");
  expect(wroomPins.pin14).toBe("IO13");
  expect(wroomPins.pin16).toBe("IO18");
  expect(wroomPins.pin17).toBe("IO19");
  expect(wroomPins.pin22).toBe("NC");
  expect(wroomPins.pin29).toBe("GND_EP");
});

test("the compiled WROOM retains every pad and the native asymmetric origin", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <Esp32C6Wroom name="U1" pcbX={12} pcbY={18} schX={0} schY={0} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  expect(pads).toHaveLength(37);
  const ports = json.filter((entry) => entry.type === "source_port");
  const ep = ports.find((port) => port.pin_number === 29);
  expect(ep).toBeDefined();
  const component = json.find((entry) => entry.type === "source_component");
  const epGroup = component?.internally_connected_source_port_ids?.find(
    (group) => ep !== undefined && group.includes(ep.source_port_id),
  );
  // The pinned compiler gives non-overlapping lands separate physical ports and
  // joins them internally. Verify that group instead of assuming one PCB port.
  expect(epGroup).toHaveLength(9);
  const epPcbPorts = json
    .filter((entry) => entry.type === "pcb_port")
    .filter((entry) => epGroup?.includes(entry.source_port_id));
  expect(epPcbPorts).toHaveLength(9);
  const epPads = pads.filter((pad) =>
    epPcbPorts.some((port) => port.pcb_port_id === pad.pcb_port_id),
  );
  expect(epPads).toHaveLength(9);
  for (const expected of wroomPattern.pads) {
    expect(
      pads.some(
        (pad) =>
          pad.shape === "rect" &&
          Math.abs(pad.x - (12 + expected.x)) < 0.00001 &&
          Math.abs(pad.y - (18 - expected.y)) < 0.00001 &&
          "width" in pad &&
          Math.abs(pad.width - expected.width) < 0.00001 &&
          "height" in pad &&
          Math.abs(pad.height - expected.height) < 0.00001,
      ),
    ).toBe(true);
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});
