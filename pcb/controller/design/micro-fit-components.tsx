import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "./tht-footprint";

// Exact installed KiCad 10.0.5 copper/hole geometry. Manufacturer component-side
// numbering is 1/2/3 then 4/5/6, never generic odd/even two-row numbering.
// The native origin is pin 1; it is intentionally not the component body centre.
export const sensorHeaderPattern: ThtPattern = {
  id: "Connector_Molex:Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal",
  pads: Array.from({ length: 6 }, (_, i) => ({
    number: String(i + 1),
    x: (i % 3) * 3,
    y: Math.floor(i / 3) * 3,
    drill: 1.02,
    width: 1.5,
    height: 1.5,
    shape: i === 0 ? "roundrect" : "circle",
    cornerRadius: i === 0 ? 0.25 : undefined,
  })),
  holes: [{ x: 3, y: -4.32, diameter: 3 }],
};
export const serviceHeaderPattern: ThtPattern = {
  id: "Connector_Molex:Molex_Micro-Fit_3.0_43045-0200_2x01_P3.00mm_Horizontal",
  pads: [
    {
      number: "1",
      x: 0,
      y: 0,
      drill: 1.02,
      width: 1.5,
      height: 1.5,
      shape: "roundrect",
      cornerRadius: 0.25,
    },
    { number: "2", x: 0, y: 3, drill: 1.02, width: 1.5, height: 1.5, shape: "circle" },
  ],
  holes: [{ x: 0, y: -4.32, diameter: 3 }],
};
export const psuHeaderPattern: ThtPattern = {
  id: "Connector_Molex:Molex_Micro-Fit_3.0_43650-0300_1x03_P3.00mm_Horizontal",
  pads: [
    {
      number: "1",
      x: 0,
      y: 0,
      drill: 1.02,
      width: 1.5,
      height: 2.02,
      shape: "roundrect",
      cornerRadius: 0.25,
    },
    { number: "2", x: 3, y: 0, drill: 1.02, width: 1.5, height: 2.02, shape: "oval" },
    { number: "3", x: 6, y: 0, drill: 1.02, width: 1.5, height: 2.02, shape: "oval" },
  ],
  holes: [{ x: 3, y: -4.32, diameter: 3 }],
};

export const microFitEvidence = {
  sensor: {
    installedSha256: "1189d97f82d7fb3431677e14c083aca02bb7d19cf70b3b44453348b7371d963d",
    url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf",
  },
  service: {
    installedSha256: "8e925c4f589c229e874438e65821325e6f912a3852dc7341d6539d24986eed66",
    url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450200_sd.pdf",
  },
  psu: {
    installedSha256: "6b669b0fab1c154bd32124d3f453b52a4dbb4ff697b7aab6dffc95fbbf582d76",
    url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf",
  },
} as const;

export const sensorHeaderPins = {
  pin1: "V5_SENSOR",
  pin2: "SDA_CABLE",
  pin3: "SCL_CABLE",
  pin4: "GND_4",
  pin5: "GND_5",
  pin6: "GND_6",
} as const;
export const serviceHeaderPins = { pin1: "POSITIVE", pin2: "RETURN" } as const;
export const psuHeaderPins = {
  pin1: "V5_PSU",
  pin2: "GND",
  pin3: "COIL_DRAIN",
} as const;

type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
>;
export function SensorHeader(props: PartProps<typeof sensorHeaderPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="43045-0600"
      pinLabels={sensorHeaderPins}
      datasheetUrl={microFitEvidence.sensor.url}
      footprint={<ThtFootprint pattern={sensorHeaderPattern} />}
      kicadFootprintMetadata={{ footprintName: sensorHeaderPattern.id }}
    />
  );
}
export function ServiceHeader(props: PartProps<typeof serviceHeaderPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="43045-0200"
      pinLabels={serviceHeaderPins}
      datasheetUrl={microFitEvidence.service.url}
      footprint={<ThtFootprint pattern={serviceHeaderPattern} />}
      kicadFootprintMetadata={{ footprintName: serviceHeaderPattern.id }}
    />
  );
}
export function PsuHeader(props: PartProps<typeof psuHeaderPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="43650-0300"
      pinLabels={psuHeaderPins}
      datasheetUrl={microFitEvidence.psu.url}
      footprint={<ThtFootprint pattern={psuHeaderPattern} />}
      kicadFootprintMetadata={{ footprintName: psuHeaderPattern.id }}
    />
  );
}
