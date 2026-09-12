import type { CapacitorProps, ChipProps, ResistorProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "../../controller/design/tht-footprint";
import type { PhysicalLandPattern } from "../../controller/design/land-pattern-physical";

// Component-side coordinates, +Y down. Axial lead pitches are project forming
// choices; the unformed manufacturer body drawings do not specify PCB pitches.
export const flybackPattern: ThtPattern = {
  id: "CrystalShim:1N4007_DO41_P10_16",
  pads: [
    {
      number: "1",
      x: 0,
      y: 0,
      drill: 1.1,
      width: 2.6,
      height: 2.6,
      shape: "roundrect",
      cornerRadius: 0,
    },
    {
      number: "2",
      x: 10.16,
      y: 0,
      drill: 1.1,
      width: 2.6,
      height: 2.6,
      shape: "circle",
    },
  ],
};
export const snubberResistorPattern: ThtPattern = {
  id: "CrystalShim:PR02FS_P15_24",
  pads: [
    { number: "1", x: 0, y: 0, drill: 1.1, width: 2.6, height: 2.6, shape: "circle" },
    {
      number: "2",
      x: 15.24,
      y: 0,
      drill: 1.1,
      width: 2.6,
      height: 2.6,
      shape: "circle",
    },
  ],
};
export const snubberCapacitorPattern: ThtPattern = {
  id: "CrystalShim:B32921C3473K000_P10",
  pads: [
    { number: "1", x: 0, y: 0, drill: 1.3, width: 2.9, height: 2.9, shape: "circle" },
    { number: "2", x: 10, y: 0, drill: 1.3, width: 2.9, height: 2.9, shape: "circle" },
  ],
};

const mask = {
  expansion: 0.05,
  basis: "Project PTH opening allowance; mask is not mains insulation.",
};
export const flybackPhysical: PhysicalLandPattern = {
  packageCenter: { x: 5.08, y: 0 },
  body: {
    width: 5.2,
    height: 2.7,
    thicknessMax: 2.7,
    basis:
      "Maximum DO-204AL body length and diameter; height excludes assembly standoff.",
  },
  envelope: {
    width: 11.02,
    height: 2.7,
    basis:
      "Project 10.16 mm lead centres plus maximum 0.86 mm lead diameter. Forming and standoff need assembly review.",
  },
  solderMask: mask,
  nativeAssembly: {
    paste:
      "Hand-solder after reflow; no stencil apertures. Pin 1 is cathode and the square land must match the body band. Use 1.1 +/-0.1 mm finished holes, not drill-tool diameter.",
    thermal:
      "Low-voltage coil suppression only. Keep this entire part inside the isolated area; cathode to V5_PSU, anode to COIL_DRAIN. Confirm final coil release time with the installed diode.",
  },
  source: {
    url: "https://www.vishay.com/docs/88503/1n4001.pdf",
    sha256: "56a77c6615c90c11993d37d94e67f335cf3a2d1fe00f25d2a1a4833834356d07",
    drawing:
      "Document 88503 revision 29-Apr-2020, PDF p4 DO-204AL. Body 4.1..5.2 x diameter 2.0..2.7 mm; standard leads 0.71..0.86 mm. Do not assume the -E3 finish denotes the special thin-lead suffix E. /54 is tape-and-reel.",
  },
};
export const snubberResistorPhysical: PhysicalLandPattern = {
  packageCenter: { x: 7.62, y: 0 },
  body: {
    width: 10,
    height: 3.9,
    thicknessMax: 3.9,
    basis:
      "Manufacturer L1 maximum and body diameter; height excludes assembly standoff.",
  },
  envelope: {
    width: 16.07,
    height: 3.9,
    basis:
      "Project 15.24 mm lead centres plus 0.83 mm maximum wire diameter; includes the separate 12 mm maximum coating extent L2. Confirm lead forming beyond coating without stressing the body.",
  },
  solderMask: mask,
  nativeAssembly: {
    paste:
      "Hand-solder after reflow; no stencil apertures. 1.1 +/-0.1 mm finished holes accommodate 0.78 +/-0.05 mm leads. The 15.24 mm project pitch is not a manufacturer forming recommendation.",
    thermal:
      "Primary-side 100 ohm 2 W flameproof non-inductive snubber resistor. Reserve heat clearance and underside lead clearance; waveform and thermal acceptance remain final-unit tests.",
  },
  source: {
    url: "https://www.vishay.com/docs/28915/pr02fs.pdf",
    sha256: "048a69c3c55dd3be3830586620d25cab23bcde74f2f6696fbd9807a84a512874",
    drawing:
      "Document 28915 revision 22-Oct-2024, PDF p7: L1 10.0 max, coating L2 12.0 max, diameter 3.9 max, wire 0.78 +/-0.05 mm. Exact selected ordering code PR02FS0201000KA100 is 100 ohm +/-10%, 2 W.",
  },
};
export const snubberCapacitorPhysical: PhysicalLandPattern = {
  packageCenter: { x: 5, y: 0 },
  body: {
    width: 13,
    height: 5,
    thicknessMax: 11,
    basis:
      "Maximum body for the exact 47 nF B32921C3473K000; straight leads and 10 mm pitch.",
  },
  envelope: {
    width: 13,
    height: 5,
    basis:
      "Installed part body. Separately reserve 13 x 6 mm and 12 mm body height for the documented up-to-100 nF alternative; that alternative is not populated.",
  },
  solderMask: mask,
  nativeAssembly: {
    paste:
      "Hand-solder after reflow; no stencil apertures. Straight leads 6 -1 mm long, 0.60 +/-0.05 mm diameter, pitch 10 +/-0.4 mm. Project 1.3 +/-0.1 mm finished holes permit lead-pitch variation; include board hole-position tolerance in fit review and never force the body.",
    thermal:
      "305 VAC X2 suppression part on primary side. Maintain mains conductor clearances around both lands; film safety approval does not approve the complete board. Keep away from hot resistor and MOV regions.",
  },
  source: {
    url: "https://www.tdk-electronics.tdk.com/inf/20/20/db/fc_2009/X2_B32921_928.pdf",
    sha256: "241e2f31011f45e43d9f62a6655f6f9357e4317789ead2eea4750ee6c0c32f0c",
    drawing:
      "June 2026, PDF p2 straight-lead drawing and p5 305 VAC ordering table. 47 nF: 13 x 5 x 11 mm maximum. Suffix 000 is untaped; do not substitute the kinked or taped drawing.",
  },
};

type Fixed<T> = Omit<
  T,
  | "manufacturerPartNumber"
  | "mfn"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
>;
export const flybackPins = { pin1: "K", pin2: "A" } as const;
export function CoilFlyback(
  props: Omit<
    Fixed<ChipProps<typeof flybackPins>>,
    "pinLabels" | "internallyConnectedPins"
  >,
) {
  return (
    <chip
      {...props}
      pinLabels={flybackPins}
      manufacturerPartNumber="1N4007-E3/54"
      datasheetUrl={flybackPhysical.source.url}
      footprint={
        <ThtFootprint pattern={flybackPattern} physicalDeclaration={flybackPhysical} />
      }
      kicadFootprintMetadata={{ footprintName: flybackPattern.id }}
    />
  );
}
export function SnubberResistor(props: Omit<Fixed<ResistorProps>, "resistance">) {
  return (
    <resistor
      {...props}
      resistance="100"
      manufacturerPartNumber="PR02FS0201000KA100"
      datasheetUrl={snubberResistorPhysical.source.url}
      footprint={
        <ThtFootprint
          pattern={snubberResistorPattern}
          physicalDeclaration={snubberResistorPhysical}
        />
      }
      kicadFootprintMetadata={{ footprintName: snubberResistorPattern.id }}
    />
  );
}
export function SnubberCapacitor(
  props: Omit<Fixed<CapacitorProps>, "capacitance" | "maxVoltageRating" | "polarized">,
) {
  return (
    <capacitor
      {...props}
      capacitance="47nF"
      maxVoltageRating="305V"
      polarized={false}
      manufacturerPartNumber="B32921C3473K000"
      datasheetUrl={snubberCapacitorPhysical.source.url}
      footprint={
        <ThtFootprint
          pattern={snubberCapacitorPattern}
          physicalDeclaration={snubberCapacitorPhysical}
        />
      }
      kicadFootprintMetadata={{ footprintName: snubberCapacitorPattern.id }}
    />
  );
}
