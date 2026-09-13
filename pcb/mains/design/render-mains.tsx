import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import {
  convertCircuitJsonToSchematicSvg,
  convertCircuitJsonToStackedSchematicSheetsSvg,
} from "circuit-to-svg";
import { mainsSchematicConnectivityErrors } from "./schematic-connectivity-check";
import { createMainsManifest } from "./design-manifest";
import { mainsPlacementIsolationErrors } from "./placement-check";
import MainsCircuit from "./mains.circuit";

const circuit = new Circuit();
circuit.add(<MainsCircuit />);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = [
  ...json.filter((e) => "error_type" in e || e.type.endsWith("_error")),
  ...mainsSchematicConnectivityErrors(json),
  ...mainsPlacementIsolationErrors(json),
];
if (errors.length) throw new Error(`Mains source errors: ${JSON.stringify(errors)}`);
const manifest = createMainsManifest(json);
const output = "dist/mains/design";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, `${JSON.stringify(json, null, 2)}\n`);
await Bun.write(
  `${output}/design-manifest.json`,
  `${JSON.stringify(manifest, null, 2)}\n`,
);
await Bun.write(`${output}/pcb.svg`, await circuit.getSvg({ view: "pcb" }));
// Circuit.getSvg shows only the first sheet. Render the actual full circuit at
// each sheet index so review never silently omits secondary power or suppression.
const sheets = json.filter((e) => e.type === "schematic_sheet");
if (sheets.length !== 3) throw new Error("Expected all three mains schematic sheets");
for (const sheet of sheets) {
  if (!sheet.name || !/^(Primary|Secondary|Suppression)$/.test(sheet.name))
    throw new Error("Unknown mains schematic sheet");
  await Bun.write(
    `${output}/schematic-${sheet.name.toLowerCase()}.svg`,
    convertCircuitJsonToSchematicSvg(json, {
      schematicSheetId: sheet.schematic_sheet_id,
    }),
  );
}
await Bun.write(
  `${output}/schematic.svg`,
  convertCircuitJsonToStackedSchematicSheetsSvg(json),
);
console.log(
  `Wrote complete mains electrical capture to ${output}; occupied/mated fit, native handoff and fabrication remain open`,
);
