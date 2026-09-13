import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { Property } from "kicadts";
import { anchorServiceEfuseForInitialExport } from "../../controller/design/service-protection-initial-export";
import { applyConnectorPhysicalForInitialExport } from "../../controller/design/connector-physical-initial-export";
import { prepareMainsFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { applyMainsPhysicalForInitialExport } from "./physical-initial-export";
import { identifyMainsMountsForInitialExport } from "./mounting-holes-initial-export";
import { assertMainsJ5PhysicalForInitialExport } from "./j5-physical-initial-export";
import {
  assertMainsInitialPadNets,
  mainsSchematicConnectivityErrors,
} from "./schematic-connectivity-check";

// Create an initial typed graph from source only. No saved KiCad project is
// read or written, and no caller can observe a partially adapted graph on error.
// Complete library/field preparation and guarded staging follow later.
// This is not an ECO entry point or a fabrication exporter.
export function createMainsInitialPcb(input: CircuitJson) {
  const errors = mainsSchematicConnectivityErrors(input);
  if (errors.length) throw new Error(`Invalid mains source: ${errors.join("; ")}`);
  const prepared = prepareMainsFootprintOriginsForInitialExport(input);
  const converter = new CircuitJsonToKicadPcbConverter(prepared);
  converter.runUntilFinished();
  const board = converter.getOutput();
  assertMainsInitialPadNets(board);
  // The pinned converter's passive Value fields contain "100Ω" and "47nF",
  // losing exact order codes. Bind only source-validated identities before the
  // physical adapter requires them; complete manifest fields are separate work.
  const passiveIdentities = [
    { ref: "R1", mpn: "PR02FS0201000KA100", kind: "simple_resistor", quantity: 100 },
    { ref: "C1", mpn: "B32921C3473K000", kind: "simple_capacitor", quantity: 47e-9 },
  ] as const;
  const bindings = passiveIdentities.map(({ ref, mpn, kind, quantity }) => {
    const sources = input.filter(
      (e) => e.type === "source_component" && e.name === ref,
    );
    const source = sources[0];
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    const fp = matches[0];
    if (
      sources.length !== 1 ||
      source?.type !== "source_component" ||
      source.manufacturer_part_number !== mpn ||
      source.ftype !== kind ||
      (source.ftype === "simple_resistor" ? source.resistance : source.capacitance) !==
        quantity ||
      matches.length !== 1 ||
      !fp ||
      fp.properties.some((p) => p.key === "MPN")
    )
      throw new Error(`${ref}: missing or changed exact passive identity`);
    return { fp, mpn };
  });
  for (const { fp, mpn } of bindings) {
    fp.properties = [
      ...fp.properties,
      new Property({
        key: "MPN",
        value: mpn,
        position: { x: 0, y: 0 },
        layer: "F.Fab",
        hidden: true,
      }),
    ];
  }
  anchorServiceEfuseForInitialExport(board, ["U2"]);
  assertMainsJ5PhysicalForInitialExport(board);
  applyConnectorPhysicalForInitialExport(board, ["J5"]);
  applyMainsPhysicalForInitialExport(board);
  identifyMainsMountsForInitialExport(board);
  return board;
}
