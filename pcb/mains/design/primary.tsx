import { Fragment } from "react";
import { MainsHeader, mainsHeaderNets } from "./mains-headers";
import { IsolatedSupply, PumpRelay, BranchFuse } from "./power-components";
import { mainsPlacements } from "./placements";
import { ThermallyProtectedMov } from "./mov-component";

// The inlet fuse, manufactured filter and continuous PE wiring are off-board.
// Only the IRM's internal isolation and relay's contact/coil boundary bridge the
// primary and isolated secondary domains. Fixed terminals have exactly two used positions.
export function MainsPrimary() {
  return (
    <group name="MainsPrimary" schSheetName="Primary">
      <MainsHeader
        name="J1"
        {...mainsPlacements.J1}
        schX={-18}
        schY={9}
        schWidth={5}
        schHeight={3}
        schPinArrangement={{ leftSide: [1, 2] }}
      />
      <MainsHeader
        name="J2"
        {...mainsPlacements.J2}
        schX={-18}
        schY={-5}
        schWidth={5}
        schHeight={3}
        schPinArrangement={{ leftSide: [1, 2] }}
      />
      <MainsHeader
        name="J3"
        {...mainsPlacements.J3}
        schX={-5}
        schY={-5}
        schWidth={5}
        schHeight={3}
        schPinArrangement={{ leftSide: [1, 2] }}
      />
      <MainsHeader
        name="J4"
        {...mainsPlacements.J4}
        schX={20}
        schY={-5}
        schWidth={5}
        schHeight={3}
        schPinArrangement={{ leftSide: [1, 2] }}
      />
      <IsolatedSupply
        name="U1"
        {...mainsPlacements.U1}
        schX={3}
        schY={9}
        schWidth={6}
        schHeight={4}
        schPinArrangement={{ leftSide: [2, 1], rightSide: [4, 3] }}
      />
      <BranchFuse
        name="F3"
        {...mainsPlacements.F3}
        schX={-18}
        schY={2}
        schWidth={4}
        schHeight={2}
        schPinArrangement={{ leftSide: [1], rightSide: [2] }}
      />
      <PumpRelay
        name="K1"
        {...mainsPlacements.K1}
        schX={7}
        schY={-5}
        schWidth={6}
        schHeight={4}
        schPinArrangement={{ leftSide: [3, 4], rightSide: [1, 5] }}
      />
      <ThermallyProtectedMov
        name="RV1"
        {...mainsPlacements.RV1}
        schX={-8}
        schY={9}
        schWidth={5}
        schHeight={3}
        schPinArrangement={{ leftSide: [1], rightSide: [2] }}
      />
      {Object.entries(mainsHeaderNets).map(([ref, [line, neutral]]) => (
        <Fragment key={ref}>
          <netlabel net={line} connectsTo={`.${ref} > .LINE`} />
          <netlabel net={neutral} connectsTo={`.${ref} > .NEUTRAL`} />
        </Fragment>
      ))}
      {(
        [
          ["AC_L_FUSED", ".F3 > .IN"],
          ["FILTER_LINE_L", ".F3 > .OUT"],
          ["AC_L_FUSED", ".U1 > .AC_L"],
          ["AC_N", ".U1 > .AC_N"],
          ["V12_RAW", ".U1 > .V12_RAW"],
          ["GND_ISO", ".U1 > .GND_ISO"],
          ["PUMP_L_FILTERED", ".K1 > .CONTACT_FIXED"],
          ["PUMP_L_SW", ".K1 > .CONTACT_MOVING"],
          ["V5_PSU", ".K1 > .COIL_HIGH"],
          ["COIL_DRAIN", ".K1 > .COIL_LOW"],
          ["AC_L_FUSED", ".RV1 > .LINE"],
          ["AC_N", ".RV1 > .NEUTRAL"],
        ] as const
      ).map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
      <schematictext
        text="J1: fused inlet. F3: T1A branch. J2: filter LINE. J3: filter LOAD. J4: pump. PE remains off-board."
        schX={0}
        schY={15}
        fontSize={0.65}
      />
    </group>
  );
}
