import { Fragment } from "react";
import { PsuHeader } from "../../controller/design/micro-fit-components";
import {
  ControllerCapacitor,
  ControllerResistor,
} from "../../controller/design/passive-components";
import { PowerSchottky } from "../../controller/design/protection-components";
import { ServiceEfuse } from "../../controller/design/service-protection-components";
import type { MainsPlacement } from "./placements";

export const secondaryPowerBoundary = [
  "V5_RAW",
  "V5_PSU",
  "GND_ISO",
  "COIL_DRAIN",
] as const;

// Default coordinates for the separate component-review canvas.
export const secondaryPowerReviewPlacements = {
  U2: { pcbX: 0, pcbY: 0, pcbRotation: 0, layer: "top" },
  D2: { pcbX: 12, pcbY: 0, pcbRotation: 0, layer: "top" },
  J5: { pcbX: 25, pcbY: 12, pcbRotation: 0, layer: "top" },
  R2: { pcbX: -15, pcbY: 12, pcbRotation: 0, layer: "top" },
  R3: { pcbX: -8, pcbY: 12, pcbRotation: 0, layer: "top" },
  R4: { pcbX: -15, pcbY: -12, pcbRotation: 0, layer: "top" },
  R5: { pcbX: -8, pcbY: -12, pcbRotation: 0, layer: "top" },
  R6: { pcbX: 7, pcbY: -9, pcbRotation: 0, layer: "top" },
  R7: { pcbX: 22, pcbY: -7, pcbRotation: 0, layer: "top" },
  C2: { pcbX: -12, pcbY: 0, pcbRotation: 0, layer: "top" },
  C3: { pcbX: -6, pcbY: 0, pcbRotation: 0, layer: "top" },
  C4: { pcbX: 9, pcbY: 8, pcbRotation: 0, layer: "top" },
  C5: { pcbX: 3, pcbY: -5, pcbRotation: 0, layer: "top" },
} as const;

// Final-use parts and fixed references. The complete board passes its explicit
// placement proposal; a standalone review uses the defaults above. Keep source
// routing disabled for the RPW custom-pad port centres. Native anchor, stencil,
// thermal copper and J5 origin/mask/paste adapters remain handoff obligations.
export function MainsSecondaryPower({
  placements = secondaryPowerReviewPlacements,
}: {
  placements?: Record<keyof typeof secondaryPowerReviewPlacements, MainsPlacement>;
} = {}) {
  return (
    <group name="MainsSecondaryPower" schSheetName="Secondary">
      <ServiceEfuse
        name="U2"
        {...placements.U2}
        schX={0}
        schY={0}
        schWidth={5}
        schHeight={3}
        schPinStyle={{
          EN_UVLO: { marginTop: 0.3 },
          OVLO: { marginTop: 0.3 },
          GND: { marginTop: 0.3 },
          DVDT: { marginTop: 0.3 },
          ILM: { marginTop: 0.3 },
          FLT_N: { marginLeft: 0.8 },
          ITIMER: { marginLeft: 0.8 },
        }}
        schPinArrangement={{
          leftSide: [5, 1, 2, 8],
          rightSide: [6, 7, 9],
          bottomSide: [3, 4, 10],
        }}
        schSheetName="Secondary"
        noConnect={["AUXOFF", "FLT_N", "ITIMER"]}
      />
      <PowerSchottky
        name="D2"
        {...placements.D2}
        schX={8}
        schY={1.5}
        schWidth={3}
        schSheetName="Secondary"
      />
      <PsuHeader
        name="J5"
        {...placements.J5}
        schX={14.5}
        schY={0}
        schWidth={4.5}
        schPinStyle={{ GND: { marginTop: 0.6 } }}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R2"
        value="26.1k"
        {...placements.R2}
        schX={-10}
        schY={4}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R3"
        value="10k"
        {...placements.R3}
        schX={-5}
        schY={4}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R4"
        value="38.3k"
        {...placements.R4}
        schX={-10}
        schY={-4}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R5"
        value="10k"
        {...placements.R5}
        schX={-5}
        schY={-4}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R6"
        value="2.87k"
        {...placements.R6}
        schX={5}
        schY={-4}
        schSheetName="Secondary"
      />
      <ControllerResistor
        name="R7"
        value="2.2k"
        {...placements.R7}
        schX={10}
        schY={-4}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C2"
        value="1uF"
        {...placements.C2}
        schX={-10}
        schY={0}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C3"
        value="100nF"
        {...placements.C3}
        schX={-6}
        schY={0}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C4"
        value="22uF"
        {...placements.C4}
        schX={10}
        schY={4}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C5"
        value="4.7nF"
        {...placements.C5}
        schX={5}
        schY={4}
        schSheetName="Secondary"
      />
      {/* Each label is an electrical source connection and a real schematic
          label. Annotation-only inline text cannot establish drawn net parity. */}
      {(
        [
          ["V5_RAW", ".U2 > .IN", -3.6, 1.3, "bottom"],
          ["V5_RAW", ".R2 > .pin1", -10.8, 4.6, "bottom"],
          ["V5_RAW", ".R4 > .pin1", -10.8, -3.4, "bottom"],
          ["V5_RAW", ".C2 > .pin1", -10.8, 0.6, "bottom"],
          ["V5_RAW", ".C3 > .pin1", -6.8, 0.6, "bottom"],
          ["EFUSE_UV", ".U2 > .EN_UVLO", -3.6, 0.25, "right"],
          ["EFUSE_UV", ".R2 > .pin2", -9.2, 4, "left"],
          ["EFUSE_UV", ".R3 > .pin1", -5.8, 4, "right"],
          ["EFUSE_OV", ".U2 > .OVLO", -3.6, -0.25, "right"],
          ["EFUSE_OV", ".R4 > .pin2", -9.2, -4, "left"],
          ["EFUSE_OV", ".R5 > .pin1", -5.8, -4, "right"],
          ["EFUSE_ILM", ".U2 > .ILM", 3.6, -0.5, "left"],
          ["EFUSE_ILM", ".R6 > .pin1", 4.2, -4, "right"],
          ["EFUSE_DVDT", ".U2 > .DVDT", 3.6, 0, "left"],
          ["EFUSE_DVDT", ".C5 > .pin1", 4.2, 4, "right"],
          ["V5_PSU", ".U2 > .OUT", 3.6, 1.3, "bottom"],
          ["V5_PSU", ".D2 > .K", 5.8, 2.3, "bottom"],
          ["V5_PSU", ".R7 > .pin1", 9.2, -3.4, "bottom"],
          ["V5_PSU", ".C4 > .pin1", 9.2, 4.6, "bottom"],
          ["V5_PSU", ".J5 > .V5_PSU", 11.3, 1, "bottom"],
          ["COIL_DRAIN", ".J5 > .COIL_DRAIN", 17.7, 0, "left"],
          ["GND_ISO", ".U2 > .GND", -3.6, -1.3, "top"],
          ["GND_ISO", ".D2 > .A", 10.4, 0.9, "top"],
          ["GND_ISO", ".R3 > .pin2", -4.2, 3.4, "top"],
          ["GND_ISO", ".R5 > .pin2", -4.2, -4.6, "top"],
          ["GND_ISO", ".R6 > .pin2", 5.8, -4.6, "top"],
          ["GND_ISO", ".R7 > .pin2", 10.8, -4.6, "top"],
          ["GND_ISO", ".C2 > .pin2", -9.2, -0.6, "top"],
          ["GND_ISO", ".C3 > .pin2", -5.2, -0.6, "top"],
          ["GND_ISO", ".C4 > .pin2", 10.8, 3.4, "top"],
          ["GND_ISO", ".C5 > .pin2", 5.8, 3.4, "top"],
          ["GND_ISO", ".J5 > .GND", 11.3, -1, "top"],
        ] as const
      ).map(([net, port, schX, schY, anchorSide]) => (
        <Fragment key={port}>
          <netlabel
            net={net}
            connectsTo={port}
            schX={schX}
            schY={schY}
            anchorSide={anchorSide}
          />
        </Fragment>
      ))}
    </group>
  );
}
