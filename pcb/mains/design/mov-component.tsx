import type { ChipProps } from "@tscircuit/props";

export const movPins = { pin1: "LINE", pin2: "NEUTRAL" } as const;

export const movCapture = {
  mpn: "TMOV14RP175E",
  footprint: "CrystalShim:TMOV14RP175E_RoundSlot",
  source:
    "https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05",
  inspectedDrawingSha256:
    "039bf6182ec4e86bce375c1935716375361cefe365a1f8515b030bdd343fbea5",
  round: { x: 0, y: 0, drill: 1.3, copper: 2.9 },
  slot: { x: 7.9, y: 0, drillWidth: 4.5, drillHeight: 1.3, width: 6.1, height: 2.9 },
  solderMaskExpansion: 0.05,
  installedAcceptance: {
    centerX: 3.75,
    centerY: 0,
    width: 27,
    height: 27,
    topMax: 26,
    bodySeatingAboveBoard: { min: 0.5, max: 1 },
    tailAndSolderBelowBoardMax: 2,
    yawMaxDegrees: 35,
    leanMaxDegrees: 5,
    basis:
      "Project final-assembly acceptance limits, including measurement error, for the entire actual body, coating, leads and solder. No manufacturer common body offset Cy is guaranteed. Whole-volume inspection is required; yaw, lean and seating limits alone do not establish fit.",
  },
  placementReserve: { centerX: 3.75, centerY: 0, width: 28, height: 28, topMax: 26.5 },
  courtyard: { centerX: 3.75, centerY: 0, width: 29, height: 29 },
  placementStatus:
    "Project-controlled occupied-volume contract; final-part acceptance and enclosure fit remain unverified. The reserve is not a manufacturer occupied-body bound or a guarantee that every supplied part fits.",
  assembly:
    "Bulk straight leads, unformed and stress-free. Rotate the upright body to align its actual lead pair with the round hole and slot. Use a removable bare-lead support to hold the lowest body coating 0.5 to 1.0 mm above the PCB and a board-referenced non-contact gauge; do not load the coating or force insertion. Hand solder after reflow with lead heat sinking and independently controlled seating. No stencil paste. Check the full accepted volume before and after soldering, including actual board thickness and tail projection. Finished-slot process, solder/insulation clearance, enclosure fit and physical acceptance remain open. See docs/design/mov-capture.md.",
} as const;

type MovProps = Omit<
  ChipProps<typeof movPins>,
  | "manufacturerPartNumber"
  | "mfn"
  | "pinLabels"
  | "footprint"
  | "datasheetUrl"
  | "internallyConnectedPins"
  | "kicadFootprintMetadata"
>;

export function ThermallyProtectedMov(props: MovProps) {
  const { round, slot, courtyard } = movCapture;
  const outline = [
    {
      x: courtyard.centerX - courtyard.width / 2,
      y: courtyard.centerY - courtyard.height / 2,
    },
    {
      x: courtyard.centerX + courtyard.width / 2,
      y: courtyard.centerY - courtyard.height / 2,
    },
    {
      x: courtyard.centerX + courtyard.width / 2,
      y: courtyard.centerY + courtyard.height / 2,
    },
    {
      x: courtyard.centerX - courtyard.width / 2,
      y: courtyard.centerY + courtyard.height / 2,
    },
    {
      x: courtyard.centerX - courtyard.width / 2,
      y: courtyard.centerY - courtyard.height / 2,
    },
  ];
  return (
    <chip
      {...props}
      manufacturerPartNumber={movCapture.mpn}
      pinLabels={movPins}
      datasheetUrl={movCapture.source}
      kicadFootprintMetadata={{ footprintName: movCapture.footprint }}
      footprint={
        <footprint>
          <platedhole
            name="line_round"
            portHints={["pin1"]}
            pcbX={round.x}
            pcbY={round.y}
            shape="circle"
            holeDiameter={round.drill}
            outerDiameter={round.copper}
            solderMaskMargin={movCapture.solderMaskExpansion}
          />
          <platedhole
            name="neutral_slot"
            portHints={["pin2"]}
            pcbX={slot.x}
            pcbY={slot.y}
            shape="pill"
            holeWidth={slot.drillWidth}
            holeHeight={slot.drillHeight}
            outerWidth={slot.width}
            outerHeight={slot.height}
            solderMaskMargin={movCapture.solderMaskExpansion}
          />
          {/* Courtyard surrounds the project reserve by 0.5 mm on each side.
              Do not fabricate an F.Fab package datum that the drawing omits. */}
          <courtyardoutline outline={outline} strokeWidth={0.05} layer="top" isClosed />
        </footprint>
      }
    />
  );
}
