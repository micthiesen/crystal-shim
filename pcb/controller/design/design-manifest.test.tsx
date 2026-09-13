import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { spawnSync } from "node:child_process";
import ControllerCircuit from "./controller.circuit";
import { createControllerManifest } from "./design-manifest";

test("controller source manifest retains stable refs, full logical nets and all physical holes", async () => {
  const circuit = new Circuit();
  circuit.add(<ControllerCircuit />);
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const before = JSON.stringify(json);
  const manifest = createControllerManifest(json);
  expect(JSON.stringify(json)).toBe(before);
  expect(createControllerManifest([...json].reverse())).toEqual(manifest);
  expect(manifest.components).toHaveLength(117);
  expect(new Set(manifest.components.map((c) => c.footprint.kicad)).size).toBe(117);
  expect(manifest.nets).toHaveLength(63);
  expect(manifest.board.holes).toHaveLength(14);
  expect(
    manifest.board.holes.filter((h) => h.ref === "J4").map((h) => h.stable_id),
  ).toEqual(["controller.hole.j4.locator-1", "controller.hole.j4.locator-2"]);
  expect(
    manifest.components.reduce((n, c) => n + c.footprint.pad_numbers.length, 0),
  ).toBe(315);
  expect(manifest.nets.reduce((n, net) => n + net.endpoints.length, 0)).toBe(303);
  expect(manifest.components.filter((c) => c.fields.exclude_from_bom)).toHaveLength(18);
  const net = (name: string) =>
    manifest.nets
      .find((n) => n.name === name)!
      .endpoints.map((p) => `${p.component.split(".").at(-1)}.${p.pad}`)
      .sort();
  expect(net("COIL_DRAIN")).toEqual(["j1.3", "q1.3"]);
  expect(net("USB_VBUS")).toEqual([
    "j4.A4",
    "j4.A9",
    "j4.B4",
    "j4.B9",
    "r42.1",
    "u9.5",
  ]);
  expect(net("GND").filter((p) => p.startsWith("u1."))).toEqual([
    "u1.1",
    "u1.28",
    "u1.29",
  ]);
  const fields = manifest.components.find((c) => c.ref === "C21")!.fields;
  expect("datasheet_url" in fields && fields.datasheet_url).toContain(
    "c1608x7r1h104k080aa",
  );

  // Exercise the actual shared schema, including two locators under one ref
  // and four board-only components excluded from schematic pin comparison.
  const normalized = spawnSync(
    "python3",
    [
      "-c",
      [
        "import json, sys",
        "from tools.tscircuit_handoff import normalize_manifest",
        "print(json.dumps(normalize_manifest(json.load(sys.stdin))))",
      ].join("\n"),
    ],
    {
      cwd: new URL("../../", import.meta.url),
      input: JSON.stringify(manifest),
      encoding: "utf8",
    },
  );
  expect(normalized.status).toBe(0);
  const shared = JSON.parse(normalized.stdout);
  expect(shared.components).toHaveLength(117);
  expect(shared.board.holes).toHaveLength(14);
  expect(shared.nets).toHaveLength(63);
  expect(shared.components[0].footprint.source_geometry_sha256).toMatch(
    /^[0-9a-f]{64}$/,
  );
  expect(shared.components[0].footprint.initial_geometry_sha256).toMatch(
    /^[0-9a-f]{64}$/,
  );

  // Retaining a model ID must not hide changed physical intent from an ECO.
  // Include paste intent even when the pinned native converter omits it.
  const r14 = json.find((e) => e.type === "source_component" && e.name === "R14")!;
  if (r14.type !== "source_component") throw new Error("Missing R14");
  const physical = json.find(
    (e) =>
      e.type === "pcb_component" && e.source_component_id === r14.source_component_id,
  )!;
  if (physical.type !== "pcb_component") throw new Error("Missing R14 footprint");
  for (const [type, field, delta] of [
    ["pcb_smtpad", "width", 0.1],
    ["pcb_smtpad", "soldermask_margin", 0.01],
    ["pcb_solder_paste", "width", 0.01],
    ["pcb_fabrication_note_path", "stroke_width", 0.01],
  ] as const) {
    const edited = structuredClone(json);
    const item = edited.find(
      (e) =>
        e.type === type &&
        "pcb_component_id" in e &&
        e.pcb_component_id === physical.pcb_component_id,
    ) as unknown as Record<string, unknown>;
    expect(item).toBeDefined();
    expect(typeof item[field]).toBe("number");
    item[field] = (item[field] as number) + delta;
    const changed = createControllerManifest(edited);
    expect(
      changed.components.find((c) => c.ref === "R14")!.footprint.source_geometry_sha256,
    ).not.toBe(
      manifest.components.find((c) => c.ref === "R14")!.footprint
        .source_geometry_sha256,
    );
    const classified = spawnSync(
      "python3",
      [
        "-c",
        [
          "import json, sys",
          "from tools.tscircuit_handoff import normalize_manifest, classify_changes",
          "old, new = json.load(sys.stdin)",
          "print(json.dumps(classify_changes(normalize_manifest(old), normalize_manifest(new))))",
        ].join("\n"),
      ],
      {
        cwd: new URL("../../", import.meta.url),
        input: JSON.stringify([manifest, changed]),
        encoding: "utf8",
      },
    );
    expect(classified.status).toBe(0);
    expect(
      JSON.parse(classified.stdout).some(
        (c: { kind: string; risk: string }) =>
          c.kind === "footprint" && c.risk === "high",
      ),
    ).toBe(true);
  }

  for (const mutate of [
    (copy: typeof json) => {
      const element = copy.find((e) => e.type === "pcb_smtpad")!;
      if (element.type !== "pcb_smtpad") throw new Error("Missing pad");
      element.pcb_component_id = "missing-owner";
    },
    (copy: typeof json) => {
      copy.find((e) => e.type === "pcb_board")!.num_layers = 2;
    },
    (copy: typeof json) => {
      copy
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === "R14")!.manufacturer_part_number = "UNSELECTED";
    },
    (copy: typeof json) => {
      const source = copy
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === "U4")!;
      copy
        .filter((e) => e.type === "pcb_component")
        .find(
          (e) => e.source_component_id === source.source_component_id,
        )!.center.x += 1;
    },
    (copy: typeof json) => {
      copy
        .filter((e) => e.type === "source_component")
        .find((e) => e.name === "R14")!.name = "R15";
    },
  ]) {
    const invalid = structuredClone(json);
    mutate(invalid);
    const old = JSON.stringify(invalid);
    expect(() => createControllerManifest(invalid)).toThrow();
    expect(JSON.stringify(invalid)).toBe(old);
  }
  const unowned = structuredClone(json);
  const paste = unowned.find(
    (e) => e.type === "pcb_solder_paste" && !e.pcb_component_id,
  )!;
  if (paste.type !== "pcb_solder_paste" || !("radius" in paste))
    throw new Error("Missing unowned paste");
  paste.radius += 0.1;
  expect(
    createControllerManifest(unowned).board.specs.unowned_physical_geometry_sha256,
  ).not.toBe(manifest.board.specs.unowned_physical_geometry_sha256);
  const boardRule = structuredClone(json);
  boardRule.find((e) => e.type === "pcb_board")!.min_trace_width = 0.11;
  expect(
    createControllerManifest(boardRule).board.specs.compiled_board_sha256,
  ).not.toBe(manifest.board.specs.compiled_board_sha256);
}, 30_000);
