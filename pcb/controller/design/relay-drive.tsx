import { PsuSupervisor, RelayPermissionGate } from "./logic-components";
import { RelayMosfet } from "./ic-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

// Final-controller circuit section. External named nets are the integration
// contract; this is not a separate board or a complete controller design.
// References are reserved here for the complete controller, not auto-assigned.
export function ControllerRelayDrive() {
  return (
    <>
      <PsuSupervisor
        name="U4"
        pcbX={-8}
        pcbY={-14}
        schX={-8}
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
        pcbX={-11}
        pcbY={-12}
        schX={-12}
        schY={4}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.V5_PSU", pin2: "net.PSU_SENSE" }}
      />
      <ControllerResistor
        name="R15"
        value="10k"
        pcbX={-11}
        pcbY={-16}
        schX={-12}
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
        schX={-4}
        schY={4}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.V3V3", pin2: "net.PSU_GOOD" }}
      />
      <ControllerCapacitor
        name="C11"
        value="100nF"
        pcbX={-8}
        pcbY={-17}
        schX={-8}
        schY={-4}
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
        schY={4}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.RELAY_REQUEST", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C12"
        value="100nF"
        pcbX={0}
        pcbY={-17}
        schX={0}
        schY={-4}
        schSheetName="Relay"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R20"
        value="100"
        pcbX={5}
        pcbY={-14}
        schX={6}
        schY={0}
        schSheetName="Relay"
        connections={{ pin1: "net.RELAY_GATED", pin2: "net.MOS_GATE" }}
      />
      <RelayMosfet
        name="Q1"
        pcbX={10}
        pcbY={-14}
        schX={11}
        schY={0}
        schSheetName="Relay"
        connections={{ G: "net.MOS_GATE", S: "net.GND", D: "net.COIL_DRAIN" }}
      />
      <ControllerResistor
        name="R11"
        value="10k"
        pcbX={10}
        pcbY={-18}
        schX={7}
        schY={-4}
        schOrientation="vertical"
        schSheetName="Relay"
        connections={{ pin1: "net.MOS_GATE", pin2: "net.GND" }}
      />
    </>
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
