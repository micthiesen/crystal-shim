import type { ChipProps } from "@tscircuit/props";
import { Fragment } from "react";
import { PhysicalFootprintGraphics } from "./land-pattern";
import { landPatternPhysicalGeometry } from "./land-pattern-physical";

// The compiler accepts numeric source indices only. These are NOT USB pin
// numbers: the initial exporter must translate both symbol and copper using
// this map before any seed can satisfy the native-footprint parity gate.
export const usbConnectorPins = {
  pin1: "A1",
  pin2: "A4",
  pin3: "A5",
  pin4: "A6",
  pin5: "A7",
  pin6: "A8",
  pin7: "A9",
  pin8: "A12",
  pin9: "B1",
  pin10: "B4",
  pin11: "B5",
  pin12: "B6",
  pin13: "B7",
  pin14: "B8",
  pin15: "B9",
  pin16: "B12",
  pin17: "SH",
} as const;

export const usbConnectorPinMap = [
  { index: 1, number: "A1", signal: "GND", x: -3.2, width: 0.6 },
  { index: 2, number: "A4", signal: "VBUS", x: -2.4, width: 0.6 },
  { index: 3, number: "A5", signal: "CC1", x: -1.25, width: 0.3 },
  { index: 4, number: "A6", signal: "D_P", x: -0.25, width: 0.3 },
  { index: 5, number: "A7", signal: "D_N", x: 0.25, width: 0.3 },
  { index: 6, number: "A8", signal: "SBU1", x: 1.25, width: 0.3 },
  { index: 7, number: "A9", signal: "VBUS", x: 2.4, width: 0.6 },
  { index: 8, number: "A12", signal: "GND", x: 3.2, width: 0.6 },
  { index: 9, number: "B1", signal: "GND", x: 3.2, width: 0.6 },
  { index: 10, number: "B4", signal: "VBUS", x: 2.4, width: 0.6 },
  { index: 11, number: "B5", signal: "CC2", x: 1.75, width: 0.3 },
  { index: 12, number: "B6", signal: "D_P", x: 0.75, width: 0.3 },
  { index: 13, number: "B7", signal: "D_N", x: -0.75, width: 0.3 },
  { index: 14, number: "B8", signal: "SBU2", x: -1.75, width: 0.3 },
  { index: 15, number: "B9", signal: "VBUS", x: -2.4, width: 0.6 },
  { index: 16, number: "B12", signal: "GND", x: -3.2, width: 0.6 },
] as const;

export const usbConnectorPattern = {
  id: "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
  // Native top view, +Y down. Origin is the body centre; mating is toward +Y.
  body: { width: 8.94, height: 7.35, nominalHeightAbovePcb: 3.31 },
  boardEdgeY: 3.675,
  smtY: -3.68,
  smtHeight: 1.15,
  locators: [
    { x: -2.89, y: -2.605 },
    { x: 2.89, y: -2.605 },
  ],
  shell: [
    { x: -4.32, y: -3.105, height: 2.1, drillHeight: 1.7 },
    { x: 4.32, y: -3.105, height: 2.1, drillHeight: 1.7 },
    { x: -4.32, y: 1.075, height: 1.8, drillHeight: 1.4 },
    { x: 4.32, y: 1.075, height: 1.8, drillHeight: 1.4 },
  ],
  source: {
    url: "https://gct.co/files/drawings/usb4105.pdf",
    sha256: "fb331fbabee8392ed2937ed757c1610cb0f174b84625147c0b580a18eea8c0e5",
    drawing:
      "USB4105 B4, 2023-12-18, sheet 1 component-side recommended layout. Native library adopts 25% rounded SMT corners; GCT does not dimension a corner radius. Four shared copper areas carry two contact numbers each. Shell stakes default to 0.95 +/-0.15 mm for GF-A; reflow/paste and final board-thickness retention must be reviewed.",
  },
} as const;

type UsbConnectorProps = Omit<
  ChipProps<typeof usbConnectorPins>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "internallyConnectedPins"
  | "kicadFootprintMetadata"
>;

export function UsbConnector(props: UsbConnectorProps) {
  const pattern = usbConnectorPattern;
  const physical = landPatternPhysicalGeometry({
    id: pattern.id,
    pads: [
      ...usbConnectorPinMap.map((pin) => ({
        x: pin.x,
        y: pattern.smtY,
        width: pin.width,
        height: pattern.smtHeight,
      })),
      ...pattern.shell.map((pad) => ({
        x: pad.x,
        y: pad.y,
        width: 1,
        height: pad.height,
      })),
    ],
    holes: pattern.locators.map((hole) => ({ ...hole, diameter: 0.65 })),
  });
  return (
    <chip
      {...props}
      manufacturerPartNumber="USB4105-GF-A"
      pinLabels={usbConnectorPins}
      datasheetUrl={pattern.source.url}
      kicadFootprintMetadata={{ footprintName: pattern.id }}
      // Every numbered contact needs its own explicit schematic connection,
      // including those sharing a solder area. Declaring different pin numbers
      // internally connected can hide required wires from the KiCad netlist.
      footprint={
        <footprint>
          <PhysicalFootprintGraphics physical={physical} />
          {usbConnectorPinMap.map((pin) => (
            <Fragment key={pin.number}>
              <smtpad
                name={`land_${pin.number}`}
                portHints={[`pin${pin.index}`]}
                pcbX={pin.x}
                pcbY={-pattern.smtY}
                width={pin.width}
                height={pattern.smtHeight}
                shape="rect"
                solderMaskMargin={physical?.declaration.solderMask.expansion}
                cornerRadius={pin.width * 0.25}
                layer="top"
              />
            </Fragment>
          ))}
          {pattern.shell.map((pad, index) => (
            <Fragment key={`shell_${index}`}>
              <platedhole
                name={`shell_${index}`}
                portHints={["pin17"]}
                pcbX={pad.x}
                pcbY={-pad.y}
                shape="pill"
                solderMaskMargin={physical?.declaration.solderMask.expansion}
                holeWidth={0.6}
                holeHeight={pad.drillHeight}
                outerWidth={1}
                outerHeight={pad.height}
              />
            </Fragment>
          ))}
          {pattern.locators.map((hole, index) => (
            <Fragment key={`locator_${index}`}>
              <hole
                name={`locator_${index}`}
                pcbX={hole.x}
                pcbY={-hole.y}
                diameter={0.65}
              />
            </Fragment>
          ))}
        </footprint>
      }
    />
  );
}
