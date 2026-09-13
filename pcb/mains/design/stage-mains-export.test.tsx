import { mainsPlacements } from "./placements";
import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { Circuit } from "tscircuit";
import { parseKicadPcb, parseKicadSch } from "kicadts";
import MainsCircuit from "./mains.circuit";
import { mainsBoardId, createMainsManifest } from "./design-manifest";
import {
  guardMainsStage,
  prepareMainsStage,
  validateMainsInitialRules,
  validateMainsRegistration,
  writeMainsInitialFiles,
} from "./stage-mains-export";

const scratch = await realpath(
  await mkdtemp(join(tmpdir(), "crystal-shim-mains-stage-test-")),
);
const manifestName = "source-manifest.normalized.json";
const augmentationName = "kicad-augmentation.normalized.json";
const inputs = [augmentationName, manifestName].sort();
const wrapper = join(import.meta.dir, "stage-mains-export.ts");
const pcbRoot = resolve(import.meta.dir, "../..");
let manifest: ReturnType<typeof createMainsManifest>;
let prepared: Awaited<ReturnType<typeof prepareMainsStage>>;

function environment(stage: string) {
  return {
    ...process.env,
    STILLAIR_HANDOFF_BOARD: mainsBoardId,
    STILLAIR_HANDOFF_STAGE: stage,
    STILLAIR_HANDOFF_MANIFEST: join(stage, manifestName),
    STILLAIR_HANDOFF_AUGMENTATION: join(stage, augmentationName),
  };
}

async function freshStage() {
  const stage = await mkdtemp(join(scratch, `stillair-${mainsBoardId}-handoff-`));
  const normalized = spawnSync(
    "python3",
    [
      "-c",
      "import json,sys; from tools.tscircuit_handoff import normalize_manifest; print(json.dumps(normalize_manifest(json.load(sys.stdin)),sort_keys=True))",
    ],
    { cwd: pcbRoot, input: JSON.stringify(manifest), encoding: "utf8" },
  );
  if (normalized.status !== 0) throw new Error(normalized.stderr);
  await writeFile(join(stage, manifestName), normalized.stdout);
  await writeFile(
    join(stage, augmentationName),
    JSON.stringify({ schema_version: 1, board_id: mainsBoardId, operations: [] }),
  );
  return environment(stage);
}

async function planFor(env: ReturnType<typeof environment>) {
  return { ...prepared, guard: await guardMainsStage(env) };
}

beforeAll(async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  manifest = createMainsManifest(circuit.getCircuitJson());
  prepared = await prepareMainsStage(await freshStage());
}, 30_000);

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

test("initial source fingerprint includes the shared origin matcher", async () => {
  for (const name of [
    "scripts/lib/footprint-origin-initial-export.ts",
    "scripts/lib/schematic-grid-initial-export.ts",
    "controller/design/footprint-geometry-identity.ts",
    "controller/design/pin-electrical-contract.ts",
    "mains/design/mains-initial-export.ts",
    "mains/design/verify-initial-geometry.ts",
  ])
    expect(prepared.sourceHashes[name]).toBe(
      createHash("sha256")
        .update(await readFile(join(pcbRoot, name)))
        .digest("hex"),
    );
});

test("requires every exact shared guard before creating output", async () => {
  const env = await freshStage();
  for (const key of [
    "STILLAIR_HANDOFF_BOARD",
    "STILLAIR_HANDOFF_STAGE",
    "STILLAIR_HANDOFF_MANIFEST",
    "STILLAIR_HANDOFF_AUGMENTATION",
  ] as const) {
    const changed = { ...env, [key]: undefined };
    await expect(guardMainsStage(changed)).rejects.toThrow("complete shared");
  }
  await expect(
    guardMainsStage({ ...env, STILLAIR_HANDOFF_BOARD: "controller.board.main" }),
  ).rejects.toThrow();
  for (const key of [
    "STILLAIR_HANDOFF_MANIFEST",
    "STILLAIR_HANDOFF_AUGMENTATION",
  ] as const)
    await expect(
      guardMainsStage({ ...env, [key]: join(scratch, "outside.json") }),
    ).rejects.toThrow("exact targets");
  expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
});

test("rejects stage aliases, non-stage directories and symlinked input files", async () => {
  const env = await freshStage();
  const alias = join(scratch, "stage-alias");
  await symlink(env.STILLAIR_HANDOFF_STAGE, alias);
  await expect(guardMainsStage(environment(alias))).rejects.toThrow("canonical");
  await expect(
    guardMainsStage(environment(`${env.STILLAIR_HANDOFF_STAGE}/.`)),
  ).rejects.toThrow();
  await expect(guardMainsStage(environment(scratch))).rejects.toThrow("canonical");
  const parentAlias = join(scratch, "parent-alias");
  await symlink(scratch, parentAlias);
  await expect(
    guardMainsStage(
      environment(join(parentAlias, env.STILLAIR_HANDOFF_STAGE.split("/").at(-1)!)),
    ),
  ).rejects.toThrow("canonical");
  for (const name of inputs) {
    const candidate = await freshStage();
    const target = join(candidate.STILLAIR_HANDOFF_STAGE, name);
    await rm(target);
    await symlink(join(env.STILLAIR_HANDOFF_STAGE, name), target);
    await expect(guardMainsStage(candidate)).rejects.toThrow("non-symlink");
    expect((await readdir(candidate.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
  }
});

test("rejects nonregular manifest before opening a FIFO", async () => {
  const env = await freshStage();
  const target = env.STILLAIR_HANDOFF_MANIFEST;
  await rm(target);
  expect(spawnSync("mkfifo", [target]).status).toBe(0);
  await expect(guardMainsStage(env)).rejects.toThrow("regular");
});

test("preexisting outputs and link targets remain byte-identical on rejection", async () => {
  const outside = join(scratch, "unintended.txt");
  // A sentinel is deliberately not a native design and must never be parsed.
  await writeFile(outside, "unintended sentinel");
  for (const name of [
    "mains.kicad_pcb",
    "mains.kicad_sch",
    "mains-initial-export-receipt.json",
    "fp-lib-table",
    "native-library-registration.json",
    "mains.kicad_pro",
    "mains.kicad_prl",
    "native-initial-rules.json",
    "footprints",
    "unexpected.txt",
  ]) {
    const env = await freshStage();
    await symlink(outside, join(env.STILLAIR_HANDOFF_STAGE, name));
    await expect(guardMainsStage(env)).rejects.toThrow("Fresh stage");
    expect(await readFile(outside, "utf8")).toBe("unintended sentinel");
    expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).toHaveLength(3);
  }
});

test("regenerated source rejects a stale normalized manifest before native emission", async () => {
  const env = await freshStage();
  const changed = JSON.parse(await readFile(env.STILLAIR_HANDOFF_MANIFEST, "utf8"));
  changed.components[0].value = "stale component value";
  await writeFile(env.STILLAIR_HANDOFF_MANIFEST, JSON.stringify(changed));
  await expect(prepareMainsStage(env)).rejects.toThrow("Regenerated source differs");
  expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
}, 20_000);

test("augmentation cannot target another board", async () => {
  const env = await freshStage();
  await writeFile(
    env.STILLAIR_HANDOFF_AUGMENTATION,
    JSON.stringify({ board_id: "another-board", operations: [] }),
  );
  await expect(prepareMainsStage(env)).rejects.toThrow("does not match");
  expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
}, 20_000);

test("detects changed inputs and outputs added after source preparation", async () => {
  for (const name of inputs) {
    const env = await freshStage();
    const plan = await planFor(env);
    await writeFile(join(env.STILLAIR_HANDOFF_STAGE, name), "changed input");
    await expect(writeMainsInitialFiles(plan)).rejects.toThrow("changed during export");
    expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
  }
  const env = await freshStage();
  const plan = await planFor(env);
  const target = join(env.STILLAIR_HANDOFF_STAGE, "unexpected.txt");
  await writeFile(target, "preexisting sentinel");
  await expect(writeMainsInitialFiles(plan)).rejects.toThrow("already exists");
  expect(await readFile(target, "utf8")).toBe("preexisting sentinel");
  expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).toHaveLength(3);
});

test("validates every generated filename before the first write", async () => {
  for (const filename of [
    "../escape.kicad_sch",
    "/tmp/escape.kicad_sch",
    "child\\escape.kicad_sch",
    "mains.kicad_pro",
    "mains.kicad_pcb",
  ]) {
    const env = await freshStage();
    const plan = await planFor(env);
    plan.files = plan.files.map((file, index) =>
      index === 1 ? { ...file, filename } : file,
    );
    await expect(writeMainsInitialFiles(plan)).rejects.toThrow("output file set");
    expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
  }
});

test("rejects a stage directory replaced after source preparation", async () => {
  const env = await freshStage();
  const plan = await planFor(env);
  const original = `${env.STILLAIR_HANDOFF_STAGE}-original`;
  await rename(env.STILLAIR_HANDOFF_STAGE, original);
  await mkdir(env.STILLAIR_HANDOFF_STAGE);
  for (const name of inputs)
    await writeFile(
      join(env.STILLAIR_HANDOFF_STAGE, name),
      await readFile(join(original, name)),
    );
  await expect(writeMainsInitialFiles(plan)).rejects.toThrow("changed during export");
  expect((await readdir(env.STILLAIR_HANDOFF_STAGE)).sort()).toEqual(inputs);
  expect((await readdir(original)).sort()).toEqual(inputs);
});

test("writes the actual complete initial hierarchy once without adoption", async () => {
  const env = await freshStage();
  const plan = await planFor(env);
  await writeMainsInitialFiles(plan);
  expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).toHaveLength(8);
  const pcb = parseKicadPcb(
    await readFile(join(env.STILLAIR_HANDOFF_STAGE, "mains.kicad_pcb"), "utf8"),
  );
  expect(pcb.footprints).toHaveLength(27);
  const refs = pcb.footprints.map(
    (fp) => fp.properties.find((p) => p.key === "Reference")?.value,
  );
  expect(refs).toContain("H1");
  expect(refs).toContain("H4");
  let symbols = 0;
  for (const file of plan.files.filter((file) => file.filename.endsWith(".kicad_sch")))
    symbols += parseKicadSch(
      await readFile(join(env.STILLAIR_HANDOFF_STAGE, file.filename), "utf8"),
    ).symbols.length;
  expect(symbols).toBe(25); // 23 physical parts and two excluded ERC flags.
  for (const file of plan.files)
    expect(
      await readFile(join(env.STILLAIR_HANDOFF_STAGE, file.filename), "utf8"),
    ).toBe(file.content);
  await expect(writeMainsInitialFiles(plan)).rejects.toThrow("already exists");
  expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).not.toContain("handoff.lock.json");
  expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).not.toContain(
    "mains-initial-export-receipt.json",
  );
});

test("native exporter failure leaves no success receipt and cannot be retried", async () => {
  const env = await freshStage();
  const fakeBin = await mkdtemp(join(scratch, "fake-native-"));
  await writeFile(join(fakeBin, "sh"), "#!/bin/sh\nexit 23\n");
  await chmod(join(fakeBin, "sh"), 0o700);
  const child = Bun.spawn(["bun", wrapper], {
    cwd: pcbRoot,
    env: { ...env, PATH: `${fakeBin}:${process.env.PATH}` },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  expect(code).not.toBe(0);
  expect(stderr).toContain("Initial native footprint export failed (23)");
  expect(await readdir(env.STILLAIR_HANDOFF_STAGE)).toHaveLength(8);
  await expect(guardMainsStage(env)).rejects.toThrow("Fresh stage");
}, 20_000);

test("CLI rejects supplied target paths", async () => {
  const result = Bun.spawnSync(
    ["bun", wrapper, join(scratch, "unintended.kicad_pcb")],
    { cwd: pcbRoot },
  );
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr.toString()).toContain("takes no path arguments");
});

test("registration evidence binds exact stage, native table and pinned tool provenance", () => {
  // Opaque bytes only: this test neither constructs nor writes a native table.
  const table = Buffer.from([1, 3, 5, 7]);
  const symbolTable = Buffer.from([2, 4, 6, 8]);
  const symbolLibrary = Buffer.from([8, 6, 4, 2]);
  const scriptHash = "a".repeat(64);
  const library = join(scratch, "footprints/CrystalShim_Mains.pretty");
  const receipt = {
    schema_version: 2,
    scope: "initial-project-library-registration-only",
    tool: "Konnect 0.2.1 register_footprint_library + register_symbol_library",
    tool_sha256: "b".repeat(64),
    table: "fp-lib-table",
    table_sha256: createHash("sha256").update(table).digest("hex"),
    script_sha256: scriptHash,
    existing_files_unchanged: true,
    symbol_table: "sym-lib-table",
    symbol_table_sha256: createHash("sha256").update(symbolTable).digest("hex"),
    symbol_library: {
      path: "CrystalShim_Mains.kicad_sym",
      sha256: createHash("sha256").update(symbolLibrary).digest("hex"),
    },
    symbol_inventory: {
      library: join(scratch, "CrystalShim_Mains.kicad_sym"),
      count: 24,
      symbols: [
        ...Object.keys(mainsPlacements).map((ref) => `Mains_${ref}`),
        "PWR_FLAG",
      ],
    },
    symbol_readback: {
      count: 1,
      libraries: [
        {
          nickname: "CrystalShim_Mains",
          scope: "project",
          type: "KiCad",
          path: join(scratch, "CrystalShim_Mains.kicad_sym"),
          uri: join(scratch, "CrystalShim_Mains.kicad_sym"),
        },
      ],
    },
    readback: {
      count: 1,
      libraries: [
        {
          nickname: "CrystalShim_Mains",
          scope: "project",
          type: "KiCad",
          path: library,
          uri: library,
        },
      ],
    },
  };
  const check = (value: unknown, bytes = table, script = scriptHash) =>
    validateMainsRegistration(
      scratch,
      Buffer.from(JSON.stringify(value)),
      bytes,
      symbolTable,
      symbolLibrary,
      script,
    );
  const evidence = check(receipt);
  expect(evidence.tables[0]!.sha256).toBe(receipt.table_sha256);
  expect(evidence.tool_sha256).toBe(receipt.tool_sha256);
  expect(evidence.script_sha256).toBe(scriptHash);
  for (const override of [
    { scope: "adopted" },
    { tool: "Konnect 0.2.2 register_footprint_library" },
    { tool_sha256: undefined },
    { tool_sha256: "unknown" },
    { table: "../fp-lib-table" },
    { table_sha256: "c".repeat(64) },
    { symbol_table: "../sym-lib-table" },
    { symbol_table_sha256: "c".repeat(64) },
    { symbol_library: { ...receipt.symbol_library, sha256: "c".repeat(64) } },
    {
      symbol_inventory: {
        ...receipt.symbol_inventory,
        symbols: [...receipt.symbol_inventory.symbols.slice(0, -1), "phantom"],
      },
    },
    { symbol_readback: { count: 0, libraries: [] } },
    { script_sha256: "c".repeat(64) },
    { existing_files_unchanged: false },
    { readback: { count: 0, libraries: [] } },
  ])
    expect(() => check({ ...receipt, ...override })).toThrow("does not bind");
  for (const override of [
    { nickname: "another" },
    { scope: "global" },
    { type: "Legacy" },
    { path: `${library}-alias` },
    { uri: `${library}-alias` },
  ])
    expect(() =>
      check({
        ...receipt,
        readback: {
          count: 1,
          libraries: [{ ...receipt.readback.libraries[0], ...override }],
        },
      }),
    ).toThrow("does not bind");
  expect(() =>
    validateMainsRegistration(
      scratch,
      Buffer.from(JSON.stringify(receipt)),
      table,
      Buffer.from([9]),
      symbolLibrary,
      scriptHash,
    ),
  ).toThrow("does not bind");
  expect(() =>
    validateMainsRegistration(
      scratch,
      Buffer.from(JSON.stringify(receipt)),
      table,
      symbolTable,
      Buffer.from([9]),
      scriptHash,
    ),
  ).toThrow("does not bind");
  expect(() => check(receipt, Buffer.from([1, 3, 5, 8]))).toThrow("does not bind");
  expect(() => check(receipt, table, "d".repeat(64))).toThrow("does not bind");
});

test("initial rules evidence requires the declared value and unchanged project/tool bindings", () => {
  // In-memory readback fixtures only. Native project serialization belongs to KiCad.
  const project = Buffer.from(
    JSON.stringify({
      board: { design_settings: { rules: { min_hole_clearance: 0.2 } } },
    }),
  );
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const scriptHash = "a".repeat(64);
  const receipt = {
    schema_version: 1,
    scope: "initial-project-npth-clearance-only",
    applied_operation: "mains.augment.npth-clearance",
    minimum_hole_to_copper_mm: 0.2,
    project: "mains.kicad_pro",
    project_sha256: hash(project),
    native_files: { "mains.kicad_pro": hash(project) },
    script_sha256: scriptHash,
    kicad_version: "10.0.5",
    existing_files_unchanged: true,
  };
  const check = (
    value: unknown,
    bytes = project,
    script = scriptHash,
    version = "10.0.5",
    localSettings?: Buffer,
  ) =>
    validateMainsInitialRules(
      Buffer.from(JSON.stringify(value)),
      bytes,
      script,
      version,
      localSettings,
    );
  expect(check(receipt).project.sha256).toBe(hash(project));
  for (const override of [
    { scope: "adopted" },
    { applied_operation: "another-rule" },
    { minimum_hole_to_copper_mm: 0.1 },
    { project: "../mains.kicad_pro" },
    { project_sha256: "b".repeat(64) },
    { script_sha256: "b".repeat(64) },
    { kicad_version: "another" },
    { existing_files_unchanged: false },
    { native_files: { "unexpected.kicad_pro": hash(project) } },
    { native_files: { "mains.kicad_pro": "b".repeat(64) } },
  ])
    expect(() => check({ ...receipt, ...override })).toThrow("does not bind");
  const wrongRule = Buffer.from(project.toString().replace("0.2", "0.1"));
  expect(() =>
    check(
      {
        ...receipt,
        project_sha256: hash(wrongRule),
        native_files: { "mains.kicad_pro": hash(wrongRule) },
      },
      wrongRule,
    ),
  ).toThrow("does not bind");
  expect(() => check(receipt, Buffer.from(project.toString() + "\n"))).toThrow(
    "does not bind",
  );
  expect(() => check(receipt, project, "c".repeat(64))).toThrow("does not bind");
  expect(() => check(receipt, project, scriptHash, "")).toThrow("does not bind");
  const localSettings = Buffer.from([2, 4, 6]);
  const optionalReceipt = {
    ...receipt,
    native_files: {
      ...receipt.native_files,
      "mains.kicad_prl": hash(localSettings),
    },
  };
  expect(
    check(optionalReceipt, project, scriptHash, "10.0.5", localSettings).native_files,
  ).toHaveLength(2);
  expect(() => check(optionalReceipt)).toThrow("does not bind");
  expect(() => check(receipt, project, scriptHash, "10.0.5", localSettings)).toThrow(
    "does not bind",
  );
  expect(() =>
    check(optionalReceipt, project, scriptHash, "10.0.5", Buffer.from([2, 4, 7])),
  ).toThrow("does not bind");
});
