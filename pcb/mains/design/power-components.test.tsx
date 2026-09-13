import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import {
  IsolatedSupply,
  PumpRelay,
  isolatedSupplyPattern,
  pumpRelayPattern,
  isolatedSupplyPhysical,
  pumpRelayPhysical,
} from "./power-components";
import { landPatternPhysicalGeometry } from "../../controller/design/land-pattern-physical";

async function compile(rotation: number) {
  const circuit = new Circuit();
  circuit.add(
    <board width={450} height={300} routingDisabled>
      <IsolatedSupply name="U1" pcbX={-90} pcbY={5} pcbRotation={rotation} schX={-8} />
      <PumpRelay name="K1" pcbX={70} pcbY={-5} pcbRotation={rotation} schX={8} />
      <netlabel net="AC_N" connectsTo=".U1 > .AC_N" />
      <netlabel net="AC_L_FUSED" connectsTo=".U1 > .AC_L" />
      <netlabel net="GND_ISO" connectsTo=".U1 > .GND_ISO" />
      <netlabel net="V12_RAW" connectsTo=".U1 > .V12_RAW" />
      <netlabel net="V5_PSU" connectsTo=".K1 > .COIL_HIGH" />
      <netlabel net="COIL_DRAIN" connectsTo=".K1 > .COIL_LOW" />
      <netlabel net="PUMP_L_FILTERED" connectsTo=".K1 > .CONTACT_FIXED" />
      <netlabel net="PUMP_L_SW" connectsTo=".K1 > .CONTACT_MOVING" />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

test("mains power models mirror actual bottom-view drawings and preserve contact stagger", () => {
  // Independent bottom-view manufacturer dimensions, before the component-side mirror.
  const relayBottom = { "1": [0, 0], "5": [0, 7.5], "4": [20, 7.5], "3": [23.5, 0] };
  for (const pad of pumpRelayPattern.pads) {
    const [x, y] = relayBottom[pad.number as keyof typeof relayBottom]!;
    expect(pad.x).toBeCloseTo(23.5 - x!, 8);
    expect(pad.y).toBe(y!);
    expect(pad.drill).toBe(1.3);
    expect((pad.width - pad.drill) / 2).toBeCloseTo(0.75, 8);
  }
  const supplyBottom = {
    "1": [81.7, 11.75],
    "2": [81.7, 5],
    "3": [5.7, 40.75],
    "4": [5.7, 46.25],
  };
  for (const pad of isolatedSupplyPattern.pads) {
    const [x, y] = supplyBottom[pad.number as keyof typeof supplyBottom]!;
    expect(pad.x).toBeCloseTo(87 - x!, 8);
    expect(pad.y).toBe(y!);
    expect(pad.drill).toBe(Number(pad.number) < 3 ? 1.5 : 2.5);
    expect((pad.width - pad.drill) / 2).toBe(Number(pad.number) < 3 ? 0.75 : 1);
  }
  const r3 = pumpRelayPattern.pads.find((p) => p.number === "3")!;
  const r4 = pumpRelayPattern.pads.find((p) => p.number === "4")!;
  expect(r4.x - r3.x).toBe(3.5);
  // The old aligned-contact table would fail this physical fit assertion.
  expect(Math.hypot(r4.x - r3.x, r4.y - r3.y)).toBeCloseTo(Math.hypot(3.5, 7.5), 8);
});

for (const rotation of [0, 90, 180, 270]) {
  test(`mains source and initial native copper retain pin geometry at ${rotation} degrees`, async () => {
    const json = await compile(rotation);
    expect(json.filter((e) => e.type.includes("error"))).toEqual([]);
    const components = json.filter((e) => e.type === "source_component");
    expect(components.map((c) => c.manufacturer_part_number).sort()).toEqual([
      "G5RL-1A-TV8 DC5",
      "IRM-45-12",
    ]);
    const converter = new CircuitJsonToKicadPcbConverter(json);
    converter.runUntilFinished();
    const board = parseKicadPcb(converter.getOutputString());
    const angle = (rotation * Math.PI) / 180;
    for (const [ref, pattern] of [
      ["U1", isolatedSupplyPattern],
      ["K1", pumpRelayPattern],
    ] as const) {
      const source = components.find((c) => c.name === ref)!;
      const ports = json
        .filter((e) => e.type === "source_port")
        .filter((e) => e.source_component_id === source.source_component_id);
      expect(ports.map((p) => String(p.pin_number)).sort()).toEqual(
        pattern.pads.map((p) => p.number).sort(),
      );
      const lands = pattern.pads.map((pad) => {
        const port = ports.find((p) => String(p.pin_number) === pad.number)!;
        const pcbPort = json.find(
          (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
        )!;
        if (pcbPort.type !== "pcb_port") throw new Error("Missing physical pin");
        const land = json.find(
          (e) => e.type === "pcb_plated_hole" && e.pcb_port_id === pcbPort.pcb_port_id,
        )!;
        if (land.type !== "pcb_plated_hole") throw new Error("Missing PTH");
        if (land.shape !== "circle" && land.shape !== "circular_hole_with_rect_pad")
          throw new Error("Unexpected PTH shape");
        expect(land.hole_diameter).toBe(pad.drill);
        return { pad, land };
      });
      // Relative geometry remains meaningful before the board-specific native origin adapter.
      for (const { pad, land } of lands) {
        const first = lands[0]!;
        const dx = pad.x - first.pad.x,
          dy = -(pad.y - first.pad.y);
        expect(land.x - first.land.x).toBeCloseTo(
          dx * Math.cos(angle) - dy * Math.sin(angle),
          6,
        );
        expect(land.y - first.land.y).toBeCloseTo(
          dx * Math.sin(angle) + dy * Math.cos(angle),
          6,
        );
      }
      const fp = board.footprints.find((f) =>
        f.properties.some((p) => p.key === "Reference" && p.value === ref),
      )!;
      expect(fp.fpPads.map((p) => p.number).sort()).toEqual(
        pattern.pads.map((p) => p.number).sort(),
      );
      if (!(fp.position instanceof At)) throw new Error("Missing native pose");
      const nativeAngle = ((fp.position.angle ?? 0) * Math.PI) / 180;
      const originPad = fp.fpPads.find((p) => p.number === lands[0]!.pad.number)!;
      const expectedNets: Record<string, string> =
        ref === "U1"
          ? { "1": "AC_N", "2": "AC_L_FUSED", "3": "GND_ISO", "4": "V12_RAW" }
          : {
              "1": "V5_PSU",
              "3": "PUMP_L_FILTERED",
              "4": "PUMP_L_SW",
              "5": "COIL_DRAIN",
            };
      for (const pad of pattern.pads) {
        const native = fp.fpPads.find((p) => p.number === pad.number)!;
        expect(native.drill?.diameter).toBe(pad.drill);
        expect(native.size?.width).toBeCloseTo(pad.width, 6);
        expect(native.size?.height).toBeCloseTo(pad.height, 6);
        expect(native.net?.name).toBe(expectedNets[pad.number]);
        if (!native.at || !originPad.at)
          throw new Error("Missing native pad coordinate");
        const dx = native.at.x - originPad.at.x,
          dy = native.at.y - originPad.at.y;
        const sourceLand = lands.find((p) => p.pad.number === pad.number)!.land;
        expect(dx * Math.cos(nativeAngle) + dy * Math.sin(nativeAngle)).toBeCloseTo(
          sourceLand.x - lands[0]!.land.x,
          6,
        );
        expect(-dx * Math.sin(nativeAngle) + dy * Math.cos(nativeAngle)).toBeCloseTo(
          -(sourceLand.y - lands[0]!.land.y),
          6,
        );
      }
      expect(fp.fpPads.every((p) => p.net !== undefined)).toBe(true);
    }
    // Coil is not a galvanic connection to contacts; open contacts are not a wire.
    expect(
      json
        .filter((e) => e.type === "source_net")
        .map((n) => n.name)
        .sort(),
    ).toEqual([
      "AC_L_FUSED",
      "AC_N",
      "COIL_DRAIN",
      "GND_ISO",
      "PUMP_L_FILTERED",
      "PUMP_L_SW",
      "V12_RAW",
      "V5_PSU",
    ]);
    expect(json.filter((e) => e.type === "pcb_courtyard_outline")).toHaveLength(2);
  });
}

test("mains physical declarations keep insulation separate from body and assembly bounds", () => {
  const supply = landPatternPhysicalGeometry(
    isolatedSupplyPattern,
    isolatedSupplyPhysical,
  )!;
  const relay = landPatternPhysicalGeometry(pumpRelayPattern, pumpRelayPhysical)!;
  expect(supply.bodyCenter).toEqual({ x: 43.5, y: 26 });
  expect(supply.courtyard.width).toBeGreaterThanOrEqual(88);
  expect(supply.courtyard.height).toBeGreaterThanOrEqual(53);
  expect(relay.bodyCenter).toEqual({ x: 11.4, y: 3.75 });
  expect(relay.courtyard.width).toBeGreaterThanOrEqual(30);
  expect(relay.courtyard.height).toBeGreaterThanOrEqual(13.7);
  expect(relay.declaration.body.thicknessMax).toBe(15.7);
  expect(supply.declaration.body.thicknessMax).toBe(30.5);
});
