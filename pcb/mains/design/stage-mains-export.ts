import { mainsPlacements } from "./placements";
import { mainsSymbolLibraryFilename } from "./project-symbol-library-initial-export";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { Circuit } from "tscircuit";
import MainsCircuit from "./mains.circuit";
import { mainsBoardId, createMainsManifest } from "./design-manifest";
import { createMainsInitialGraphs } from "./mains-initial-export";

const pcbRoot = resolve(import.meta.dir, "../..");
const repoRoot = resolve(pcbRoot, "..");
const manifestName = "source-manifest.normalized.json";
const augmentationName = "kicad-augmentation.normalized.json";
const receiptName = "mains-initial-export-receipt.json";
const registrationReceiptName = "native-library-registration.json";
const registrationScript = "mains/design/register-mains-library.py";
const rulesReceiptName = "native-initial-rules.json";
const rulesScript = "mains/design/apply-mains-initial-rules.py";
const initialInputs = [augmentationName, manifestName].sort();
const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

type Environment = Record<string, string | undefined>;
type InitialFile = { filename: string; content: string };
type Guard = {
  stage: string;
  manifest: Buffer;
  augmentation: Buffer;
  identity: string;
};
type InitialPlan = {
  guard: Guard;
  files: InitialFile[];
  sourceHashes: Record<string, string>;
  manifestDigest: string;
};

// Check the native helper's bounded readback without interpreting or rewriting
// the protected fp-lib-table text. Exported for failure-mode tests using bytes.
export function validateMainsRegistration(
  stage: string,
  receiptBytes: Buffer,
  tableBytes: Buffer,
  symbolTableBytes: Buffer,
  symbolLibraryBytes: Buffer,
  scriptHash: string,
) {
  const receipt = JSON.parse(receiptBytes.toString());
  const entries = receipt.readback?.libraries;
  const library = join(stage, "footprints/CrystalShim_Mains.pretty");
  const symbolEntries = receipt.symbol_readback?.libraries;
  const symbolLibrary = join(stage, mainsSymbolLibraryFilename);
  if (
    receipt.schema_version !== 2 ||
    receipt.scope !== "initial-project-library-registration-only" ||
    receipt.tool !==
      "Konnect 0.2.1 register_footprint_library + register_symbol_library" ||
    typeof receipt.tool_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receipt.tool_sha256) ||
    receipt.table !== "fp-lib-table" ||
    receipt.table_sha256 !== sha256(tableBytes) ||
    receipt.symbol_table !== "sym-lib-table" ||
    receipt.symbol_table_sha256 !== sha256(symbolTableBytes) ||
    receipt.symbol_library?.path !== mainsSymbolLibraryFilename ||
    receipt.symbol_library?.sha256 !== sha256(symbolLibraryBytes) ||
    receipt.symbol_inventory?.library !== symbolLibrary ||
    receipt.symbol_inventory?.count !== 23 ||
    !Array.isArray(receipt.symbol_inventory?.symbols) ||
    JSON.stringify([...receipt.symbol_inventory.symbols].sort()) !==
      JSON.stringify(
        [
          ...Object.keys(mainsPlacements).map((ref) => `Mains_${ref}`),
          "PWR_FLAG",
        ].sort(),
      ) ||
    receipt.symbol_readback?.count !== 1 ||
    !Array.isArray(symbolEntries) ||
    symbolEntries.length !== 1 ||
    symbolEntries[0]?.nickname !== "CrystalShim_Mains" ||
    symbolEntries[0]?.scope !== "project" ||
    symbolEntries[0]?.type !== "KiCad" ||
    symbolEntries[0]?.path !== symbolLibrary ||
    symbolEntries[0]?.uri !== symbolLibrary ||
    receipt.script_sha256 !== scriptHash ||
    receipt.existing_files_unchanged !== true ||
    receipt.readback?.count !== 1 ||
    !Array.isArray(entries) ||
    entries.length !== 1 ||
    entries[0]?.nickname !== "CrystalShim_Mains" ||
    entries[0]?.scope !== "project" ||
    entries[0]?.type !== "KiCad" ||
    entries[0]?.path !== library ||
    entries[0]?.uri !== library
  )
    throw new Error("Native registration receipt does not bind this mains stage");
  return {
    path: registrationReceiptName,
    sha256: sha256(receiptBytes),
    tables: [
      { path: "fp-lib-table", sha256: sha256(tableBytes) },
      { path: "sym-lib-table", sha256: sha256(symbolTableBytes) },
    ],
    symbol_library: {
      path: mainsSymbolLibraryFilename,
      sha256: sha256(symbolLibraryBytes),
    },
    tool: receipt.tool as string,
    tool_sha256: receipt.tool_sha256 as string,
    script: registrationScript,
    script_sha256: scriptHash,
  };
}

export function validateMainsInitialRules(
  receiptBytes: Buffer,
  projectBytes: Buffer,
  scriptHash: string,
  kicadVersion: string,
  localSettingsBytes?: Buffer,
) {
  const receipt = JSON.parse(receiptBytes.toString());
  const project = JSON.parse(projectBytes.toString());
  const nativeFiles: Record<string, string> = {
    "mains.kicad_pro": sha256(projectBytes),
  };
  if (localSettingsBytes !== undefined)
    nativeFiles["mains.kicad_prl"] = sha256(localSettingsBytes);
  if (
    receipt.schema_version !== 1 ||
    receipt.scope !== "initial-project-npth-clearance-only" ||
    receipt.applied_operation !== "mains.augment.npth-clearance" ||
    receipt.minimum_hole_to_copper_mm !== 0.2 ||
    receipt.project !== "mains.kicad_pro" ||
    receipt.project_sha256 !== sha256(projectBytes) ||
    receipt.script_sha256 !== scriptHash ||
    typeof kicadVersion !== "string" ||
    !kicadVersion ||
    receipt.kicad_version !== kicadVersion ||
    receipt.existing_files_unchanged !== true ||
    !receipt.native_files ||
    Array.isArray(receipt.native_files) ||
    JSON.stringify(Object.keys(receipt.native_files).sort()) !==
      JSON.stringify(Object.keys(nativeFiles).sort()) ||
    Object.entries(nativeFiles).some(
      ([path, hash]) => receipt.native_files[path] !== hash,
    ) ||
    project.board?.design_settings?.rules?.min_hole_clearance !== 0.2
  )
    throw new Error(
      "Native initial rules receipt does not bind the declared mains rule",
    );
  return {
    path: rulesReceiptName,
    sha256: sha256(receiptBytes),
    project: { path: "mains.kicad_pro", sha256: sha256(projectBytes) },
    native_files: Object.entries(nativeFiles).map(([path, hash]) => ({
      path,
      sha256: hash,
    })),
    applied_operation: receipt.applied_operation as string,
    kicad_version: kicadVersion,
    script: rulesScript,
    script_sha256: scriptHash,
  };
}

async function runInitialTool(
  command: string[],
  env: Environment,
  label: string,
  timeout: number,
) {
  const child = Bun.spawn(command, {
    cwd: pcbRoot,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${label} failed (${code}): ${stderr || stdout}`);
}

// These input files are supplied by the shared handoff tool. Never follow links
// or wait on a FIFO while reading them, even if a stage changes during a build.
async function readRegular(path: string): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink())
    throw new Error(`Expected a regular non-symlink file: ${path}`);
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const current = await file.stat();
    if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino)
      throw new Error(`Input changed while opening: ${path}`);
    return await file.readFile();
  } finally {
    await file.close();
  }
}

export async function guardMainsStage(env: Environment): Promise<Guard> {
  const stage = env.STILLAIR_HANDOFF_STAGE;
  if (
    !stage ||
    !isAbsolute(stage) ||
    env.STILLAIR_HANDOFF_BOARD !== mainsBoardId ||
    env.STILLAIR_HANDOFF_MANIFEST !== join(stage, manifestName) ||
    env.STILLAIR_HANDOFF_AUGMENTATION !== join(stage, augmentationName)
  )
    throw new Error(
      "Require the complete shared mains handoff environment and exact targets",
    );
  if (
    (await realpath(stage)) !== stage ||
    !basename(stage).startsWith(`stillair-${mainsBoardId}-handoff-`) ||
    !relative(repoRoot, stage).startsWith(`..${sep}`)
  )
    throw new Error("Require a canonical fresh handoff stage outside the repository");
  const stat = await lstat(stage);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Stage must be a real directory");
  if (JSON.stringify((await readdir(stage)).sort()) !== JSON.stringify(initialInputs))
    throw new Error(
      "Fresh stage must contain only the shared manifest and augmentation",
    );
  return {
    stage,
    identity: `${stat.dev}:${stat.ino}`,
    manifest: await readRegular(join(stage, manifestName)),
    augmentation: await readRegular(join(stage, augmentationName)),
  };
}

async function sourceHashes(): Promise<Record<string, string>> {
  const names = (await readdir(import.meta.dir))
    .filter((name) => /\.(?:ts|tsx|py)$/.test(name) && !name.includes(".test."))
    .map((name) => join("mains/design", name));
  // Mains composes exact controller component/geometry helpers. Bind those
  // dependencies too; a mains-only fingerprint would omit authoritative inputs.
  names.push(
    ...(await readdir(join(pcbRoot, "controller/design")))
      .filter((name) => /\.(?:ts|tsx|py)$/.test(name) && !name.includes(".test."))
      .map((name) => join("controller/design", name)),
  );
  names.push(
    "scripts/lib/footprint-origin-initial-export.ts",
    "scripts/lib/schematic-grid-initial-export.ts",
    "package.json",
    "bun.lock",
    "tools/tscircuit_handoff.py",
    "tools/kicad_python.sh",
  );
  const entries = await Promise.all(
    names
      .sort()
      .map(
        async (name) => [name, sha256(await readRegular(join(pcbRoot, name)))] as const,
      ),
  );
  return Object.fromEntries(entries);
}

// Use the shared normalizer itself, not a second TypeScript schema. Inputs and
// output stay on pipes; no temporary file or normalized manifest is overwritten.
function bindManifest(
  guard: Guard,
  generated: ReturnType<typeof createMainsManifest>,
): string {
  const checked = spawnSync(
    "python3",
    [
      "-c",
      [
        "import importlib.util, json, sys",
        "spec = importlib.util.spec_from_file_location('handoff', sys.argv[1])",
        "module = importlib.util.module_from_spec(spec)",
        "spec.loader.exec_module(module)",
        "data = json.load(sys.stdin)",
        "actual = module.normalize_manifest(data['generated'])",
        "expected = module.normalize_manifest(data['staged'])",
        "if actual != expected: raise ValueError('Regenerated source differs from staged manifest')",
        "module.validate_augmentation(data['augmentation'], expected)",
        "print(module.digest(actual))",
      ].join("\n"),
      join(pcbRoot, "tools/tscircuit_handoff.py"),
    ],
    {
      cwd: pcbRoot,
      input: JSON.stringify({
        generated,
        staged: JSON.parse(guard.manifest.toString()),
        augmentation: JSON.parse(guard.augmentation.toString()),
      }),
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 1_000_000,
    },
  );
  if (checked.error || checked.status !== 0 || !/^[a-f0-9]{64}\n$/.test(checked.stdout))
    throw new Error(
      `Mains manifest binding failed: ${checked.error ?? checked.stderr.trim()}`,
    );
  return checked.stdout.trim();
}

function validateFiles(files: InitialFile[]) {
  const names = files.map((file) => file.filename);
  if (
    names.length !== 6 ||
    new Set(names).size !== 6 ||
    !names.includes("mains.kicad_pcb") ||
    !names.includes(mainsSymbolLibraryFilename) ||
    !names.includes("mains.kicad_sch") ||
    names.filter((name) => name.endsWith(".kicad_sch")).length !== 4 ||
    files.some(
      (file) =>
        !/^[A-Za-z0-9_-]+\.kicad_(?:pcb|sch|sym)$/.test(file.filename) ||
        !file.content.trim(),
    )
  )
    throw new Error("Unsafe or incomplete mains initial output file set");
}

export async function prepareMainsStage(
  env: Environment = process.env,
): Promise<InitialPlan> {
  const guard = await guardMainsStage(env);
  const hashes = await sourceHashes();
  const circuit = new Circuit();
  circuit.add(createElement(MainsCircuit));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const manifestDigest = bindManifest(guard, createMainsManifest(json));
  const graphs = createMainsInitialGraphs(json);
  const files = [
    { filename: "mains.kicad_pcb", content: graphs.pcb.getString() },
    ...graphs.schematicFiles,
    graphs.symbolLibraryFile,
  ];
  validateFiles(files);
  return { guard, files, sourceHashes: hashes, manifestDigest };
}

async function verifyInputs(plan: InitialPlan) {
  const { guard } = plan;
  const stat = await lstat(guard.stage);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    (await realpath(guard.stage)) !== guard.stage ||
    `${stat.dev}:${stat.ino}` !== guard.identity ||
    !(await readRegular(join(guard.stage, manifestName))).equals(guard.manifest) ||
    !(await readRegular(join(guard.stage, augmentationName))).equals(
      guard.augmentation,
    ) ||
    JSON.stringify(await sourceHashes()) !== JSON.stringify(plan.sourceHashes)
  )
    throw new Error("Mains stage inputs or generator sources changed during export");
}

// Public for host tests of the actual initial writer. An incomplete stage has no
// success receipt and is never reused. This function cannot overwrite a file.
export async function writeMainsInitialFiles(plan: InitialPlan): Promise<void> {
  validateFiles(plan.files);
  await verifyInputs(plan);
  if (
    JSON.stringify((await readdir(plan.guard.stage)).sort()) !==
    JSON.stringify(initialInputs)
  )
    throw new Error("Initial output or other unexpected stage entry already exists");
  for (const file of plan.files) {
    const output = await open(
      join(plan.guard.stage, file.filename),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await output.writeFile(file.content);
      await output.sync();
    } finally {
      await output.close();
    }
  }
}

export async function stageMainsExport(
  env: Environment = process.env,
): Promise<string> {
  const plan = await prepareMainsStage(env);
  await writeMainsInitialFiles(plan);
  const { stage } = plan.guard;
  const command = [
    "sh",
    join(pcbRoot, "tools/kicad_python.sh"),
    join(import.meta.dir, "export-native-footprints.py"),
    "--board",
    join(stage, "mains.kicad_pcb"),
    "--manifest",
    join(stage, manifestName),
    "--stage",
    stage,
    "--output-root",
    join(stage, "footprints"),
  ];
  await runInitialTool(command, env, "Initial native footprint export", 120_000);
  await verifyInputs(plan);
  const rootEntries = [
    ...initialInputs,
    ...plan.files.map((file) => file.filename),
    "footprints",
  ].sort();
  if (JSON.stringify((await readdir(stage)).sort()) !== JSON.stringify(rootEntries))
    throw new Error("Unexpected entry after native library export");
  for (const name of ["footprints", "footprints/CrystalShim_Mains.pretty"]) {
    const path = join(stage, name);
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (await realpath(path)) !== path)
      throw new Error("Native library directory is not a canonical stage directory");
  }
  const initialFiles = [];
  for (const file of plan.files) {
    const bytes = await readRegular(join(stage, file.filename));
    if (sha256(bytes) !== sha256(file.content))
      throw new Error(
        `Initial native file changed during library export: ${file.filename}`,
      );
    initialFiles.push({ path: file.filename, sha256: sha256(bytes) });
  }
  const libraryReceiptPath = "footprints/native-footprints-receipt.json";
  const libraryReceiptBytes = await readRegular(join(stage, libraryReceiptPath));
  const libraryReceipt = JSON.parse(libraryReceiptBytes.toString());
  if (
    libraryReceipt.status !== "validated-native-library-only" ||
    libraryReceipt.footprints !== 26 ||
    libraryReceipt.source.sha256.board !== sha256(plan.files[0]!.content) ||
    libraryReceipt.source.sha256.manifest !== sha256(plan.guard.manifest)
  )
    throw new Error("Native library receipt does not bind this mains seed");
  const refs = JSON.parse(plan.guard.manifest.toString()).components.map(
    (component: { ref: string }) => component.ref,
  ) as string[];
  const expectedEntries = refs.map((ref) => `Mains_${ref}.kicad_mod`).sort();
  const library = join(stage, "footprints/CrystalShim_Mains.pretty");
  if (
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify(["CrystalShim_Mains.pretty", "native-footprints-receipt.json"])
  )
    throw new Error("Native library file set differs from the mains manifest");
  const preservedFiles = [
    ...initialFiles,
    { path: libraryReceiptPath, sha256: sha256(libraryReceiptBytes) },
  ];
  for (const name of expectedEntries) {
    const bytes = await readRegular(join(library, name));
    const entry = libraryReceipt.entries.find(
      (item: { path: string }) => item.path === `CrystalShim_Mains.pretty/${name}`,
    );
    if (!entry || entry.sha256 !== sha256(bytes))
      throw new Error(`Native library entry differs from its receipt: ${name}`);
    preservedFiles.push({
      path: `footprints/CrystalShim_Mains.pretty/${name}`,
      sha256: sha256(bytes),
    });
  }
  await runInitialTool(
    ["python3", join(pcbRoot, registrationScript)],
    env,
    "Initial project-library registration",
    60_000,
  );
  await verifyInputs(plan);
  if (
    JSON.stringify((await readdir(stage)).sort()) !==
      JSON.stringify(
        [
          ...rootEntries,
          "fp-lib-table",
          "sym-lib-table",
          registrationReceiptName,
        ].sort(),
      ) ||
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify(["CrystalShim_Mains.pretty", "native-footprints-receipt.json"])
  )
    throw new Error("Unexpected entry after native project-library registration");
  for (const file of preservedFiles)
    if (sha256(await readRegular(join(stage, file.path))) !== file.sha256)
      throw new Error(
        `Native registration changed an existing stage file: ${file.path}`,
      );
  const registrationEvidence = validateMainsRegistration(
    stage,
    await readRegular(join(stage, registrationReceiptName)),
    await readRegular(join(stage, "fp-lib-table")),
    await readRegular(join(stage, "sym-lib-table")),
    await readRegular(join(stage, mainsSymbolLibraryFilename)),
    plan.sourceHashes[registrationScript]!,
  );
  preservedFiles.push(
    { path: registrationEvidence.path, sha256: registrationEvidence.sha256 },
    ...registrationEvidence.tables,
  );
  await runInitialTool(
    ["sh", join(pcbRoot, "tools/kicad_python.sh"), join(pcbRoot, rulesScript)],
    env,
    "Native initial project rules",
    60_000,
  );
  await verifyInputs(plan);
  const finalEntries = (await readdir(stage)).sort();
  const hasLocalSettings = finalEntries.includes("mains.kicad_prl");
  if (
    JSON.stringify(finalEntries) !==
      JSON.stringify(
        [
          ...rootEntries,
          "fp-lib-table",
          "sym-lib-table",
          registrationReceiptName,
          "mains.kicad_pro",
          ...(hasLocalSettings ? ["mains.kicad_prl"] : []),
          rulesReceiptName,
        ].sort(),
      ) ||
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify(["CrystalShim_Mains.pretty", "native-footprints-receipt.json"])
  )
    throw new Error("Unexpected entry after native initial project rules");
  for (const file of preservedFiles)
    if (sha256(await readRegular(join(stage, file.path))) !== file.sha256)
      throw new Error(
        `Native initial rules changed an existing stage file: ${file.path}`,
      );
  const initialRulesEvidence = validateMainsInitialRules(
    await readRegular(join(stage, rulesReceiptName)),
    await readRegular(join(stage, "mains.kicad_pro")),
    plan.sourceHashes[rulesScript]!,
    libraryReceipt.kicad_version,
    hasLocalSettings ? await readRegular(join(stage, "mains.kicad_prl")) : undefined,
  );
  await runInitialTool(
    [
      "sh",
      join(pcbRoot, "tools/kicad_python.sh"),
      join(pcbRoot, "mains/design/apply-mains-isolation-areas.py"),
    ],
    env,
    "Native mains isolation areas",
    60_000,
  );
  await verifyInputs(plan);
  const isolationBytes = await readRegular(join(stage, "native-isolation-areas.json"));
  const isolation = JSON.parse(isolationBytes.toString());
  const boardFile = initialFiles.find((f) => f.path === "mains.kicad_pcb")!;
  if (
    isolation.board_sha256_before !== boardFile.sha256 ||
    isolation.board_sha256_after !==
      sha256(await readRegular(join(stage, boardFile.path))) ||
    isolation.source_pads_preserved !== true ||
    isolation.script_sha256 !==
      plan.sourceHashes["mains/design/apply-mains-isolation-areas.py"]
  )
    throw new Error("Native isolation receipt does not bind this initial board");
  boardFile.sha256 = isolation.board_sha256_after;
  const receipt = await open(join(stage, receiptName), "wx", 0o600);
  try {
    await receipt.writeFile(
      JSON.stringify(
        {
          schema_version: 1,
          status: "initial-export-only",
          board_id: mainsBoardId,
          manifest_digest: plan.manifestDigest,
          input_sha256: {
            manifest: sha256(plan.guard.manifest),
            augmentation: sha256(plan.guard.augmentation),
          },
          generator_sha256: plan.sourceHashes,
          initial_files: initialFiles,
          native_library_receipt: {
            path: libraryReceiptPath,
            sha256: sha256(libraryReceiptBytes),
          },
          native_library_registration: registrationEvidence,
          native_initial_rules: initialRulesEvidence,
          native_isolation_areas: {
            path: "native-isolation-areas.json",
            sha256: sha256(isolationBytes),
          },
          limitations:
            "Initial project libraries, two source power annotations, monotone schematic grid and the declared NPTH rule applied; no adoption, handoff lock, completed augmentation, ERC/DRC or fabrication acceptance.",
        },
        null,
        2,
      ) + "\n",
    );
    await receipt.sync();
  } finally {
    await receipt.close();
  }
  return join(stage, receiptName);
}

if (import.meta.main) {
  if (process.argv.length !== 2)
    throw new Error("stage-mains-export.ts takes no path arguments");
  console.log(`Mains initial export only: ${await stageMainsExport()}`);
}
