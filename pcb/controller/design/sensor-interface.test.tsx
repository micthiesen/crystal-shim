import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerSensorInterface, sensorInterfaceBoundary } from "./sensor-interface";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

// Independent physical-pin contract: ESP B-side, isolated buffer A-side and
// connector segments must never collapse to the older shared SDA/SCL names.
const expectedNets = {
  V5_LOGIC: ["U5.1", "U5.5", "C42.1"],
  V5_SENSOR_SW: ["U5.6", "C43.1", "C44.1", "R67.1", "R68.1"],
  V5_SENSOR: ["R68.2", "D7.1", "J3.1"],
  V3V3: ["U3.1", "U3.8", "C40.1", "C41.1", "R60.1", "R61.1", "R66.1"],
  GND: [
    "U5.2",
    "U3.4",
    "U11.2",
    "D7.2",
    "J3.4",
    "J3.5",
    "J3.6",
    "C40.2",
    "C41.2",
    "C42.2",
    "C43.2",
    "C44.2",
    "R64.2",
    "R65.2",
    "R67.2",
  ],
  SENSOR_POWER_EN: ["U5.3", "R65.1"],
  SENSOR_POWER_FAULT_N: ["U5.4", "R66.2"],
  SENSOR_BUS_EN: ["U3.5", "R64.1"],
  SENSOR_SDA: ["U3.6", "R60.2"],
  SENSOR_SCL: ["U3.7", "R61.2"],
  SDA_BUFFER_A: ["U3.3", "R62.1"],
  SCL_BUFFER_A: ["U3.2", "R63.1"],
  SDA_CABLE: ["R62.2", "U11.4", "J3.2"],
  SCL_CABLE: ["R63.2", "U11.5", "J3.3"],
};

test("sensor interface preserves protected power, three I2C segments and every physical connector/ESD pin", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet name="SensorInterface" sheetIndex={0} />
      <ControllerSensorInterface />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const names = new Map(
    ports.map((port) => [
      port.source_port_id,
      `${components.find((e) => e.source_component_id === port.source_component_id)!.name}.${port.pin_number}`,
    ]),
  );
  expect(components.map((e) => [e.name, e.manufacturer_part_number]).sort()).toEqual(
    [
      ["U3", "TCA9517ADGKR"],
      ["U5", "TPS2553DBVR"],
      ["U11", "ESDS312DBVR"],
      ["D7", "SMBJ7.0A"],
      ["J3", "43045-0600"],
      ["R60", "ERJ3EKF2701V"],
      ["R61", "ERJ3EKF2701V"],
      ["R62", "ERJ3EKF22R0V"],
      ["R63", "ERJ3EKF22R0V"],
      ["R64", "ERJ3EKF1002V"],
      ["R65", "ERJ3EKF1002V"],
      ["R66", "ERJ3EKF1002V"],
      ["R67", "ERJ3EKF1002V"],
      ["R68", "CRCW25126R80FKEGHP"],
      ["C40", "C1608X7R1H104K080AA"],
      ["C41", "C1608X7R1H104K080AA"],
      ["C42", "C1608X7R1H104K080AA"],
      ["C43", "C2012X7R1E105K125AB"],
      ["C44", "C3216X7R1E106K160AB"],
    ].sort(),
  );
  expect(ports).toHaveLength(55);
  expect(nets.map((e) => e.name).sort()).toEqual(Object.keys(expectedNets).sort());
  for (const [name, endpoints] of Object.entries(expectedNets)) {
    const net = nets.find((e) => e.name === name)!;
    const connected = new Set(
      traces
        .filter((e) => e.connected_source_net_ids.includes(net.source_net_id))
        .flatMap((e) => e.connected_source_port_ids),
    );
    expect([...connected].map((id) => names.get(id)).sort(), name).toEqual(
      [...endpoints].sort(),
    );
  }
  for (const nc of ["U11.1", "U11.3"]) {
    const port = ports.find((e) => names.get(e.source_port_id) === nc)!;
    expect(
      traces.some((e) => e.connected_source_port_ids.includes(port.source_port_id)),
    ).toBe(false);
  }
  for (const [ref, value] of [
    ["R60", 2700],
    ["R61", 2700],
    ["R62", 22],
    ["R63", 22],
    ["R64", 10000],
    ["R65", 10000],
    ["R66", 10000],
    ["R67", 10000],
    ["R68", 6.8],
  ] as const) {
    const part = components.find((e) => e.name === ref);
    if (part?.ftype !== "simple_resistor") throw new Error(`Missing ${ref}`);
    expect(part.resistance).toBe(value);
  }
  for (const [ref, value, voltage] of [
    ["C40", 1e-7, 50],
    ["C41", 1e-7, 50],
    ["C42", 1e-7, 50],
    ["C43", 1e-6, 25],
    ["C44", 1e-5, 25],
  ] as const) {
    const part = components.find((e) => e.name === ref);
    if (part?.ftype !== "simple_capacitor") throw new Error(`Missing ${ref}`);
    expect(part.capacitance).toBe(value);
    expect(part.max_voltage_rating).toBe(voltage);
  }
  const u11 = components.find((e) => e.name === "U11")!;
  expect(u11.internally_connected_source_port_ids ?? []).toEqual([]);
  expect(sensorInterfaceBoundary).toEqual([
    "V5_LOGIC",
    "V3V3",
    "GND",
    "SENSOR_SDA",
    "SENSOR_SCL",
    "SENSOR_BUS_EN",
    "SENSOR_POWER_EN",
    "SENSOR_POWER_FAULT_N",
  ]);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});
