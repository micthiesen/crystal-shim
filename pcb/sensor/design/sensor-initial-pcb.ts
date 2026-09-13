import { FootprintAttr, PadNet } from "kicadts";
import type { CircuitJson } from "circuit-json";
import { electrodeRectangles, electrodePadNumbers, electrodeNets } from "./electrodes";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";

// Fresh in-memory export only. No adopted project read or modified.
export function prepareSensorInitialJson(input: CircuitJson): CircuitJson {
  const json = structuredClone(input);
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
  const electrode = board.footprints.find((f) =>
    f.properties.some((p) => p.key === "Reference" && p.value === "E1"),
  );
  if (!electrode || electrode.fpPads.length !== electrodeRectangles.length)
    throw new Error("Electrode copper incomplete");
  const attrs = new FootprintAttr();
  attrs.boardOnly = true;
  attrs.excludeFromBom = true;
  attrs.excludeFromPosFiles = true;
  electrode.attr = attrs;
  // Source coveredWithSolderMask/paste intent must survive the converter. These
  // are capacitor electrodes, never solderable component lands.
  for (const [index, pad] of electrode.fpPads.entries()) {
    const geometry = electrodeRectangles[index];
    if (!geometry) throw new Error("Electrode pad identity missing");
    // The pinned converter maps internal SMT copper to F.Cu. Restore the explicit
    // source layer in this initial in-memory graph, never by editing native text.
    pad.number = String(electrodePadNumbers[index]);
    const net = board.nets.find((n) => n.name === electrodeNets[geometry[1] as 1]);
    if (!net) throw new Error("Missing electrode net");
    pad.net = new PadNet(net.id, net.name);
    const copper = [geometry[2] === "inner2" ? "In2.Cu" : "B.Cu"];
    pad.layers = copper;
    if (copper.length !== 1)
      throw new Error("Electrode must retain exactly one copper layer");
  }
  const pigtail = board.footprints.find((f) =>
    f.properties.some((p) => p.key === "Reference" && p.value === "J1"),
  );
  if (!pigtail) throw new Error("Missing pigtail");
  pigtail.attr = new FootprintAttr();
  pigtail.attr.boardOnly = true;
  pigtail.attr.excludeFromBom = true;
  pigtail.attr.excludeFromPosFiles = true;
  for (const pad of pigtail.fpPads)
    pad.layers = pad.layers!.layers.filter((l) => !l.endsWith(".Paste"));
  return board;
}
