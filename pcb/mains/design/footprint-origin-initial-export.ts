import type { CircuitJson } from "circuit-json";
import {
  prepareFootprintOriginsWithPatterns,
  type OriginPattern,
} from "../../scripts/lib/footprint-origin-initial-export";
import { psuHeaderPattern } from "../../controller/design/micro-fit-components";
import { mainsHeaderDefinitions, mainsHeaderPattern } from "./mains-headers";
import { isolatedSupplyPattern, pumpRelayPattern } from "./power-components";
import {
  flybackPattern,
  snubberCapacitorPattern,
  snubberResistorPattern,
} from "./suppression-components";
import { movCapture } from "./mov-component";

// Exact component-side datums (+Y down), not compiler copper-box centres.
// Keep both physical tails of every Sabre blade and J5's unnumbered locator.
// A slot has one centre just like a round hole; its shape is verified separately.
export const mainsOriginPatterns: Readonly<Record<string, OriginPattern>> = {
  "IRM-10-5": isolatedSupplyPattern,
  "G5RL-1A-TV8 DC5": pumpRelayPattern,
  ...Object.fromEntries(
    Object.entries(mainsHeaderDefinitions).map(([ref, part]) => [
      part.mpn,
      mainsHeaderPattern(ref as keyof typeof mainsHeaderDefinitions),
    ]),
  ),
  "43650-0300": psuHeaderPattern,
  "1N4007-E3/54": flybackPattern,
  PR02FS0201000KA100: snubberResistorPattern,
  B32921C3473K000: snubberCapacitorPattern,
  [movCapture.mpn]: {
    id: movCapture.footprint,
    pads: [
      { number: "1", x: movCapture.round.x, y: movCapture.round.y },
      { number: "2", x: movCapture.slot.x, y: movCapture.slot.y },
    ],
  },
};

// Derived Circuit JSON only, before initial native conversion. The common
// algorithm validates every numbered land/locator and edits only component
// centres in a clone. No saved native board is loaded or changed.
export function prepareMainsFootprintOriginsForInitialExport(input: CircuitJson) {
  return prepareFootprintOriginsWithPatterns(
    input,
    ["U1", "K1", "J1", "J2", "J3", "J4", "J5", "D1", "R1", "C1", "RV1"],
    mainsOriginPatterns,
  );
}
