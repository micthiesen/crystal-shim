import { createControllerInitialPcb } from "./controller-initial-pcb";
import type { CircuitJson } from "circuit-json";
import type { KicadSch } from "kicadts";
import { CircuitJsonToKicadSchConverter } from "circuit-json-to-kicad";
import {
  mapUsbSchematicForInitialExport,
  prepareUsbForInitialExport,
} from "./usb-initial-export";
import { prepareFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { applyControllerPinTypesForInitialExport } from "./pin-electrical-initial-export";
import { createControllerManifest } from "./design-manifest";
import { applyControllerFieldsForInitialExport } from "./fields-initial-export";
import { applyControllerSchematicCleanupForInitialExport } from "./schematic-cleanup-initial-export";

// This creates fresh initial object graphs only. It never loads, writes or edits
// a native file. Stage/adoption/parity and declared downstream augmentation are
// separate gates; callers must not serialize these over an adopted design.
export function createControllerInitialGraphs(input: CircuitJson) {
  const json = prepareFootprintOriginsForInitialExport(
    prepareUsbForInitialExport(input, ["J4"]),
    ["U1", "J1", "J2", "J3", "D4", "SW1", "SW2", "SW3"],
  );
  // Preserve actual electrical labels instead of the converter's unconnected
  // custom power graphics. Reviewed PWR_FLAG symbols are a native augmentation.
  const powerIds = new Set<string>();
  for (const element of json) {
    if (
      element.type === "source_net" &&
      (element.is_power || element.is_ground || element.is_positive_voltage_source)
    ) {
      powerIds.add(element.source_net_id);
      element.is_power = false;
      element.is_ground = false;
      element.is_positive_voltage_source = false;
    }
  }
  for (const element of json) {
    if (element.type === "schematic_net_label" && powerIds.has(element.source_net_id))
      delete element.symbol_name;
  }
  const schematic = new CircuitJsonToKicadSchConverter(json);
  schematic.runUntilFinished();
  // Pinned 0.0.205 exposes only serialized child files publicly. Adapt its initial
  // typed graph cache, then refresh every cached string before first emission.
  const initialFiles = Reflect.get(schematic, "files") as {
    kicadSch: KicadSch;
    content: string;
  }[];
  if (!Array.isArray(initialFiles) || initialFiles.length !== 8)
    throw new Error("Controller initial hierarchy must have root plus seven sheets");
  const usbSheets = initialFiles.filter((file) =>
    file.kicadSch.symbols.some((symbol) =>
      symbol.properties.some((p) => p.key === "Reference" && p.value === "J4"),
    ),
  );
  if (usbSheets.length !== 1) throw new Error("Controller USB sheet is ambiguous");
  mapUsbSchematicForInitialExport(usbSheets[0]!.kicadSch, ["J4"]);
  const pinTypes = applyControllerPinTypesForInitialExport(
    json,
    initialFiles.map((file) => file.kicadSch),
  );
  if (pinTypes.components !== 95)
    throw new Error("Controller initial component count changed");
  const manifest = createControllerManifest(input);
  const sheets = initialFiles.map((file) => file.kicadSch);
  applyControllerFieldsForInitialExport(sheets, manifest);
  applyControllerSchematicCleanupForInitialExport(sheets, manifest);
  for (const file of initialFiles) file.content = file.kicadSch.getString();
  const pcb = createControllerInitialPcb(json);
  return {
    circuitJson: json,
    pcb,
    schematicFiles: schematic.getOutputFiles({
      schematicFilename: "controller.kicad_sch",
    }),
  };
}
