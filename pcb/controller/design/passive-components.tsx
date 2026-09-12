import type { CapacitorProps, ResistorProps } from "@tscircuit/props";
import { LandPatternFootprint } from "./land-pattern";
import {
  panasonic0603,
  panasonic0805,
  tdkC1608,
  tdk1uf,
  tdk10uf,
  vishay2512hp,
  murata22uf,
} from "./passive-land-patterns";

// Selecting a value selects its already reviewed exact ordering code as well.
export const controllerResistors = {
  "6.8": { mpn: "CRCW25126R80FKEGHP", pattern: vishay2512hp },
  "22": { mpn: "ERJ3EKF22R0V", pattern: panasonic0603 },
  "100": { mpn: "ERA3AEB101V", pattern: panasonic0603 },
  "330": { mpn: "ERA3AEB331V", pattern: panasonic0603 },
  "680": { mpn: "ERA3AEB681V", pattern: panasonic0603 },
  "1k": { mpn: "ERA3AEB102V", pattern: panasonic0603 },
  "2.2k": { mpn: "ERA6AEB222V", pattern: panasonic0805 },
  "2.7k": { mpn: "ERA3AEB272V", pattern: panasonic0603 },
  "2.87k": { mpn: "ERA3AEB2871V", pattern: panasonic0603 },
  "5.1k": { mpn: "ERA3AEB512V", pattern: panasonic0603 },
  "10k": { mpn: "ERA3AEB103V", pattern: panasonic0603 },
  "26.1k": { mpn: "ERA3AEB2612V", pattern: panasonic0603 },
  "38.3k": { mpn: "ERA3AEB3832V", pattern: panasonic0603 },
  "95.3k": { mpn: "ERA3AEB9532V", pattern: panasonic0603 },
  "100k": { mpn: "ERA3AEB104V", pattern: panasonic0603 },
  "470k": { mpn: "ERA6AEB474V", pattern: panasonic0805 },
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
  const part = controllerResistors[value];
  return (
    <resistor
      {...props}
      resistance={value}
      manufacturerPartNumber={part.mpn}
      datasheetUrl={part.pattern.source.url}
      footprint={<LandPatternFootprint pattern={part.pattern} />}
      kicadFootprintMetadata={{ footprintName: part.pattern.id }}
    />
  );
}

export const controllerCapacitors = {
  "4.7nF": {
    mpn: "C1608C0G1H472J080AA",
    pattern: tdkC1608,
    voltage: "50V",
    datasheetUrl:
      "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608c0g1h472j080aa.pdf",
  },
  "100nF": {
    mpn: "C1608X7R1H104K080AA",
    pattern: tdkC1608,
    voltage: "50V",
    datasheetUrl:
      "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608x7r1h104k080aa.pdf",
  },
  "1uF": {
    mpn: "C2012X7R1E105K125AB",
    pattern: tdk1uf,
    voltage: "25V",
    datasheetUrl: tdk1uf.source.url,
  },
  "22uF": {
    mpn: "GRM32ER71E226ME15L",
    pattern: murata22uf,
    voltage: "25V",
    datasheetUrl: murata22uf.source.url,
  },
  "10uF": {
    mpn: "C3216X7R1E106K160AB",
    pattern: tdk10uf,
    voltage: "25V",
    datasheetUrl:
      "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf",
  },
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
      datasheetUrl={part.datasheetUrl}
      footprint={<LandPatternFootprint pattern={part.pattern} />}
      kicadFootprintMetadata={{ footprintName: part.pattern.id }}
    />
  );
}
