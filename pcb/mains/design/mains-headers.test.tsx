import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { Fragment } from "react";
import {
  MainsHeader,
  mainsHeaderDefinitions,
  mainsHeaderNets,
  mainsHeaderPattern,
  mainsHeaderPhysical,
  type MainsHeaderRef,
} from "./mains-headers";
import { schematicConnectivityErrors } from "../../controller/design/schematic-connectivity-check";
import { landPatternPhysicalGeometry } from "../../controller/design/land-pattern-physical";

const refs: MainsHeaderRef[] = ["J1", "J2", "J3", "J4"];
const counts = [2, 2, 2, 2];
const expectedNets = [
  ["AC_L_FUSED", "AC_N"],
  ["FILTER_LINE_L", "AC_N"],
  ["PUMP_L_FILTERED", "PUMP_N_FILTERED"],
  ["PUMP_L_SW", "PUMP_N_FILTERED"],
];

async function compile(rotation: number) {
  const circuit = new Circuit();
  circuit.add(
    <board width={240} height={240} routingDisabled>
      {refs.map((ref, i) => (
        <Fragment key={ref}>
          <MainsHeader
            name={ref}
            pcbX={i % 2 === 0 ? -70 : 40}
            pcbY={i < 2 ? 55 : -55}
            pcbRotation={rotation}
            schX={i % 2 === 0 ? -10 : 10}
            schY={i < 2 ? 6 : -6}
          />
          <netlabel net={mainsHeaderNets[ref][0]} connectsTo={`.${ref} > .LINE`} />
          <netlabel net={mainsHeaderNets[ref][1]} connectsTo={`.${ref} > .NEUTRAL`} />
        </Fragment>
      ))}
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

for (const rotation of [0, 90, 180, 270]) {
  test(`Fixed terminal blocks retain eight physical pins and exact circuit nets at ${rotation} degrees`, async () => {
    const json = await compile(rotation);
    expect(json.filter((e) => e.type.includes("error"))).toEqual([]);
    expect(schematicConnectivityErrors(json)).toEqual([]);
    const source = json.filter((e) => e.type === "source_component");
    const ports = json.filter((e) => e.type === "source_port");
    expect(source).toHaveLength(4);
    expect(ports).toHaveLength(8);
    expect(ports.filter((p) => p.do_not_connect)).toHaveLength(0);
    expect(json.filter((e) => e.type === "pcb_plated_hole")).toHaveLength(8);
    expect(json.filter((e) => e.type === "pcb_hole")).toHaveLength(0);
    const converter = new CircuitJsonToKicadPcbConverter(json);
    converter.runUntilFinished();
    const native = parseKicadPcb(converter.getOutputString());
    let connectedTails = 0;
    for (const [i, ref] of refs.entries()) {
      const part = source.find((e) => e.name === ref)!;
      expect(part.manufacturer_part_number).toBe("1868076");
      const fp = native.footprints.find((e) =>
        e.properties.some((p) => p.key === "Reference" && p.value === ref),
      )!;
      expect(fp.fpPads).toHaveLength(counts[i]!);
      const physical = json.find(
        (e) =>
          e.type === "pcb_component" &&
          e.source_component_id === part.source_component_id,
      );
      if (physical?.type !== "pcb_component") throw new Error(`Missing ${ref}`);
      const lands = json
        .filter((e) => e.type === "pcb_plated_hole")
        .filter((e) => e.pcb_component_id === physical.pcb_component_id);
      const a = (rotation * Math.PI) / 180;
      if (!(fp.position instanceof At)) throw new Error("Missing native pose");
      const nativeAngle = ((fp.position?.angle ?? 0) * Math.PI) / 180;
      const nativeWorld = (pad: (typeof fp.fpPads)[number]) => {
        if (!pad.at) throw new Error("Missing native coordinate");
        return {
          x: pad.at.x * Math.cos(nativeAngle) + pad.at.y * Math.sin(nativeAngle),
          y: -pad.at.x * Math.sin(nativeAngle) + pad.at.y * Math.cos(nativeAngle),
        };
      };
      const origin = nativeWorld(fp.fpPads.find((p) => p.number === "1")!);
      // Shape/polarity-independent sorted vectors still retain orientation and
      // every number; a mirror or missing terminal pin fails.
      for (let number = 1; number <= counts[i]!; number++) {
        const pins = fp.fpPads.filter((p) => p.number === String(number));
        expect(pins).toHaveLength(1);
        const sourcePort = ports.find(
          (p) =>
            p.source_component_id === part.source_component_id &&
            p.pin_number === number,
        )!;
        const pcbPort = json.find(
          (p) =>
            p.type === "pcb_port" && p.source_port_id === sourcePort.source_port_id,
        );
        if (pcbPort?.type !== "pcb_port") throw new Error(`Missing ${ref}.${number}`);
        const pair = lands.filter((land) => land.pcb_port_id === pcbPort.pcb_port_id);
        expect(pair).toHaveLength(1);
        expect(sourcePort.do_not_connect === true).toBe(number > 2);
        for (const pad of pins) {
          expect(pad.drill?.diameter).toBe(1.3);
          expect(pad.size?.width).toBeCloseTo(3.5, 8);
          expect(pad.size?.height).toBeCloseTo(3.5, 8);
          expect(pad.padType).toBe("thru_hole");
          if (number <= 2) {
            expect(pad.net?.name).toBe(expectedNets[i]![number - 1]);
            connectedTails++;
          } else expect(pad.net).toBeUndefined();
        }
        // The first exported pad is circuit 1. Native +Y down.
        const actual = pins
          .map((pad) => {
            const p = nativeWorld(pad);
            return [p.x - origin.x, p.y - origin.y].map(
              (v) => Number(v.toFixed(6)) + 0,
            );
          })
          .sort();
        const expected = [0]
          .map((dy) => {
            const dx = (number - 1) * 7.62;
            return [
              dx * Math.cos(a) + dy * Math.sin(a),
              -dx * Math.sin(a) + dy * Math.cos(a),
            ].map((v) => Number(v.toFixed(6)) + 0);
          })
          .sort();
        expect(actual).toEqual(expected);
      }
    }
    expect(connectedTails).toBe(8);
  });
}

test("fixed terminal body and drill reserve match the manufacturer drawing", () => {
  for (const ref of refs) {
    const declaration = mainsHeaderPhysical(ref);
    const pattern = mainsHeaderPattern(ref);
    const geometry = landPatternPhysicalGeometry(pattern, declaration)!;
    expect(declaration.body.thicknessMax).toBe(21.5);
    expect(declaration.body.width).toBe(15.24);
    expect(declaration.body.height).toBe(12.5);
    expect(declaration.packageCenter).toEqual({ x: 3.81, y: 1.65 });
    expect(geometry.courtyard.width).toBeGreaterThanOrEqual(
      mainsHeaderDefinitions[ref].bodyWidth + 1,
    );
    expect(geometry.courtyard.height).toBeGreaterThanOrEqual(13.5);
    expect((3.5 - 1.3) / 2).toBeCloseTo(1.1, 8);
    expect(pattern.holes ?? []).toEqual([]);
  }
});
