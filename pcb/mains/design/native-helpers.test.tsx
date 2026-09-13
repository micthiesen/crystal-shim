import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { Circuit } from "tscircuit";
import MainsCircuit from "./mains.circuit";
import { createMainsManifest } from "./design-manifest";

test("mains native helpers admit the actual source and reject unsafe stage or identity drift without native I/O", async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  const result = spawnSync("python3", ["-B", "mains/design/native-helpers.test.py"], {
    cwd: new URL("../../", import.meta.url),
    input: JSON.stringify(createMainsManifest(circuit.getCircuitJson())),
    encoding: "utf8",
    timeout: 30000,
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.stderr).toContain("OK");
}, 30000);
