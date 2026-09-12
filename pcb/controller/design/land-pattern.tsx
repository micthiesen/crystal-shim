import type { LandPattern } from "./ic-land-patterns";
import { Fragment } from "react";
import { landPatternPhysicalGeometry } from "./land-pattern-physical";

// Manufacturer drawings and native KiCad use top-view +Y down. Convert once at
// the source-footprint boundary; callers supply ordinary tscircuit +Y-up placement.
export function LandPatternFootprint({ pattern }: { pattern: LandPattern }) {
  const physical = landPatternPhysicalGeometry(pattern);
  const rectangle = (width: number, height: number) => [
    { x: -width / 2, y: height / 2 },
    { x: width / 2, y: height / 2 },
    { x: width / 2, y: -height / 2 },
    { x: -width / 2, y: -height / 2 },
    { x: -width / 2, y: height / 2 },
  ];
  return (
    <footprint>
      {physical && (
        <>
          <fabricationnotepath
            route={rectangle(
              physical.declaration.body.width,
              physical.declaration.body.height,
            )}
            strokeWidth={0.1}
            layer="top"
          />
          <courtyardoutline
            outline={rectangle(physical.courtyard.width, physical.courtyard.height)}
            strokeWidth={0.05}
            layer="top"
            isClosed
          />
        </>
      )}
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
            solderMaskMargin={physical?.declaration.solderMask.expansion}
            shape="rect"
            layer="top"
          />
        </Fragment>
      ))}
    </footprint>
  );
}
