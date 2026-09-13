import type { CircuitJson } from "circuit-json";
import { wroomPattern } from "./esp32-c6-wroom";
import { buttonPattern, statusLedPattern } from "./assembly-components";
import {
  psuHeaderPattern,
  sensorHeaderPattern,
  serviceHeaderPattern,
} from "./micro-fit-components";

import {
  prepareFootprintOriginsWithPatterns,
  type OriginPattern,
} from "../../scripts/lib/footprint-origin-initial-export";

const patterns: Readonly<Record<string, OriginPattern>> = {
  "ESP32-C6-WROOM-1-N8": wroomPattern,
  "B3F-1002-G": buttonPattern,
  WP710A10LGD: statusLedPattern,
  "43650-0300": psuHeaderPattern,
  "43045-0600": sensorHeaderPattern,
  "43045-0200": serviceHeaderPattern,
};

// Controller registry only; the shared matcher preserves its original behavior.
export function prepareFootprintOriginsForInitialExport(
  input: CircuitJson,
  refs: readonly string[],
): CircuitJson {
  return prepareFootprintOriginsWithPatterns(input, refs, patterns);
}
