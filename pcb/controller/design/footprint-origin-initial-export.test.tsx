import { ServicePowerHeader } from "./service-power-header";
import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { Esp32C6Wroom } from "./esp32-c6-wroom";
import { ControllerButton, StatusLed } from "./assembly-components";
import { PsuHeader, SensorHeader } from "./micro-fit-components";
import { prepareFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";

const refs = ["U1", "J1", "J2", "J3", "D4", "SW1"];
async function gallery(rotation: number) {
  const circuit = new Circuit();
  const placement = (index: number) => ({
    pcbX: -75 + index * 30,
    pcbY: 7,
    pcbRotation: rotation,
    schX: -30 + index * 12,
  });
  circuit.add(
    <board width={210} height={65} pcbRelative routingDisabled>
      <Esp32C6Wroom name="U1" {...placement(0)} />
      <PsuHeader name="J1" {...placement(1)} />
      <ServicePowerHeader name="J2" {...placement(2)} />
      <SensorHeader name="J3" {...placement(3)} />
      <StatusLed name="D4" {...placement(4)} />
      <ControllerButton name="SW1" {...placement(5)} />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

function convert(json: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  return parseKicadPcb(converter.getOutputString());
}

for (const rotation of [0, 90, 180, 270]) {
  test(`manufacturer origin normalization preserves absolute native geometry at ${rotation} degrees`, async () => {
    const source = await gallery(rotation);
    const before = structuredClone(source);
    const normalized = prepareFootprintOriginsForInitialExport(source, refs);
    expect(source).toEqual(before);
    expect(prepareFootprintOriginsForInitialExport(normalized, refs)).toEqual(
      normalized,
    );
    const expected = structuredClone(source);
    for (const [index, ref] of refs.entries()) {
      const part = expected
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === ref)!;
      expected
        .filter((e) => e.type === "pcb_component")
        .find((e) => e.source_component_id === part.source_component_id)!.center = {
        x: -75 + index * 30,
        y: 7,
      };
    }
    // Numerical roundoff is allowed only in the new centre. Every other source
    // field, including physical geometry, identity and ports, is byte-identical.
    const compared = structuredClone(normalized);
    for (const element of compared.filter((e) => e.type === "pcb_component")) {
      const target = expected
        .filter((e) => e.type === "pcb_component")
        .find((e) => e.pcb_component_id === element.pcb_component_id)!;
      expect(element.center.x).toBeCloseTo(target.center.x, 7);
      expect(element.center.y).toBeCloseTo(target.center.y, 7);
      element.center = target.center;
    }
    expect(compared).toEqual(expected);
    const initial = convert(source);
    const native = convert(normalized);
    for (const [index, ref] of refs.entries()) {
      const find = (board: typeof native) =>
        board.footprints.find((fp) =>
          fp.properties.some((p) => p.key === "Reference" && p.value === ref),
        )!;
      const previous = find(initial);
      const footprint = find(native);
      const at = footprint.position;
      expect(at).toBeInstanceOf(At);
      if (!(at instanceof At)) throw new Error("Missing position");
      expect(at.x).toBeCloseTo(100 - 75 + index * 30, 7);
      expect(at.y).toBeCloseTo(93, 7);
      expect(at.angle ?? 0).toBe(rotation);
      // Compare native absolute geometry before/after origin normalization,
      // including every repeated pad, locator and physical outline vertex.
      const geometry = (fp: typeof footprint) => {
        const origin = fp.position as At;
        const radians = ((origin.angle ?? 0) * Math.PI) / 180;
        const absolute = (p: { x: number; y: number }) => ({
          x: origin.x + p.x * Math.cos(radians) + p.y * Math.sin(radians),
          y: origin.y - p.x * Math.sin(radians) + p.y * Math.cos(radians),
        });
        return [
          ...fp.fpPads.map((p) => absolute(p.at!)),
          ...fp.fpLines.flatMap((p) => [absolute(p.start!), absolute(p.end!)]),
          ...fp.fpPolys.flatMap((p) =>
            p.points!.points.map((point) => {
              if (!("x" in point)) throw new Error("Unexpected arc");
              return absolute(point);
            }),
          ),
        ];
      };
      const oldGeometry = geometry(previous);
      const newGeometry = geometry(footprint);
      expect(newGeometry.length).toBe([50, 17, 15, 20, 15, 17][index]);
      expect(newGeometry.length).toBe(oldGeometry.length);
      for (const [i, point] of newGeometry.entries()) {
        expect(point.x).toBeCloseTo(oldGeometry[i]!.x, 7);
        expect(point.y).toBeCloseTo(oldGeometry[i]!.y, 7);
      }
      // Native datum now agrees with manufacturer pin-one location. The WROOM
      // first land uses Espressif's independent (-8.75,-8.26) drawing coordinate.
      const first = footprint.fpPads.find((p) => p.number === "1")!;
      expect(first.at!.x).toBeCloseTo(ref === "U1" ? -8.75 : 0, 7);
      expect(first.at!.y).toBeCloseTo(ref === "U1" ? -8.26 : 0, 7);
    }
  });
}

test("origin normalization rejects drift and preserves the entire input batch", async () => {
  const source = await gallery(0);
  const component = (json: CircuitJson) =>
    json
      .filter((e) => e.type === "pcb_component")
      .find((p) => {
        const s = json
          .filter((e) => e.type === "source_component")
          .find((e) => e.source_component_id === p.source_component_id);
        return s?.name === "SW1";
      })!;
  const changes: ((json: CircuitJson) => void)[] = [
    (j) => {
      component(j).rotation = 45;
    },
    (j) => {
      component(j).layer = "bottom";
    },
    (j) => {
      component(j).metadata!.kicad_footprint!.footprintName = "wrong";
    },
    (j) => {
      j
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === "SW1")!.manufacturer_part_number = "wrong";
    },
    (j) => {
      j
        .filter((e) => e.type === "pcb_plated_hole")
        .find((e) => e.pcb_component_id === component(j).pcb_component_id)!.x += 0.1;
    },
    (j) => {
      j.filter((e) => e.type === "pcb_hole")[0]!.y += 0.1;
    },
    (j) => {
      j.push(structuredClone(component(j)));
    },
    (j) => {
      j.push(structuredClone(j.find((e) => e.type === "pcb_plated_hole")!));
    },
  ];
  for (const change of changes) {
    const changed = structuredClone(source);
    change(changed);
    const before = structuredClone(changed);
    expect(() => prepareFootprintOriginsForInitialExport(changed, refs)).toThrow();
    expect(changed).toEqual(before);
  }
  expect(() =>
    prepareFootprintOriginsForInitialExport(source, [...refs, "U1"]),
  ).toThrow();
  expect(() => prepareFootprintOriginsForInitialExport(source, ["missing"])).toThrow();
  // Reordering input records must not choose a different repeated button land.
  const shuffled = [...source].reverse();
  const result = prepareFootprintOriginsForInitialExport(shuffled, refs);
  expect(component(result).center).toEqual({ x: 75, y: 7 });
});
