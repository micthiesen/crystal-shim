import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import ControllerCircuit from "./controller.circuit";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

test("controller schematic preserves power separation, hardware permission and buffered sensor boundaries across sheets", async () => {
  const circuit = new Circuit();
  circuit.add(<ControllerCircuit />);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  expect(components).toHaveLength(95);
  expect(new Set(components.map((e) => e.name)).size).toBe(95);
  expect(new Set(nets.map((e) => e.name)).size).toBe(nets.length);
  expect(json.filter((e) => e.type === "schematic_sheet")).toHaveLength(7);
  // Multiple unanchored groups otherwise trigger automatic board packing,
  // which moves and rotates even explicitly placed section components.
  for (const [ref, x, y, rotation] of [
    ["TP1", -24, -29, 0],
    ["TP10", 20, -37, 0],
    ["J4", -20, 1.14, 0],
  ] as const) {
    const source = components.find((e) => e.name === ref)!;
    const placed = json
      .filter((e) => e.type === "pcb_component")
      .find((e) => e.source_component_id === source.source_component_id)!;
    expect(placed.center.x).toBeCloseTo(x, 6);
    expect(placed.center.y).toBeCloseTo(y, 6);
    expect(placed.rotation).toBeCloseTo(rotation, 6);
  }

  // Check the board interfaces as whole named electrical nodes. A section-level
  // test cannot detect an extra connection introduced by another sheet.
  const expectedBoundaries = {
    V5_PSU: ["D1.2", "J1.1", "R14.1", "TP2.1"],
    V5_SERVICE_RAW: ["C20.1", "C21.1", "D5.1", "J2.1", "R30.1", "R33.1", "U10.5"],
    V5_SERVICE: ["C22.1", "D2.2", "D6.1", "R37.1", "U10.6"],
    V5_LOGIC: [
      "C1.1",
      "C2.1",
      "C42.1",
      "C7.1",
      "D1.1",
      "D2.1",
      "TP3.1",
      "U2.2",
      "U2.3",
      "U5.1",
      "U5.5",
    ],
    USB_VBUS: ["J4.10", "J4.15", "J4.2", "J4.7", "R42.1", "U9.5"],
    COIL_DRAIN: ["J1.3", "Q1.3"],
    PSU_GOOD: ["R12.2", "TP7.1", "U1.19", "U4.1", "U6.2"],
    RELAY_REQUEST: ["R2.1", "U1.11", "U6.1"],
    RELAY_GATED: ["R20.1", "TP8.1", "U6.4"],
    MOS_GATE: ["Q1.1", "R11.1", "R20.2"],
    CHIP_EN: ["C9.1", "R53.2", "R55.1", "U1.3", "U4.3"],
    SENSOR_BUS_EN: ["R64.1", "U1.8", "U3.5"],
    SENSOR_POWER_EN: ["R65.1", "U1.20", "U5.3"],
    SENSOR_POWER_FAULT_N: ["R66.2", "U1.21", "U5.4"],
    V5_SENSOR_SW: ["C43.1", "C44.1", "R67.1", "R68.1", "U5.6"],
    V5_SENSOR: ["D7.1", "J3.1", "R68.2"],
    SENSOR_SDA: ["R60.2", "TP5.1", "U1.16", "U3.6"],
    SENSOR_SCL: ["R61.2", "TP6.1", "U1.17", "U3.7"],
    SDA_BUFFER_A: ["R62.1", "U3.3"],
    SCL_BUFFER_A: ["R63.1", "U3.2"],
    SDA_CABLE: ["J3.2", "R62.2", "U11.4"],
    SCL_CABLE: ["J3.3", "R63.2", "U11.5"],
    UART0_RX: ["TP9.1", "U1.24"],
    UART0_TX: ["TP10.1", "U1.25"],
  };
  for (const [name, expected] of Object.entries(expectedBoundaries)) {
    const net = nets.find((e) => e.name === name);
    expect(net).toBeDefined();
    const ids = new Set(
      traces
        .filter((e) => e.connected_source_net_ids.includes(net!.source_net_id))
        .flatMap((e) => e.connected_source_port_ids),
    );
    const actual = ports
      .filter((e) => ids.has(e.source_port_id))
      .map((e) => {
        const component = components.find(
          (c) => c.source_component_id === e.source_component_id,
        );
        return `${component?.name}.${e.pin_number}`;
      });
    expect(actual.sort()).toEqual(expected.sort());
  }
  // This is the electrical integration gate. The section review placements
  // overlap; real board placement checks must pass separately before handoff.
  expect(
    json.filter(
      (e) =>
        ("error_type" in e || e.type.endsWith("_error")) && !e.type.startsWith("pcb_"),
    ),
  ).toEqual([]);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  // This regression mimics the real exporter hazard: names still readable as
  // text and source nets intact, but physical pins lose their electrical labels.
  expect(
    schematicConnectivityErrors(
      json.filter(
        (e) => e.type !== "schematic_net_label" || e.text !== "SENSOR_POWER_FAULT_N",
      ),
    ).length,
  ).toBeGreaterThan(0);
});
