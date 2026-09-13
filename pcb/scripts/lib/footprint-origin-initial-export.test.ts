import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import {
  prepareFootprintOriginsWithPatterns,
  type OriginPattern,
} from "./footprint-origin-initial-export";

const patterns = {
  "TEST-TWO-TAIL": {
    id: "Test:TwoTail",
    pads: [
      { number: "1", x: 0, y: 0 },
      { number: "1", x: 0, y: -3 },
      { number: "2", x: 7.5, y: 0 },
    ],
    holes: [{ x: 2, y: -4 }],
  },
} as const satisfies Readonly<Record<string, OriginPattern>>;

// Explicit 90-degree fixture: the authored origin is (10,20), while the
// compiler's arbitrary stored center is (99,99). Only fields the matcher reads
// are provided; actual compiled/native geometry remains covered by the existing
// controller origin gallery tests. Repeated tails have separate PCB ports.
function fixture(): CircuitJson {
  return [
    {
      type: "source_component",
      source_component_id: "source-j1",
      name: "J1",
      manufacturer_part_number: "TEST-TWO-TAIL",
    },
    {
      type: "pcb_component",
      pcb_component_id: "pcb-j1",
      source_component_id: "source-j1",
      layer: "top",
      rotation: 90,
      center: { x: 99, y: 99 },
      metadata: { kicad_footprint: { footprintName: "Test:TwoTail" } },
    },
    ...[
      { id: "1", name: "pin1", number: 1, hint: "pin1", x: 10, y: 20 },
      {
        id: "1b",
        name: "pin1_internal_1",
        number: undefined,
        hint: "pin1",
        x: 7,
        y: 20,
      },
      { id: "2", name: "pin2", number: 2, hint: "pin2", x: 10, y: 27.5 },
    ].flatMap((p) => [
      {
        type: "source_port",
        source_port_id: `source-${p.id}`,
        source_component_id: "source-j1",
        name: p.name,
        pin_number: p.number,
        port_hints: [p.hint],
      },
      {
        type: "pcb_port",
        pcb_port_id: `pcb-${p.id}`,
        pcb_component_id: "pcb-j1",
        source_port_id: `source-${p.id}`,
      },
      {
        type: "pcb_plated_hole",
        pcb_component_id: "pcb-j1",
        pcb_port_id: `pcb-${p.id}`,
        port_hints: [p.hint],
        x: p.x,
        y: p.y,
      },
    ]),
    { type: "pcb_hole", pcb_component_id: "pcb-j1", x: 6, y: 22 },
  ] as unknown as CircuitJson;
}

test("explicit readonly registry identifies a new repeated-tail pattern without controller defaults", () => {
  const source = fixture();
  const before = structuredClone(source);
  const registryBefore = structuredClone(patterns);
  const normalized = prepareFootprintOriginsWithPatterns(source, ["J1"], patterns);
  const expected = structuredClone(source);
  expected.find((e) => e.type === "pcb_component")!.center = { x: 10, y: 20 };
  expect(normalized).toEqual(expected);
  expect(source).toEqual(before);
  expect(patterns).toEqual(registryBefore);
  expect(prepareFootprintOriginsWithPatterns(normalized, ["J1"], patterns)).toEqual(
    normalized,
  );
  expect(
    prepareFootprintOriginsWithPatterns([...source].reverse(), ["J1"], patterns),
  ).toEqual([...expected].reverse());
  expect(() => prepareFootprintOriginsWithPatterns(source, ["J1"], {})).toThrow(
    "unsupported footprint origin source",
  );
  expect(() =>
    prepareFootprintOriginsWithPatterns(source, ["J1", "J1"], patterns),
  ).toThrow("Duplicate origin reference");
});

test("registry is supplied per call and late failure cannot expose partial center changes", () => {
  const source = fixture();
  const before = structuredClone(source);
  const other: Readonly<Record<string, OriginPattern>> = {
    "TEST-TWO-TAIL": {
      ...patterns["TEST-TWO-TAIL"],
      pads: patterns["TEST-TWO-TAIL"].pads.map((p) => ({ ...p, x: p.x + 4 })),
      holes: patterns["TEST-TWO-TAIL"].holes.map((p) => ({ ...p, x: p.x + 4 })),
    },
  };
  expect(
    prepareFootprintOriginsWithPatterns(source, ["J1"], other).find(
      (e) => e.type === "pcb_component",
    )!.center,
  ).toEqual({ x: 10, y: 16 });
  expect(() =>
    prepareFootprintOriginsWithPatterns(source, ["J1", "missing"], patterns),
  ).toThrow("missing: unsupported footprint origin source");
  expect(source).toEqual(before);
  expect(
    prepareFootprintOriginsWithPatterns(source, ["J1"], patterns).find(
      (e) => e.type === "pcb_component",
    )!.center,
  ).toEqual({ x: 10, y: 20 });
});

test("shared matcher retains rejection of orphan pads, invalid internal tails and incomplete geometry", () => {
  const changes: ((json: CircuitJson) => void)[] = [
    (json) => {
      json.find((e) => e.type === "pcb_plated_hole")!.pcb_port_id = "orphan";
    },
    (json) => {
      json
        .filter((e) => e.type === "source_port")
        .find((e) => e.name === "pin1_internal_1")!.name = "not-an-internal-tail";
    },
    (json) => {
      json
        .filter((e) => e.type === "source_port")
        .find((e) => e.name === "pin1")!.pin_number = 2;
    },
    (json) => {
      json.find((e) => e.type === "pcb_hole")!.x += 0.1;
    },
    (json) => {
      json.push(structuredClone(json.find((e) => e.type === "pcb_plated_hole")!));
    },
    (json) => {
      json.splice(
        json.findIndex((e) => e.type === "pcb_hole"),
        1,
      );
    },
  ];
  for (const change of changes) {
    const changed = fixture();
    change(changed);
    const before = structuredClone(changed);
    expect(() =>
      prepareFootprintOriginsWithPatterns(changed, ["J1"], patterns),
    ).toThrow();
    expect(changed).toEqual(before);
  }
});
