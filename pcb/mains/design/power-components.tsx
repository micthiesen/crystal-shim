import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "../../controller/design/tht-footprint";
import type { PhysicalLandPattern } from "../../controller/design/land-pattern-physical";

// All footprint coordinates use the component-side view with +Y down.
// Manufacturer bottom views must be mirrored, not copied directly.
export const isolatedSupplyPins = {
  pin1: "AC_N",
  pin2: "AC_L",
  pin3: "GND_ISO",
  pin4: "V5_RAW",
} as const;
export const pumpRelayPins = {
  pin1: "COIL_HIGH",
  pin3: "CONTACT_FIXED",
  pin4: "CONTACT_MOVING",
  pin5: "COIL_LOW",
} as const;

export const isolatedSupplyPattern: ThtPattern = {
  id: "CrystalShim:IRM_10_5",
  pads: [
    {
      number: "1",
      x: 42.1,
      y: 14.2,
      drill: 1.5,
      width: 3,
      height: 3,
      shape: "roundrect",
      cornerRadius: 0,
    },
    { number: "2", x: 42.1, y: 3.45, drill: 1.5, width: 3, height: 3, shape: "circle" },
    { number: "3", x: 3.6, y: 3.45, drill: 1.5, width: 3, height: 3, shape: "circle" },
    { number: "4", x: 3.6, y: 11.45, drill: 1.5, width: 3, height: 3, shape: "circle" },
  ],
};

export const pumpRelayPattern: ThtPattern = {
  id: "CrystalShim:G5RL_1A_TV8",
  pads: [
    {
      number: "1",
      x: 23.5,
      y: 0,
      drill: 1.3,
      width: 2.8,
      height: 2.8,
      shape: "roundrect",
      cornerRadius: 0,
    },
    { number: "3", x: 0, y: 0, drill: 1.3, width: 2.8, height: 2.8, shape: "circle" },
    {
      number: "4",
      x: 3.5,
      y: 7.5,
      drill: 1.3,
      width: 2.8,
      height: 2.8,
      shape: "circle",
    },
    {
      number: "5",
      x: 23.5,
      y: 7.5,
      drill: 1.3,
      width: 2.8,
      height: 2.8,
      shape: "circle",
    },
  ],
};

export const isolatedSupplyPhysical: PhysicalLandPattern = {
  packageCenter: { x: 22.85, y: 12.7 },
  body: {
    width: 45.7,
    height: 25.4,
    thicknessMax: 22,
    basis: "IRM-10 nominal body; manufacturer general dimensional tolerance +/-0.5 mm.",
  },
  envelope: {
    width: 46.2,
    height: 25.9,
    basis:
      "Maximum body dimensions. PCB placement also reserves the documented 47.7 x 27.4 mm assembly envelope.",
  },
  solderMask: {
    expansion: 0.05,
    basis: "Project PTH opening allowance; no mask counted as insulation.",
  },
  nativeAssembly: {
    paste:
      "Hand-solder through-hole module after reflow. No stencil apertures. Lead length 3.5 +/-1 mm; confirm final board/fillet fit.",
    thermal:
      "Maintain the mains/isolated barrier on every layer and the 50 C enclosure-air limit. Module approvals do not approve the assembled controller.",
  },
  source: {
    url: "https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf",
    sha256: "1aab6b30492328818e4d0900416676891eeb1076f409d56dc2277d7119ed208a",
    drawing:
      "2025-08-08 mechanical drawing, Case222A, bottom view mirrored in X. Manufacturer labels functions, not pin numbers. Adopt native IRM-05 symbol numbers consistently. 1.5 mm drills and 3 mm copper match the installed native candidate, not a manufacturer drill recommendation.",
  },
};

export const pumpRelayPhysical: PhysicalLandPattern = {
  packageCenter: { x: 11.4, y: 3.75 },
  body: {
    width: 28.8,
    height: 12.5,
    thicknessMax: 15.7,
    basis: "Manufacturer average body dimensions 28.8 x 12.5; maximum height 15.7 mm.",
  },
  envelope: {
    width: 29,
    height: 12.7,
    basis:
      "Maximum body envelope about drawing datum: coil is 2.3 mm from the end; pin 3 is 23.5 mm beyond the coil. Transverse centring is a drawing inference requiring package-fit review.",
  },
  solderMask: {
    expansion: 0.05,
    basis: "Project PTH opening allowance; solder mask is not mains insulation.",
  },
  nativeAssembly: {
    paste:
      "Hand-solder flux-protected relay after reflow, with no stencil apertures. Do not wash as a sealed relay. Four finished holes 1.3 +/-0.1 mm; 2.8 mm project lands give 0.75 mm nominal annulus.",
    thermal:
      "Maintain >=8 mm primary-to-secondary isolation including routes, copper, solder and mounting metal. Body outline does not substitute for the reviewed insulation boundary. Coil voltage, dropout and contact heating require final-unit tests.",
  },
  source: {
    url: "https://omronfs.omron.com/en_US/ecb/products/pdf/en-g5rl.pdf",
    sha256: "27f89100ce31179247bfdf60fba4d9023c4801e76c6a711461b91cce88293ac5",
    drawing:
      "K132-E1-10 1216(0307)(O), PDF p5 top G5RL-1A-TV8 mounting/terminal drawings. Bottom-view coils x=0, contact 4 x=20, contact 3 x=23.5. Mirror X and place pin 3 at (0,0). Preserve separate 20 +/-0.1, 3.5 +/-0.1 and 7.5 +/-0.1 dimensions; derived 23.5 is not +/-0.1. Source correction independently reviewed before capture. This verified older primary PDF establishes geometry, not a current ordering-status assertion.",
  },
};

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

export function IsolatedSupply(props: PartProps<typeof isolatedSupplyPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="IRM-10-5"
      pinLabels={isolatedSupplyPins}
      datasheetUrl={isolatedSupplyPhysical.source.url}
      footprint={
        <ThtFootprint
          pattern={isolatedSupplyPattern}
          physicalDeclaration={isolatedSupplyPhysical}
        />
      }
      kicadFootprintMetadata={{ footprintName: isolatedSupplyPattern.id }}
    />
  );
}

export function PumpRelay(props: PartProps<typeof pumpRelayPins>) {
  return (
    <chip
      schWidth={8}
      {...props}
      manufacturerPartNumber="G5RL-1A-TV8 DC5"
      pinLabels={pumpRelayPins}
      datasheetUrl={pumpRelayPhysical.source.url}
      footprint={
        <ThtFootprint
          pattern={pumpRelayPattern}
          physicalDeclaration={pumpRelayPhysical}
        />
      }
      kicadFootprintMetadata={{ footprintName: pumpRelayPattern.id }}
    />
  );
}
