import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import {
  CircuitJsonToKicadPcbConverter,
  CircuitJsonToKicadSchConverter,
} from "circuit-json-to-kicad";
import { parseKicadPcb, parseKicadSch } from "kicadts";
import {
  ControllerTestPoints,
  controllerTestPoints,
  omitTestPointPasteForInitialExport,
} from "./test-points";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

// Required observability nets plus a local UART return. These are measurement
// points, not external power inputs or an installed USB/UART bridge.
const expectedNets = {
  TP1: "GND",
  TP2: "V5_PSU",
  TP3: "V5_LOGIC",
  TP4: "V3V3",
  TP5: "SENSOR_SDA",
  TP6: "SENSOR_SCL",
  TP7: "PSU_GOOD",
  TP8: "RELAY_GATED",
  TP9: "UART0_RX",
  TP10: "UART0_TX",
  TP11: "GND",
  TP12: "ACCESSORY_INPUT1",
  TP13: "ACCESSORY_INPUT2",
  TP14: "GND",
};

async function fixture() {
  const circuit = new Circuit();
  circuit.add(
    <board width={110} height={110} routingDisabled>
      <schematicsheet
        name="TestPoints"
        displayName="Controller test and UART service pads"
        sheetIndex={0}
      />
      <ControllerTestPoints />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

test("service pads expose every required net with probe room and no purchased or pasted part", async () => {
  const json = await fixture();
  const components = json.filter((e) => e.type === "source_component");
  const sourcePorts = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const pads = json.filter((e) => e.type === "pcb_smtpad");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  expect(components.map((e) => e.name).sort()).toEqual(
    Object.keys(expectedNets).sort(),
  );
  expect(pads).toHaveLength(14);
  expect(sourcePorts).toHaveLength(14);
  expect(
    json.filter(
      (e) =>
        e.type === "pcb_solder_paste" ||
        e.type === "pcb_plated_hole" ||
        e.type === "pcb_hole",
    ),
  ).toEqual([]);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  expect(
    json.filter(
      (e) => "error_type" in e || "warning_type" in e || e.type.endsWith("_error"),
    ),
  ).toEqual([]);
  for (const [ref, netName] of Object.entries(expectedNets)) {
    const component = components.find((e) => e.name === ref)!;
    expect(component.ftype).toBe("simple_test_point");
    expect(component.manufacturer_part_number).toBeUndefined();
    expect(component.supplier_part_numbers).toBeUndefined();
    const port = sourcePorts.find(
      (e) => e.source_component_id === component.source_component_id,
    )!;
    expect(port.pin_number).toBe(1);
    const actualNetIds = new Set(
      traces
        .filter((e) => e.connected_source_port_ids.includes(port.source_port_id))
        .flatMap((e) => e.connected_source_net_ids),
    );
    expect(
      [...actualNetIds].map((id) => nets.find((e) => e.source_net_id === id)!.name),
    ).toEqual([netName]);
    const pcbPort = pcbPorts.find((e) => e.source_port_id === port.source_port_id)!;
    const pad = pads.find((e) => e.pcb_port_id === pcbPort.pcb_port_id)!;
    expect(pad.shape).toBe("circle");
    if (pad.shape !== "circle") throw new Error("Expected round probe pad");
    expect(pad.radius).toBe(1);
    expect(pad.layer).toBe("top");
    expect(pad.is_covered_with_solder_mask).toBe(false);
    expect(pad.soldermask_margin).toBe(0.05);
    // Ø2.1 mm mask opening is explicit, rather than dependent on fab defaults.
    expect(2 * (pad.radius + pad.soldermask_margin!)).toBe(2.1);
    const placement = controllerTestPoints.find((p) => p.ref === ref)!;
    expect([pad.x, pad.y]).toEqual([placement.x, placement.y]);
    expect(Math.abs(pad.x) + 2).toBeLessThan(55);
    expect(Math.abs(pad.y) + 2).toBeLessThan(55);
  }
  const courtyards = json.filter((e) => e.type === "pcb_courtyard_circle");
  expect(courtyards).toHaveLength(14);
  for (const courtyard of courtyards) expect(courtyard.radius).toBe(2);
  for (const [i, a] of pads.entries())
    for (const b of pads.slice(i + 1)) {
      if (a.shape !== "circle" || b.shape !== "circle")
        throw new Error("Expected circles");
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(8);
    }
});

test("initial KiCad export preserves exact pad copper, mask, nets and BOM exclusions while removing only paste", async () => {
  const json = await fixture();
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  const board = converter.getOutput();
  // Include an unrelated footprint with the same pad structure. The adapter
  // must select fixed references, not every circular pad or library match.
  const unrelated = parseKicadPcb(board.getString()).footprints[0]!;
  unrelated.properties.find((p) => p.key === "Reference")!.value = "TP_OTHER";
  board.footprints.push(unrelated);
  const before = board.getString();
  // This assertion demonstrates the pinned converter defect the adapter fixes.
  for (const footprint of board.footprints)
    expect(footprint.fpPads[0]!.layers?.layers).toContain("F.Paste");
  omitTestPointPasteForInitialExport(board);
  const parsed = parseKicadPcb(board.getString());
  for (const footprint of parsed.footprints) {
    if (
      footprint.properties.some((p) => p.key === "Reference" && p.value === "TP_OTHER")
    ) {
      expect(footprint.fpPads[0]!.layers?.layers).toEqual([
        "F.Cu",
        "F.Paste",
        "F.Mask",
      ]);
      continue;
    }
    const ref = footprint.properties.find((e) => e.key === "Reference")!
      .value as keyof typeof expectedNets;
    const placement = controllerTestPoints.find((e) => e.ref === ref)!;
    expect(footprint.libraryLink).toBe("CrystalShim:TestPoint_Pad_D2.0mm_NoPaste");
    expect(footprint.attr?.excludeFromBom).toBe(true);
    expect(footprint.attr?.excludeFromPosFiles).toBe(true);
    expect(footprint.fpPads).toHaveLength(1);
    const pad = footprint.fpPads[0]!;
    expect(pad.number).toBe("1");
    expect(pad.net?.name).toBe(expectedNets[ref]);
    expect(pad.layers?.layers).toEqual(["F.Cu", "F.Mask"]);
    expect(pad.shape).toBe("circle");
    expect([pad.size?.width, pad.size?.height]).toEqual([2, 2]);
    expect([pad.at?.x, pad.at?.y]).toEqual([0, 0]);
    expect([footprint.position?.x, footprint.position?.y]).toEqual([
      100 + placement.x,
      100 - placement.y,
    ]);
    expect(pad.solderMaskMargin).toBe(0.05);
  }
  // Restore just the layer list in memory: byte equality proves the adapter did
  // not change any other pad, net, property, graphics, placement or UUID.
  for (const footprint of board.footprints)
    footprint.fpPads[0]!.layers = ["F.Cu", "F.Paste", "F.Mask"];
  expect(board.getString()).toBe(before);
  const schematic = new CircuitJsonToKicadSchConverter(json);
  schematic.runUntilFinished();
  const symbols = schematic
    .getOutputFiles({ schematicFilename: "test-points.kicad_sch" })
    .flatMap((file) => parseKicadSch(file.content).symbols)
    .filter((symbol) =>
      symbol.properties.some((p) => p.key === "Reference" && p.value.startsWith("TP")),
    );
  expect(symbols).toHaveLength(14);
  for (const symbol of symbols) {
    const ref = symbol.properties.find((p) => p.key === "Reference")!.value;
    expect(symbol.libraryId).toBe(`Custom:ControllerTestPoint_${ref}`);
    expect(symbol.inBom).toBe(false);
    expect(symbol.onBoard).toBe(true);
    expect(symbol.properties.find((p) => p.key === "Footprint")?.value).toBe(
      "CrystalShim:TestPoint_Pad_D2.0mm_NoPaste",
    );
  }
});

test("paste adjustment fails atomically on an unexpected pad or a second application", async () => {
  const converter = new CircuitJsonToKicadPcbConverter(await fixture());
  converter.runUntilFinished();
  const board = converter.getOutput();
  const last = board.footprints.at(-1)!.fpPads[0]!;
  last.number = "2";
  const broken = board.getString();
  expect(() => omitTestPointPasteForInitialExport(board)).toThrow(
    "unexpected test-point",
  );
  expect(board.getString()).toBe(broken);
  last.number = "1";
  omitTestPointPasteForInitialExport(board);
  const corrected = board.getString();
  expect(() => omitTestPointPasteForInitialExport(board)).toThrow(
    "unexpected test-point",
  );
  expect(board.getString()).toBe(corrected);
});
