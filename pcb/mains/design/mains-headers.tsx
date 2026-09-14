import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "../../controller/design/tht-footprint";
import type { PhysicalLandPattern } from "../../controller/design/land-pattern-physical";

// Phoenix Contact 1868076 MKDS 5/2-7,62 fixed side-entry screw terminals.
// Native component-side coordinates: pin 1 at origin, wire entry toward +Y.
export const mainsHeaderDefinitions = {
  J1: { circuits: 2, mpn: "1868076", bodyWidth: 15.24 },
  J2: { circuits: 2, mpn: "1868076", bodyWidth: 15.24 },
  J3: { circuits: 2, mpn: "1868076", bodyWidth: 15.24 },
  J4: { circuits: 2, mpn: "1868076", bodyWidth: 15.24 },
} as const;
export type MainsHeaderRef = keyof typeof mainsHeaderDefinitions;

export const mainsHeaderNets = {
  J1: ["AC_L_FUSED", "AC_N"],
  J2: ["FILTER_LINE_L", "AC_N"],
  J3: ["PUMP_L_FILTERED", "PUMP_N_FILTERED"],
  J4: ["PUMP_L_SW", "PUMP_N_FILTERED"],
} as const;

export function mainsHeaderPattern(_ref: MainsHeaderRef): ThtPattern {
  return {
    id: "CrystalShim:Phoenix_MKDS_5_2_7_62_1868076",
    pads: [0, 7.62].map((x, i) => ({
      number: String(i + 1),
      x,
      y: 0,
      drill: 1.3,
      width: 3.5,
      height: 3.5,
      shape: "circle" as const,
    })),
  };
}

export function mainsHeaderPhysical(_ref: MainsHeaderRef): PhysicalLandPattern {
  return {
    packageCenter: { x: 3.81, y: 1.65 },
    envelopeCenter: { x: 3.81, y: 1.65 },
    body: {
      width: 15.24,
      height: 12.5,
      thicknessMax: 21.5,
      basis:
        "Phoenix Contact 1868076 product drawing: 15.24 x 12.5 mm body, height above PCB 21.5 mm; pin row 4.6 mm from rear face.",
    },
    envelope: {
      width: 15.74,
      height: 13,
      basis:
        "Nominal body plus project 0.25 mm allowance on each edge. Wire entry and top screwdriver access are reserved separately.",
    },
    solderMask: {
      expansion: 0.05,
      basis: "Project plated-hole mask allowance; no soldermask insulation credit.",
    },
    nativeAssembly: {
      paste:
        "Hand-solder after reflow; no paste. Two 1.3 mm finished holes at 7.62 mm pitch accept 0.9 mm square, 5.1 mm long pins. Project copper diameter 3.5 mm.",
      thermal:
        "Fixed screw terminals: no mating plug or unused cavity. L on pin 1, N on pin 2; PE bypasses board. Reserve side wire entry and top screwdriver access with the controller removed; use the specified strip length and screw torque. Retain enclosure strain relief.",
    },
    source: {
      url: "https://www.phoenixcontact.com/en-us/products/pcb-terminal-block-mkds-5-2-762-1868076",
      sha256: "ada027e88b46d2245ef499b6a4ed4edcb2eb3bfa147cb4703733281099163a01",
      drawing:
        "Phoenix Contact MKDS 5/2-7,62 order 1868076, 2023-01-22 PDF page 5 visually verified at https://static.chipdip.ru/lib/954/DOC034954716.pdf; product dimensions and PCB hole layout. Fixed horizontal wire entry; not the pluggable MSTB family.",
    },
  };
}

type HeaderProps = Omit<
  ChipProps,
  | "name"
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "internallyConnectedPins"
  | "kicadFootprintMetadata"
  | "noConnect"
> & { name: MainsHeaderRef };

export function MainsHeader({ name, ...props }: HeaderProps) {
  const definition = mainsHeaderDefinitions[name];
  const pattern = mainsHeaderPattern(name);
  const physical = mainsHeaderPhysical(name);
  const pinLabels = Object.fromEntries(
    Array.from({ length: definition.circuits }, (_, i) => [
      `pin${i + 1}`,
      i === 0 ? "LINE" : "NEUTRAL",
    ]),
  );
  return (
    <chip
      {...props}
      name={name}
      manufacturerPartNumber={definition.mpn}
      pinLabels={pinLabels}
      datasheetUrl={physical.source.url}
      footprint={<ThtFootprint pattern={pattern} physicalDeclaration={physical} />}
      kicadFootprintMetadata={{ footprintName: pattern.id }}
    />
  );
}
