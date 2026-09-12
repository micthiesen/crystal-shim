import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerRelayDrive } from "./relay-drive";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

test("relay circuit compiles the supervisor, independent permission gate and low-side coil path", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet
        name="Relay"
        displayName="Controller relay permission"
        sheetIndex={0}
      />
      <ControllerRelayDrive />
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
  expect(components).toHaveLength(12);
  expect(components.find((e) => e.name === "J1")?.manufacturer_part_number).toBe(
    "43650-0300",
  );
  expect(endpoints("V5_PSU")).toEqual(["J1.1", "R14.1"]);
  expect(endpoints("PSU_SENSE")).toEqual(["R14.2", "R15.1", "U4.5"]);
  expect(endpoints("PSU_GOOD")).toEqual(["R12.2", "U4.1", "U6.2"]);
  expect(endpoints("CHIP_EN")).toEqual(["U4.3"]);
  expect(endpoints("RELAY_REQUEST")).toEqual(["R2.1", "U6.1"]);
  expect(endpoints("RELAY_GATED")).toEqual(["R20.1", "U6.4"]);
  expect(endpoints("MOS_GATE")).toEqual(["Q1.1", "R11.1", "R20.2"]);
  expect(endpoints("COIL_DRAIN")).toEqual(["J1.3", "Q1.3"]);
  expect(endpoints("GND")).toEqual([
    "C11.2",
    "C12.2",
    "J1.2",
    "Q1.2",
    "R11.2",
    "R15.2",
    "R2.2",
    "U4.2",
    "U6.3",
  ]);
  // The only supervisor pin without a net must be its intentionally open CT.
  const supervisor = components.find((e) => e.name === "U4");
  const ct = ports.find(
    (e) =>
      e.source_component_id === supervisor?.source_component_id && e.pin_number === 4,
  );
  expect(ct).toBeDefined();
  expect(
    traces.some((e) => e.connected_source_port_ids.includes(ct!.source_port_id)),
  ).toBe(false);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  expect(schematicConnectivityErrors(json)).toEqual([]);
  const withoutPermissionLabels = json.filter(
    (e) => e.type !== "schematic_net_label" || e.text !== "PSU_GOOD",
  );
  expect(schematicConnectivityErrors(withoutPermissionLabels).length).toBeGreaterThan(
    0,
  );
});
