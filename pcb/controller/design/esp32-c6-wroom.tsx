import type { ChipProps } from "@tscircuit/props";
import { LandPatternFootprint } from "./land-pattern";
import type { LandPattern } from "./ic-land-patterns";

// Espressif datasheet v1.4, Table 3-1. These are MODULE pad numbers.
export const wroomPins = {
  pin1: "GND_1",
  pin2: "V3V3",
  pin3: "EN",
  pin4: "IO4",
  pin5: "IO5",
  pin6: "IO6",
  pin7: "IO7",
  pin8: "IO0",
  pin9: "IO1",
  pin10: "IO8",
  pin11: "IO10",
  pin12: "IO11",
  pin13: "IO12",
  pin14: "IO13",
  pin15: "IO9",
  pin16: "IO18",
  pin17: "IO19",
  pin18: "IO20",
  pin19: "IO21",
  pin20: "IO22",
  pin21: "IO23",
  pin22: "NC",
  pin23: "IO15",
  pin24: "RXD0_IO17",
  pin25: "TXD0_IO16",
  pin26: "IO3",
  pin27: "IO2",
  pin28: "GND_28",
  pin29: "GND_EP",
} as const;

// Native Espressif footprint origin, +Y down. Body extends x +/-9 and
// y -15.75..9.75. Datasheet Fig 11-1 verifies all 28 perimeter lands and the
// nine 0.8 mm exposed-ground lands on a 1.25 mm grid. Do not merge pad 29
// into one paste-covered square. Thermal vias and antenna keepouts belong to
// the reviewed board augmentation, not hidden inside this copper model.
export const wroomPattern: LandPattern = {
  id: "Espressif:ESP32-C6-WROOM-1",
  body: { width: 18, height: 25.5 },
  pads: [
    ...Array.from({ length: 14 }, (_, i) => ({
      number: String(i + 1),
      x: -8.75,
      y: Number((-8.26 + 1.27 * i).toFixed(3)),
      width: 1.5,
      height: 0.9,
    })),
    ...Array.from({ length: 14 }, (_, i) => ({
      number: String(15 + i),
      x: 8.75,
      y: Number((8.25 - 1.27 * i).toFixed(3)),
      width: 1.5,
      height: 0.9,
    })),
    ...[-2.755, -1.505, -0.255].flatMap((x) =>
      [-3.79, -2.54, -1.29].map((y) => ({
        number: "29",
        x,
        y,
        width: 0.8,
        height: 0.8,
      })),
    ),
  ],
  source: {
    url: "https://raw.githubusercontent.com/espressif/kicad-libraries/dd76561812ab300351234ba6e0ec1295641796f0/footprints/Espressif.pretty/ESP32-C6-WROOM-1.kicad_mod",
    sha256: "801e051393f57c7e45523b91de1c1b61f595a923c9a02b8fae846c4af4a926b1",
    drawing: "ESP32-C6-WROOM-1 datasheet v1.4 Figure 11-1, page 44",
  },
};

// Full module body/antenna bounds are deliberately explicit because the native
// footprint origin is 3 mm below the body center, not at its center.
export const wroomBody = { left: -9, right: 9, top: -15.75, bottom: 9.75 } as const;
export const wroomAntenna = { left: -9, right: 9, top: -15.75, bottom: -9.75 } as const;

type Props = Omit<
  ChipProps<typeof wroomPins>,
  "manufacturerPartNumber" | "pinLabels" | "footprint" | "datasheetUrl"
>;

export function Esp32C6Wroom(props: Props) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="ESP32-C6-WROOM-1-N8"
      datasheetUrl="https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf"
      pinLabels={wroomPins}
      footprint={<LandPatternFootprint pattern={wroomPattern} />}
      kicadFootprintMetadata={{ footprintName: wroomPattern.id }}
      noConnect={["NC", ...(props.noConnect ?? [])]}
    />
  );
}
