import { Fragment } from "react";
// Absolute rim coordinates as seen through glass: x right, y down. B.Cu stays
// B.Cu when mirrored to outward view; all copper remains mask-covered.
export const electrodeRectangles = [
  ["sen_oop_level", 4, "bottom", 1.8, 8.15, 0, 50],
  ["sen_level", 1, "bottom", 11.15, 17.5, 0, 50],
  ["sen_rl", 2, "bottom", 20.5, 26.85, 52, 62],
  ["sen_oop_rl", 4, "bottom", 29.85, 36.2, 52, 62],
  ["trace_rl_vertical", 2, "bottom", 18.775, 18.925, 0, 57.075],
  ["trace_rl_horizontal", 2, "bottom", 18.775, 20.575, 56.925, 57.075],
  ["shield2_level_back", 4, "top", 0.8, 9.15, 0, 62],
  ["shield1_level_back", 3, "top", 10.15, 18.5, 0, 62],
  ["shield1_ref_back", 3, "top", 19.5, 27.85, 0, 62],
  ["shield2_ref_back", 4, "top", 28.85, 37.2, 0, 62],
  ["shield1_rl_trace_vertical", 3, "top", 18.65, 19.05, 0, 57.2],
  ["shield1_rl_trace_horizontal", 3, "top", 18.65, 20.7, 56.8, 57.2],
  ["trace_oop_rl_vertical", 4, "bottom", 32.95, 33.1, 0, 52.075],
] as const;
export const electrodeNets = ["", "CIN_LEVEL", "CIN_RL", "SHLD1", "SHLD2"] as const;
export const electrodePins = Object.fromEntries(
  electrodeRectangles.map(([id], i) => [`pin${i + 1}`, id]),
);
export function Electrodes() {
  return (
    <chip
      name="E1"
      manufacturerPartNumber="PCB-COPPER-OOP-50"
      pinLabels={electrodePins}
      pcbX={0}
      pcbY={-10}
      pcbRotation={0}
      schX={13}
      schY={-7}
      schSheetName="TankSensor"
      kicadFootprintMetadata={{ footprintName: "CrystalShim_Sensor:Tank_Electrodes" }}
      connections={Object.fromEntries(
        electrodeRectangles.map(([id, pin]) => [id, `net.${electrodeNets[pin]}`]),
      )}
      footprint={
        <footprint>
          {electrodeRectangles.map(([id, _pin, layer, x0, x1, y0, y1], i) => (
            <Fragment key={id}>
              <smtpad
                name={id}
                portHints={[`pin${i + 1}`]}
                layer={layer}
                shape="rect"
                pcbX={19 - (x0 + x1) / 2}
                pcbY={31 - (y0 + y1) / 2}
                width={x1 - x0}
                height={y1 - y0}
                coveredWithSolderMask
                solderPasteMargin={-100}
              />
            </Fragment>
          ))}
        </footprint>
      }
    />
  );
}
