import { FootprintAttr } from "kicadts";
import type { CircuitJson } from "circuit-json";
import { applyConnectorPhysicalForInitialExport } from "../../controller/design/connector-physical-initial-export";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { prepareFootprintOriginsForInitialExport } from "../../controller/design/footprint-origin-initial-export";
// Fresh in-memory export only. No adopted project read or modified.
export function prepareSensorInitialJson(input: CircuitJson): CircuitJson {
  const json = prepareFootprintOriginsForInitialExport(input, ["J1"]);
  const e = json.find((e) => e.type === "source_component" && e.name === "E1");
  if (!e || e.type !== "source_component") throw new Error("Missing electrode source");
  const p = json.find(
    (p) =>
      p.type === "pcb_component" && p.source_component_id === e.source_component_id,
  );
  if (!p || p.type !== "pcb_component") throw new Error("Missing E1 copper");
  return json.filter(
    (e) =>
      !(e.type === "pcb_solder_paste" && e.pcb_component_id === p.pcb_component_id),
  );
}
export function createSensorInitialPcb(input: CircuitJson) {
  const json = prepareSensorInitialJson(input);
  const converter = new CircuitJsonToKicadPcbConverter(json);
  converter.runUntilFinished();
  const board = converter.getOutput();
  applyConnectorPhysicalForInitialExport(board, ["J1"]);
  const electrode = board.footprints.find((f) =>
    f.properties.some((p) => p.key === "Reference" && p.value === "E1"),
  );
  if (!electrode || electrode.fpPads.length !== 13)
    throw new Error("Electrode copper incomplete");
  const attrs = new FootprintAttr();
  attrs.boardOnly = true;
  attrs.excludeFromBom = true;
  attrs.excludeFromPosFiles = true;
  electrode.attr = attrs;
  // Source coveredWithSolderMask/paste intent must survive the converter. These
  // are capacitor electrodes, never solderable component lands.
  for (const pad of electrode.fpPads) {
    const copper = pad.layers?.layers.filter((l) => l.endsWith(".Cu")) ?? [];
    pad.layers = copper;
    if (copper.length !== 1)
      throw new Error("Electrode must retain exactly one copper layer");
  }
  return board;
}
