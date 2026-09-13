import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import { KicadSch, KicadSym } from "kicadts";
import { gridInitialSchematics } from "../../scripts/lib/schematic-grid-initial-export";
import { prepareMainsFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { applyMainsPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { createMainsManifest } from "./design-manifest";
import { applyMainsFieldsForInitialExport } from "./fields-initial-export";
import {
  applyMainsProjectSymbolsForInitialExport,
  addMainsPowerFlagsForInitialExport,
  mainsSymbolLibraryFilename,
} from "./project-symbol-library-initial-export";
import { applyMainsSchematicCleanupForInitialExport } from "./schematic-cleanup-initial-export";
import { createMainsInitialPcb } from "./mains-initial-pcb";

// In-memory initial graphs only. No native file is read, written or adopted.
// The guarded staging exporter is the only allowed first-emission caller;
// subsequent adopted-board changes require a separately reviewed native ECO.
export function createMainsInitialGraphs(input: CircuitJson) {
  const json = prepareMainsFootprintOriginsForInitialExport(input);
  const powerIds = new Set<string>();
  // Keep electrical global labels instead of disconnected custom power artwork.
  // Explicit external AC PWR_FLAG annotations are added after exact pin typing.
  for (const e of json) {
    if (
      e.type === "source_net" &&
      (e.is_power || e.is_ground || e.is_positive_voltage_source)
    ) {
      powerIds.add(e.source_net_id);
      e.is_power = false;
      e.is_ground = false;
      e.is_positive_voltage_source = false;
    }
  }
  for (const e of json) {
    if (e.type === "schematic_net_label" && powerIds.has(e.source_net_id))
      delete e.symbol_name;
  }
  const manifest = createMainsManifest(input);
  const converter = new CircuitJsonToKicadSchConverter(json);
  converter.runUntilFinished();
  // Pinned converter 0.0.205 caches typed sheets and strings privately. Validate
  // both before applying initial adapters; refresh every string before emission.
  const files = Reflect.get(converter, "files") as {
    kicadSch: KicadSch;
    content: string;
  }[];
  if (
    !Array.isArray(files) ||
    files.length !== 4 ||
    files.some(
      (f) => !(f.kicadSch instanceof KicadSch) || typeof f.content !== "string",
    )
  )
    throw new Error("Mains initial hierarchy must have root plus three sheets");
  const sheets = files.map((f) => f.kicadSch);
  if (applyMainsPinTypesForInitialExport(json, sheets).components !== 23)
    throw new Error("Mains initial component count changed");
  applyMainsProjectSymbolsForInitialExport(json, sheets, manifest);
  applyMainsFieldsForInitialExport(sheets, manifest);
  applyMainsSchematicCleanupForInitialExport(sheets, manifest);
  addMainsPowerFlagsForInitialExport(sheets, manifest);
  const gridded = gridInitialSchematics(sheets);
  for (const [index, file] of files.entries()) {
    file.kicadSch = gridded.sheets[index]!;
    file.content = file.kicadSch.getString();
  }
  return {
    circuitJson: json,
    pcb: createMainsInitialPcb(json),
    symbolLibraryFile: {
      filename: mainsSymbolLibraryFilename,
      content: new KicadSym({
        version: 20231120,
        generator: "tscircuit",
        symbols: gridded.library,
      }).getString(),
    },
    schematicFiles: converter.getOutputFiles({ schematicFilename: "mains.kicad_sch" }),
  };
}
