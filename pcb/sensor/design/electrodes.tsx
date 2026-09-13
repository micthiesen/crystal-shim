import { Fragment } from "react";
// Glass-facing coordinates: x right, y down from PCB top. Top is 2 mm below rim.
// Slots interrupt only the common-net faces; they are not independent channels.
type ElectrodeRectangle = readonly [
  string,
  number,
  "bottom" | "inner2",
  number,
  number,
  number,
  number,
];
export const electrodeRectangles: readonly ElectrodeRectangle[] = [
  ...Array.from({ length: 10 }, (_, i): ElectrodeRectangle => [
    `level_bar_${i + 1}`,
    1,
    "bottom",
    1.15,
    7.5,
    1 + i * 5.05,
    5.55 + i * 5.05,
  ]),
  ...Array.from({ length: 10 }, (_, i): ElectrodeRectangle => [
    `oop_bar_${i + 1}`,
    4,
    "bottom",
    10.5,
    16.85,
    1 + i * 5.05,
    5.55 + i * 5.05,
  ]),
  ["level_spine", 1, "bottom", 1.15, 1.3, 1, 51],
  ["oop_spine", 4, "bottom", 16.7, 16.85, 1, 63],
  ["sen_rl", 2, "bottom", 1.15, 7.5, 53, 63],
  ["sen_oop_rl", 4, "bottom", 10.5, 16.85, 53, 63],
  ["trace_rl_vertical", 2, "bottom", 8.925, 9.075, 1, 58.075],
  ["trace_rl_horizontal", 2, "bottom", 7.425, 9.075, 57.925, 58.075],
  ["shield1_back", 3, "inner2", 0.65, 8, 0.5, 51],
  ["shield1_ref_back", 3, "inner2", 0.65, 8, 51, 63.5],
  ["shield2_back", 4, "inner2", 10, 17.35, 0.5, 51],
  ["shield2_ref_back", 4, "inner2", 10, 17.35, 51, 63.5],
  ["shield1_rl_trace", 3, "inner2", 8.85, 9.15, 0.5, 58.275],
  ["shield1_rl_link", 3, "inner2", 7.725, 9.275, 57.725, 58.275],
];
export const electrodeNets = ["", "CIN_LEVEL", "CIN_RL", "SHLD1", "SHLD2"] as const;
// Preserve the accepted thirteen schematic terminals. Multiple physical bars
// belong to the same terminal; pin numbering never implies separate channels.
export const electrodeTerminals = [
  ["sen_oop_level", 4],
  ["sen_level", 1],
  ["sen_rl", 2],
  ["sen_oop_rl", 4],
  ["trace_rl_vertical", 2],
  ["trace_rl_horizontal", 2],
  ["shield2_level_back", 4],
  ["shield1_level_back", 3],
  ["shield1_ref_back", 3],
  ["shield2_ref_back", 4],
  ["shield1_rl_trace_vertical", 3],
  ["shield1_rl_trace_horizontal", 3],
  ["trace_oop_rl_vertical", 4],
] as const;
export const electrodePadNumbers = electrodeRectangles.map(([id]) => {
  if (id.startsWith("level_bar_") || id === "level_spine") return 2;
  if (id.startsWith("oop_bar_")) return 1;
  const numbers: Record<string, number> = {
    oop_spine: 13,
    sen_rl: 3,
    sen_oop_rl: 4,
    trace_rl_vertical: 5,
    trace_rl_horizontal: 6,
    shield1_back: 8,
    shield1_ref_back: 9,
    shield2_back: 7,
    shield2_ref_back: 10,
    shield1_rl_trace: 11,
    shield1_rl_link: 12,
  };
  const number = numbers[id];
  if (!number) throw new Error(`Missing electrode terminal: ${id}`);
  return number;
});
export const electrodePins = Object.fromEntries(
  electrodeTerminals.map(([id], i) => [`pin${i + 1}`, id]),
);
export function Electrodes() {
  return (
    <chip
      name="E1"
      manufacturerPartNumber="PCB-COPPER-OOP-50"
      pinLabels={electrodePins}
      pcbX={0}
      pcbY={0}
      pcbRotation={0}
      schX={13}
      schY={-7}
      schSheetName="TankSensor"
      kicadFootprintMetadata={{ footprintName: "CrystalShim_Sensor:Tank_Electrodes" }}
      connections={Object.fromEntries(
        electrodeTerminals.map(([id, pin]) => [id, `net.${electrodeNets[pin]}`]),
      )}
      footprint={
        <footprint>
          {electrodeRectangles.map(([id, _pin, layer, x0, x1, y0, y1], i) => (
            <Fragment key={id}>
              <smtpad
                name={id}
                portHints={[`pin${electrodePadNumbers[i]}`]}
                layer={layer}
                shape="rect"
                pcbX={9 - (x0 + x1) / 2}
                pcbY={32 - (y0 + y1) / 2}
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
