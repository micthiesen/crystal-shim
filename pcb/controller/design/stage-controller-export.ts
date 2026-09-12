import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createElement } from "react";
import { Circuit } from "tscircuit";
import ControllerCircuit from "./controller.circuit";
import { controllerBoardId, createControllerManifest } from "./design-manifest";
import { createControllerInitialGraphs } from "./controller-initial-export";

const pcbRoot = resolve(import.meta.dir, "../..");
const repoRoot = resolve(pcbRoot, "..");
const manifestName = "source-manifest.normalized.json";
const augmentationName = "kicad-augmentation.normalized.json";
const receiptName = "controller-initial-export-receipt.json";
const registrationReceiptName = "native-library-registration.json";
const registrationScript = "controller/design/register-controller-library.py";
const rulesReceiptName = "native-initial-rules.json";
const rulesScript = "controller/design/apply-controller-initial-rules.py";
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
export function validateControllerRegistration(
  stage: string,
  receiptBytes: Buffer,
  tableBytes: Buffer,
  scriptHash: string,
) {
  const receipt = JSON.parse(receiptBytes.toString());
  const entries = receipt.readback?.libraries;
  const library = join(stage, "footprints/CrystalShim_Controller.pretty");
  if (
    receipt.schema_version !== 1 ||
    receipt.scope !== "initial-project-library-registration-only" ||
    receipt.tool !== "Konnect 0.2.1 register_footprint_library" ||
    typeof receipt.tool_sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(receipt.tool_sha256) ||
    receipt.table !== "fp-lib-table" ||
    receipt.table_sha256 !== sha256(tableBytes) ||
    receipt.script_sha256 !== scriptHash ||
    receipt.existing_files_unchanged !== true ||
    receipt.readback?.count !== 1 ||
    !Array.isArray(entries) ||
    entries.length !== 1 ||
    entries[0]?.nickname !== "CrystalShim_Controller" ||
    entries[0]?.scope !== "project" ||
    entries[0]?.type !== "KiCad" ||
    entries[0]?.path !== library ||
    entries[0]?.uri !== library
  )
    throw new Error("Native registration receipt does not bind this controller stage");
  return {
    path: registrationReceiptName,
    sha256: sha256(receiptBytes),
    table: { path: "fp-lib-table", sha256: sha256(tableBytes) },
    tool: receipt.tool as string,
    tool_sha256: receipt.tool_sha256 as string,
    script: registrationScript,
    script_sha256: scriptHash,
  };
}

export function validateControllerInitialRules(
  receiptBytes: Buffer,
  projectBytes: Buffer,
  scriptHash: string,
  kicadVersion: string,
  localSettingsBytes?: Buffer,
) {
  const receipt = JSON.parse(receiptBytes.toString());
  const project = JSON.parse(projectBytes.toString());
  const nativeFiles: Record<string, string> = {
    "controller.kicad_pro": sha256(projectBytes),
  };
  if (localSettingsBytes !== undefined)
    nativeFiles["controller.kicad_prl"] = sha256(localSettingsBytes);
  if (
    receipt.schema_version !== 1 ||
    receipt.scope !== "initial-project-npth-clearance-only" ||
    receipt.applied_operation !== "controller.augment.npth-clearance" ||
    receipt.minimum_hole_to_copper_mm !== 0.2 ||
    receipt.project !== "controller.kicad_pro" ||
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
      "Native initial rules receipt does not bind the declared controller rule",
    );
  return {
    path: rulesReceiptName,
    sha256: sha256(receiptBytes),
    project: { path: "controller.kicad_pro", sha256: sha256(projectBytes) },
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

export async function guardControllerStage(env: Environment): Promise<Guard> {
  const stage = env.STILLAIR_HANDOFF_STAGE;
  if (
    !stage ||
    !isAbsolute(stage) ||
    env.STILLAIR_HANDOFF_BOARD !== controllerBoardId ||
    env.STILLAIR_HANDOFF_MANIFEST !== join(stage, manifestName) ||
    env.STILLAIR_HANDOFF_AUGMENTATION !== join(stage, augmentationName)
  )
    throw new Error(
      "Require the complete shared controller handoff environment and exact targets",
    );
  if (
    (await realpath(stage)) !== stage ||
    !basename(stage).startsWith(`stillair-${controllerBoardId}-handoff-`) ||
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
    .map((name) => join("controller/design", name));
  names.push(
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
  generated: ReturnType<typeof createControllerManifest>,
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
      `Controller manifest binding failed: ${checked.error ?? checked.stderr.trim()}`,
    );
  return checked.stdout.trim();
}

function validateFiles(files: InitialFile[]) {
  const names = files.map((file) => file.filename);
  if (
    names.length !== 9 ||
    new Set(names).size !== 9 ||
    !names.includes("controller.kicad_pcb") ||
    !names.includes("controller.kicad_sch") ||
    names.filter((name) => name.endsWith(".kicad_sch")).length !== 8 ||
    files.some(
      (file) =>
        !/^[A-Za-z0-9_-]+\.kicad_(?:pcb|sch)$/.test(file.filename) ||
        !file.content.trim(),
    )
  )
    throw new Error("Unsafe or incomplete controller initial output file set");
}

export async function prepareControllerStage(
  env: Environment = process.env,
): Promise<InitialPlan> {
  const guard = await guardControllerStage(env);
  const hashes = await sourceHashes();
  const circuit = new Circuit();
  circuit.add(createElement(ControllerCircuit));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const manifestDigest = bindManifest(guard, createControllerManifest(json));
  const graphs = createControllerInitialGraphs(json);
  const files = [
    { filename: "controller.kicad_pcb", content: graphs.pcb.getString() },
    ...graphs.schematicFiles,
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
    throw new Error(
      "Controller stage inputs or generator sources changed during export",
    );
}

// Public for host tests of the actual initial writer. An incomplete stage has no
// success receipt and is never reused. This function cannot overwrite a file.
export async function writeControllerInitialFiles(plan: InitialPlan): Promise<void> {
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

export async function stageControllerExport(
  env: Environment = process.env,
): Promise<string> {
  const plan = await prepareControllerStage(env);
  await writeControllerInitialFiles(plan);
  const { stage } = plan.guard;
  const command = [
    "sh",
    join(pcbRoot, "tools/kicad_python.sh"),
    join(import.meta.dir, "export-native-footprints.py"),
    "--board",
    join(stage, "controller.kicad_pcb"),
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
  for (const name of ["footprints", "footprints/CrystalShim_Controller.pretty"]) {
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
    libraryReceipt.footprints !== 99 ||
    libraryReceipt.source.sha256.board !== sha256(plan.files[0]!.content) ||
    libraryReceipt.source.sha256.manifest !== sha256(plan.guard.manifest)
  )
    throw new Error("Native library receipt does not bind this controller seed");
  const refs = JSON.parse(plan.guard.manifest.toString()).components.map(
    (component: { ref: string }) => component.ref,
  ) as string[];
  const expectedEntries = refs.map((ref) => `Controller_${ref}.kicad_mod`).sort();
  const library = join(stage, "footprints/CrystalShim_Controller.pretty");
  if (
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify([
        "CrystalShim_Controller.pretty",
        "native-footprints-receipt.json",
      ])
  )
    throw new Error("Native library file set differs from the controller manifest");
  const preservedFiles = [
    ...initialFiles,
    { path: libraryReceiptPath, sha256: sha256(libraryReceiptBytes) },
  ];
  for (const name of expectedEntries) {
    const bytes = await readRegular(join(library, name));
    const entry = libraryReceipt.entries.find(
      (item: { path: string }) => item.path === `CrystalShim_Controller.pretty/${name}`,
    );
    if (!entry || entry.sha256 !== sha256(bytes))
      throw new Error(`Native library entry differs from its receipt: ${name}`);
    preservedFiles.push({
      path: `footprints/CrystalShim_Controller.pretty/${name}`,
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
        [...rootEntries, "fp-lib-table", registrationReceiptName].sort(),
      ) ||
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify([
        "CrystalShim_Controller.pretty",
        "native-footprints-receipt.json",
      ])
  )
    throw new Error("Unexpected entry after native project-library registration");
  for (const file of preservedFiles)
    if (sha256(await readRegular(join(stage, file.path))) !== file.sha256)
      throw new Error(
        `Native registration changed an existing stage file: ${file.path}`,
      );
  const registrationEvidence = validateControllerRegistration(
    stage,
    await readRegular(join(stage, registrationReceiptName)),
    await readRegular(join(stage, "fp-lib-table")),
    plan.sourceHashes[registrationScript]!,
  );
  preservedFiles.push(
    { path: registrationEvidence.path, sha256: registrationEvidence.sha256 },
    registrationEvidence.table,
  );
  await runInitialTool(
    ["sh", join(pcbRoot, "tools/kicad_python.sh"), join(pcbRoot, rulesScript)],
    env,
    "Native initial project rules",
    60_000,
  );
  await verifyInputs(plan);
  const finalEntries = (await readdir(stage)).sort();
  const hasLocalSettings = finalEntries.includes("controller.kicad_prl");
  if (
    JSON.stringify(finalEntries) !==
      JSON.stringify(
        [
          ...rootEntries,
          "fp-lib-table",
          registrationReceiptName,
          "controller.kicad_pro",
          ...(hasLocalSettings ? ["controller.kicad_prl"] : []),
          rulesReceiptName,
        ].sort(),
      ) ||
    JSON.stringify((await readdir(library)).sort()) !==
      JSON.stringify(expectedEntries) ||
    JSON.stringify((await readdir(join(stage, "footprints"))).sort()) !==
      JSON.stringify([
        "CrystalShim_Controller.pretty",
        "native-footprints-receipt.json",
      ])
  )
    throw new Error("Unexpected entry after native initial project rules");
  for (const file of preservedFiles)
    if (sha256(await readRegular(join(stage, file.path))) !== file.sha256)
      throw new Error(
        `Native initial rules changed an existing stage file: ${file.path}`,
      );
  const initialRulesEvidence = validateControllerInitialRules(
    await readRegular(join(stage, rulesReceiptName)),
    await readRegular(join(stage, "controller.kicad_pro")),
    plan.sourceHashes[rulesScript]!,
    libraryReceipt.kicad_version,
    hasLocalSettings
      ? await readRegular(join(stage, "controller.kicad_prl"))
      : undefined,
  );
  const receipt = await open(join(stage, receiptName), "wx", 0o600);
  try {
    await receipt.writeFile(
      JSON.stringify(
        {
          schema_version: 1,
          status: "initial-export-only",
          board_id: controllerBoardId,
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
          limitations:
            "Only the declared initial NPTH rule applied; no adoption, handoff lock, completed augmentation, ERC/DRC or fabrication acceptance.",
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
    throw new Error("stage-controller-export.ts takes no path arguments");
  console.log(`Controller initial export only: ${await stageControllerExport()}`);
}
