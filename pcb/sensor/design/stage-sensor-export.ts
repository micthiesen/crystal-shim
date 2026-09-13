import { constants } from "node:fs";
import { open, lstat, readdir, realpath } from "node:fs/promises";
import { join, resolve, basename, isAbsolute } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { Circuit } from "tscircuit";
import SensorCircuit from "./sensor.circuit";
import { createSensorManifest } from "./design-manifest";
import { createSensorInitialGraphs } from "./sensor-initial-export";
const root = resolve(import.meta.dir, "../..");
const hash = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const names = ["kicad-augmentation.normalized.json", "source-manifest.normalized.json"];
export async function sensorStageGuard(env: Record<string, string | undefined>) {
  const stage = env.STILLAIR_HANDOFF_STAGE;
  if (
    !stage ||
    !isAbsolute(stage) ||
    (await realpath(stage)) !== stage ||
    !basename(stage).startsWith("stillair-sensor.board.main-handoff-") ||
    stage.startsWith(resolve(root, "..") + "/") ||
    env.STILLAIR_HANDOFF_BOARD !== "sensor.board.main"
  )
    throw new Error("Requires a fresh guarded sensor stage outside repository");
  for (const [key, name] of [
    ["STILLAIR_HANDOFF_MANIFEST", names[1]!],
    ["STILLAIR_HANDOFF_AUGMENTATION", names[0]!],
  ])
    if (
      env[key!] !== join(stage, name!) ||
      !(await lstat(join(stage, name!))).isFile() ||
      (await lstat(join(stage, name!))).isSymbolicLink()
    )
      throw new Error("Stage input guard mismatch");
  if (JSON.stringify((await readdir(stage)).sort()) !== JSON.stringify(names))
    throw new Error("Stage must contain only its two normalized inputs");
  return stage;
}
function run(
  command: string,
  args: string[],
  env: Record<string, string | undefined>,
  input?: string,
) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    timeout: 120000,
  });
  if (result.error || result.status !== 0)
    throw new Error(`${command}: ${result.error ?? result.stderr}`);
  return result.stdout;
}
export async function stageSensorExport(
  env: Record<string, string | undefined> = process.env,
) {
  const stage = await sensorStageGuard(env);
  const before = Object.fromEntries(
    await Promise.all(
      names.map(async (n) => [n, hash(await Bun.file(join(stage, n)).text())]),
    ),
  );
  const circuit = new Circuit();
  circuit.add(createElement(SensorCircuit));
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  if (json.some((e) => "error_type" in e || e.type.endsWith("_error")))
    throw new Error("Sensor source errors");
  const manifest = createSensorManifest(json);
  const normalized = run(
    "python3",
    [
      "-c",
      "import importlib.util,json,sys; s=importlib.util.spec_from_file_location('h','tools/tscircuit_handoff.py'); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.normalize_manifest(json.load(sys.stdin)),sort_keys=True))",
    ],
    env,
    JSON.stringify(manifest),
  );
  const staged = run(
    "python3",
    [
      "-c",
      "import json,sys;print(json.dumps(json.load(open(sys.argv[1])),sort_keys=True))",
      join(stage, names[1]!),
    ],
    env,
  );
  if (normalized !== staged)
    throw new Error("Staged manifest differs from fresh source");
  const graphs = createSensorInitialGraphs(json);
  const files = [
    ...graphs.schematicFiles,
    graphs.symbolLibraryFile,
    { filename: "sensor.kicad_pcb", content: graphs.pcb.getString() },
  ];
  if (
    new Set(files.map((f) => f.filename)).size !== files.length ||
    files.some((f) => basename(f.filename) !== f.filename)
  )
    throw new Error("Unsafe initial filenames");
  await sensorStageGuard(env);
  for (const f of files) {
    const handle = await open(
      join(stage, f.filename),
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(f.content);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  run(
    "sh",
    [
      join(root, "tools/kicad_python.sh"),
      join(import.meta.dir, "export-native-footprints.py"),
      "--board",
      join(stage, "sensor.kicad_pcb"),
      "--manifest",
      join(stage, names[1]!),
      "--stage",
      stage,
      "--output-root",
      join(stage, "footprints"),
    ],
    env,
  );
  run("python3", [join(import.meta.dir, "register-sensor-library.py")], env);
  run(
    "sh",
    [
      join(root, "tools/kicad_python.sh"),
      join(import.meta.dir, "apply-sensor-routing-rules.py"),
    ],
    env,
  );
  for (const name of names)
    if (hash(await Bun.file(join(stage, name)).text()) !== before[name])
      throw new Error("Stage input changed");
  const receipt = {
    schema_version: 1,
    board_id: "sensor.board.main",
    status: "initial-export-only",
    inputs: before,
    files: Object.fromEntries(
      await Promise.all(
        files.map(async (f) => [
          f.filename,
          hash(await Bun.file(join(stage, f.filename)).text()),
        ]),
      ),
    ),
    native_library: "footprints/native-footprints-receipt.json",
    registration: "native-library-registration.json",
  };
  const out = await open(join(stage, "sensor-initial-export-receipt.json"), "wx");
  try {
    await out.writeFile(JSON.stringify(receipt, null, 2));
  } finally {
    await out.close();
  }
  return stage;
}
if (import.meta.main) console.log(await stageSensorExport());
