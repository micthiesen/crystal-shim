import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const stage = await mkdtemp(join(tmpdir(), "crystal-shim-kicad-export-test-"));

afterAll(async () => {
  await rm(stage, { recursive: true, force: true });
});

test("exports every hierarchical schematic file from the tooling fixture", async () => {
  const process = Bun.spawn(
    [
      "bun",
      "run",
      "tools/export_kicad_schematic.ts",
      "dist/fixtures/tooling-smoke/circuit.json",
      "tooling-smoke.kicad_sch",
    ],
    {
      cwd: import.meta.dir + "/..",
      env: { ...Bun.env, STILLAIR_HANDOFF_STAGE: stage },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  expect(exitCode, stdout + stderr).toBe(0);
  const root = await readFile(join(stage, "tooling-smoke.kicad_sch"), "utf8");
  expect(root).toContain('(property "Sheetfile" "main.kicad_sch"');
  const main = await readFile(join(stage, "main.kicad_sch"), "utf8");
  expect(main.length).toBeGreaterThan(1000);
  expect(main).toContain('(property "Reference" "R1"');
  expect(main).toContain('(property "Reference" "C1"');
});
