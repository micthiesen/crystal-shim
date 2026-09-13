import { Fragment } from "react";
import type { ChipProps } from "@tscircuit/props";
import { sensorHeaderPins } from "../../controller/design/micro-fit-components";
// Hand-soldered outward-face lands; no through holes or glass-facing solder tails.
export function SensorPigtail(props: ChipProps<typeof sensorHeaderPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="PCB-SENSOR-PIGTAIL-6"
      pinLabels={sensorHeaderPins}
      kicadFootprintMetadata={{ footprintName: "CrystalShim_Sensor:Sensor_Pigtail_6" }}
      footprint={
        <footprint>
          {Array.from({ length: 6 }, (_, i) => (
            <Fragment key={i}>
              <smtpad
                portHints={[`pin${i + 1}`]}
                shape="rect"
                pcbX={0}
                pcbY={7.5 - i * 3}
                width={3}
                height={2}
                layer="top"
                solderPasteMargin={-100}
              />
            </Fragment>
          ))}
        </footprint>
      }
    />
  );
}
