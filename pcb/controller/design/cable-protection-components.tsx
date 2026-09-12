import type { ChipProps } from "@tscircuit/props";
import { LandPatternFootprint } from "./land-pattern";
import { esds312, smbj7_0a } from "./cable-protection-land-patterns";

export const cableEsdPins = {
  pin1: "NC_1",
  pin2: "GND",
  pin3: "NC_3",
  pin4: "IO1",
  pin5: "IO2",
} as const;
export const cablePowerTvsPins = { pin1: "K", pin2: "A" } as const;
type PartProps<P extends Record<string, string>> = Omit<
  ChipProps<P>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "kicadFootprintMetadata"
  | "internallyConnectedPins"
>;

export function CableSignalEsd(props: PartProps<typeof cableEsdPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="ESDS312DBVR"
      pinLabels={cableEsdPins}
      datasheetUrl={esds312.source.url}
      footprint={<LandPatternFootprint pattern={esds312} />}
      kicadFootprintMetadata={{ footprintName: esds312.id }}
      noConnect={["NC_1", "NC_3", ...(props.noConnect ?? [])]}
    />
  );
}

export function CablePowerTvs(props: PartProps<typeof cablePowerTvsPins>) {
  return (
    <chip
      {...props}
      manufacturerPartNumber="SMBJ7.0A"
      pinLabels={cablePowerTvsPins}
      datasheetUrl={smbj7_0a.source.url}
      footprint={<LandPatternFootprint pattern={smbj7_0a} />}
      kicadFootprintMetadata={{ footprintName: smbj7_0a.id }}
    >
      {/* Clear cathode-side marking outside the copper, inherited by rotation. */}
      <silkscreentext text="K" pcbX={-4.4} pcbY={0} fontSize={0.8} />
    </chip>
  );
}
