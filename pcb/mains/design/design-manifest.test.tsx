import { beforeAll, expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { spawnSync } from "node:child_process";
import MainsCircuit from "./mains.circuit";
import {
  createMainsManifest,
  mainsBoardId,
  mainsComponentId,
  mainsNativeFootprint,
  mainsProjectSymbol,
} from "./design-manifest";
import { createMainsInitialPcb } from "./mains-initial-pcb";
import { controllerFootprintGeometrySha256 } from "../../controller/design/footprint-geometry-identity";

let source: CircuitJson;
let manifest: ReturnType<typeof createMainsManifest>;
beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  source = circuit.getCircuitJson();
  manifest = createMainsManifest(source);
});

function shared(input: unknown, compare = false) {
  const result = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, sys",
        "from tools.tscircuit_handoff import normalize_manifest, classify_changes",
        "data = json.load(sys.stdin)",
        compare
          ? "print(json.dumps(classify_changes(normalize_manifest(data[0]), normalize_manifest(data[1]))))"
          : "print(json.dumps(normalize_manifest(data)))",
      ].join("\n"),
    ],
    {
      cwd: new URL("../../", import.meta.url),
      input: JSON.stringify(input),
      encoding: "utf8",
      timeout: 30000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

function component(json: CircuitJson, ref: string) {
  const found = json.find((e) => e.type === "source_component" && e.name === ref);
  if (found?.type !== "source_component") throw new Error(`Missing ${ref}`);
  return found;
}
function physical(json: CircuitJson, ref: string) {
  const id = component(json, ref).source_component_id;
  const found = json.find(
    (e) => e.type === "pcb_component" && e.source_component_id === id,
  );
  if (found?.type !== "pcb_component") throw new Error(`Missing physical ${ref}`);
  return found;
}

test("mains manifest normalizes to the shared schema with 27 stable refs, all logical nets and five NPTHs", () => {
  const untouched = JSON.stringify(source);
  expect(createMainsManifest([...source].reverse())).toEqual(manifest);
  const ids = [
    ...new Set(
      source.flatMap((e) =>
        Object.entries(e)
          .filter(([key, value]) => key.endsWith("_id") && typeof value === "string")
          .map(([, value]) => value as string),
      ),
    ),
  ];
  const renamed = new Map(ids.map((id, index) => [id, `renamed_identity_${index}`]));
  const renumbered = JSON.parse(
    JSON.stringify(source, (_key, value) =>
      typeof value === "string" ? (renamed.get(value) ?? value) : value,
    ),
  ) as CircuitJson;
  expect(createMainsManifest(renumbered)).toEqual(manifest);
  expect(JSON.stringify(source)).toBe(untouched);
  expect(mainsBoardId).toBe("mains.board.main");
  expect(mainsComponentId("RV1")).toBe("mains.component.rv1");
  expect(mainsNativeFootprint("H4")).toBe("CrystalShim_Mains:Mains_H4");
  expect(mainsProjectSymbol("U2")).toBe("CrystalShim_Mains:Mains_U2");
  expect(() => mainsComponentId("U99")).toThrow();
  expect(() => mainsProjectSymbol("H1")).toThrow();
  const normalized = shared(manifest);
  expect(normalized.board).toMatchObject({
    stable_id: "mains.board.main",
    width_mm: 135,
    height_mm: 75,
    layer_count: 2,
    coordinate_system: "center-x-right-y-up",
    kicad_origin_mm: [100, 100],
    specs: { material: "FR4", thickness_mm: 1.6, assembly_sides: ["front"] },
  });
  expect(normalized.components).toHaveLength(27);
  expect(new Set(manifest.components.map((c) => c.footprint.kicad)).size).toBe(27);
  expect(
    manifest.components.reduce((sum, c) => sum + c.footprint.pad_numbers.length, 0),
  ).toBe(66);
  expect(manifest.nets).toHaveLength(14);
  expect(manifest.nets.reduce((sum, n) => sum + n.endpoints.length, 0)).toBe(56);
  expect(manifest.metadata.physical_numbered_pad_count).toBe(81);
  expect(Object.values(manifest.metadata.physical_pad_numbers).flat()).toHaveLength(81);
  expect(manifest.metadata.physical_pad_numbers.J4).toEqual([
    "1",
    "1",
    "2",
    "2",
    "3",
    "3",
    "4",
    "4",
    "5",
    "5",
    "6",
    "6",
  ]);
  expect(manifest.metadata.source_paste_record_count).toBe(118);
  expect(Object.values(manifest.metadata.logical_pins).flat()).toHaveLength(66);
  expect(
    Object.values(manifest.metadata.logical_pins)
      .flat()
      .filter((p) => p.no_connect),
  ).toHaveLength(10);
  expect(manifest.metadata.logical_pins.K1).toEqual([
    { number: "1", name: "COIL_HIGH", no_connect: false },
    { number: "3", name: "CONTACT_FIXED", no_connect: false },
    { number: "4", name: "CONTACT_MOVING", no_connect: false },
    { number: "5", name: "COIL_LOW", no_connect: false },
  ]);
  expect(normalized.metadata.logical_pins).toEqual(manifest.metadata.logical_pins);
  expect(normalized.metadata.physical_pad_numbers).toEqual(
    manifest.metadata.physical_pad_numbers,
  );
  expect(normalized.board.holes).toEqual([
    { stable_id: "mains.hole.h1", ref: "H1", x_mm: -62.5, y_mm: 32.5, drill_mm: 3.2 },
    { stable_id: "mains.hole.h2", ref: "H2", x_mm: 62.5, y_mm: 32.5, drill_mm: 3.2 },
    { stable_id: "mains.hole.h3", ref: "H3", x_mm: -62.5, y_mm: -32.5, drill_mm: 3.2 },
    { stable_id: "mains.hole.h4", ref: "H4", x_mm: 62.5, y_mm: -32.5, drill_mm: 3.2 },
    {
      stable_id: "mains.hole.j5.locator-1",
      ref: "J5",
      x_mm: 57.82,
      y_mm: -20.5,
      drill_mm: 3,
    },
  ]);
  expect(
    manifest.components
      .filter((c) => "exclude_from_bom" in c.fields && c.fields.exclude_from_bom)
      .map((c) => c.ref),
  ).toEqual(["H1", "H2", "H3", "H4"]);
  const net = (name: string) =>
    manifest.nets
      .find((n) => n.name === name)!
      .endpoints.map((p) => `${p.component.split(".").at(-1)}.${p.pad}`)
      .sort();
  expect(net("AC_L_FUSED")).toEqual(["j1.1", "j2.1", "rv1.1", "u1.2"]);
  expect(net("COIL_DRAIN")).toEqual(["d1.2", "j5.3", "k1.5"]);
  expect(net("SNUBBER_RC")).toEqual(["c1.1", "r1.2"]);
  expect(
    manifest.components.find((c) => c.ref === "K1")!.footprint.pad_numbers,
  ).toEqual(["1", "3", "4", "5"]);
  expect(manifest.components.find((c) => c.ref === "C3")!.fields).toMatchObject({
    manufacturer_part_number: "C1608X7R1H104K080AA",
    datasheet_url: expect.stringContaining("c1608x7r1h104k080aa"),
  });
  expect(manifest.components.find((c) => c.ref === "C5")!.fields).toMatchObject({
    manufacturer_part_number: "C1608C0G1H472J080AA",
    datasheet_url: expect.stringContaining("c1608c0g1h472j080aa"),
  });
  const native = createMainsInitialPcb(source);
  for (const c of manifest.components) {
    const fp = native.footprints.find((f) =>
      f.properties.some((p) => p.key === "Reference" && p.value === c.ref),
    )!;
    expect(c.footprint.initial_geometry_sha256).toBe(
      controllerFootprintGeometrySha256(fp),
    );
    expect(c.footprint.source_geometry_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(c.footprint.kicad).toBe(`CrystalShim_Mains:Mains_${c.ref}`);
  }
});

test("source receipts retain SMT copper, mask, paste and graphics even when the converter ignores them", () => {
  const before = manifest.components.find((c) => c.ref === "R2")!;
  for (const [type, field, delta] of [
    ["pcb_smtpad", "width", 0.1],
    ["pcb_smtpad", "soldermask_margin", 0.01],
    ["pcb_solder_paste", "width", 0.01],
    ["pcb_fabrication_note_path", "stroke_width", 0.01],
  ] as const) {
    const edited = structuredClone(source);
    const id = physical(edited, "R2").pcb_component_id;
    const item = edited.find(
      (e) => e.type === type && "pcb_component_id" in e && e.pcb_component_id === id,
    ) as unknown as Record<string, unknown>;
    expect(item).toBeDefined();
    expect(typeof item[field]).toBe("number");
    item[field] = (item[field] as number) + delta;
    const changed = createMainsManifest(edited);
    expect(
      changed.components.find((c) => c.ref === "R2")!.footprint.source_geometry_sha256,
    ).not.toBe(before.footprint.source_geometry_sha256);
    expect(
      shared([manifest, changed], true).some(
        (c: { kind: string; risk: string }) =>
          c.kind === "footprint" && c.risk === "high",
      ),
    ).toBe(true);
  }
  const edited = structuredClone(source);
  const paste = edited.find(
    (e) => e.type === "pcb_solder_paste" && !e.pcb_component_id,
  );
  if (paste?.type !== "pcb_solder_paste" || paste.shape !== "circle")
    throw new Error("Missing unowned circular paste");
  paste.radius += 0.1;
  const changed = createMainsManifest(edited);
  expect(changed.board.specs.unowned_physical_geometry_sha256).not.toBe(
    manifest.board.specs.unowned_physical_geometry_sha256,
  );
  expect(changed.components).toEqual(manifest.components);
  const boardRule = structuredClone(source);
  boardRule.find((e) => e.type === "pcb_board")!.min_trace_width = 0.11;
  expect(createMainsManifest(boardRule).board.specs.compiled_board_sha256).not.toBe(
    manifest.board.specs.compiled_board_sha256,
  );
});

test("malformed identities, lost physical lands, changed pins/nets and moved placements fail without mutating input", () => {
  const cases: [string, (json: CircuitJson) => void][] = [
    [
      "missing board ID",
      (j) => {
        const board = j.find((e) => e.type === "pcb_board")! as unknown as Record<
          string,
          unknown
        >;
        delete board.pcb_board_id;
      },
    ],
    [
      "missing all paste IDs",
      (j) => {
        for (const e of j.filter((e) => e.type === "pcb_solder_paste"))
          delete (e as unknown as Record<string, unknown>).pcb_solder_paste_id;
      },
    ],
    [
      "custom board outline",
      (j) => {
        j.find((e) => e.type === "pcb_board")!.outline = [
          { x: -67.5, y: -37.5 },
          { x: 67.5, y: -37.5 },
          { x: 0, y: 37.5 },
        ];
      },
    ],
    [
      "missing pin name",
      (j) => {
        j.filter((e) => e.type === "source_port")[0]!.name = "";
      },
    ],
    [
      "duplicate ref",
      (j) => {
        component(j, "R2").name = "R3";
      },
    ],
    [
      "unknown ref",
      (j) => {
        component(j, "R2").name = "R99";
      },
    ],
    [
      "duplicate source ID",
      (j) => {
        component(j, "R2").source_component_id = component(j, "R3").source_component_id;
      },
    ],
    [
      "duplicate physical ID",
      (j) => {
        physical(j, "R2").pcb_component_id = physical(j, "R3").pcb_component_id;
      },
    ],
    [
      "selected MPN",
      (j) => {
        component(j, "C3").manufacturer_part_number = component(
          j,
          "C5",
        ).manufacturer_part_number;
      },
    ],
    [
      "selected quantity",
      (j) => {
        const p = component(j, "R2");
        if (p.ftype !== "simple_resistor") throw new Error("wrong kind");
        p.resistance = 26000;
      },
    ],
    [
      "selected display value",
      (j) => {
        const p = component(j, "R2");
        if (p.ftype !== "simple_resistor") throw new Error("wrong kind");
        p.display_resistance = "25kΩ";
      },
    ],
    [
      "footprint family substitution",
      (j) => {
        physical(j, "C3").metadata!.kicad_footprint!.footprintName =
          "CrystalShim:TDK_C2012";
      },
    ],
    [
      "SMT position",
      (j) => {
        physical(j, "C5").center.x += 1;
      },
    ],
    [
      "rotation",
      (j) => {
        physical(j, "R2").rotation = 90;
      },
    ],
    [
      "side",
      (j) => {
        physical(j, "R2").layer = "bottom";
      },
    ],
    [
      "do not place",
      (j) => {
        physical(j, "R2").do_not_place = true;
      },
    ],
    [
      "malformed coordinate",
      (j) => {
        physical(j, "C5").center.x = Number.NaN;
      },
    ],
    [
      "board layers",
      (j) => {
        j.find((e) => e.type === "pcb_board")!.num_layers = 4;
      },
    ],
    [
      "logical pin number",
      (j) => {
        const id = component(j, "K1").source_component_id;
        j
          .filter((e) => e.type === "source_port")
          .find(
            (e) =>
              e.type === "source_port" &&
              e.source_component_id === id &&
              e.pin_number === 3,
          )!.pin_number = 2;
      },
    ],
    [
      "missing tail",
      (j) => {
        const id = physical(j, "J4").pcb_component_id;
        j.splice(
          j.findIndex((e) => e.type === "pcb_plated_hole" && e.pcb_component_id === id),
          1,
        );
      },
    ],
    [
      "orphan physical owner",
      (j) => {
        const pad = j.find((e) => e.type === "pcb_smtpad")!;
        if (pad.type !== "pcb_smtpad") throw new Error("missing pad");
        pad.pcb_component_id = "unknown";
      },
    ],
    [
      "orphan physical port",
      (j) => {
        j.find((e) => e.type === "pcb_port")!.source_port_id = "unknown";
      },
    ],
    [
      "missing net label",
      (j) => {
        j.splice(
          j.findIndex(
            (e) => e.type === "schematic_net_label" && e.text === "SNUBBER_RC",
          ),
          1,
        );
      },
    ],
    [
      "duplicate named net",
      (j) => {
        const nets = j.filter((e) => e.type === "source_net");
        nets[1]!.name = nets[0]!.name;
      },
    ],
    [
      "changed NC",
      (j) => {
        const id = component(j, "U2").source_component_id;
        j
          .filter((e) => e.type === "source_port")
          .find(
            (e) =>
              e.type === "source_port" &&
              e.source_component_id === id &&
              e.pin_number === 3,
          )!.do_not_connect = false;
      },
    ],
    [
      "mounting drill",
      (j) => {
        const h = j.find((e) => e.type === "pcb_hole" && !e.pcb_component_id);
        if (h?.type !== "pcb_hole" || h.hole_shape !== "circle")
          throw new Error("missing hole");
        h.hole_diameter = 3;
      },
    ],
    [
      "mounting position",
      (j) => {
        const h = j.find((e) => e.type === "pcb_hole" && !e.pcb_component_id);
        if (h?.type !== "pcb_hole") throw new Error("missing hole");
        h.x += 0.1;
      },
    ],
  ];
  for (const [name, mutate] of cases) {
    const changed = structuredClone(source);
    mutate(changed);
    const before = JSON.stringify(changed);
    expect(() => createMainsManifest(changed), name).toThrow();
    expect(JSON.stringify(changed), name).toBe(before);
  }
});
