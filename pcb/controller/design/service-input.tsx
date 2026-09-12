import { Fragment } from "react";
import { ServiceHeader } from "./micro-fit-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";
import { PowerSchottky } from "./protection-components";
import { BidirectionalSupplyTvs, ServiceEfuse } from "./service-protection-components";

// The final controller's service-input protection, ahead of D2 in logic-power.
// These are fixed references and nets; section-review placement is provisional.
// Keep source routing disabled for the TPS259470 custom-pad port centres.
export function ControllerServiceInput() {
  return (
    <group name="ServiceProtection" schSheetName="Service">
      <ServiceHeader
        name="J2"
        pcbX={22}
        pcbY={-44}
        schX={-11.88}
        schY={0}
        schSheetName="Service"
        connections={{ V5_SERVICE_RAW: "net.V5_SERVICE_RAW", GND: "net.GND" }}
      />
      <BidirectionalSupplyTvs
        name="D5"
        pcbX={22}
        pcbY={-34}
        schX={-11.88}
        schY={-3.3}
        schSheetName="Service"
        connections={{ TERMINAL_1: "net.V5_SERVICE_RAW", TERMINAL_2: "net.GND" }}
      />
      <ServiceEfuse
        name="U10"
        pcbX={12}
        pcbY={-34}
        schX={0}
        schY={0}
        schSheetName="Service"
        connections={{
          EN_UVLO: "net.SERVICE_UVLO",
          OVLO: "net.SERVICE_OVLO",
          IN: "net.V5_SERVICE_RAW",
          OUT: "net.V5_SERVICE",
          DVDT: "net.SERVICE_DVDT",
          GND: "net.GND",
          ILM: "net.SERVICE_ILM",
        }}
        noConnect={["AUXOFF", "FLT_N", "ITIMER"]}
      />
      <PowerSchottky
        name="D6"
        pcbX={4}
        pcbY={-34}
        schX={9.9}
        schY={0}
        schSheetName="Service"
        connections={{ K: "net.V5_SERVICE", A: "net.GND" }}
      />
      <ControllerResistor
        name="R30"
        value="26.1k"
        pcbX={14}
        pcbY={-26}
        schX={-9.9}
        schY={6.6}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE_RAW", pin2: "net.SERVICE_UV_DIV" }}
      />
      <ControllerResistor
        name="R31"
        value="10k"
        pcbX={10}
        pcbY={-26}
        schX={-6.6}
        schY={6.6}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_UV_DIV", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R32"
        value="470k"
        pcbX={14}
        pcbY={-30}
        schX={-3.3}
        schY={3.96}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_UV_DIV", pin2: "net.SERVICE_UVLO" }}
      />
      <ControllerResistor
        name="R33"
        value="38.3k"
        pcbX={21}
        pcbY={-26}
        schX={-9.9}
        schY={-6.6}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE_RAW", pin2: "net.SERVICE_OV_DIV" }}
      />
      <ControllerResistor
        name="R34"
        value="10k"
        pcbX={25}
        pcbY={-26}
        schX={-6.6}
        schY={-6.6}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_OV_DIV", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R35"
        value="470k"
        pcbX={20}
        pcbY={-30}
        schX={-3.3}
        schY={-3.96}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_OV_DIV", pin2: "net.SERVICE_OVLO" }}
      />
      <ControllerResistor
        name="R36"
        value="2.87k"
        pcbX={7}
        pcbY={-30}
        schX={3.96}
        schY={-3.96}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_ILM", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R37"
        value="2.2k"
        pcbX={4}
        pcbY={-27}
        schX={9.9}
        schY={-3.3}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C20"
        value="1uF"
        pcbX={16}
        pcbY={-38}
        schX={-7.92}
        schY={0}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE_RAW", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C21"
        value="100nF"
        pcbX={12}
        pcbY={-38}
        schX={-7.92}
        schY={-3.3}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE_RAW", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C22"
        value="22uF"
        pcbX={6}
        pcbY={-39}
        schX={6.6}
        schY={0}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C23"
        value="4.7nF"
        pcbX={10}
        pcbY={-22}
        schX={3.96}
        schY={3.96}
        schSheetName="Service"
        connections={{ pin1: "net.SERVICE_DVDT", pin2: "net.GND" }}
      />
      {/* The pinned renderer's inline signal text is only a drawing annotation.
          Explicit labels preserve electrical nets in the initial KiCad export. */}
      {[
        ["SERVICE_UVLO", ".U10 > .pin1"],
        ["SERVICE_UVLO", ".R32 > .pin2"],
        ["SERVICE_OVLO", ".U10 > .pin2"],
        ["SERVICE_OVLO", ".R35 > .pin2"],
        ["SERVICE_ILM", ".U10 > .pin9"],
        ["SERVICE_ILM", ".R36 > .pin1"],
        ["SERVICE_DVDT", ".U10 > .pin7"],
        ["SERVICE_DVDT", ".C23 > .pin1"],
        ["SERVICE_UV_DIV", ".R30 > .pin2"],
        ["SERVICE_UV_DIV", ".R32 > .pin1"],
        ["SERVICE_OV_DIV", ".R33 > .pin2"],
        ["SERVICE_OV_DIV", ".R35 > .pin1"],
      ].map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}

export const serviceInputBoundary = ["V5_SERVICE_RAW", "V5_SERVICE", "GND"] as const;
