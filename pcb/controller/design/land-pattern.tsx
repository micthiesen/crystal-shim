import type { LandPattern } from "./ic-land-patterns";
import { Fragment } from "react";

// Manufacturer drawings and native KiCad use top-view +Y down. Convert once at
// the source-footprint boundary; callers supply ordinary tscircuit +Y-up placement.
export function LandPatternFootprint({ pattern }: { pattern: LandPattern }) {
  return (
    <footprint>
      {pattern.pads.map((pad, index) => (
        <Fragment key={`${pad.number}-${index}`}>
          <smtpad
            name={`land_${pad.number}_${index}`}
            portHints={[`pin${pad.number}`]}
            pcbX={pad.x}
            pcbY={-pad.y}
            width={pad.width}
            height={pad.height}
            cornerRadius={pad.cornerRadius}
            shape="rect"
            layer="top"
          />
        </Fragment>
      ))}
    </footprint>
  );
}
