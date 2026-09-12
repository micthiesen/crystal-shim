import type { CapacitorProps, ResistorProps } from "@tscircuit/props";
import { LandPatternFootprint } from "./land-pattern";
import { panasonic0603, tdk100nf, tdk1uf, murata22uf } from "./passive-land-patterns";

// Selecting a value selects its already reviewed exact ordering code as well.
export const controllerResistors = {
  "22": "ERJ3EKF22R0V",
  "100": "ERA3AEB101V",
  "330": "ERA3AEB331V",
  "680": "ERA3AEB681V",
  "1k": "ERA3AEB102V",
  "2.7k": "ERA3AEB272V",
  "5.1k": "ERA3AEB512V",
  "10k": "ERA3AEB103V",
  "95.3k": "ERA3AEB9532V",
  "100k": "ERA3AEB104V",
} as const;

type ResistorOptions = Omit<
  ResistorProps,
  | "resistance"
  | "manufacturerPartNumber"
  | "mfn"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
> & { value: keyof typeof controllerResistors };

export function ControllerResistor({ value, ...props }: ResistorOptions) {
  return (
    <resistor
      {...props}
      resistance={value}
      manufacturerPartNumber={controllerResistors[value]}
      datasheetUrl={panasonic0603.source.url}
      footprint={<LandPatternFootprint pattern={panasonic0603} />}
      kicadFootprintMetadata={{ footprintName: panasonic0603.id }}
    />
  );
}

export const controllerCapacitors = {
  "100nF": { mpn: "C1608X7R1H104K080AA", pattern: tdk100nf, voltage: "50V" },
  "1uF": { mpn: "C2012X7R1E105K125AB", pattern: tdk1uf, voltage: "25V" },
  "22uF": { mpn: "GRM32ER71E226ME15L", pattern: murata22uf, voltage: "25V" },
} as const;

type CapacitorOptions = Omit<
  CapacitorProps,
  | "capacitance"
  | "manufacturerPartNumber"
  | "mfn"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
  | "maxVoltageRating"
  | "polarized"
> & { value: keyof typeof controllerCapacitors };

export function ControllerCapacitor({ value, ...props }: CapacitorOptions) {
  const part = controllerCapacitors[value];
  return (
    <capacitor
      {...props}
      capacitance={value}
      maxVoltageRating={part.voltage}
      polarized={false}
      manufacturerPartNumber={part.mpn}
      datasheetUrl={part.pattern.source.url}
      footprint={<LandPatternFootprint pattern={part.pattern} />}
      kicadFootprintMetadata={{ footprintName: part.pattern.id }}
    />
  );
}
