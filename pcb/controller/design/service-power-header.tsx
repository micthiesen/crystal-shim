import type { ChipProps } from "@tscircuit/props";
import { ThtFootprint, type ThtPattern } from "./tht-footprint";

// Exact installed KiCad JST geometry, pin-one origin, native +Y mating direction.
// 1.0 mm drill is the upper end of JST's 0.9 +0.1 mm PCB-hole specification.
export const servicePowerHeaderPattern: ThtPattern = {
  id: "Connector_JST:JST_XH_S2B-XH-A_1x02_P2.50mm_Horizontal",
  pads: [
    {
      number: "1",
      x: 0,
      y: 0,
      drill: 1,
      width: 1.7,
      height: 2,
      shape: "roundrect",
      cornerRadius: 0.25,
    },
    { number: "2", x: 2.5, y: 0, drill: 1, width: 1.7, height: 2, shape: "oval" },
  ],
};
export const servicePowerHeaderPins = { pin1: "POSITIVE", pin2: "RETURN" } as const;
export const servicePowerHeaderDatasheet =
  "https://www.jst.com/wp-content/uploads/2025/06/eXH.pdf";

type Props = Omit<
  ChipProps<typeof servicePowerHeaderPins>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
>;
export function ServicePowerHeader(props: Props) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="S2B-XH-A"
      pinLabels={servicePowerHeaderPins}
      datasheetUrl={servicePowerHeaderDatasheet}
      footprint={<ThtFootprint pattern={servicePowerHeaderPattern} />}
      kicadFootprintMetadata={{ footprintName: servicePowerHeaderPattern.id }}
    />
  );
}
