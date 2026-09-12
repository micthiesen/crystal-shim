import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { MainsSuppression } from "./suppression";
import { schematicConnectivityErrors } from "../../controller/design/schematic-connectivity-check";

const circuit = new Circuit();
circuit.add(
  <board width={70} height={50} routingDisabled>
    <MainsSuppression />
  </board>,
);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = [
  ...json.filter((e) => e.type.includes("error")),
  ...schematicConnectivityErrors(json),
];
if (errors.length) throw new Error(JSON.stringify(errors));
const output = "dist/mains/suppression-review";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, JSON.stringify(json, null, 2) + "\n");
await Bun.write(`${output}/lands.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(`Wrote ${output} (circuit and component review only)`);
