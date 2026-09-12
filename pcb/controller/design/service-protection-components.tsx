import type { ChipProps } from "@tscircuit/props";
import { Fragment } from "react";
import { LandPatternFootprint, PhysicalFootprintGraphics } from "./land-pattern";
import { landPatternPhysicalGeometry } from "./land-pattern-physical";
import { smbj8_0ca, tps259470a } from "./service-protection-land-patterns";

export const serviceEfusePins = {
  pin1: "EN_UVLO",
  pin2: "OVLO",
  pin3: "AUXOFF",
  pin4: "FLT_N",
  pin5: "IN",
  pin6: "OUT",
  pin7: "DVDT",
  pin8: "GND",
  pin9: "ILM",
  pin10: "ITIMER",
} as const;

export const bidirectionalSupplyTvsPins = {
  pin1: "TERMINAL_1",
  pin2: "TERMINAL_2",
} as const;

type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "internallyConnectedPins"
  | "kicadFootprintMetadata"
>;

export function Tps259470Footprint() {
  const physical = landPatternPhysicalGeometry(tps259470a);
  // Current tscircuit ports use polygon bounding-box
  // centres, which lie in these L notches. The current KiCad converter also
  // adds a diameter-0.2 anchor at the vertex mean, changing the copper there.
  // anchorServiceEfuseForInitialExport moves native anchors into the horizontal
  // leg before initial-stage serialization, preserving this outline. Source
  // routing stays disabled; native paste augmentation remains required.
  return (
    <footprint>
      <PhysicalFootprintGraphics physical={physical} />
      {tps259470a.pads.map((pad) => (
        <Fragment key={pad.number}>
          {pad.shape === "polygon" ? (
            <smtpad
              name={`land_${pad.number}`}
              portHints={[`pin${pad.number}`]}
              shape="polygon"
              solderMaskMargin={physical?.declaration.solderMask.expansion}
              // Native +Y down -> tscircuit +Y up, exactly once.
              points={pad.points.map(({ x, y }) => ({ x, y: -y }))}
              layer="top"
            />
          ) : (
            <smtpad
              name={`land_${pad.number}`}
              portHints={[`pin${pad.number}`]}
              shape="rect"
              solderMaskMargin={physical?.declaration.solderMask.expansion}
              pcbX={pad.x}
              pcbY={-pad.y}
              width={pad.width}
              height={pad.height}
              cornerRadius={pad.cornerRadius}
              layer="top"
            />
          )}
        </Fragment>
      ))}
    </footprint>
  );
}

export function ServiceEfuse(props: PartProps<typeof serviceEfusePins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TPS259470ARPWR"
      pinLabels={serviceEfusePins}
      datasheetUrl={tps259470a.source.url}
      footprint={<Tps259470Footprint />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TPS259470A_RPW0010A" }}
    />
  );
}

export function BidirectionalSupplyTvs(
  props: PartProps<typeof bidirectionalSupplyTvsPins>,
) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SMBJ8.0CA"
      pinLabels={bidirectionalSupplyTvsPins}
      datasheetUrl={smbj8_0ca.source.url}
      footprint={<LandPatternFootprint pattern={smbj8_0ca} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:SMBJ8_0CA" }}
    />
  );
}
