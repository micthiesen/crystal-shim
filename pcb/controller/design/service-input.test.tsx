import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerServiceInput } from "./service-input";
import { ControllerLogicPower } from "./logic-power";
import { ControllerRelayDrive } from "./relay-drive";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

test("service protection retains both reverse-input series resistors, current limit and output clamp", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet
        name="Service"
        displayName="Controller service protection"
        sheetIndex={0}
      />
      <ControllerServiceInput />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const endpoints = (name: string) => {
    const net = nets.find((e) => e.name === name);
    expect(net).toBeDefined();
    const ids = new Set(
      traces
        .filter((e) => e.connected_source_net_ids.includes(net!.source_net_id))
        .flatMap((e) => e.connected_source_port_ids),
    );
    return ports
      .filter((e) => ids.has(e.source_port_id))
      .map(
        (e) =>
          `${components.find((c) => c.source_component_id === e.source_component_id)?.name}.${e.pin_number}`,
      )
      .sort();
  };
  expect(components).toHaveLength(16);
  expect(endpoints("V5_SERVICE_RAW")).toEqual([
    "C20.1",
    "C21.1",
    "D5.1",
    "J2.1",
    "R30.1",
    "R33.1",
    "U10.5",
  ]);
  expect(endpoints("SERVICE_UV_DIV")).toEqual(["R30.2", "R31.1", "R32.1"]);
  expect(endpoints("SERVICE_UVLO")).toEqual(["R32.2", "U10.1"]);
  expect(endpoints("SERVICE_OV_DIV")).toEqual(["R33.2", "R34.1", "R35.1"]);
  expect(endpoints("SERVICE_OVLO")).toEqual(["R35.2", "U10.2"]);
  expect(endpoints("SERVICE_ILM")).toEqual(["R36.1", "U10.9"]);
  expect(endpoints("SERVICE_DVDT")).toEqual(["C23.1", "U10.7"]);
  expect(endpoints("V5_SERVICE")).toEqual(["C22.1", "D6.1", "R37.1", "U10.6"]);
  expect(endpoints("GND")).toEqual([
    "C20.2",
    "C21.2",
    "C22.2",
    "C23.2",
    "D5.2",
    "D6.2",
    "J2.2",
    "R31.2",
    "R34.2",
    "R36.2",
    "R37.2",
    "U10.8",
  ]);
  expect(nets.map((e) => e.name).sort()).toEqual([
    "GND",
    "SERVICE_DVDT",
    "SERVICE_ILM",
    "SERVICE_OVLO",
    "SERVICE_OV_DIV",
    "SERVICE_UVLO",
    "SERVICE_UV_DIV",
    "V5_SERVICE",
    "V5_SERVICE_RAW",
  ]);

  const efuse = components.find((e) => e.name === "U10")!;
  const unused = ports
    .filter(
      (e) =>
        e.source_component_id === efuse.source_component_id &&
        !traces.some((t) => t.connected_source_port_ids.includes(e.source_port_id)),
    )
    .map((e) => e.pin_number)
    .sort((a, b) => a! - b!);
  expect(unused).toEqual([3, 4, 10]);
  // These values close specific reversed-input and current-limit calculations.
  for (const [ref, ohms] of [
    ["R30", 26100],
    ["R31", 10000],
    ["R32", 470000],
    ["R33", 38300],
    ["R34", 10000],
    ["R35", 470000],
    ["R36", 2870],
    ["R37", 2200],
  ] as const) {
    const component = components.find((e) => e.name === ref);
    if (component?.ftype !== "simple_resistor")
      throw new Error(`Missing resistor ${ref}`);
    expect(component.resistance).toBe(ohms);
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  expect(schematicConnectivityErrors(json)).toEqual([]);
  const withoutControlLabels = json.filter(
    (e) => e.type !== "schematic_net_label" || !e.text.startsWith("SERVICE_"),
  );
  expect(schematicConnectivityErrors(withoutControlLabels).length).toBeGreaterThan(0);
});

test("service joins the existing OR input without creating a coil-supply or PSU-sense path", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet name="Service" sheetIndex={0} />
      <schematicsheet name="Power" sheetIndex={1} />
      <schematicsheet name="Relay" sheetIndex={2} />
      <ControllerServiceInput />
      <ControllerLogicPower />
      <ControllerRelayDrive />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  expect(components).toHaveLength(38);
  expect(new Set(components.map((e) => e.name)).size).toBe(38);
  for (const [ref, pin, expected] of [
    ["D2", 2, "V5_SERVICE"],
    ["D2", 1, "V5_LOGIC"],
    ["D1", 2, "V5_PSU"],
    ["D1", 1, "V5_LOGIC"],
    ["R14", 1, "V5_PSU"],
    ["Q1", 3, "COIL_DRAIN"],
    ["J1", 1, "V5_PSU"],
    ["J1", 2, "GND"],
    ["J1", 3, "COIL_DRAIN"],
  ] as const) {
    const component = components.find((e) => e.name === ref)!;
    const port = ports.find(
      (e) =>
        e.source_component_id === component.source_component_id && e.pin_number === pin,
    )!;
    const connected = new Set(
      traces
        .filter((e) => e.connected_source_port_ids.includes(port.source_port_id))
        .flatMap((e) => e.connected_source_net_ids),
    );
    expect(
      nets.filter((e) => connected.has(e.source_net_id)).map((e) => e.name),
    ).toEqual([expected]);
  }
  expect(nets.some((e) => e.name === "USB_VBUS")).toBe(false);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});
