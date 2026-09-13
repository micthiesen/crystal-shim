import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "../../controller/design/tht-footprint";
import type { PhysicalLandPattern } from "../../controller/design/land-pattern-physical";

// All footprint coordinates use the component-side view with +Y down.
// Manufacturer bottom views must be mirrored, not copied directly.
export const isolatedSupplyPins = {
  pin1: "AC_N",
  pin2: "AC_L",
  pin3: "GND_ISO",
  pin4: "V12_RAW",
} as const;
export const pumpRelayPins = {
  pin1: "COIL_HIGH",
  pin3: "CONTACT_FIXED",
  pin4: "CONTACT_MOVING",
  pin5: "COIL_LOW",
} as const;

export const isolatedSupplyPattern: ThtPattern = {
  id: "CrystalShim:IRM_45_12",
  pads: [
    {
      number: "1",
      x: 5.3,
      y: 11.75,
      drill: 1.5,
      width: 3,
      height: 3,
      shape: "roundrect",
      cornerRadius: 0,
    },
    { number: "2", x: 5.3, y: 5, drill: 1.5, width: 3, height: 3, shape: "circle" },
    {
      number: "3",
      x: 81.3,
      y: 40.75,
      drill: 2.5,
      width: 4.5,
      height: 4.5,
      shape: "circle",
    },
    {
      number: "4",
      x: 81.3,
      y: 46.25,
      drill: 2.5,
      width: 4.5,
      height: 4.5,
      shape: "circle",
    },
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
  packageCenter: { x: 43.5, y: 26 },
  body: {
    width: 87,
    height: 52,
    thicknessMax: 30.5,
    basis: "IRM-45 nominal body and +/-1 mm general drawing tolerance.",
  },
  envelope: {
    width: 88,
    height: 53,
    basis:
      "Maximum module body from general tolerance; placement adds service clearance.",
  },
  solderMask: {
    expansion: 0.05,
    basis: "Project PTH opening; mask is not insulation.",
  },
  nativeAssembly: {
    paste:
      "Through-hole module after reflow, no paste. AC leads diameter 1 mm; secondary leads diameter 2 mm; projection 3.5 +/-1 mm. Selected 1.5/2.5 mm finished drills are project allowances, not manufacturer recommendations.",
    thermal:
      "Keep every primary/secondary conductor separated. Full 45.6 W through 50 C at >=100 VAC per manufacturer curves; verify final enclosure heating.",
  },
  source: {
    url: "https://www.meanwell.com/Upload/PDF/IRM-45/IRM-45-SPEC.PDF",
    sha256: "11edb8c455a657584182999ef91d58902c4ed06426ec70691c6126637d42f9e2",
    drawing:
      "2025-11-21 p4, Case IRM60. Bottom view mirrored about 87 mm body width. Bottom AC/L (81.7,5), AC/N (81.7,11.75), -V (5.7,40.75), +V (5.7,46.25). Manufacturer labels functions; source retains logical 1=N,2=L,3=-V,4=+V.",
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
      manufacturerPartNumber="IRM-45-12"
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

// Project lead-forming footprint for the manufacturer's axial 215-series fuse.
export const branchFusePins = { pin1: "IN", pin2: "OUT" } as const;
export const branchFusePattern: ThtPattern = {
  id: "CrystalShim:Littelfuse_215_Axial_P30_48",
  pads: [
    { number: "1", x: 0, y: 0, drill: 1.1, width: 2.5, height: 2.5, shape: "circle" },
    {
      number: "2",
      x: 30.48,
      y: 0,
      drill: 1.1,
      width: 2.5,
      height: 2.5,
      shape: "circle",
    },
  ],
};
export const branchFusePhysical: PhysicalLandPattern = {
  packageCenter: { x: 15.24, y: 0 },
  body: {
    width: 21.5,
    height: 5.5,
    thicknessMax: 7.3,
    basis:
      "215 axial drawing: body 21.5 +/-1 mm, diameter 5.5 +/-0.3 mm, held >=1.5 mm above board.",
  },
  envelope: {
    width: 32.98,
    height: 5.8,
    basis:
      "Project formed-lead/copper envelope; 30.48 mm pitch leaves 3.99 mm each side of maximum 22.5 mm body, exceeding the manufacturer's >1 mm bend offset.",
  },
  solderMask: { expansion: 0.05, basis: "Project PTH mask opening, not insulation." },
  nativeAssembly: {
    paste:
      "No paste. Hand-solder after reflow, 350 +/-5 C for <=5 s. Hold body >=1.5 mm above board and bend leads >1 mm from caps. Replacement requires desoldering.",
    thermal:
      "T1A 250 VAC high breaking capacity branch fuse, not a temperature sensor or guarantee of selective operation with T2A inlet fuse.",
  },
  source: {
    url: "https://www.littelfuse.com/assetdocs/littelfuse_fuse_215_datasheet?assetguid=990f7193-d9a2-48e4-b760-2b43514249cf",
    sha256: "", // Primary PDF read via web; direct byte download blocked, no hash claimed.
    drawing:
      "215 Series datasheet 2021-11-30 pp1,3,4: 1 A 250 VAC, 1500 A interrupt; axial suffix E; body/lead forming per drawing. Hole, land and pitch are declared project choices, not a supplied PCB layout.",
  },
};
export function BranchFuse(props: PartProps<typeof branchFusePins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="0215001.MXEP"
      pinLabels={branchFusePins}
      datasheetUrl={branchFusePhysical.source.url}
      footprint={
        <ThtFootprint
          pattern={branchFusePattern}
          physicalDeclaration={branchFusePhysical}
        />
      }
      kicadFootprintMetadata={{ footprintName: branchFusePattern.id }}
    />
  );
}
