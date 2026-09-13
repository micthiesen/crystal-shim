import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "../../controller/design/tht-footprint";
import type { PhysicalLandPattern } from "../../controller/design/land-pattern-physical";

// Molex 431600001-SD PSD000 A1, right-angle headers. Component-side mating
// view, mating toward +Y in component coordinates, origin at circuit 1's lower tail. Each blade has TWO
// tails sharing one logical pad number, including blades unused by the harness.
export const mainsHeaderDefinitions = {
  J1: { circuits: 2, mpn: "43160-1102", housing: "44441-2002", bodyWidth: 21.08 },
  J2: { circuits: 3, mpn: "43160-1103", housing: "44441-2003", bodyWidth: 28.58 },
  J3: { circuits: 4, mpn: "43160-1104", housing: "44441-2004", bodyWidth: 36.07 },
  J4: { circuits: 6, mpn: "43160-1106", housing: "44441-2006", bodyWidth: 51.05 },
} as const;
export type MainsHeaderRef = keyof typeof mainsHeaderDefinitions;

export const mainsHeaderNets = {
  J1: ["AC_L_FUSED", "AC_N"],
  J2: ["FILTER_LINE_L", "AC_N"],
  J3: ["PUMP_L_FILTERED", "PUMP_N_FILTERED"],
  J4: ["PUMP_L_SW", "PUMP_N_FILTERED"],
} as const;

export function mainsHeaderPattern(ref: MainsHeaderRef): ThtPattern {
  const { circuits, mpn } = mainsHeaderDefinitions[ref];
  return {
    id: `CrystalShim:Molex_Sabre_${mpn}`,
    pads: Array.from({ length: circuits }, (_, index) =>
      [-3.18, 0].map((y) => ({
        number: String(index + 1),
        x: index * 7.493,
        y,
        drill: 1.78,
        width: 3.5,
        height: 3.5,
        shape: "circle" as const,
      })),
    ).flat(),
    // -110n has no board locks. Do not add optional 3 mm holes or thermal vias.
  };
}

export function mainsHeaderPhysical(ref: MainsHeaderRef): PhysicalLandPattern {
  const { circuits, bodyWidth } = mainsHeaderDefinitions[ref];
  const centerX = ((circuits - 1) * 7.493) / 2;
  return {
    packageCenter: { x: centerX, y: 9.03 },
    // Conservative right-angle whole-header reserve including bent tails; mating +Y.
    // The size is dimensioned; the shroud's pose is still a qualified inference.
    envelopeCenter: { x: centerX, y: 6.5 },
    body: {
      width: bodyWidth,
      height: 14.76,
      thicknessMax: 13.67,
      basis:
        "Right-angle shroud: width +/-0.33, depth 14.76 +/-0.10, height 11.53 +/-0.15 plus latch 1.86 +/-0.13. Body Y pose bounded by the 19.78 +/-0.38 overall depth, 3.18 tail rows and 13.13 board-lock datum in drawing sheets 3/4; conservative whole-header reserve governs fit.",
    },
    envelope: {
      width: bodyWidth + 0.33,
      height: 21.5,
      basis:
        "Whole right-angle header allocation Y=-4.25..17.25 about front tail row, including rear tails and assembly allowance. Maximum width per drawing. Mated housing extends farther outward; reserve 35 mm beyond PCB edge for mating, release and cable access; maximum mated height allocation 17 mm.",
    },
    solderMask: {
      expansion: 0.05,
      basis: "Project PTH opening allowance. No mask is counted as mains insulation.",
    },
    nativeAssembly: {
      paste:
        "Hand-solder all tails after reflow; no stencil paste. Finished holes 1.78 +/-0.08 mm. Project 3.50 mm copper, two same-number tails per circuit. Short tails 3.81 +/-0.28 mm. Native origin/mask/paste and circuit-1 Fab/silk marker remain declared handoff work.",
      thermal:
        "Preserve unused blades/tails and empty harness cavities. Reserve insulation clearance from all metal, plus right-angle mating and latch access outside the board edge. Confirm body pose, housing numbering, latch/wire access and partial-mating risk before placement approval; pole counts alone do not prove coding. PE bypasses these headers.",
    },
    source: {
      url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/431/43160/431600106_sd.pdf",
      sha256: "249d83521d452abfae030237405456be0e05ec06e08c629489d60fa035962fa7",
      drawing:
        "431600001-SD PSD000 A1, released 2020-05-26, sheets 3/4/5. Verified manufacturer PDF mirror: https://www.megastar.com/content/pdfs/431601102_sd.pdf. Circuit pitch 7.493 +/-0.13 non-accumulative; tail-row pitch 3.18 +/-0.13 mm. No manufacturer copper diameter specified. See docs/design/mains-header-capture.md for orientation and datum qualifications.",
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
      i === 0 ? "LINE" : i === 1 ? "NEUTRAL" : `UNUSED_${i + 1}`,
    ]),
  );
  return (
    <chip
      {...props}
      name={name}
      manufacturerPartNumber={definition.mpn}
      pinLabels={pinLabels}
      noConnect={Array.from(
        { length: definition.circuits - 2 },
        (_, i) => `UNUSED_${i + 3}`,
      )}
      datasheetUrl={physical.source.url}
      footprint={<ThtFootprint pattern={pattern} physicalDeclaration={physical} />}
      kicadFootprintMetadata={{ footprintName: pattern.id }}
    />
  );
}
