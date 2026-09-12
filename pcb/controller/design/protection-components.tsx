import type { ChipProps } from "@tscircuit/props";
import { LandPatternFootprint } from "./land-pattern";
import { stps2l40u, usblc6_2sc6 } from "./protection-land-patterns";

export const powerSchottkyPins = { pin1: "K", pin2: "A" } as const;

export const usbEsdPins = {
  pin1: "IO1_1",
  pin2: "GND",
  pin3: "IO2_3",
  pin4: "IO2_4",
  pin5: "VBUS",
  pin6: "IO1_6",
} as const;

type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  | "manufacturerPartNumber"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "internallyConnectedPins"
  | "kicadFootprintMetadata"
>;

export function PowerSchottky(props: PartProps<typeof powerSchottkyPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="STPS2L40U"
      pinLabels={powerSchottkyPins}
      datasheetUrl="https://www.st.com/resource/en/datasheet/stps2l40.pdf"
      footprint={<LandPatternFootprint pattern={stps2l40u} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:STPS2L40U_SMB" }}
    />
  );
}

export function UsbEsdProtection(props: PartProps<typeof usbEsdPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="USBLC6-2SC6"
      pinLabels={usbEsdPins}
      datasheetUrl="https://www.st.com/resource/en/datasheet/usblc6-2.pdf"
      footprint={<LandPatternFootprint pattern={usblc6_2sc6} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:USBLC6_2SC6_SOT23_6L" }}
      // Only the straight-through data paths are hard-connected. The steering
      // diodes and VBUS clamp do not short either data lane to a supply rail.
      internallyConnectedPins={[
        ["pin1", "pin6"],
        ["pin3", "pin4"],
      ]}
    />
  );
}
