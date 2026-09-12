import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { PowerSchottky, UsbEsdProtection } from "./protection-components";

test("STPS2L40U SMB copper preserves the adopted K/A map at both orientations", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={50} height={40} routingDisabled>
      <PowerSchottky name="D_FORWARD" pcbX={-10} pcbY={4} schX={-10} schY={0} />
      <PowerSchottky
        name="D_REVERSED"
        pcbX={10}
        pcbY={4}
        pcbRotation={180}
        schX={10}
        schY={0}
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
  for (const [name, centreX, direction] of [
    ["D_FORWARD", -10, 1],
    ["D_REVERSED", 10, -1],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    expect(component?.manufacturer_part_number).toBe("STPS2L40U");
    const partPorts = ports.filter(
      (entry) => entry.source_component_id === component?.source_component_id,
    );
    expect(partPorts).toHaveLength(2);
    for (const [number, functionName, x] of [
      [1, "K", -2.11],
      [2, "A", 2.11],
    ] as const) {
      const source = partPorts.find((entry) => entry.pin_number === number);
      expect(source?.name).toBe(functionName);
      const physical = pcbPorts.find(
        (entry) => entry.source_port_id === source?.source_port_id,
      );
      const matches = pads.filter(
        (entry) => entry.pcb_port_id === physical?.pcb_port_id,
      );
      expect(matches).toHaveLength(1);
      const pad = matches[0];
      if (pad?.shape !== "rect") throw new Error(`Missing ${name} pad ${number}`);
      expect(pad.x).toBeCloseTo(centreX + direction * x, 6);
      expect(pad.y).toBeCloseTo(4, 6);
      expect(pad.width).toBeCloseTo(1.62, 6);
      expect(pad.height).toBeCloseTo(2.18, 6);
    }
    // A diode is not an internal hard short in the connectivity model.
    expect(component?.internally_connected_source_port_ids ?? []).toEqual([]);
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});

test("USBLC6 copper and physical functions survive top-view conversion and rotation", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={50} height={40} routingDisabled>
      <UsbEsdProtection name="U_ESD" pcbX={-10} pcbY={4} schX={-10} schY={0} />
      <UsbEsdProtection
        name="U_ROTATED"
        pcbX={10}
        pcbY={4}
        pcbRotation={90}
        schX={10}
        schY={0}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((entry) => entry.type === "source_component");
  const ports = json.filter((entry) => entry.type === "source_port");
  const pcbPorts = json.filter((entry) => entry.type === "pcb_port");
  const pads = json.filter((entry) => entry.type === "pcb_smtpad");
  expect(pads).toHaveLength(12);

  // Independent transcription of DS4260 Rev7 p1/p13, in native +Y-down form.
  const expectedPins = [
    [1, "IO1_1", -1.15, -0.95],
    [2, "GND", -1.15, 0],
    [3, "IO2_3", -1.15, 0.95],
    [4, "IO2_4", 1.15, 0.95],
    [5, "VBUS", 1.15, 0],
    [6, "IO1_6", 1.15, -0.95],
  ] as const;
  for (const [name, centreX, rotation] of [
    ["U_ESD", -10, 0],
    ["U_ROTATED", 10, 90],
  ] as const) {
    const component = components.find((entry) => entry.name === name);
    expect(component?.manufacturer_part_number).toBe("USBLC6-2SC6");
    const partPorts = ports.filter(
      (entry) => entry.source_component_id === component?.source_component_id,
    );
    expect(partPorts).toHaveLength(6);
    for (const [number, functionName, x, y] of expectedPins) {
      const source = partPorts.find((entry) => entry.pin_number === number);
      expect(source?.name).toBe(functionName);
      const physical = pcbPorts.find(
        (entry) => entry.source_port_id === source?.source_port_id,
      );
      const matches = pads.filter(
        (entry) => entry.pcb_port_id === physical?.pcb_port_id,
      );
      expect(matches).toHaveLength(1);
      const pad = matches[0];
      if (pad?.shape !== "rect") throw new Error(`Missing ${name} pad ${number}`);
      expect(pad.x).toBeCloseTo(centreX + (rotation === 0 ? x : y), 6);
      expect(pad.y).toBeCloseTo(4 + (rotation === 0 ? -y : x), 6);
      expect(pad.width).toBeCloseTo(rotation === 0 ? 1.2 : 0.6, 6);
      expect(pad.height).toBeCloseTo(rotation === 0 ? 0.6 : 1.2, 6);
    }

    // The source net model must retain both separate pass-through paths. The
    // clamp/steering diodes do not establish hard shorts to GND or VBUS.
    const groups = component?.internally_connected_source_port_ids?.map((group) =>
      group
        .map((id) => partPorts.find((port) => port.source_port_id === id)?.pin_number)
        .sort((a, b) => (a ?? 0) - (b ?? 0)),
    );
    expect(groups?.sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))).toEqual([
      [1, 6],
      [3, 4],
    ]);
  }
  expect(
    json.filter((entry) => "error_type" in entry || entry.type.endsWith("_error")),
  ).toEqual([]);
});
