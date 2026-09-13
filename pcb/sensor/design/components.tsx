import { Fragment } from "react";
import type { ChipProps, ResistorProps } from "@tscircuit/props";
import type { LandPattern } from "../../controller/design/ic-land-patterns";
import { dbv5 } from "../../controller/design/logic-land-patterns";
import { panasonic0603 } from "../../controller/design/passive-land-patterns";
import { LandPatternFootprint } from "../../controller/design/land-pattern";

export const fdcPattern: LandPattern = {
  id: "CrystalShim_Sensor:FDC1004_DGS10",
  body: { width: 3, height: 3 },
  pads: Array.from({ length: 10 }, (_, i) => ({
    number: String(i + 1),
    x: i < 5 ? -2.2 : 2.2,
    y: i < 5 ? -1 + i * 0.5 : 1 - (i - 5) * 0.5,
    width: 1.45,
    height: 0.3,
    cornerRadius: 0.05,
  })),
  source: {
    url: "https://www.ti.com/lit/ds/symlink/fdc1004.pdf",
    sha256: "79f6eb7e66c8064b465acf43a153b8ad9091dbd3fff46ab8787176a30529ae1e",
    drawing:
      "SNOSCY5C Rev C, DGS0010A 4221984/A 05/2015, PDF p29-31; p30 lands inspected: 4.4 row centres, 0.5 pitch, 1.45x0.30 R0.05, max0.05 NSMD expansion.",
  },
};
export const ldoPattern: LandPattern = {
  ...dbv5,
  id: "CrystalShim_Sensor:TPS7A2433_DBV5",
  source: {
    url: "https://www.ti.com/lit/ds/symlink/tps7a24.pdf",
    sha256: "5cfbb6f17e5be0a018664b90f0bca99f9ad84b7d06c072bffcd36e693ffd70d0",
    drawing:
      "SBVS386E Rev E; DBV0005A 4214839/K08/2024, PDF p28-30; p29 lands inspected: same shared DBV5, 2.6 row centres,0.95pitch,1.1x0.6 R0.05,max0.07 NSMD expansion.",
  },
};

function SensorIcFootprint({ pattern }: { pattern: LandPattern }) {
  const hw = Math.max(...pattern.pads.map((p) => Math.abs(p.x) + p.width / 2)) + 0.25;
  const hh =
    Math.max(
      pattern.body.height / 2,
      ...pattern.pads.map((p) => Math.abs(p.y) + p.height / 2),
    ) + 0.25;
  return (
    <footprint>
      <fabricationnotepath
        route={[
          { x: -pattern.body.width / 2, y: -pattern.body.height / 2 },
          { x: pattern.body.width / 2, y: -pattern.body.height / 2 },
          { x: pattern.body.width / 2, y: pattern.body.height / 2 },
          { x: -pattern.body.width / 2, y: pattern.body.height / 2 },
          { x: -pattern.body.width / 2, y: -pattern.body.height / 2 },
        ]}
        strokeWidth={0.1}
        layer="top"
      />
      <courtyardoutline
        outline={[
          { x: -hw, y: -hh },
          { x: hw, y: -hh },
          { x: hw, y: hh },
          { x: -hw, y: hh },
          { x: -hw, y: -hh },
        ]}
        strokeWidth={0.05}
        isClosed
        layer="top"
      />
      {pattern.pads.map((p) => (
        <Fragment key={p.number}>
          <smtpad
            portHints={[`pin${p.number}`]}
            pcbX={p.x}
            pcbY={-p.y}
            width={p.width}
            height={p.height}
            shape="rect"
            cornerRadius={p.cornerRadius}
            solderMaskMargin={0.05}
            layer="top"
          />
        </Fragment>
      ))}
    </footprint>
  );
}

export const fdcPins = {
  pin1: "SHLD1",
  pin2: "CIN_LEVEL",
  pin3: "CIN_RL",
  pin4: "CIN3",
  pin5: "CIN4",
  pin6: "SHLD2",
  pin7: "GND",
  pin8: "VDD",
  pin9: "SDA",
  pin10: "SCL",
} as const;
export const ldoPins = {
  pin1: "IN",
  pin2: "GND",
  pin3: "EN",
  pin4: "NC",
  pin5: "OUT",
} as const;
type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  "manufacturerPartNumber" | "pinLabels" | "footprint" | "datasheetUrl"
>;
export function Fdc1004(props: PartProps<typeof fdcPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="FDC1004DGSR"
      pinLabels={fdcPins}
      noConnect={["CIN3", "CIN4"]}
      datasheetUrl={fdcPattern.source.url}
      footprint={<SensorIcFootprint pattern={fdcPattern} />}
      kicadFootprintMetadata={{ footprintName: fdcPattern.id }}
    />
  );
}
export function SensorLdo(props: PartProps<typeof ldoPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="TPS7A2433DBVR"
      pinLabels={ldoPins}
      datasheetUrl={ldoPattern.source.url}
      footprint={<SensorIcFootprint pattern={ldoPattern} />}
      kicadFootprintMetadata={{ footprintName: ldoPattern.id }}
    />
  );
}
export const sensorResistors = {
  "22": "ERJ3EKF22R0V",
  "2.7k": "ERJ3EKF2701V",
  "3.01k": "ERJ3EKF3011V",
  "10k": "ERJ3EKF1002V",
} as const;
export function SensorResistor({
  value,
  ...props
}: Omit<ResistorProps, "resistance" | "footprint" | "manufacturerPartNumber"> & {
  value: keyof typeof sensorResistors;
}) {
  return (
    <resistor
      {...props}
      resistance={value}
      manufacturerPartNumber={sensorResistors[value]}
      datasheetUrl={panasonic0603.source.url}
      footprint={<LandPatternFootprint pattern={panasonic0603} />}
      kicadFootprintMetadata={{ footprintName: panasonic0603.id }}
    />
  );
}
