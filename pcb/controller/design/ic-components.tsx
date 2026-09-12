import type { ChipProps } from "@tscircuit/props";
import { ap63203, ao3400a, tca9517a } from "./ic-land-patterns";
import { LandPatternFootprint } from "./land-pattern";

export const buckPins = {
  pin1: "FB",
  pin2: "EN",
  pin3: "VIN",
  pin4: "GND",
  pin5: "SW",
  pin6: "BST",
} as const;
export const relayMosfetPins = { pin1: "G", pin2: "S", pin3: "D" } as const;
export const sensorBufferPins = {
  pin1: "VCCA",
  pin2: "SCLA",
  pin3: "SDAA",
  pin4: "GND",
  pin5: "EN",
  pin6: "SDAB",
  pin7: "SCLB",
  pin8: "VCCB",
} as const;

type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  "manufacturerPartNumber" | "pinLabels" | "footprint" | "datasheetUrl"
>;

export function ControllerBuck(props: PartProps<typeof buckPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="AP63203WU-7"
      pinLabels={buckPins}
      datasheetUrl={ap63203.source.url}
      footprint={<LandPatternFootprint pattern={ap63203} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:AP63203_TSOT26" }}
    />
  );
}

export function RelayMosfet(props: PartProps<typeof relayMosfetPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="AO3400A"
      pinLabels={relayMosfetPins}
      datasheetUrl="https://www.aosmd.com/res/data_sheets/AO3400A.pdf"
      footprint={<LandPatternFootprint pattern={ao3400a} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:AO3400A_SOT23" }}
    />
  );
}

export function SensorBusBuffer(props: PartProps<typeof sensorBufferPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TCA9517ADGKR"
      pinLabels={sensorBufferPins}
      datasheetUrl={tca9517a.source.url}
      footprint={<LandPatternFootprint pattern={tca9517a} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TCA9517A_DGK8" }}
    />
  );
}
