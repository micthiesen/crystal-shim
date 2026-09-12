import { Fragment } from "react";

// Electrical pads and non-plated locators, in native top-view +Y-down coordinates.
export type ThtPattern = {
  id: string;
  pads: {
    number: string;
    x: number;
    y: number;
    drill: number;
    width: number;
    height: number;
    shape: "circle" | "roundrect" | "oval";
    cornerRadius?: number;
  }[];
  holes?: { x: number; y: number; diameter: number }[];
};

export function ThtFootprint({ pattern }: { pattern: ThtPattern }) {
  return (
    <footprint>
      {pattern.pads.map((pad, index) => {
        const common = {
          name: `land_${pad.number}_${index}`,
          pcbX: pad.x,
          pcbY: -pad.y,
          portHints: [`pin${pad.number}`],
        };
        return (
          <Fragment key={`${pad.number}-${index}`}>
            {pad.shape === "circle" ? (
              <platedhole
                {...common}
                shape="circle"
                holeDiameter={pad.drill}
                outerDiameter={pad.width}
              />
            ) : pad.shape === "roundrect" ? (
              <platedhole
                {...common}
                shape="circular_hole_with_rect_pad"
                holeDiameter={pad.drill}
                rectPadWidth={pad.width}
                rectPadHeight={pad.height}
                rectBorderRadius={pad.cornerRadius ?? 0}
              />
            ) : (
              <platedhole
                {...common}
                shape="pill"
                holeWidth={pad.drill}
                holeHeight={pad.drill}
                outerWidth={pad.width}
                outerHeight={pad.height}
              />
            )}
          </Fragment>
        );
      })}
      {pattern.holes?.map((hole, index) => (
        <Fragment key={`locator-${index}`}>
          <hole
            name={`locator_${index}`}
            pcbX={hole.x}
            pcbY={-hole.y}
            diameter={hole.diameter}
          />
        </Fragment>
      ))}
    </footprint>
  );
}
