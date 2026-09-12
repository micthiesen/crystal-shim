import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
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
