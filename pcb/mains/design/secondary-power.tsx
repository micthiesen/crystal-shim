import { Fragment } from "react";
import { PsuHeader, ServiceHeader } from "../../controller/design/micro-fit-components";
import { ControllerCapacitor } from "../../controller/design/passive-components";
import { BuckInductor } from "../../controller/design/assembly-components";
import { MainsBuck, MotorFuse } from "./secondary-components";
import { mainsPlacements, type MainsPlacement } from "./placements";

export const secondaryPowerBoundary = [
  "V12_RAW",
  "V12_MOTOR",
  "V5_PSU",
  "GND_ISO",
  "COIL_DRAIN",
] as const;
export const secondaryPowerReviewPlacements = {
  U2: mainsPlacements.U2,
  L1: mainsPlacements.L1,
  J5: mainsPlacements.J5,
  J6: mainsPlacements.J6,
  F2: mainsPlacements.F2,
  C2: mainsPlacements.C2,
  C3: mainsPlacements.C3,
  C4: mainsPlacements.C4,
  C5: mainsPlacements.C5,
  C6: mainsPlacements.C6,
  C7: mainsPlacements.C7,
} as const;
export function MainsSecondaryPower({
  placements = secondaryPowerReviewPlacements,
}: {
  placements?: Record<keyof typeof secondaryPowerReviewPlacements, MainsPlacement>;
} = {}) {
  return (
    <group name="MainsSecondaryPower" schSheetName="Secondary">
      <MainsBuck
        name="U2"
        {...placements.U2}
        schX={0}
        schY={0}
        schSheetName="Secondary"
      />
      <BuckInductor
        name="L1"
        {...placements.L1}
        schX={8}
        schY={0}
        schSheetName="Secondary"
      />
      <PsuHeader
        name="J5"
        {...placements.J5}
        schX={24}
        schY={0}
        schSheetName="Secondary"
      />
      <ServiceHeader
        name="J6"
        {...placements.J6}
        schX={24}
        schY={-13}
        schSheetName="Secondary"
      />
      <MotorFuse
        name="F2"
        {...placements.F2}
        schX={12}
        schY={-13}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C2"
        value="22uF"
        {...placements.C2}
        schX={-12}
        schY={5}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C3"
        value="22uF"
        {...placements.C3}
        schX={-12}
        schY={-3}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C4"
        value="22uF"
        {...placements.C4}
        schX={14}
        schY={5}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C5"
        value="100nF"
        {...placements.C5}
        schX={6}
        schY={7}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C6"
        value="22uF"
        {...placements.C6}
        schX={14}
        schY={-4}
        schSheetName="Secondary"
      />
      <ControllerCapacitor
        name="C7"
        value="100nF"
        {...placements.C7}
        schX={-6}
        schY={-7}
        schSheetName="Secondary"
      />
      {(
        [
          ["V12_RAW", ".U2 > .VIN"],
          ["V12_RAW", ".U2 > .EN"],
          ["V12_RAW", ".C2 > .pin1"],
          ["V12_RAW", ".C3 > .pin1"],
          ["V12_RAW", ".C7 > .pin1"],
          ["V12_RAW", ".F2 > .IN"],
          ["V12_MOTOR", ".F2 > .OUT"],
          ["V12_MOTOR", ".J6 > .POSITIVE"],
          ["BUCK5_SW", ".U2 > .SW"],
          ["BUCK5_SW", ".L1 > .pin1"],
          ["BUCK5_SW", ".C5 > .pin2"],
          ["BUCK5_BST", ".U2 > .BST"],
          ["BUCK5_BST", ".C5 > .pin1"],
          ["V5_PSU", ".U2 > .FB"],
          ["V5_PSU", ".L1 > .pin2"],
          ["V5_PSU", ".C4 > .pin1"],
          ["V5_PSU", ".C6 > .pin1"],
          ["V5_PSU", ".J5 > .V5_PSU"],
          ["COIL_DRAIN", ".J5 > .COIL_DRAIN"],
          ["GND_ISO", ".U2 > .GND"],
          ["GND_ISO", ".J5 > .GND"],
          ["GND_ISO", ".J6 > .RETURN"],
          ["GND_ISO", ".C2 > .pin2"],
          ["GND_ISO", ".C3 > .pin2"],
          ["GND_ISO", ".C4 > .pin2"],
          ["GND_ISO", ".C6 > .pin2"],
          ["GND_ISO", ".C7 > .pin2"],
        ] as const
      ).map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}
