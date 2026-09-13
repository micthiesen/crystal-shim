import { mainsHeaderPhysical, type MainsHeaderRef } from "./mains-headers";
import { mainsPlacementIsolationErrors } from "./placement-check";
import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";
import MainsCircuit from "./mains.circuit";
import { mainsMountingHoles, mainsPlacements } from "./placements";

// Independent contract: mains-design-basis.md architecture and pin maps, plus
// power-protection-review.md. The fuse, filter and continuous PE are off-board.
const expectedNets = {
  FILTER_LINE_L: ["F3.2", "J2.1"],
  AC_L_FUSED: ["F3.1", "J1.1", "RV1.1", "U1.2"],
  AC_N: ["J1.2", "J2.2", "RV1.2", "U1.1"],
  PUMP_L_FILTERED: ["J3.1", "K1.3"],
  PUMP_N_FILTERED: ["C1.2", "J3.2", "J4.2"],
  PUMP_L_SW: ["J4.1", "K1.4", "R1.1"],
  SNUBBER_RC: ["C1.1", "R1.2"],
  V12_RAW: ["C2.1", "C3.1", "C7.1", "F2.1", "U1.4", "U2.2", "U2.3"],
  V12_MOTOR: ["F2.2", "J6.1"],
  V5_PSU: ["C4.1", "C6.1", "D1.1", "J5.1", "K1.1", "L1.2", "U2.1"],
  COIL_DRAIN: ["D1.2", "J5.3", "K1.5"],
  GND_ISO: ["C2.2", "C3.2", "C4.2", "C6.2", "C7.2", "J5.2", "J6.2", "U1.3", "U2.4"],
  BUCK5_SW: ["C5.2", "L1.1", "U2.5"],
  BUCK5_BST: ["C5.1", "U2.6"],
} as const;
const expectedPins = {
  C1: [1, 2],
  C2: [1, 2],
  C3: [1, 2],
  C4: [1, 2],
  C5: [1, 2],
  C6: [1, 2],
  C7: [1, 2],
  D1: [1, 2],
  F3: [1, 2],
  F2: [1, 2],
  J1: [1, 2],
  J2: [1, 2, 3],
  J3: [1, 2, 3, 4],
  J4: [1, 2, 3, 4, 5, 6],
  J5: [1, 2, 3],
  J6: [1, 2],
  K1: [1, 3, 4, 5],
  L1: [1, 2],
  R1: [1, 2],
  RV1: [1, 2],
  U1: [1, 2, 3, 4],
  U2: [1, 2, 3, 4, 5, 6],
} as const;
const expectedNc = ["J2.3", "J3.3", "J3.4", "J4.3", "J4.4", "J4.5", "J4.6"].sort();

let compiled: Promise<CircuitJson> | undefined;
function compile() {
  return (compiled ??= (async () => {
    const circuit = new Circuit();
    circuit.add(<MainsCircuit />);
    await circuit.renderUntilSettled();
    return circuit.getCircuitJson();
  })());
}
function endpointNames(json: CircuitJson) {
  const parts = json.filter((e) => e.type === "source_component");
  return new Map(
    json
      .filter((e) => e.type === "source_port")
      .map((port) => {
        const part = parts.find(
          (c) => c.source_component_id === port.source_component_id,
        );
        if (!part) throw new Error(`Missing component for ${port.source_port_id}`);
        return [port.source_port_id, `${part.name}.${port.pin_number}`];
      }),
  );
}
function schematicPin(json: CircuitJson, endpoint: string) {
  const names = endpointNames(json);
  const pin = json.find(
    (e) => e.type === "schematic_port" && names.get(e.source_port_id) === endpoint,
  );
  if (pin?.type !== "schematic_port") throw new Error(`Missing schematic ${endpoint}`);
  return pin;
}

test("full mains source retains 22 parts and every connected or intentionally unused pin", async () => {
  const json = await compile();
  const parts = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  expect(parts.map((p) => p.name).sort()).toEqual(Object.keys(expectedPins).sort());
  expect(parts).toHaveLength(22);
  expect(ports).toHaveLength(60);
  for (const part of parts) {
    const pins = ports.filter(
      (p) => p.source_component_id === part.source_component_id,
    );
    expect(pins.map((p) => p.pin_number).sort((a, b) => a! - b!)).toEqual([
      ...expectedPins[part.name as keyof typeof expectedPins],
    ]);
    for (const pin of pins) {
      expect(
        json.filter(
          (e) => e.type === "schematic_port" && e.source_port_id === pin.source_port_id,
        ),
      ).toHaveLength(1);
      expect(
        json.filter(
          (e) => e.type === "pcb_port" && e.source_port_id === pin.source_port_id,
        ),
      ).toHaveLength(1);
    }
  }
  const names = endpointNames(json);
  expect(
    ports
      .filter((p) => p.do_not_connect)
      .map((p) => names.get(p.source_port_id))
      .sort(),
  ).toEqual(expectedNc);
  expect(json.filter((e) => e.type === "schematic_sheet")).toHaveLength(3);
  // Compiler errors are not conditional-body, enclosure or routed-isolation acceptance.
  expect(
    json.filter(
      (e) =>
        "error_type" in e ||
        e.type.endsWith("_error") ||
        e.type === "schematic_element_outside_sheet_warning",
    ),
  ).toEqual([]);
});

test("whole-board source and drawn nets preserve isolation, raw/protected power and load-side RC", async () => {
  const json = await compile();
  const nets = json.filter((e) => e.type === "source_net");
  const ports = json.filter((e) => e.type === "source_port");
  const traces = json.filter((e) => e.type === "source_trace");
  const names = endpointNames(json);
  const drawn = schematicPortNetNames(json);
  expect(nets.map((n) => n.name).sort()).toEqual(Object.keys(expectedNets).sort());
  const assigned = new Set<string>();
  for (const [name, members] of Object.entries(expectedNets)) {
    const net = nets.find((n) => n.name === name)!;
    const ids = new Set(
      traces
        .filter((t) => t.connected_source_net_ids.includes(net.source_net_id))
        .flatMap((t) => t.connected_source_port_ids),
    );
    expect([...ids].map((id) => names.get(id)).sort()).toEqual([...members].sort());
    for (const id of ids) {
      expect(assigned.has(id)).toBe(false);
      assigned.add(id);
      // Actual wire geometry and label anchors, not source traces or annotation.
      expect(drawn.get(id)).toEqual([name]);
    }
  }
  expect(assigned.size).toBe(53);
  for (const port of ports) {
    expect(assigned.has(port.source_port_id)).toBe(!port.do_not_connect);
    if (port.do_not_connect) {
      expect(drawn.get(port.source_port_id)).toEqual([]);
      expect(
        traces.some((t) => t.connected_source_port_ids.includes(port.source_port_id)),
      ).toBe(false);
    }
  }
  // This also follows transitive source connections, including unnamed bridges.
  expect(schematicConnectivityErrors(json)).toEqual([]);
});

test("full assembly preserves 30 Sabre tails including 14 tails of seven unused blades", async () => {
  const json = await compile();
  const names = endpointNames(json);
  const parts = json.filter((e) => e.type === "source_component");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const lands = json.filter(
    (e) => e.type === "pcb_plated_hole" || e.type === "pcb_smtpad",
  );
  expect(lands).toHaveLength(75);
  for (const port of pcbPorts) {
    const endpoint = names.get(port.source_port_id);
    if (!endpoint) throw new Error(`Missing source identity for ${port.pcb_port_id}`);
    expect(lands.filter((land) => land.pcb_port_id === port.pcb_port_id)).toHaveLength(
      /^J[1-4]\./.test(endpoint) ? 2 : 1,
    );
  }
  let sabreTails = 0;
  let unusedTails = 0;
  for (const [ref, blades] of [
    ["J1", 2],
    ["J2", 3],
    ["J3", 4],
    ["J4", 6],
  ] as const) {
    const source = parts.find((p) => p.name === ref)!;
    const pcb = json.find(
      (e) =>
        e.type === "pcb_component" &&
        e.source_component_id === source.source_component_id,
    );
    if (pcb?.type !== "pcb_component") throw new Error(`Missing ${ref}`);
    const tails = lands.filter((e) => e.pcb_component_id === pcb.pcb_component_id);
    expect(tails).toHaveLength(blades * 2);
    for (let number = 1; number <= blades; number++) {
      const pair = tails.filter((e) => {
        const port = pcbPorts.find((p) => p.pcb_port_id === e.pcb_port_id);
        return port && names.get(port.source_port_id) === `${ref}.${number}`;
      });
      expect(pair).toHaveLength(2);
      expect(pair.every((e) => e.type === "pcb_plated_hole")).toBe(true);
      sabreTails += pair.length;
      if (number > 2) unusedTails += pair.length;
    }
  }
  expect(sabreTails).toBe(30);
  expect(unusedTails).toBe(14);
});

test("every authored position and four board holes survive full-sheet compilation", async () => {
  const json = await compile();
  const board = json.find((e) => e.type === "pcb_board");
  if (board?.type !== "pcb_board") throw new Error("Missing mains board");
  expect(board.width).toBe(180);
  expect(board.height).toBe(110);
  expect(board.thickness).toBe(1.6);
  expect(board.num_layers).toBe(2);
  // Independent transcription of mains-placement.md, not body-centre inference.
  const expected: Record<string, readonly [number, number, number]> = {
    U1: [-77.5, 45.0, 0],
    K1: [30.0, -15.0, 0],
    J1: [-73.0, -42.0, 0],
    J2: [-79.0, -22.0, 0],
    J3: [-12.0, -42.0, 0],
    J4: [35.0, -42.0, 0],
    R1: [7, -26, 0],
    C1: [-9, -24, 0],
    F3: [-47.0, -15.0, 0],
    RV1: [-42.0, -35.0, 0],
    D1: [55.0, -5.0, 0],
    J5: [79.0, 5.0, 270],
    J6: [79.0, 29.0, 270],
    F2: [57.0, 29.0, 0],
    U2: [32.0, 16.0, 0],
    L1: [42.0, 16.0, 0],
    C2: [23.0, 18.0, 90],
    C3: [23.0, 25.0, 90],
    C4: [51.0, 16.0, 90],
    C5: [36.0, 21.0, 0],
    C6: [57.0, 16.0, 90],
    C7: [28.0, 13.0, 0],
  };
  // Numeric datum definitions are component-side +Y down, from the audited
  // exact part models. Every selected pin-1 datum except U1 is at local (0,0);
  // K1 uses contact pin 3. Sabre's second same-number tail is not this datum.
  const originAnchors: Record<string, readonly [number, number, number]> = {
    U1: [1, 5.3, 11.75],
    K1: [3, 0, 0],
    J1: [1, 0, 0],
    J2: [1, 0, 0],
    J3: [1, 0, 0],
    J4: [1, 0, 0],
    J5: [1, 0, 0],
    J6: [1, 0, 0],
    F3: [1, 0, 0],
    R1: [1, 0, 0],
    C1: [1, 0, 0],
    D1: [1, 0, 0],
    RV1: [1, 0, 0],
  };
  const parts = json.filter((e) => e.type === "source_component");
  expect(Object.keys(mainsPlacements).sort()).toEqual(Object.keys(expected).sort());
  expect(json.filter((e) => e.type === "pcb_component")).toHaveLength(22);
  for (const [ref, [x, y, rotation]] of Object.entries(expected)) {
    const authored = mainsPlacements[ref as keyof typeof mainsPlacements];
    const authoredPose: number[] = [authored.pcbX, authored.pcbY, authored.pcbRotation];
    expect(authoredPose).toEqual([x, y, rotation]);
    expect(authored.layer).toBe("top");
    const source = parts.find((p) => p.name === ref)!;
    const placed = json.find(
      (e) =>
        e.type === "pcb_component" &&
        e.source_component_id === source.source_component_id,
    );
    if (placed?.type !== "pcb_component") throw new Error(`Missing ${ref}`);
    // tscircuit recentres asymmetric bounding boxes without moving the pads.
    // Reconstruct the authored origin from a specified physical pad datum;
    // checking pcb_component.center would mistake representation for placement.
    const anchor = originAnchors[ref];
    if (anchor) {
      const [pin, localX, localYDown] = anchor;
      const sourcePort = json.find(
        (e) =>
          e.type === "source_port" &&
          e.source_component_id === source.source_component_id &&
          e.pin_number === pin,
      );
      if (sourcePort?.type !== "source_port") throw new Error(`Missing ${ref}.${pin}`);
      const pcbPort = json.find(
        (e) => e.type === "pcb_port" && e.source_port_id === sourcePort.source_port_id,
      );
      if (pcbPort?.type !== "pcb_port")
        throw new Error(`Missing physical ${ref}.${pin}`);
      const angle = (rotation! * Math.PI) / 180;
      const expectedX = x! + localX * Math.cos(angle) + localYDown * Math.sin(angle);
      const expectedY = y! + localX * Math.sin(angle) - localYDown * Math.cos(angle);
      const matches = json.filter(
        (e) =>
          e.type === "pcb_plated_hole" &&
          e.pcb_port_id === pcbPort.pcb_port_id &&
          Math.abs(e.x - expectedX) < 1e-6 &&
          Math.abs(e.y - expectedY) < 1e-6,
      );
      expect(matches).toHaveLength(1);
    } else {
      expect(placed.center.x).toBeCloseTo(x!, 6);
      expect(placed.center.y).toBeCloseTo(y!, 6);
    }
    expect(placed.rotation).toBe(rotation);
    expect(placed.layer).toBe("top");
    expect(placed.do_not_place).toBe(false);
  }
  expect(mainsMountingHoles).toEqual([
    { ref: "H1", x: -85, y: 50 },
    { ref: "H2", x: 85, y: 50 },
    { ref: "H3", x: -85, y: -50 },
    { ref: "H4", x: 85, y: -50 },
  ]);
  const holes = json.filter((e) => e.type === "pcb_hole");
  expect(holes).toHaveLength(6); // board holes plus J5/J6 locators
  const mounting = holes.filter((e) => !e.pcb_component_id);
  expect(mounting).toHaveLength(4);
  for (const hole of mainsMountingHoles) {
    const actual = mounting.filter(
      (e) => Math.abs(e.x - hole.x) < 1e-6 && Math.abs(e.y - hole.y) < 1e-6,
    );
    expect(actual).toHaveLength(1);
    if (actual[0]?.hole_shape !== "circle")
      throw new Error(`Missing circular ${hole.ref}`);
    expect(actual[0].hole_diameter).toBe(3.2);
  }
  expect(json.filter((e) => e.type === "pcb_trace")).toEqual([]);
});

test("a drawn primary/secondary short and missing load-neutral labels fail connectivity", async () => {
  const json = await compile();
  const primary = schematicPin(json, "U1.1");
  const secondary = schematicPin(json, "U1.3");
  expect(primary.schematic_sheet_id).toBe(secondary.schematic_sheet_id);
  const wire = structuredClone(json.find((e) => e.type === "schematic_trace")!);
  if (wire.type !== "schematic_trace") throw new Error("Missing schematic trace");
  wire.schematic_trace_id = "adversarial_primary_secondary_short";
  wire.schematic_sheet_id = primary.schematic_sheet_id;
  wire.edges = [{ from: primary.center, to: secondary.center }];
  wire.junctions = [];
  const shorted = [...json, wire];
  const drawn = schematicPortNetNames(shorted);
  expect(drawn.get(primary.source_port_id)).toContain("GND_ISO");
  expect(drawn.get(secondary.source_port_id)).toContain("AC_N");
  const errors = schematicConnectivityErrors(shorted);
  expect(errors.some((e) => e.startsWith("U1.AC_N:"))).toBe(true);
  expect(errors.some((e) => e.startsWith("U1.GND_ISO:"))).toBe(true);
  const missing = json.filter(
    (e) => e.type !== "schematic_net_label" || e.text !== "PUMP_N_FILTERED",
  );
  expect(schematicConnectivityErrors(missing).some((e) => e.startsWith("C1."))).toBe(
    true,
  );
});

test("mains pads preserve 8 mm isolation and 3.2 mm primary separation including unused blades", async () => {
  const json = await compile();
  expect(mainsPlacementIsolationErrors(json)).toEqual([]);
  const changed = structuredClone(json);
  const owner = changed.find((e) => e.type === "source_component" && e.name === "R1")!;
  if (owner.type !== "source_component") throw new Error("Missing R1");
  const physical = changed.find(
    (e) =>
      e.type === "pcb_component" && e.source_component_id === owner.source_component_id,
  )!;
  if (physical.type !== "pcb_component") throw new Error("Missing R1 footprint");
  for (const e of changed)
    if (
      e.type === "pcb_plated_hole" &&
      e.pcb_component_id === physical.pcb_component_id
    ) {
      e.x += 26;
      e.y -= 3;
    }
  expect(
    mainsPlacementIsolationErrors(changed).some(
      (e) => e.includes("R1.2") && e.includes("K1.5"),
    ),
  ).toBe(true);
});

test("mains header occupied envelopes clear all 8 mm insulating mount reservations", () => {
  for (const ref of ["J1", "J2", "J3", "J4"] as MainsHeaderRef[]) {
    const pose = mainsPlacements[ref];
    const physical = mainsHeaderPhysical(ref);
    const x = pose.pcbX + physical.envelopeCenter!.x;
    const y = pose.pcbY + physical.envelopeCenter!.y;
    const dx = physical.envelope.width / 2;
    const dy = physical.envelope.height / 2;
    for (const hole of mainsMountingHoles) {
      expect(Math.abs(x - hole.x) >= dx + 4 || Math.abs(y - hole.y) >= dy + 4).toBe(
        true,
      );
    }
  }
});
