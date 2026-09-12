import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { MainsSuppression } from "./suppression";
import {
  CoilFlyback,
  SnubberCapacitor,
  SnubberResistor,
  flybackPattern,
  snubberResistorPattern,
  snubberCapacitorPattern,
  flybackPhysical,
  snubberResistorPhysical,
  snubberCapacitorPhysical,
} from "./suppression-components";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";
import { landPatternPhysicalGeometry } from "../../controller/design/land-pattern-physical";

test("coil clamp and load-side RC retain polarity and cannot bypass the open relay", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={80} height={60} routingDisabled>
      <MainsSuppression />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  expect(json.filter((e) => e.type.includes("error"))).toEqual([]);
  expect(schematicConnectivityErrors(json)).toEqual([]);
  const parts = json.filter((e) => e.type === "source_component");
  expect(parts.map((p) => p.name).sort()).toEqual(["C1", "D1", "R1"]);
  const expected = {
    "D1.1": "V5_PSU",
    "D1.2": "COIL_DRAIN",
    "R1.1": "PUMP_L_SW",
    "R1.2": "SNUBBER_RC",
    "C1.1": "SNUBBER_RC",
    "C1.2": "PUMP_N_FILTERED",
  };
  const ports = json.filter((e) => e.type === "source_port");
  expect(ports).toHaveLength(6);
  const drawnNets = schematicPortNetNames(json);
  for (const port of ports) {
    const part = parts.find((p) => p.source_component_id === port.source_component_id)!;
    const key = `${part.name}.${port.pin_number}` as keyof typeof expected;
    expect(drawnNets.get(port.source_port_id)).toEqual([expected[key]]);
  }
  expect(ports.filter((p) => p.do_not_connect)).toHaveLength(0);
  const resistor = parts.find((p) => p.name === "R1")!;
  if (resistor.ftype !== "simple_resistor") throw new Error("Missing resistor");
  expect(resistor.resistance).toBe(100);
  const capacitor = parts.find((p) => p.name === "C1")!;
  if (capacitor.ftype !== "simple_capacitor") throw new Error("Missing capacitor");
  expect(capacitor.capacitance).toBe(47e-9);
  expect(capacitor.max_voltage_rating).toBe(305);
  expect(
    json
      .filter((e) => e.type === "source_net")
      .map((e) => e.name)
      .sort(),
  ).toEqual(["COIL_DRAIN", "PUMP_L_SW", "PUMP_N_FILTERED", "SNUBBER_RC", "V5_PSU"]);
  // Check actual serialized native output, including cathode pin numbering.
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  const native = parseKicadPcb(converter.getOutputString());
  for (const fp of native.footprints) {
    const ref = fp.properties.find((p) => p.key === "Reference")!.value;
    for (const pad of fp.fpPads)
      expect(pad.net?.name).toBe(
        expected[`${ref}.${pad.number}` as keyof typeof expected],
      );
  }
  const band = ports.find(
    (p) =>
      p.source_component_id ===
        parts.find((p) => p.name === "D1")!.source_component_id && p.pin_number === 1,
  )!;
  expect(band.name).toBe("K");
  const withoutCoilLabel = json.filter(
    (e) => e.type !== "schematic_net_label" || e.text !== "COIL_DRAIN",
  );
  expect(schematicConnectivityErrors(withoutCoilLabel).length).toBeGreaterThan(0);
});

test("finished drills and physical envelopes use exact body and wire maxima", () => {
  for (const [pattern, wireMax, body, physical] of [
    [flybackPattern, 0.86, [5.2, 2.7], flybackPhysical],
    [snubberResistorPattern, 0.83, [10, 3.9], snubberResistorPhysical],
    [snubberCapacitorPattern, 0.65, [13, 5], snubberCapacitorPhysical],
  ] as const) {
    for (const pad of pattern.pads) {
      expect(pad.drill - 0.1).toBeGreaterThan(wireMax);
      expect((pad.width - pad.drill) / 2).toBeGreaterThanOrEqual(0.75);
    }
    expect([physical.body.width, physical.body.height]).toEqual([...body]);
    const geometry = landPatternPhysicalGeometry(pattern, physical)!;
    expect(geometry.courtyard.width).toBeGreaterThan(physical.envelope.width);
    expect(geometry.courtyard.height).toBeGreaterThan(physical.envelope.height);
  }
  expect(snubberResistorPhysical.envelope.width).toBeGreaterThan(12);
  expect(flybackPattern.pads[0]!.shape).toBe("roundrect");
  expect(flybackPattern.pads[0]!.cornerRadius).toBe(0);
  // Worst two-hole diametric freedom exceeds lead-pitch +/-0.4 mm plus
  // an explicitly budgeted 0.10 mm differential hole-position error.
  expect(snubberCapacitorPattern.pads[0]!.drill - 0.1 - 0.65).toBeGreaterThanOrEqual(
    0.5,
  );
});

for (const rotation of [0, 90, 180, 270]) {
  test(`suppression part drill centres and exact identities survive rotation ${rotation}`, async () => {
    const circuit = new Circuit();
    circuit.add(
      <board width={130} height={100} routingDisabled>
        <CoilFlyback name="D1" pcbX={-35} pcbY={20} pcbRotation={rotation} schX={-6} />
        <SnubberResistor name="R1" pcbX={0} pcbY={0} pcbRotation={rotation} schX={0} />
        <SnubberCapacitor
          name="C1"
          pcbX={35}
          pcbY={-20}
          pcbRotation={rotation}
          schX={6}
        />
      </board>,
    );
    await circuit.renderUntilSettled();
    const json = circuit.getCircuitJson();
    expect(json.filter((e) => e.type.includes("error"))).toEqual([]);
    const converter = new CircuitJsonToKicadPcbConverter(json);
    converter.runUntilFinished();
    const native = parseKicadPcb(converter.getOutputString());
    for (const [ref, pitch, mpn, pattern] of [
      ["D1", 10.16, "1N4007-E3/54", flybackPattern],
      ["R1", 15.24, "PR02FS0201000KA100", snubberResistorPattern],
      ["C1", 10, "B32921C3473K000", snubberCapacitorPattern],
    ] as const) {
      const part = json.find((e) => e.type === "source_component" && e.name === ref)!;
      if (part.type !== "source_component") throw new Error("Missing source part");
      expect(part.manufacturer_part_number).toBe(mpn);
      const fp = native.footprints.find((f) =>
        f.properties.some((p) => p.key === "Reference" && p.value === ref),
      )!;
      expect(fp.fpPads.map((p) => p.number).sort()).toEqual(["1", "2"]);
      const a = fp.fpPads.find((p) => p.number === "1");
      const b = fp.fpPads.find((p) => p.number === "2");
      if (!a?.at || !b?.at) throw new Error("Missing native PTHs");
      expect(Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y)).toBeCloseTo(pitch, 6);
      if (!(fp.position instanceof At)) throw new Error("Missing native pose");
      // Distance alone would miss a reversed diode. Check the signed pin 1-to-2
      // vector in native global +Y-down coordinates at every cardinal rotation.
      const angle = ((fp.position.angle ?? 0) * Math.PI) / 180;
      const sourceAngle = (rotation * Math.PI) / 180;
      const dx = b.at.x - a.at.x;
      const dy = b.at.y - a.at.y;
      expect(dx * Math.cos(angle) + dy * Math.sin(angle)).toBeCloseTo(
        pitch * Math.cos(sourceAngle),
        6,
      );
      expect(-dx * Math.sin(angle) + dy * Math.cos(angle)).toBeCloseTo(
        -pitch * Math.sin(sourceAngle),
        6,
      );
      for (const pad of fp.fpPads) {
        const expected = pattern.pads.find((p) => p.number === pad.number)!;
        expect(pad.drill?.diameter).toBe(expected.drill);
        expect(pad.size?.width).toBeCloseTo(expected.width, 6);
      }
    }
  });
}
