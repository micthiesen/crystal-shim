import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import ControllerCircuit from "./controller.circuit";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  At,
  parseKicadPcb,
  parseKicadSch,
  type KicadSch,
  type SchematicSymbol,
} from "kicadts";
import { mapUsbSchematicForInitialExport } from "./usb-initial-export";
import { applyControllerPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { createControllerInitialGraphs } from "./controller-initial-export";
import { controllerPlacements } from "./placements";
import { controllerPlacementErrors } from "./placement-check";
import { createControllerManifest } from "./design-manifest";
import { applyControllerFieldsForInitialExport } from "./fields-initial-export";

// Rendering all 95 components exceeded Bun's 5 s default on GitHub's runner
// (5.55 s, with no assertion failure). Keep the limit local to this full design.
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
  const initialGraphs = createControllerInitialGraphs(json);
  const nativePcb = parseKicadPcb(initialGraphs.pcb.getString());
  expect(initialGraphs.schematicFiles).toHaveLength(8);
  expect(nativePcb.footprints).toHaveLength(99); // 95 parts plus four board NPTHs
  // Check every actual source/native position against the authored manufacturer
  // datum. pcbRelative prevents the compiler's implicit group packing/rotation.
  for (const [ref, placement] of Object.entries(controllerPlacements)) {
    const source = components.find((e) => e.name === ref)!;
    const placed = initialGraphs.circuitJson
      .filter((e) => e.type === "pcb_component")
      .find((e) => e.source_component_id === source.source_component_id)!;
    expect(placed.center.x).toBeCloseTo(placement.pcbX, 6);
    expect(placed.center.y).toBeCloseTo(placement.pcbY, 6);
    expect(placed.rotation).toBeCloseTo(placement.pcbRotation, 6);
    const fp = nativePcb.footprints.find((f) =>
      f.properties.some((p) => p.key === "Reference" && p.value === ref),
    )!;
    expect(fp).toBeDefined();
    const at = fp.position;
    if (!(at instanceof At)) throw new Error(`${ref}: missing native origin`);
    expect(at.x).toBeCloseTo(100 + placement.pcbX, 6);
    expect(at.y).toBeCloseTo(100 - placement.pcbY, 6);
    expect(at.angle ?? 0).toBeCloseTo(placement.pcbRotation, 6);
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
  // The full source has no component/courtyard overlap or placement errors.
  // Enclosure mating/access, routed return paths and native DRC remain separate.
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(controllerPlacementErrors(json)).toEqual([]);
  // A probe courtyard entering a mounting reserve must fail even without
  // touching another part. Exercise the check against actual compiled geometry.
  const crowded = structuredClone(json);
  const probe = crowded.find((e) => e.type === "pcb_courtyard_circle")!;
  if (probe.type !== "pcb_courtyard_circle") throw new Error("Missing probe circle");
  probe.center = { x: -30, y: 26 };
  expect(
    controllerPlacementErrors(crowded).some((e) => e.includes("mounting reserve")),
  ).toBe(true);
  // Native ERC must see actual driver/supply/NC roles. Keep electrical labels
  // instead of the converter's unconnected custom power-rail graphics.
  const exportJson = structuredClone(json);
  const powerIds = new Set<string>();
  for (const e of exportJson) {
    if (
      e.type === "source_net" &&
      (e.is_power || e.is_ground || e.is_positive_voltage_source)
    ) {
      powerIds.add(e.source_net_id);
      e.is_power = false;
      e.is_ground = false;
      e.is_positive_voltage_source = false;
    }
  }
  for (const e of exportJson) {
    if (e.type === "schematic_net_label" && powerIds.has(e.source_net_id))
      delete e.symbol_name;
  }
  const converter = new CircuitJsonToKicadSchConverter(exportJson);
  converter.runUntilFinished();
  // Pinned 0.0.205 exposes only serialized children publicly. Its internal
  // initial-file cache carries the typed graphs; no native file is loaded here.
  const initialFiles = Reflect.get(converter, "files") as { kicadSch: KicadSch }[];
  expect(initialFiles).toHaveLength(8);
  const sheets = initialFiles.map((f) => f.kicadSch);
  const reference = (symbol: SchematicSymbol) =>
    symbol.properties.find((p) => p.key === "Reference")?.value;
  const usb = sheets.filter((s) =>
    s.symbols.some((symbol) => reference(symbol) === "J4"),
  );
  expect(usb).toHaveLength(1);
  mapUsbSchematicForInitialExport(usb[0]!, ["J4"]);
  const before = sheets.map((s) => s.getString());
  // A bad component late in the multi-sheet batch must not leave early sheets
  // partly typed. Unknown exact parts are refused, never silently passive.
  const unknown = structuredClone(exportJson);
  unknown
    .filter((e) => e.type === "source_component")
    .find((e) => e.name === "U3")!.manufacturer_part_number = "UNREVIEWED";
  expect(() => applyControllerPinTypesForInitialExport(unknown, sheets)).toThrow(
    "exact chip MPN",
  );
  expect(sheets.map((s) => s.getString())).toEqual(before);
  expect(() =>
    applyControllerPinTypesForInitialExport(exportJson, sheets.slice(0, -1)),
  ).toThrow();
  expect(sheets.map((s) => s.getString())).toEqual(before);
  expect(applyControllerPinTypesForInitialExport(exportJson, sheets).components).toBe(
    95,
  );
  const native = sheets.map((s) => parseKicadSch(s.getString()));
  const pinList = (symbol: SchematicSymbol): import("kicadts").SymbolPin[] => [
    ...symbol.pins,
    ...symbol.subSymbols.flatMap(pinList),
  ];
  const pin = (ref: string, number: string) => {
    const sheet = native.find((s) =>
      s.symbols.some((symbol) => reference(symbol) === ref),
    )!;
    const instance = sheet.symbols.find((s) => reference(s) === ref)!;
    const library = sheet.libSymbols!.symbols.find(
      (s) => s.libraryId === instance.libraryId,
    )!;
    return pinList(library).find((p) => p.numberString === number)!;
  };
  // Independent safety-relevant expected roles, including the AUXOFF output
  // correction found against TI's RPW table by independent review.
  for (const [ref, number, name, type] of [
    ["U4", "1", "RESET_N", "open_collector"],
    ["U6", "4", "Y", "output"],
    ["U1", "2", "V3V3", "power_in"],
    ["U1", "22", "NC", "no_connect"],
    ["U1", "29", "GND_EP", "power_in"],
    ["U3", "2", "SCLA", "bidirectional"],
    ["U5", "4", "FAULT_N", "open_collector"],
    ["U5", "6", "OUT", "power_out"],
    ["U10", "3", "AUXOFF", "open_collector"],
    ["U11", "1", "NC_1", "no_connect"],
    ["J4", "A6", "A6", "passive"],
    ["Q1", "1", "G", "input"],
    ["R14", "1", "1", "passive"],
    ["TP1", "1", "1", "passive"],
  ] as const) {
    expect(pin(ref, number).name).toBe(name);
    expect(pin(ref, number).pinElectricalType).toBe(type);
  }
  // Only library electrical fields changed. Reset just those typed fields in a
  // readback copy and prove all native geometry, wires, UUIDs and instances equal.
  for (const sheet of native)
    for (const library of sheet.libSymbols?.symbols ?? [])
      for (const pin of pinList(library)) pin.pinElectricalType = "passive";
  expect(native.map((s) => s.getString())).toEqual(before);
  // Instance metadata must reach every emitted child file, without changing
  // the cached symbol library, wires, pin geometry, UUIDs or other properties.
  const manifest = createControllerManifest(json);
  const fieldsBefore = sheets.map((s) => s.getString());
  const invalidFields = structuredClone(manifest);
  invalidFields.components.find((c) => c.ref === "U9")!.value = "wrong part";
  expect(() => applyControllerFieldsForInitialExport(sheets, invalidFields)).toThrow(
    "U9: unexpected initial symbol identity/value",
  );
  expect(sheets.map((s) => s.getString())).toEqual(fieldsBefore);
  applyControllerFieldsForInitialExport(sheets, manifest);
  const initialInstances = initialGraphs.schematicFiles.flatMap(
    (file) => parseKicadSch(file.content).symbols,
  );
  for (const component of manifest.components.filter(
    (c) => c.footprint.pad_numbers.length,
  )) {
    const instance = initialInstances.find((s) => reference(s) === component.ref)!;
    const field = (key: string) => instance.properties.filter((p) => p.key === key);
    for (const [key, expected] of Object.entries({
      Footprint: component.footprint.kicad,
      MPN:
        "manufacturer_part_number" in component.fields
          ? (component.fields.manufacturer_part_number ?? "")
          : "",
      Datasheet:
        "datasheet_url" in component.fields
          ? (component.fields.datasheet_url ?? "")
          : "",
    })) {
      expect(field(key)).toHaveLength(1);
      expect(field(key)[0]!.value).toBe(expected);
    }
  }
  const metadataReadback = sheets.map((s) => parseKicadSch(s.getString()));
  for (const [index, sheet] of metadataReadback.entries()) {
    const original = parseKicadSch(fieldsBefore[index]!);
    for (const instance of sheet.symbols) {
      const previous = original.symbols.find(
        (s) => reference(s) === reference(instance),
      )!;
      instance.properties.splice(0, instance.properties.length, ...previous.properties);
    }
  }
  expect(metadataReadback.map((s) => s.getString())).toEqual(fieldsBefore);
  // This regression mimics the real exporter hazard: names still readable as
  // text and source nets intact, but physical pins lose their electrical labels.
  expect(
    schematicConnectivityErrors(
      json.filter(
        (e) => e.type !== "schematic_net_label" || e.text !== "SENSOR_POWER_FAULT_N",
      ),
    ).length,
  ).toBeGreaterThan(0);
}, 30_000);
