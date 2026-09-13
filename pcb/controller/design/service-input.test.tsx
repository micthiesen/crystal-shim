import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerServiceInput } from "./service-input";
import { ControllerLogicPower } from "./logic-power";
import { ControllerRelayDrive } from "./relay-drive";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

test("known-adapter service input has only its connector and bypass capacitors", async () => {
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
  expect(components).toHaveLength(3);
  expect(endpoints("V5_SERVICE")).toEqual(["C20.1", "C21.1", "J2.1"]);
  expect(endpoints("GND")).toEqual(["C20.2", "C21.2", "J2.2"]);
  expect(nets.map((e) => e.name).sort()).toEqual(["GND", "V5_SERVICE"]);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  expect(schematicConnectivityErrors(json)).toEqual([]);
});

test("service joins the existing OR input without creating a coil-supply or PSU-sense path", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled pcbRelative>
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
  expect(components).toHaveLength(25);
  expect(new Set(components.map((e) => e.name)).size).toBe(25);
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
