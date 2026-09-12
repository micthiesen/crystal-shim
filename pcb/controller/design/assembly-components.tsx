import type { ChipProps, InductorProps } from "@tscircuit/props";
import type { LandPattern } from "./ic-land-patterns";
import { LandPatternFootprint } from "./land-pattern";
import { ThtFootprint, type ThtPattern } from "./tht-footprint";

export const buckInductorPattern: LandPattern = {
  id: "CrystalShim:SRP5030TA",
  body: { width: 5.3, height: 5.2 },
  pads: [
    { number: "1", x: -2.25, y: 0, width: 2, height: 1.8 },
    { number: "2", x: 2.25, y: 0, width: 2, height: 1.8 },
  ],
  source: {
    url: "https://www.bourns.com/docs/product-datasheets/srp5030ta.pdf",
    sha256: "4a4ce681e20e29b4b888dc3a783f7e30eb7a75541f16591b2c1da921b26c7e32",
    drawing:
      "p1 recommended layout: outer span 6.5, inner gap 2.5, pad width 1.8 mm. Body maximum envelope 6.0 x 5.4 x 3.0 mm. Stock L_Bourns_SRP5030T shares centres and sizes but rounds the corners by 0.25 mm; source adopts the manufacturer's rectangular example under a custom ID.",
  },
};

export const statusLedPattern: ThtPattern = {
  id: "LED_THT:LED_D3.0mm",
  pads: [
    {
      number: "1",
      x: 0,
      y: 0,
      drill: 0.9,
      width: 1.8,
      height: 1.8,
      shape: "roundrect",
      cornerRadius: 0,
    },
    {
      number: "2",
      x: 2.54,
      y: 0,
      drill: 0.9,
      width: 1.8,
      height: 1.8,
      shape: "circle",
    },
  ],
};
export const buttonPattern: ThtPattern = {
  id: "Button_Switch_THT:SW_PUSH_6mm_H4.3mm",
  pads: [
    { number: "1", x: 0, y: 0, drill: 1.1, width: 2, height: 2, shape: "circle" },
    { number: "1", x: 6.5, y: 0, drill: 1.1, width: 2, height: 2, shape: "circle" },
    { number: "2", x: 0, y: 4.5, drill: 1.1, width: 2, height: 2, shape: "circle" },
    { number: "2", x: 6.5, y: 4.5, drill: 1.1, width: 2, height: 2, shape: "circle" },
  ],
};

type InductorOptions = Omit<
  InductorProps,
  | "inductance"
  | "manufacturerPartNumber"
  | "mfn"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
>;
export function BuckInductor(props: InductorOptions) {
  return (
    <inductor
      {...props}
      inductance="4.7uH"
      manufacturerPartNumber="SRP5030TA-4R7M"
      datasheetUrl={buckInductorPattern.source.url}
      footprint={<LandPatternFootprint pattern={buckInductorPattern} />}
      kicadFootprintMetadata={{ footprintName: buckInductorPattern.id }}
    />
  );
}

export const statusLedPins = { pin1: "K", pin2: "A" } as const;
export const buttonPins = { pin1: "CONTACT_A", pin2: "CONTACT_B" } as const;
type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
>;

// The native origin is cathode pad 1. Hand-solder this LED AFTER reflow.
export function StatusLed(props: PartProps<typeof statusLedPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="WP710A10LGD"
      pinLabels={statusLedPins}
      datasheetUrl="https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf"
      footprint={<ThtFootprint pattern={statusLedPattern} />}
      kicadFootprintMetadata={{ footprintName: statusLedPattern.id }}
    />
  );
}

// Native pad 1 joins Omron terminals 3/4; pad 2 joins terminals 1/2.
// The repeated lands are permanent pairs; pressing connects the two pairs.
export function ControllerButton(props: PartProps<typeof buttonPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="B3F-1002-G"
      pinLabels={buttonPins}
      datasheetUrl="https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3f.pdf"
      footprint={<ThtFootprint pattern={buttonPattern} />}
      kicadFootprintMetadata={{ footprintName: buttonPattern.id }}
    />
  );
}
