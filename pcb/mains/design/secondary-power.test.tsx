import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";
import { MainsSecondaryPower, secondaryPowerBoundary } from "./secondary-power";

async function compile() {
  const circuit = new Circuit();
  circuit.add(
    <board width={100} height={70} routingDisabled pcbRelative>
      <schematicsheet
        name="Secondary"
        sheetIndex={0}
        sheetWidth={400}
        sheetHeight={180}
      />
      <MainsSecondaryPower />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

test("mains secondary retains the exact thirteen selected parts, values and physical identities", async () => {
  const json = await compile();
  const parts = json.filter((e) => e.type === "source_component");
  const expected = {
    U2: ["TPS259470ARPWR", "CrystalShim:TPS259470A_RPW0010A"],
    D2: ["STPS2L40U", "CrystalShim:STPS2L40U_SMB"],
    J5: [
      "43650-0300",
      "Connector_Molex:Molex_Micro-Fit_3.0_43650-0300_1x03_P3.00mm_Horizontal",
    ],
    R2: ["ERA3AEB2612V", "CrystalShim:Panasonic_0603"],
    R3: ["ERA3AEB103V", "CrystalShim:Panasonic_0603"],
    R4: ["ERA3AEB3832V", "CrystalShim:Panasonic_0603"],
    R5: ["ERA3AEB103V", "CrystalShim:Panasonic_0603"],
    R6: ["ERA3AEB2871V", "CrystalShim:Panasonic_0603"],
    R7: ["ERA6AEB222V", "CrystalShim:Panasonic_0805"],
    C2: ["C2012X7R1E105K125AB", "CrystalShim:TDK_C2012"],
    C3: ["C1608X7R1H104K080AA", "CrystalShim:TDK_C1608"],
    C4: ["GRM32ER71E226ME15L", "CrystalShim:Murata_GRM32_Reflow"],
    C5: ["C1608C0G1H472J080AA", "CrystalShim:TDK_C1608"],
  };
  expect(parts.map((p) => p.name).sort()).toEqual(Object.keys(expected).sort());
  for (const [ref, [mpn, footprintName]] of Object.entries(expected)) {
    const part = parts.find((p) => p.name === ref)!;
    expect(part.manufacturer_part_number).toBe(mpn);
    const pcb = json.find(
      (e) =>
        e.type === "pcb_component" &&
        e.source_component_id === part.source_component_id,
    );
    if (pcb?.type !== "pcb_component") throw new Error(`Missing ${ref} PCB component`);
    expect(pcb.metadata?.kicad_footprint?.footprintName).toBe(footprintName);
    expect(pcb.layer).toBe("top");
    expect(pcb.do_not_place).toBe(false);
    for (const type of ["pcb_courtyard_outline", "pcb_fabrication_note_path"] as const)
      expect(
        json.filter(
          (e) => e.type === type && e.pcb_component_id === pcb.pcb_component_id,
        ),
      ).toHaveLength(1);
  }
  for (const [ref, resistance] of [
    ["R2", 26100],
    ["R3", 10000],
    ["R4", 38300],
    ["R5", 10000],
    ["R6", 2870],
    ["R7", 2200],
  ] as const) {
    const resistor = parts.find((e) => e.name === ref);
    if (resistor?.ftype !== "simple_resistor") throw new Error(`Missing ${ref}`);
    expect(resistor.resistance).toBe(resistance);
  }
  for (const [ref, capacitance, voltage] of [
    ["C2", 1e-6, 25],
    ["C3", 1e-7, 50],
    ["C4", 22e-6, 25],
    ["C5", 4.7e-9, 50],
  ] as const) {
    const capacitor = parts.find((e) => e.name === ref);
    if (capacitor?.ftype !== "simple_capacitor") throw new Error(`Missing ${ref}`);
    expect(capacitor.capacitance).toBe(capacitance);
    expect(capacitor.max_voltage_rating).toBe(voltage);
  }
  expect(
    json.filter(
      (e) =>
        "error_type" in e ||
        e.type.endsWith("_error") ||
        e.type === "schematic_element_outside_sheet_warning",
    ),
  ).toEqual([]);
});

test("mains dividers connect directly to raw power while the clamp and harness use protected power", async () => {
  const json = await compile();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const expectedNets = {
    V5_RAW: ["C2.1", "C3.1", "R2.1", "R4.1", "U2.5"],
    EFUSE_UV: ["R2.2", "R3.1", "U2.1"],
    EFUSE_OV: ["R4.2", "R5.1", "U2.2"],
    EFUSE_ILM: ["R6.1", "U2.9"],
    EFUSE_DVDT: ["C5.1", "U2.7"],
    V5_PSU: ["C4.1", "D2.1", "J5.1", "R7.1", "U2.6"],
    COIL_DRAIN: ["J5.3"],
    GND_ISO: [
      "C2.2",
      "C3.2",
      "C4.2",
      "C5.2",
      "D2.2",
      "J5.2",
      "R3.2",
      "R5.2",
      "R6.2",
      "R7.2",
      "U2.8",
    ],
  };
  expect(nets.map((e) => e.name).sort()).toEqual(Object.keys(expectedNets).sort());
  expect(secondaryPowerBoundary).toEqual(["V5_RAW", "V5_PSU", "GND_ISO", "COIL_DRAIN"]);
  const schematicNets = schematicPortNetNames(json);
  for (const [name, expected] of Object.entries(expectedNets)) {
    const net = nets.find((e) => e.name === name)!;
    const ids = new Set(
      traces
        .filter((e) => e.connected_source_net_ids.includes(net.source_net_id))
        .flatMap((e) => e.connected_source_port_ids),
    );
    const connected = ports.filter((p) => ids.has(p.source_port_id));
    const endpoints = connected
      .map(
        (p) =>
          `${components.find((c) => c.source_component_id === p.source_component_id)!.name}.${p.pin_number}`,
      )
      .sort();
    expect(endpoints).toEqual(expected);
    // Independently prove electrical label reachability in the drawn schematic,
    // not only source traces or annotation text.
    for (const port of connected)
      expect(schematicNets.get(port.source_port_id)).toEqual([name]);
  }
  const efuse = components.find((e) => e.name === "U2")!;
  const efusePorts = ports.filter(
    (p) => p.source_component_id === efuse.source_component_id,
  );
  expect(efusePorts.map((p) => [p.pin_number, p.name])).toEqual([
    [1, "EN_UVLO"],
    [2, "OVLO"],
    [3, "AUXOFF"],
    [4, "FLT_N"],
    [5, "IN"],
    [6, "OUT"],
    [7, "DVDT"],
    [8, "GND"],
    [9, "ILM"],
    [10, "ITIMER"],
  ]);
  expect(efusePorts.filter((p) => p.do_not_connect).map((p) => p.pin_number)).toEqual([
    3, 4, 10,
  ]);
  for (const port of ports) {
    const connected = traces.some((t) =>
      t.connected_source_port_ids.includes(port.source_port_id),
    );
    expect(connected).toBe(!port.do_not_connect);
    expect(
      json.filter(
        (e) => e.type === "schematic_port" && e.source_port_id === port.source_port_id,
      ),
    ).toHaveLength(1);
    expect(
      json.filter(
        (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
      ),
    ).toHaveLength(1);
  }
  expect(ports).toHaveLength(35);
  expect(schematicConnectivityErrors(json)).toEqual([]);
});

test("drawn-label loss and a wire touching an unused eFuse pin fail connectivity review", async () => {
  const json = await compile();
  const unlabeled = json.filter(
    (e) => e.type !== "schematic_net_label" || e.text !== "EFUSE_UV",
  );
  expect(
    schematicConnectivityErrors(unlabeled).some((e) => e.startsWith("U2.EN_UVLO:")),
  ).toBe(true);
  const efuse = json.find((e) => e.type === "source_component" && e.name === "U2");
  if (efuse?.type !== "source_component") throw new Error("Missing eFuse");
  const nc = json.find(
    (e) =>
      e.type === "source_port" &&
      e.source_component_id === efuse.source_component_id &&
      e.pin_number === 3,
  );
  if (nc?.type !== "source_port") throw new Error("Missing AUXOFF");
  const pin = json.find(
    (e) => e.type === "schematic_port" && e.source_port_id === nc.source_port_id,
  );
  if (pin?.type !== "schematic_port") throw new Error("Missing AUXOFF schematic pin");
  const trace = structuredClone(json.find((e) => e.type === "schematic_trace")!);
  if (trace.type !== "schematic_trace") throw new Error("Missing schematic trace");
  trace.schematic_trace_id = "review_unwanted_auxoff_wire";
  trace.schematic_sheet_id = pin.schematic_sheet_id;
  trace.edges = [{ from: pin.center, to: { x: pin.center.x, y: pin.center.y - 0.25 } }];
  trace.junctions = [];
  expect(schematicConnectivityErrors([...json, trace])).toContain(
    "U2.AUXOFF: source NC pin touches a drawn schematic wire",
  );
});

test("RPW power lands remain IN and OUT and the harness retains three PTHs and its NPTH", async () => {
  const json = await compile();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const efuse = components.find((e) => e.name === "U2")!;
  const efusePcb = json.find(
    (e) =>
      e.type === "pcb_component" && e.source_component_id === efuse.source_component_id,
  );
  if (efusePcb?.type !== "pcb_component")
    throw new Error("Missing eFuse PCB component");
  const lands = json
    .filter((e) => e.type === "pcb_smtpad")
    .filter((e) => e.pcb_component_id === efusePcb.pcb_component_id);
  expect(lands).toHaveLength(10);
  expect(lands.filter((e) => e.shape === "polygon")).toHaveLength(4);
  for (const [number, x] of [
    [5, -0.25],
    [6, 0.25],
  ] as const) {
    const port = ports.find(
      (p) =>
        p.source_component_id === efuse.source_component_id && p.pin_number === number,
    )!;
    const pcbPort = json.find(
      (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
    );
    if (pcbPort?.type !== "pcb_port") throw new Error(`Missing U2.${number}`);
    const land = lands.find((p) => p.pcb_port_id === pcbPort.pcb_port_id);
    if (land?.shape !== "rect")
      throw new Error(`Missing U2.${number} rectangular power land`);
    expect(land.x).toBe(x);
    expect(land.width).toBe(0.3);
    expect(land.height).toBe(2.4);
  }
  for (const land of lands) expect(land.soldermask_margin).toBe(0.05);
  const header = components.find((e) => e.name === "J5")!;
  const headerPcb = json.find(
    (e) =>
      e.type === "pcb_component" &&
      e.source_component_id === header.source_component_id,
  );
  if (headerPcb?.type !== "pcb_component") throw new Error("Missing J5 PCB component");
  const headerLands = json.filter(
    (e) =>
      e.type === "pcb_plated_hole" && e.pcb_component_id === headerPcb.pcb_component_id,
  );
  expect(headerLands).toHaveLength(3);
  const holes = json
    .filter((e) => e.type === "pcb_hole")
    .filter((e) => e.pcb_component_id === headerPcb.pcb_component_id);
  expect(holes).toHaveLength(1);
  if (holes[0]?.hole_shape !== "circle") throw new Error("Missing circular J5 locator");
  expect(holes[0].hole_diameter).toBe(3);
});
