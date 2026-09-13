import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Circuit } from "../../../../pcb/node_modules/tscircuit";
import MainsCircuit from "../../../../pcb/mains/design/mains.circuit";
import { tps259470a } from "../../../../pcb/controller/design/service-protection-land-patterns";
import { icPhysicalLandPatterns } from "../../../../pcb/controller/design/ic-physical-models";
import { mainsPlacements } from "../../../../pcb/mains/design/placements";

// Read-only source receipt. Writes JSON to stdout; never invokes a native exporter.
const root = resolve(import.meta.dir, "../../../..");
const files = [
  "pcb/mains/design/mains.circuit.tsx",
  "pcb/mains/design/placements.ts",
  "pcb/mains/design/secondary-power.tsx",
  "pcb/controller/design/service-protection-land-patterns.ts",
  "pcb/controller/design/service-protection-components.tsx",
  "pcb/controller/design/ic-physical-models.ts",
];
const circuit = new Circuit();
circuit.add(MainsCircuit());
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const source = json.find((e) => e.type === "source_component" && e.name === "U2");
if (!source || source.type !== "source_component") throw new Error("Missing U2");
const component = json.find(
  (e) => e.type === "pcb_component" && e.source_component_id === source.source_component_id,
);
if (!component || component.type !== "pcb_component") throw new Error("Missing U2 PCB");
const lands = json.filter(
  (e) => e.type === "pcb_smtpad" && e.pcb_component_id === component.pcb_component_id,
);
if (source.manufacturer_part_number !== "TPS259470ARPWR" || lands.length !== 10)
  throw new Error("U2 source identity changed");
console.log(JSON.stringify({
  schema: "crystal-shim.mains-thermal-source.v1",
  coordinate_system: "model: top view, body centre, +Y down; compiled: source +Y up",
  source_hashes: Object.fromEntries(files.map((file) => [
    file, createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex"),
  ])),
  pattern: tps259470a,
  physical: icPhysicalLandPatterns.TPS259470ARPWR,
  placement: mainsPlacements.U2,
  compiled_component: component,
  compiled_lands: lands,
}, null, 2));
