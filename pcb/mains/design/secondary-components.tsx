import { Fragment } from "react";
import type { ChipProps } from "@tscircuit/props";
import { buckPins } from "../../controller/design/ic-components";
import { ap63203, type LandPattern } from "../../controller/design/ic-land-patterns";
import { PhysicalFootprintGraphics } from "../../controller/design/land-pattern";

import {
  landPatternPhysicalGeometry,
  type PhysicalLandPattern,
} from "../../controller/design/land-pattern-physical";
import { icPhysicalLandPatterns } from "../../controller/design/ic-physical-models";
function SecondaryFootprint({
  pattern,
  physical,
}: {
  pattern: LandPattern;
  physical: PhysicalLandPattern;
}) {
  return (
    <footprint>
      <PhysicalFootprintGraphics
        physical={landPatternPhysicalGeometry(pattern, physical)}
      />
      {pattern.pads.map((p) => (
        <Fragment key={p.number}>
          <smtpad
            portHints={[`pin${p.number}`]}
            pcbX={p.x}
            pcbY={-p.y}
            width={p.width}
            height={p.height}
            solderMaskMargin={0.05}
            shape="rect"
            layer="top"
          />
        </Fragment>
      ))}
    </footprint>
  );
}
export const mainsBuckPattern = { ...ap63203, id: "CrystalShim:AP63205_TSOT26" };
export function MainsBuck(
  props: Omit<
    ChipProps<typeof buckPins>,
    "manufacturerPartNumber" | "pinLabels" | "footprint"
  >,
) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="AP63205WU-7"
      pinLabels={buckPins}
      datasheetUrl={ap63203.source.url}
      footprint={
        <SecondaryFootprint
          pattern={mainsBuckPattern}
          physical={icPhysicalLandPatterns["AP63203WU-7"]!}
        />
      }
      kicadFootprintMetadata={{ footprintName: mainsBuckPattern.id }}
    />
  );
}

export const motorFusePattern: LandPattern = {
  id: "CrystalShim:Littelfuse_451",
  body: { width: 6.1, height: 2.69 },
  pads: [
    { number: "1", x: -2.45, y: 0, width: 1.96, height: 3.15 },
    { number: "2", x: 2.45, y: 0, width: 1.96, height: 3.15 },
  ],
  source: {
    url: "https://www.littelfuse.com/assetdocs/fuse-451-and-453-datasheet?assetguid=533cd5cc-956c-4243-867f-6ab5a62f6ba1",
    sha256: "4d7971c5346420f32946d8f6f19189db0074a717fa4ad9566c72a60c7c21cb84",
    drawing:
      "Littelfuse 451/453 Rev 2025-12-01 p4: 6.86 mm outer copper span, 1.96 x 3.15 mm lands. Centres +/-2.45 follow those dimensions. Installed KiCad 10.0.5 NANO2-451_453 uses +/-2.455 (0.01 mm wider overall); hash identifies that inspected installed footprint, not PDF bytes. Manufacturer body 6.10 +/-0.20 x 2.69 +/-0.25 x 2.69 +/-0.25 mm.",
  },
};
export const motorFusePhysical: PhysicalLandPattern = {
  body: {
    ...motorFusePattern.body,
    thicknessMax: 2.94,
    basis: "451/453 drawing maximum height including +/-0.25 mm tolerance.",
  },
  envelope: {
    width: 6.3,
    height: 2.94,
    basis: "Maximum manufacturer body; copper extends beyond body.",
  },
  solderMask: { expansion: 0.05, basis: "Project NSMD mask allowance." },
  nativeAssembly: {
    paste: "Ordinary SMT lands, no exposed pad or special stencil bank.",
    thermal:
      "3 A rated; 2 A continuous allocation, temperature derating and startup pulse acceptance remain final-unit checks.",
  },
  source: motorFusePattern.source,
};
export const motorFusePins = { pin1: "IN", pin2: "OUT" } as const;
export function MotorFuse(
  props: Omit<
    ChipProps<typeof motorFusePins>,
    "manufacturerPartNumber" | "pinLabels" | "footprint"
  >,
) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="0451003.MRL"
      pinLabels={motorFusePins}
      datasheetUrl={motorFusePattern.source.url}
      footprint={
        <SecondaryFootprint pattern={motorFusePattern} physical={motorFusePhysical} />
      }
      kicadFootprintMetadata={{ footprintName: motorFusePattern.id }}
    />
  );
}
