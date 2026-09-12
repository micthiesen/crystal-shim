import { Fragment } from "react";
import { PsuSupervisor, RelayPermissionGate } from "./logic-components";
import { RelayMosfet } from "./ic-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";
import { PsuHeader } from "./micro-fit-components";

// Final-controller circuit section. External named nets are the integration
// contract; this is not a separate board or a complete controller design.
// References are reserved here for the complete controller, not auto-assigned.
export function ControllerRelayDrive() {
  return (
    <group name="RelayPermission" schSheetName="Relay">
      <PsuHeader
        name="J1"
        pcbX={22}
        pcbY={-14}
        schX={13.5}
        schY={3}
        schSheetName="Relay"
        connections={{
          V5_PSU: "net.V5_PSU",
          GND: "net.GND",
          COIL_DRAIN: "net.COIL_DRAIN",
        }}
      />
      <PsuSupervisor
        name="U4"
        pcbX={-8}
        pcbY={-14}
        schX={-6}
        schY={0}
        schSheetName="Relay"
        connections={{
          RESET_N: "net.PSU_GOOD",
          GND: "net.GND",
          MR_N: "net.CHIP_EN",
          SENSE: "net.PSU_SENSE",
          VDD: "net.V3V3",
        }}
        noConnect={["CT"]}
      />
      <ControllerResistor
        name="R14"
        value="95.3k"
        pcbX={-13}
        pcbY={-12}
        schX={-9}
        schY={3}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.V5_PSU", pin2: "net.PSU_SENSE" }}
      />
      <ControllerResistor
        name="R15"
        value="10k"
        pcbX={-13}
        pcbY={-16}
        schX={-9}
        schY={0}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.PSU_SENSE", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R12"
        value="10k"
        pcbX={-4}
        pcbY={-12}
        schX={-3}
        schY={3}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.V3V3", pin2: "net.PSU_GOOD" }}
      />
      <ControllerCapacitor
        name="C11"
        value="100nF"
        pcbX={-8}
        pcbY={-18}
        schX={-6}
        schY={-3}
        schSheetName="Relay"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <RelayPermissionGate
        name="U6"
        pcbX={0}
        pcbY={-14}
        schX={0}
        schY={0}
        schSheetName="Relay"
        connections={{
          A: "net.RELAY_REQUEST",
          B: "net.PSU_GOOD",
          GND: "net.GND",
          Y: "net.RELAY_GATED",
          VCC: "net.V3V3",
        }}
      />
      <ControllerResistor
        name="R2"
        value="10k"
        pcbX={0}
        pcbY={-10}
        schX={0}
        schY={3}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.RELAY_REQUEST", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C12"
        value="100nF"
        pcbX={0}
        pcbY={-18}
        schX={0}
        schY={-3}
        schSheetName="Relay"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R20"
        value="100"
        pcbX={5}
        pcbY={-14}
        schX={4.5}
        schY={0}
        schSheetName="Relay"
        connections={{ pin1: "net.RELAY_GATED", pin2: "net.MOS_GATE" }}
      />
      <RelayMosfet
        name="Q1"
        pcbX={10}
        pcbY={-14}
        schX={9.75}
        schY={0}
        schSheetName="Relay"
        connections={{ G: "net.MOS_GATE", S: "net.GND", D: "net.COIL_DRAIN" }}
      />
      <ControllerResistor
        name="R11"
        value="10k"
        pcbX={10}
        pcbY={-18}
        schX={5.25}
        schY={-3}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.MOS_GATE", pin2: "net.GND" }}
      />
      {/* Inline signal text is graphical only in the pinned initial exporter.
          Real labels preserve the named nets, including external boundaries. */}
      {[
        ["PSU_GOOD", ".U4 > .pin1"],
        ["PSU_GOOD", ".R12 > .pin2"],
        ["PSU_GOOD", ".U6 > .pin2"],
        ["PSU_SENSE", ".U4 > .pin5"],
        ["PSU_SENSE", ".R14 > .pin2"],
        ["PSU_SENSE", ".R15 > .pin1"],
        ["CHIP_EN", ".U4 > .pin3"],
        ["RELAY_REQUEST", ".U6 > .pin1"],
        ["RELAY_REQUEST", ".R2 > .pin1"],
        ["RELAY_GATED", ".U6 > .pin4"],
        ["RELAY_GATED", ".R20 > .pin1"],
        ["MOS_GATE", ".R20 > .pin2"],
        ["MOS_GATE", ".Q1 > .pin1"],
        ["MOS_GATE", ".R11 > .pin1"],
        ["COIL_DRAIN", ".Q1 > .pin3"],
        ["V5_PSU", ".J1 > .pin1"],
        ["GND", ".J1 > .pin2"],
        ["COIL_DRAIN", ".J1 > .pin3"],
      ].map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}

export const relayDriveBoundary = [
  "V5_PSU",
  "V3V3",
  "GND",
  "CHIP_EN",
  "PSU_GOOD",
  "RELAY_REQUEST",
  "COIL_DRAIN",
] as const;
