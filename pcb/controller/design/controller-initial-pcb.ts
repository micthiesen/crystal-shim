import type { CircuitJson } from "circuit-json";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { mapUsbPcbForInitialExport } from "./usb-initial-export";
import { anchorServiceEfuseForInitialExport } from "./service-protection-initial-export";
import { applyConnectorPhysicalForInitialExport } from "./connector-physical-initial-export";
import { omitTestPointPasteForInitialExport } from "./test-points";
import { identifyControllerMountsForInitialExport } from "./mounting-holes-initial-export";

// Fresh graph only. Callers first apply USB and manufacturer-origin preparation.
// The manifest and initial exporter share this physical conversion so adapter
// changes are included in the footprint geometry identity used by later ECOs.
export function createControllerInitialPcb(prepared: CircuitJson) {
  const converter = new CircuitJsonToKicadPcbConverter(prepared);
  converter.runUntilFinished();
  const pcb = converter.getOutput();
  mapUsbPcbForInitialExport(pcb, ["J4"]);
  anchorServiceEfuseForInitialExport(pcb, ["U10"]);
  applyConnectorPhysicalForInitialExport(pcb, [
    "J1",
    "J2",
    "J3",
    "J4",
    "D4",
    "SW1",
    "SW2",
    "SW3",
  ]);
  omitTestPointPasteForInitialExport(pcb);
  identifyControllerMountsForInitialExport(pcb);
  return pcb;
}
