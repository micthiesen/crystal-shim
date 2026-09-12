import type { ChipProps } from "@tscircuit/props";
import { dbv5, dbv6, fsusb42 } from "./logic-land-patterns";
import { LandPatternFootprint } from "./land-pattern";

export const supervisorPins = {
  pin1: "RESET_N",
  pin2: "GND",
  pin3: "MR_N",
  pin4: "CT",
  pin5: "SENSE",
  pin6: "VDD",
} as const;
export const sensorFeedPins = {
  pin1: "IN",
  pin2: "GND",
  pin3: "EN",
  pin4: "FAULT_N",
  pin5: "ILIM",
  pin6: "OUT",
} as const;
export const relayGatePins = {
  pin1: "A",
  pin2: "B",
  pin3: "GND",
  pin4: "Y",
  pin5: "VCC",
} as const;
export const usbDetectPins = {
  pin1: "NC",
  pin2: "A",
  pin3: "GND",
  pin4: "Y",
  pin5: "VCC",
} as const;
export const usbSwitchPins = {
  pin1: "VCC",
  pin2: "SEL",
  pin3: "D_P",
  pin4: "D_N",
  pin5: "GND",
  pin6: "HSD1_N",
  pin7: "HSD1_P",
  pin8: "HSD2_N",
  pin9: "HSD2_P",
  pin10: "OE_N",
} as const;

type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  "manufacturerPartNumber" | "pinLabels" | "footprint" | "datasheetUrl"
>;

export function PsuSupervisor(props: PartProps<typeof supervisorPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TPS3808G01DBVR"
      pinLabels={supervisorPins}
      datasheetUrl={dbv6.source.url}
      footprint={<LandPatternFootprint pattern={dbv6} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TI_DBV6" }}
    />
  );
}
export function SensorPowerFeed(props: PartProps<typeof sensorFeedPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TPS2553DBVR"
      pinLabels={sensorFeedPins}
      datasheetUrl="https://www.ti.com/lit/ds/symlink/tps2553.pdf"
      footprint={<LandPatternFootprint pattern={dbv6} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TI_DBV6" }}
    />
  );
}
export function RelayPermissionGate(props: PartProps<typeof relayGatePins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SN74LVC1G08DBVR"
      pinLabels={relayGatePins}
      datasheetUrl={dbv5.source.url}
      footprint={<LandPatternFootprint pattern={dbv5} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TI_DBV5" }}
    />
  );
}
export function UsbPresenceDetector(props: PartProps<typeof usbDetectPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SN74LVC1G14DBVR"
      pinLabels={usbDetectPins}
      datasheetUrl="https://www.ti.com/lit/ds/symlink/sn74lvc1g14.pdf"
      footprint={<LandPatternFootprint pattern={dbv5} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:TI_DBV5" }}
      noConnect={["NC", ...(props.noConnect ?? [])]}
    />
  );
}
export function UsbDataSwitch(props: PartProps<typeof usbSwitchPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="FSUSB42MUX"
      pinLabels={usbSwitchPins}
      datasheetUrl={fsusb42.source.url}
      footprint={<LandPatternFootprint pattern={fsusb42} />}
      kicadFootprintMetadata={{ footprintName: "CrystalShim:FSUSB42_MSOP10" }}
    />
  );
}
