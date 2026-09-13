import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerModuleControls } from "./module-controls";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "./schematic-connectivity-check";

async function fixture() {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet
        name="Module"
        displayName="ESP module and local controls"
        sheetIndex={0}
      />
      <ControllerModuleControls />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

test("module controls preserve GPIO allocation, separate buttons and current-limited reset/LED paths", async () => {
  const json = await fixture();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json
    .filter((e) => e.type === "source_port")
    .filter((e) => e.pin_number !== undefined);
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
  const expected = {
    V3V3: ["C5.1", "C6.1", "R50.1", "R51.1", "R52.1", "R53.1", "U1.2"],
    GND: [
      "C5.2",
      "C6.2",
      "C9.2",
      "D4.1",
      "SW1.2",
      "SW2.2",
      "SW3.2",
      "U1.1",
      "U1.28",
      "U1.29",
    ],
    CHIP_EN: ["C9.1", "R53.2", "R55.1", "U1.3"],
    RESET_CONTACT: ["R55.2", "SW3.1"],
    MAINTENANCE_N: ["R50.2", "SW1.1", "U1.12"],
    BOOT_N: ["R51.2", "SW2.1", "U1.15"],
    BOOT_STRAP8: ["R52.2", "U1.10"],
    STATUS_LED: ["R54.1", "U1.18"],
    LED_ANODE: ["D4.2", "R54.2"],
    RELAY_REQUEST: ["U1.11"],
    PSU_GOOD: ["U1.19"],
    SENSOR_BUS_EN: ["U1.8"],
    SENSOR_POWER_EN: ["U1.20"],
    SENSOR_POWER_FAULT_N: ["U1.21"],
    SENSOR_SDA: ["U1.16"],
    SENSOR_SCL: ["U1.17"],
    USB_D_N: ["U1.13"],
    USB_D_P: ["U1.14"],
    PUMP_TRANSFER: ["U1.9"],
    PUMP_CHLORINE: ["U1.27"],
    PUMP_DECHLOR: ["U1.26"],
    ACCESSORY_INPUT1: ["U1.4"],
    ACCESSORY_INPUT2: ["U1.5"],
    RESERVOIR_SDA: ["U1.6"],
    RESERVOIR_SCL: ["U1.7"],
    UART0_RX: ["U1.24"],
    UART0_TX: ["U1.25"],
  };
  expect(components).toHaveLength(14);
  expect(nets.map((e) => e.name).sort()).toEqual(Object.keys(expected).sort());
  for (const [net, pins] of Object.entries(expected))
    expect(endpoints(net)).toEqual(pins);
  const module = components.find((e) => e.name === "U1")!;
  expect(module.manufacturer_part_number).toBe("ESP32-C6-WROOM-1-N8");
  const unused = ports
    .filter(
      (e) =>
        e.source_component_id === module.source_component_id &&
        !traces.some((t) => t.connected_source_port_ids.includes(e.source_port_id)),
    )
    .map((e) => e.pin_number)
    .sort((a, b) => a! - b!);
  expect(unused).toEqual([22, 23]);
  for (const [ref, ohms] of [
    ["R50", 10000],
    ["R51", 10000],
    ["R52", 10000],
    ["R53", 10000],
    ["R54", 680],
    ["R55", 330],
  ] as const) {
    const part = components.find((e) => e.name === ref);
    if (part?.ftype !== "simple_resistor") throw new Error(`Missing ${ref}`);
    expect(part.resistance).toBe(ohms);
  }
  expect(
    components
      .filter((e) => e.name.startsWith("SW"))
      .map((e) => e.manufacturer_part_number),
  ).toEqual(["B3F-1002-G", "B3F-1002-G", "B3F-1002-G"]);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});

test("module signal labels serve distinct short islands and face inward at page edges", async () => {
  const json = await fixture();
  const components = json.filter((e) => e.type === "source_component");
  const names = new Map(
    json
      .filter((e) => e.type === "source_port")
      .map((port) => [
        port.source_port_id,
        `${components.find((e) => e.source_component_id === port.source_component_id)!.name}.${port.pin_number}`,
      ]),
  );
  const connected = (input: typeof json) =>
    new Map(
      [...schematicPortNetNames(input)].map(([id, nets]) => [names.get(id)!, nets]),
    );
  const before = connected(json);
  const labels = json.filter((e) => e.type === "schematic_net_label");
  const enableLabels = labels.filter((e) => e.text === "CHIP_EN");
  expect(enableLabels).toHaveLength(4);
  const enableIslands: string[][] = [];
  for (const label of enableLabels) {
    const cut = connected(json.filter((e) => e !== label));
    const lost: string[] = [];
    for (const [pin, prior] of before) {
      if (JSON.stringify(cut.get(pin)) !== JSON.stringify(prior)) {
        expect(prior, pin).toEqual(["CHIP_EN"]);
        expect(cut.get(pin), pin).toEqual([]);
        lost.push(pin);
      }
    }
    enableIslands.push(lost.sort());
  }
  // The old automatic U1/R53 wire joined two labels and crossed their text.
  expect(enableIslands.sort()).toEqual([["C9.1"], ["R53.2"], ["R55.1"], ["U1.3"]]);
  for (const [net, pin, side] of [
    ["MAINTENANCE_N", "SW1.1", "left"],
    ["BOOT_N", "SW2.1", "left"],
    ["RESET_CONTACT", "SW3.1", "left"],
    ["LED_ANODE", "D4.2", "right"],
  ] as const) {
    const port = json
      .filter((e) => e.type === "schematic_port")
      .find((e) => names.get(e.source_port_id) === pin)!;
    const label = labels
      .filter((e) => e.text === net)
      .find(
        (e) => connected(json.filter((entry) => entry !== e)).get(pin)?.length === 0,
      )!;
    expect(label, pin).toBeDefined();
    // These short elbows leave a label above the switch/LED and point its text
    // toward the sheet interior. Automatic pin-end labels crossed the frame.
    expect(label.anchor_side, pin).toBe(side);
    expect(label.anchor_position!.y - port.center.y, pin).toBeGreaterThanOrEqual(0.6);
    expect(label.anchor_position!.y - port.center.y, pin).toBeLessThanOrEqual(0.8);
    expect(Math.abs(label.anchor_position!.x - port.center.x), pin).toBeLessThanOrEqual(
      0.8,
    );
  }
  expect(schematicConnectivityErrors(json)).toEqual([]);
});
