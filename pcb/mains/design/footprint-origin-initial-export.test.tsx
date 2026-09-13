import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { PsuHeader, ServiceHeader } from "../../controller/design/micro-fit-components";
import MainsCircuit from "./mains.circuit";
import { MainsHeader } from "./mains-headers";
import { IsolatedSupply, PumpRelay, BranchFuse } from "./power-components";
import {
  CoilFlyback,
  SnubberCapacitor,
  SnubberResistor,
} from "./suppression-components";
import { ThermallyProtectedMov } from "./mov-component";
import { mainsPlacements } from "./placements";
import { prepareMainsFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";

const refs = [
  "U1",
  "K1",
  "J1",
  "J2",
  "J3",
  "J4",
  "J5",
  "D1",
  "R1",
  "C1",
  "RV1",
  "J6",
  "F3",
];

function sourceComponent(json: CircuitJson, ref: string) {
  const source = json.find((e) => e.type === "source_component" && e.name === ref);
  if (source?.type !== "source_component") throw new Error(`Missing ${ref}`);
  const component = json.find(
    (e) =>
      e.type === "pcb_component" &&
      e.source_component_id === source.source_component_id,
  );
  if (component?.type !== "pcb_component") throw new Error(`Missing physical ${ref}`);
  return component;
}

function convert(json: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  return parseKicadPcb(converter.getOutputString());
}

test("complete mains origins match authored datums without changing any other source field", async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  const input = circuit.getCircuitJson();
  const untouched = structuredClone(input);
  const prepared = prepareMainsFootprintOriginsForInitialExport(input);
  expect(input).toEqual(untouched);
  const expected = structuredClone(input);
  for (const ref of refs) {
    const placement = mainsPlacements[ref as keyof typeof mainsPlacements];
    sourceComponent(expected, ref).center = { x: placement.pcbX, y: placement.pcbY };
    const actual = sourceComponent(prepared, ref);
    expect(actual.center.x).toBeCloseTo(placement.pcbX, 7);
    expect(actual.center.y).toBeCloseTo(placement.pcbY, 7);
  }
  // Only floating point roundoff in the thirteen corrected centres is normalized
  // for comparison. Nets, hole shapes, mask/paste, graphics and SMT are untouched.
  const rounded = structuredClone(prepared);
  for (const ref of refs)
    sourceComponent(rounded, ref).center = sourceComponent(expected, ref).center;
  expect(rounded).toEqual(expected);
  expect(prepareMainsFootprintOriginsForInitialExport(prepared)).toEqual(prepared);
  expect(prepared.filter((e) => e.type === "pcb_component")).toHaveLength(22);

  // The former raw export had displaced native footprint origins despite
  // correct global copper. This assertion fails if preparation is bypassed.
  expect(sourceComponent(input, "U1").center).not.toEqual(
    sourceComponent(prepared, "U1").center,
  );
  const native = convert(prepared);
  expect(native.footprints).toHaveLength(26); // four separate mounting holes
  for (const ref of refs) {
    const fp = native.footprints.find((f) =>
      f.properties.some((p) => p.key === "Reference" && p.value === ref),
    )!;
    if (!(fp.position instanceof At)) throw new Error(`Missing native ${ref}`);
    const placement = mainsPlacements[ref as keyof typeof mainsPlacements];
    expect(fp.position.x).toBeCloseTo(100 + placement.pcbX, 7);
    expect(fp.position.y).toBeCloseTo(100 - placement.pcbY, 7);
    expect(fp.position.angle ?? 0).toBe(placement.pcbRotation);
  }
});

async function gallery(rotation: number) {
  const place = (i: number) => ({
    pcbX: -180 + (i % 6) * 70,
    pcbY: 60 - Math.floor(i / 6) * 100,
    pcbRotation: rotation,
    schX: i * 12,
  });
  const circuit = new Circuit();
  circuit.add(
    <board width={750} height={500} routingDisabled pcbRelative>
      <IsolatedSupply name="U1" {...place(0)} />
      <PumpRelay name="K1" {...place(1)} />
      <MainsHeader name="J1" {...place(2)} />
      <MainsHeader name="J2" {...place(3)} />
      <MainsHeader name="J3" {...place(4)} />
      <MainsHeader name="J4" {...place(5)} />
      <PsuHeader name="J5" {...place(6)} />
      <CoilFlyback name="D1" {...place(7)} />
      <SnubberResistor name="R1" {...place(8)} />
      <SnubberCapacitor name="C1" {...place(9)} />
      <ThermallyProtectedMov name="RV1" {...place(10)} />
      <ServiceHeader name="J6" {...place(11)} />
      <BranchFuse name="F3" {...place(12)} />
    </board>,
  );
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
}

for (const rotation of [0, 90, 180, 270]) {
  test(`mains origin correction preserves all native pad and outline points at ${rotation} degrees`, async () => {
    const input = await gallery(rotation);
    const prepared = prepareMainsFootprintOriginsForInitialExport(input);
    const previous = convert(input);
    const native = convert(prepared);
    for (const [index, ref] of refs.entries()) {
      const find = (board: typeof native) =>
        board.footprints.find((fp) =>
          fp.properties.some((p) => p.key === "Reference" && p.value === ref),
        )!;
      const fp = find(native);
      const old = find(previous);
      if (!(fp.position instanceof At)) throw new Error("Missing native placement");
      expect(fp.position.x).toBeCloseTo(100 - 180 + (index % 6) * 70, 7);
      expect(fp.position.y).toBeCloseTo(100 - 60 + Math.floor(index / 6) * 100, 7);
      expect(fp.position.angle ?? 0).toBe(rotation);
      const geometry = (f: typeof fp) => {
        const origin = f.position as At;
        const angle = ((origin.angle ?? 0) * Math.PI) / 180;
        const absolute = (p: { x: number; y: number }) => ({
          x: origin.x + p.x * Math.cos(angle) + p.y * Math.sin(angle),
          y: origin.y - p.x * Math.sin(angle) + p.y * Math.cos(angle),
        });
        return [
          ...f.fpPads.map((p) => absolute(p.at!)),
          ...f.fpLines.flatMap((p) => [absolute(p.start!), absolute(p.end!)]),
          ...f.fpPolys.flatMap((p) =>
            p.points!.points.map((point) => {
              if (!("x" in point)) throw new Error("Unexpected courtyard arc");
              return absolute(point);
            }),
          ),
        ];
      };
      const before = geometry(old);
      const after = geometry(fp);
      expect(after).toHaveLength(before.length);
      for (const [i, point] of after.entries()) {
        expect(point.x).toBeCloseTo(before[i]!.x, 7);
        expect(point.y).toBeCloseTo(before[i]!.y, 7);
      }
      expect(fp.fpPads.map((p) => p.number)).toEqual(old.fpPads.map((p) => p.number));
      expect(fp.fpPads.map((p) => p.net?.name)).toEqual(
        old.fpPads.map((p) => p.net?.name),
      );
      expect(fp.fpPads.map((p) => p.drill?.getString())).toEqual(
        old.fpPads.map((p) => p.drill?.getString()),
      );
    }
    // 49 numbered through-hole lands, including both tails on all 15 blades,
    // plus J5's one locator. No duplicate pad may disappear during normalization.
    expect(native.footprints.flatMap((fp) => fp.fpPads)).toHaveLength(55);
  });
}

test("mains preparation rejects missing tails, changed locators and non-rigid pin movement", async () => {
  const input = await gallery(0);
  for (const mutate of [
    (json: CircuitJson) => {
      const c = sourceComponent(json, "J4");
      const i = json.findIndex(
        (e) =>
          e.type === "pcb_plated_hole" && e.pcb_component_id === c.pcb_component_id,
      );
      json.splice(i, 1);
    },
    (json: CircuitJson) => {
      const c = sourceComponent(json, "J5");
      const hole = json.find(
        (e) => e.type === "pcb_hole" && e.pcb_component_id === c.pcb_component_id,
      );
      if (hole?.type !== "pcb_hole") throw new Error("Missing J5 locator");
      hole.x += 0.1;
    },
    (json: CircuitJson) => {
      const c = sourceComponent(json, "RV1");
      const hole = json.find(
        (e) =>
          e.type === "pcb_plated_hole" && e.pcb_component_id === c.pcb_component_id,
      );
      if (hole?.type !== "pcb_plated_hole") throw new Error("Missing MOV land");
      hole.y += 0.1;
    },
  ]) {
    const modified = structuredClone(input);
    mutate(modified);
    const untouched = structuredClone(modified);
    expect(() => prepareMainsFootprintOriginsForInitialExport(modified)).toThrow();
    expect(modified).toEqual(untouched);
  }
  const reversed = [...input].reverse();
  const restored = prepareMainsFootprintOriginsForInitialExport(reversed);
  for (const ref of refs)
    expect(sourceComponent(restored, ref).center).toEqual(
      sourceComponent(prepareMainsFootprintOriginsForInitialExport(input), ref).center,
    );
});
