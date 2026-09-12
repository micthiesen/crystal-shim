import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { ControllerUsbInterface, usbInterfaceBoundary } from "./usb-interface";
import {
  schematicPortNetNames,
  schematicConnectivityErrors,
} from "./schematic-connectivity-check";

// Independent transcription of controller-design-basis.md, using manufacturer
// USB contact names and numeric physical pin numbers for the remaining parts.
const expectedNets: Record<string, string[]> = {
  GND: [
    "J4.A1",
    "J4.A12",
    "J4.B1",
    "J4.B12",
    "J4.SH",
    "R40.2",
    "R41.2",
    "R43.2",
    "U7.3",
    "U8.2",
    "U8.5",
    "U9.2",
    "C30.2",
    "C31.2",
  ],
  USB_VBUS: ["J4.A4", "J4.A9", "J4.B4", "J4.B9", "R42.1", "U9.5"],
  USB_CC1: ["J4.A5", "R40.1"],
  USB_CC2: ["J4.B5", "R41.1"],
  USB_D_P_PORT: ["J4.A6", "J4.B6", "U9.1", "U9.6", "U8.3"],
  USB_D_N_PORT: ["J4.A7", "J4.B7", "U9.3", "U9.4", "U8.4"],
  USB_D_N_SWITCH: ["U8.6", "R44.1"],
  USB_D_P_SWITCH: ["U8.7", "R45.1"],
  USB_D_N: ["R44.2"],
  USB_D_P: ["R45.2"],
  USB_VBUS_SENSE: ["R42.2", "R43.1", "U7.2"],
  USB_SWITCH_OE_N: ["U7.4", "U8.10", "R46.2"],
  V3V3: ["U7.5", "U8.1", "R46.1", "C30.1", "C31.1"],
};
const noConnects = ["J4.A8", "J4.B8", "U7.1", "U8.8", "U8.9"];

async function fixture() {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled pcbRelative>
      <schematicsheet
        name="USB"
        displayName="Controller self-powered USB interface"
        sheetIndex={0}
      />
      <ControllerUsbInterface />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

function sourcePortNames(json: CircuitJson) {
  const components = json.filter((e) => e.type === "source_component");
  return new Map(
    json
      .filter((e) => e.type === "source_port")
      .map((port) => {
        const ref = components.find(
          (e) => e.source_component_id === port.source_component_id,
        )!.name;
        return [
          port.source_port_id,
          `${ref}.${ref === "J4" ? port.name : port.pin_number}`,
        ];
      }),
  );
}

test("self-powered USB retains exact refs, physical pins, CC pulldowns and hardware gate", async () => {
  const json = await fixture();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const names = sourcePortNames(json);
  expect(components.map((e) => [e.name, e.manufacturer_part_number]).sort()).toEqual(
    [
      ["J4", "USB4105-GF-A"],
      ["U7", "SN74LVC1G14DBVR"],
      ["U8", "FSUSB42MUX"],
      ["U9", "USBLC6-2SC6"],
      ["R40", "ERA3AEB512V"],
      ["R41", "ERA3AEB512V"],
      ["R42", "ERA3AEB102V"],
      ["R43", "ERA3AEB104V"],
      ["R44", "ERJ3EKF22R0V"],
      ["R45", "ERJ3EKF22R0V"],
      ["R46", "ERA3AEB103V"],
      ["C30", "C1608X7R1H104K080AA"],
      ["C31", "C1608X7R1H104K080AA"],
    ].sort(),
  );
  for (const [ref, value] of [
    ["R40", 5100],
    ["R41", 5100],
    ["R42", 1000],
    ["R43", 100000],
    ["R44", 22],
    ["R45", 22],
    ["R46", 10000],
  ] as const) {
    const part = components.find((e) => e.name === ref);
    if (part?.ftype !== "simple_resistor") throw new Error(`${ref}: missing resistor`);
    expect(part.resistance).toBe(value);
  }
  for (const ref of ["C30", "C31"]) {
    const part = components.find((e) => e.name === ref);
    if (part?.ftype !== "simple_capacitor") throw new Error(`${ref}: missing bypass`);
    expect(part.capacitance).toBe(1e-7);
    expect(part.max_voltage_rating).toBe(50);
  }
  // Exact endpoint sets forbid a VBUS-to-board-power connection or CC1/CC2
  // short and distinguish both sides of each module-side series resistor.
  expect(nets.map((e) => e.name).sort()).toEqual(Object.keys(expectedNets).sort());
  for (const [name, endpoints] of Object.entries(expectedNets)) {
    const net = nets.find((e) => e.name === name)!;
    const ids = new Set(
      traces
        .filter((e) => e.connected_source_net_ids.includes(net.source_net_id))
        .flatMap((e) => e.connected_source_port_ids),
    );
    expect([...ids].map((id) => names.get(id)).sort(), name).toEqual(
      [...endpoints].sort(),
    );
  }
  expect(usbInterfaceBoundary).toEqual(["V3V3", "GND", "USB_D_P", "USB_D_N"]);
  for (const name of noConnects) {
    const port = ports.find((e) => names.get(e.source_port_id) === name)!;
    expect(port, name).toBeDefined();
    expect(
      traces.some((e) => e.connected_source_port_ids.includes(port.source_port_id)),
      name,
    ).toBe(false);
  }
  const esd = components.find((e) => e.name === "U9")!;
  expect(
    esd.internally_connected_source_port_ids
      ?.map((group) => group.map((id) => names.get(id)).sort())
      .sort(),
  ).toEqual([
    ["U9.1", "U9.6"],
    ["U9.3", "U9.4"],
  ]);
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const esdPads = json.filter(
    (e) =>
      e.type === "pcb_smtpad" &&
      pcbPorts.some(
        (p) =>
          p.pcb_port_id === e.pcb_port_id &&
          names.get(p.source_port_id)?.startsWith("U9."),
      ),
  );
  expect(esdPads).toHaveLength(6);
  const shell = json.filter((e) => e.type === "pcb_plated_hole");
  const connector = components.find((e) => e.name === "J4")!;
  const shellIds = connector.internally_connected_source_port_ids!.flat();
  expect(shell).toHaveLength(4);
  for (const pad of shell) {
    const port = pcbPorts.find((p) => p.pcb_port_id === pad.pcb_port_id)!;
    expect(shellIds).toContain(port.source_port_id);
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});

function schematicConnectivity(json: CircuitJson) {
  const names = sourcePortNames(json);
  return new Map(
    [...schematicPortNetNames(json)].map(([id, nets]) => [names.get(id)!, nets]),
  );
}

test("all USB schematic pins reach their electrical labels and NC pins stay isolated", async () => {
  const json = await fixture();
  const connected = schematicConnectivity(json);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(connected.size).toBe(56);
  for (const [net, endpoints] of Object.entries(expectedNets)) {
    for (const endpoint of endpoints)
      expect(connected.get(endpoint), endpoint).toEqual([net]);
  }
  for (const endpoint of noConnects)
    expect(connected.get(endpoint), endpoint).toEqual([]);
  const usbSheet = json
    .filter((e) => e.type === "schematic_sheet")
    .find((e) => e.name === "USB")!;
  for (const entry of json.filter(
    (e) =>
      e.type === "schematic_port" ||
      e.type === "schematic_trace" ||
      e.type === "schematic_net_label",
  )) {
    expect(entry.schematic_sheet_id).toBe(usbSheet.schematic_sheet_id);
  }
  // Prove the audit catches the original disconnected-label failure: source
  // connectivity remains intact when only its real signal labels are removed.
  const missingLabel = json.filter(
    (e) => e.type !== "schematic_net_label" || e.text !== "USB_D_P_PORT",
  );
  const broken = schematicConnectivity(missingLabel);
  expect(broken.get("J4.A6")).toEqual([]);
  expect(broken.get("U9.6")).toEqual([]);
  expect(
    schematicConnectivityErrors(missingLabel).some((error) =>
      error.startsWith("J4.A6:"),
    ),
  ).toBe(true);

  const label = json.find(
    (e) => e.type === "schematic_net_label" && e.text === "USB_D_P_PORT",
  );
  if (!label || label.type !== "schematic_net_label")
    throw new Error("Missing USB data label");
  const foreignSheet = [
    ...json,
    {
      ...label,
      schematic_net_label_id: "foreign_label",
      schematic_sheet_id: "another_sheet",
      text: "FOREIGN_NET",
    },
  ];
  expect(schematicConnectivityErrors(foreignSheet)).toEqual([]);

  const names = sourcePortNames(json);
  const nc = json.find(
    (e) => e.type === "schematic_port" && names.get(e.source_port_id) === "U7.1",
  );
  if (!nc || nc.type !== "schematic_port") throw new Error("Missing detector NC port");
  const connectedNc = [
    ...json,
    {
      ...label,
      schematic_net_label_id: "wrong_nc_label",
      text: "V3V3",
      anchor_position: nc.center,
      center: nc.center,
    },
  ];
  expect(
    schematicConnectivityErrors(connectedNc).some((error) =>
      error.startsWith("U7.NC:"),
    ),
  ).toBe(true);

  const otherNc = json.find(
    (e) => e.type === "schematic_port" && names.get(e.source_port_id) === "U8.8",
  );
  if (!otherNc || otherNc.type !== "schematic_port")
    throw new Error("Missing HSD2 NC port");
  const unusedWire: CircuitJson[number] = {
    type: "schematic_trace",
    schematic_trace_id: "nc_wire",
    schematic_sheet_id: nc.schematic_sheet_id,
    junctions: [],
    edges: [{ from: nc.center, to: otherNc.center }],
  };
  expect(
    schematicConnectivityErrors([...json, unusedWire]).some((error) =>
      error.includes("source NC pin touches"),
    ),
  ).toBe(true);
  expect(
    schematicConnectivityErrors([
      ...json,
      { ...unusedWire, schematic_sheet_id: "another_sheet" },
    ]),
  ).toEqual([]);
});

// Independent electrical island partition. A repeated label must name a different
// physical wire island, not merely hide single_global_label on an existing wire.
const signalIslands: Record<string, string[][]> = {
  USB_CC1: [["J4.A5"], ["R40.1"]],
  USB_CC2: [["J4.B5"], ["R41.1"]],
  USB_D_P_PORT: [["J4.A6", "J4.B6"], ["U9.1", "U9.6"], ["U8.3"]],
  USB_D_N_PORT: [["J4.A7", "J4.B7"], ["U9.3", "U9.4"], ["U8.4"]],
  USB_SWITCH_OE_N: [["U7.4"], ["U8.10", "R46.2"]],
  USB_D_P_SWITCH: [["U8.7"], ["R45.1"]],
  USB_D_N_SWITCH: [["U8.6"], ["R44.1"]],
};

test("sixteen signal labels each name exactly one distinct useful USB wire island", async () => {
  const json = await fixture();
  const before = schematicConnectivity(json);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  const labels = json
    .filter((e) => e.type === "schematic_net_label")
    .filter((e) => e.text in signalIslands);
  expect(labels).toHaveLength(16);
  for (const [net, groups] of Object.entries(signalIslands)) {
    const cuts: string[][] = [];
    const named = labels.filter((l) => l.text === net);
    expect(named, net).toHaveLength(groups.length);
    for (const label of named) {
      const cut = schematicConnectivity(json.filter((e) => e !== label));
      const lost: string[] = [];
      for (const [pin, prior] of before) {
        const after = cut.get(pin);
        if (JSON.stringify(after) !== JSON.stringify(prior)) {
          expect(prior, pin).toEqual([net]);
          expect(after, pin).toEqual([]);
          lost.push(pin);
        }
      }
      cuts.push(lost.sort());
      expect(
        lost.length,
        `${net}: label must serve a real distinct island`,
      ).toBeGreaterThan(0);
    }
    expect(cuts.sort(), net).toEqual(groups.map((g) => [...g].sort()).sort());
  }
});

test("J4 uses horizontal ground labels with one explicit A12/B1 branch", async () => {
  const json = await fixture();
  const labels = json
    .filter((e) => e.type === "schematic_net_label")
    .filter((e) => e.text === "GND" && e.anchor_position?.x === -13);
  expect(labels.map((l) => [l.anchor_position?.y, l.anchor_side]).sort()).toEqual([
    [-0.7, "right"],
    [0.8, "right"],
  ]);
  const lower = labels.find((l) => l.anchor_position?.y === -0.7)!;
  const cut = schematicConnectivity(json.filter((e) => e !== lower));
  for (const pin of expectedNets.GND!)
    expect(cut.get(pin), pin).toEqual(["J4.A12", "J4.B1"].includes(pin) ? [] : ["GND"]);
});
