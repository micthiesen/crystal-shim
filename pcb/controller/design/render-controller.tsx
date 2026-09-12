import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import ControllerCircuit from "./controller.circuit";
import { controllerPlacementErrors } from "./placement-check";
import { schematicConnectivityErrors } from "./schematic-connectivity-check";

const circuit = new Circuit();
circuit.add(<ControllerCircuit />);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = [
  ...json.filter((e) => "error_type" in e || e.type.endsWith("_error")),
  ...schematicConnectivityErrors(json),
  ...controllerPlacementErrors(json),
];
if (errors.length)
  throw new Error(`Controller source checks failed: ${JSON.stringify(errors)}`);
const output = "dist/controller/design";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, `${JSON.stringify(json, null, 2)}\n`);
await Bun.write(`${output}/pcb.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(
  `Wrote complete controller review to ${output}; native handoff and fabrication remain separate`,
);
