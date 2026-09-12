import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerLogicPower } from "./logic-power";

test("logic supply preserves diode isolation, bootstrap connection and direct fixed-output feedback", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet
        name="Power"
        displayName="Controller logic power"
        sheetIndex={0}
      />
      <ControllerLogicPower />
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
  expect(components).toHaveLength(10);
  expect(endpoints("V5_PSU")).toEqual(["D1.2"]);
  expect(endpoints("V5_SERVICE")).toEqual(["D2.2"]);
  expect(endpoints("V5_LOGIC")).toEqual([
    "C1.1",
    "C2.1",
    "C7.1",
    "D1.1",
    "D2.1",
    "U2.2",
    "U2.3",
  ]);
  expect(endpoints("BUCK_BST")).toEqual(["C8.1", "U2.6"]);
  expect(endpoints("BUCK_SW")).toEqual(["C8.2", "L1.1", "U2.5"]);
  expect(endpoints("V3V3")).toEqual(["C3.1", "C4.1", "L1.2", "U2.1"]);
  expect(endpoints("GND")).toEqual(["C1.2", "C2.2", "C3.2", "C4.2", "C7.2", "U2.4"]);
  expect(nets.map((e) => e.name).sort()).toEqual([
    "BUCK_BST",
    "BUCK_SW",
    "GND",
    "V3V3",
    "V5_LOGIC",
    "V5_PSU",
    "V5_SERVICE",
  ]);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});
