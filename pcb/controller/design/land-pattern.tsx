import type { LandPattern } from "./ic-land-patterns";
import { Fragment } from "react";
import { landPatternPhysicalGeometry } from "./land-pattern-physical";

// Manufacturer drawings and native KiCad use top-view +Y down. Convert once at
// the source-footprint boundary; callers supply ordinary tscircuit +Y-up placement.
export function PhysicalFootprintGraphics({
  physical,
}: {
  physical: ReturnType<typeof landPatternPhysicalGeometry>;
}) {
  if (!physical) return null;
  const rectangle = (width: number, height: number, center: { x: number; y: number }) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ].map(([sx, sy]) => ({
      x: center.x + (sx! * width) / 2,
      y: -(center.y + (sy! * height) / 2),
    }));
  return (
    <>
      <fabricationnotepath
        route={rectangle(
          physical.declaration.body.width,
          physical.declaration.body.height,
          physical.bodyCenter,
        )}
        strokeWidth={0.1}
        layer="top"
      />
      <courtyardoutline
        outline={rectangle(
          physical.courtyard.width,
          physical.courtyard.height,
          physical.courtyard.center,
        )}
        strokeWidth={0.05}
        layer="top"
        isClosed
      />
    </>
  );
}

export function LandPatternFootprint({ pattern }: { pattern: LandPattern }) {
  const physical = landPatternPhysicalGeometry(pattern);
  return (
    <footprint>
      <PhysicalFootprintGraphics physical={physical} />
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
