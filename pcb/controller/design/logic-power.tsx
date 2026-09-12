import { Fragment } from "react";
import { ControllerBuck } from "./ic-components";
import { PowerSchottky } from "./protection-components";
import { BuckInductor } from "./assembly-components";
import { ControllerCapacitor } from "./passive-components";

// Final controller's diode OR and buck section. Both input nets are downstream
// of their respective eFuses. USB_VBUS has no power connection to this section.
export function ControllerLogicPower() {
  return (
    <group name="LogicPower" schSheetName="Power">
      <PowerSchottky
        name="D1"
        pcbX={-20}
        pcbY={-38}
        schX={-12}
        schY={4}
        schSheetName="Power"
        connections={{ A: "net.V5_PSU", K: "net.V5_LOGIC" }}
      />
      <PowerSchottky
        name="D2"
        pcbX={-10}
        pcbY={-38}
        schX={-12}
        schY={-2}
        schSheetName="Power"
        connections={{ A: "net.V5_SERVICE", K: "net.V5_LOGIC" }}
      />
      <ControllerCapacitor
        name="C1"
        value="22uF"
        pcbX={-24}
        pcbY={-30}
        schX={-7}
        schY={4}
        schSheetName="Power"
        connections={{ pin1: "net.V5_LOGIC", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C2"
        value="22uF"
        pcbX={-24}
        pcbY={-25}
        schX={-7}
        schY={-2}
        schSheetName="Power"
        connections={{ pin1: "net.V5_LOGIC", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C7"
        value="100nF"
        pcbX={-19}
        pcbY={-30}
        schX={-2}
        schY={-5}
        schSheetName="Power"
        connections={{ pin1: "net.V5_LOGIC", pin2: "net.GND" }}
      />
      <ControllerBuck
        name="U2"
        pcbX={-16}
        pcbY={-28}
        schX={0}
        schY={0}
        schSheetName="Power"
        connections={{
          FB: "net.V3V3",
          EN: "net.V5_LOGIC",
          VIN: "net.V5_LOGIC",
          GND: "net.GND",
          SW: "net.BUCK_SW",
          BST: "net.BUCK_BST",
        }}
      />
      <ControllerCapacitor
        name="C8"
        value="100nF"
        pcbX={-13}
        pcbY={-30}
        schX={4}
        schY={5}
        schSheetName="Power"
        connections={{ pin1: "net.BUCK_BST", pin2: "net.BUCK_SW" }}
      />
      <BuckInductor
        name="L1"
        pcbX={-9}
        pcbY={-28}
        schX={7}
        schY={0}
        schSheetName="Power"
        connections={{ pin1: "net.BUCK_SW", pin2: "net.V3V3" }}
      />
      <ControllerCapacitor
        name="C3"
        value="22uF"
        pcbX={-3}
        pcbY={-29}
        schX={12}
        schY={4}
        schSheetName="Power"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C4"
        value="22uF"
        pcbX={-3}
        pcbY={-24}
        schX={12}
        schY={-2}
        schSheetName="Power"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      {/* Explicit electrical labels survive the initial native export. */}
      {[
        ["BUCK_SW", ".U2 > .pin5"],
        ["BUCK_SW", ".L1 > .pin1"],
        ["BUCK_SW", ".C8 > .pin2"],
        ["BUCK_BST", ".U2 > .pin6"],
        ["BUCK_BST", ".C8 > .pin1"],
      ].map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}

export const logicPowerBoundary = [
  "V5_PSU",
  "V5_SERVICE",
  "V5_LOGIC",
  "V3V3",
  "GND",
] as const;
