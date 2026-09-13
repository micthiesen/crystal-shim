import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import {
  convertCircuitJsonToSchematicSvg,
  convertCircuitJsonToPcbSvg,
} from "circuit-to-svg";
import { createSensorManifest } from "./design-manifest";
import SensorCircuit from "./sensor.circuit";
const c = new Circuit();
c.add(<SensorCircuit />);
await c.renderUntilSettled();
const json = c.getCircuitJson();
const out = "dist/sensor/design";
await mkdir(out, { recursive: true });
await Bun.write(`${out}/circuit.json`, JSON.stringify(json, null, 2));
await Bun.write(`${out}/pcb.svg`, await c.getSvg({ view: "pcb" }));
await Bun.write(`${out}/schematic.svg`, convertCircuitJsonToSchematicSvg(json));
await Bun.write(
  `${out}/glass.svg`,
  convertCircuitJsonToPcbSvg(json, {
    layer: "bottom",
    showSolderMask: false,
    showSolderPaste: false,
  }),
);
const errors = json.filter((e) => "error_type" in e || e.type.endsWith("_error"));
if (errors.length) throw new Error(JSON.stringify(errors, null, 2));
await Bun.write(
  `${out}/design-manifest.json`,
  JSON.stringify(createSensorManifest(json), null, 2),
);
console.log(`Sensor source and placement rendered to ${out}`);
