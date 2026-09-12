import { controllerPlacements } from "./placements";
import { Fragment } from "react";
import { SensorBusBuffer } from "./ic-components";
import { SensorPowerFeed } from "./logic-components";
import { SensorHeader } from "./micro-fit-components";
import { CablePowerTvs, CableSignalEsd } from "./cable-protection-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

// Final-controller references; independent-section placements remain provisional.
// Route cable -> local TVS -> series impedance -> protected circuitry. Ground is
// one isolated net; its short dirty return must not share a narrow protected
// return. These source connections do not replace the final transient/layout gate.
export function ControllerSensorInterface() {
  return (
    <group name="SensorInterface" schSheetName="SensorInterface">
      <SensorPowerFeed
        name="U5"
        {...controllerPlacements.U5}
        schX={-7}
        schY={4}
        schSheetName="SensorInterface"
        connections={{
          IN: "net.V5_LOGIC",
          ILIM: "net.V5_LOGIC",
          GND: "net.GND",
          EN: "net.SENSOR_POWER_EN",
          FAULT_N: "net.SENSOR_POWER_FAULT_N",
          OUT: "net.V5_SENSOR_SW",
        }}
      />
      <ControllerCapacitor
        name="C42"
        {...controllerPlacements.C42}
        value="100nF"
        schX={-10}
        schY={8}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_LOGIC", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R65"
        {...controllerPlacements.R65}
        value="10k"
        schX={-13}
        schY={6}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SENSOR_POWER_EN", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R66"
        {...controllerPlacements.R66}
        value="10k"
        schX={-13}
        schY={3}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_POWER_FAULT_N" }}
      />
      <ControllerCapacitor
        name="C43"
        {...controllerPlacements.C43}
        value="1uF"
        schX={-1}
        schY={6}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C44"
        {...controllerPlacements.C44}
        value="10uF"
        schX={-1}
        schY={3}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R67"
        {...controllerPlacements.R67}
        value="10k"
        schX={-1}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R68"
        {...controllerPlacements.R68}
        value="6.8"
        schX={5}
        schY={4}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.V5_SENSOR" }}
      />
      <CablePowerTvs
        name="D7"
        {...controllerPlacements.D7}
        schX={10}
        schY={4}
        schSheetName="SensorInterface"
        connections={{ K: "net.V5_SENSOR", A: "net.GND" }}
      />
      <SensorHeader
        name="J3"
        {...controllerPlacements.J3}
        schX={12}
        schY={-1}
        schSheetName="SensorInterface"
        connections={{
          V5_SENSOR: "net.V5_SENSOR",
          SDA_CABLE: "net.SDA_CABLE",
          SCL_CABLE: "net.SCL_CABLE",
          GND_4: "net.GND",
          GND_5: "net.GND",
          GND_6: "net.GND",
        }}
      />
      <CableSignalEsd
        name="U11"
        {...controllerPlacements.U11}
        schX={7}
        schY={-7}
        schSheetName="SensorInterface"
        connections={{ IO1: "net.SDA_CABLE", IO2: "net.SCL_CABLE", GND: "net.GND" }}
      />
      <ControllerResistor
        name="R62"
        {...controllerPlacements.R62}
        value="22"
        schX={0}
        schY={-6}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SDA_BUFFER_A", pin2: "net.SDA_CABLE" }}
      />
      <ControllerResistor
        name="R63"
        {...controllerPlacements.R63}
        value="22"
        schX={0}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SCL_BUFFER_A", pin2: "net.SCL_CABLE" }}
      />
      <SensorBusBuffer
        name="U3"
        {...controllerPlacements.U3}
        schX={-7}
        schY={-6}
        schSheetName="SensorInterface"
        connections={{
          VCCA: "net.V3V3",
          VCCB: "net.V3V3",
          GND: "net.GND",
          EN: "net.SENSOR_BUS_EN",
          SDAA: "net.SDA_BUFFER_A",
          SCLA: "net.SCL_BUFFER_A",
          SDAB: "net.SENSOR_SDA",
          SCLB: "net.SENSOR_SCL",
        }}
      />
      <ControllerCapacitor
        name="C40"
        {...controllerPlacements.C40}
        value="100nF"
        schX={-11}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C41"
        {...controllerPlacements.C41}
        value="100nF"
        schX={-7}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R60"
        {...controllerPlacements.R60}
        value="2.7k"
        schX={-13}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_SDA" }}
      />
      <ControllerResistor
        name="R61"
        {...controllerPlacements.R61}
        value="2.7k"
        schX={-9}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_SCL" }}
      />
      <ControllerResistor
        name="R64"
        {...controllerPlacements.R64}
        value="10k"
        schX={-13}
        schY={-6}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SENSOR_BUS_EN", pin2: "net.GND" }}
      />
      {/* Signal islands require real anchored labels. Power/ground use the
          compiler's electrical rail labels; avoid overlapping duplicate labels. */}
      {(
        [
          ["SENSOR_POWER_EN", "U5", [3]],
          ["SENSOR_POWER_FAULT_N", "U5", [4]],
          ["SENSOR_BUS_EN", "U3", [5]],
          ["SDA_BUFFER_A", "U3", [3]],
          ["SCL_BUFFER_A", "U3", [2]],
          ["SENSOR_SDA", "U3", [6]],
          ["SENSOR_SCL", "U3", [7]],
          ["SDA_CABLE", "J3", [2]],
          ["SCL_CABLE", "J3", [3]],
          ["SENSOR_SDA", "R60", [2]],
          ["SENSOR_SCL", "R61", [2]],
          ["SDA_BUFFER_A", "R62", [1]],
          ["SDA_CABLE", "R62", [2]],
          ["SCL_BUFFER_A", "R63", [1]],
          ["SCL_CABLE", "R63", [2]],
          ["SENSOR_BUS_EN", "R64", [1]],
          ["SENSOR_POWER_EN", "R65", [1]],
          ["SENSOR_POWER_FAULT_N", "R66", [2]],
        ] as const
      ).map(([net, ref, pins]) =>
        pins.map((pin) => (
          <Fragment key={`${ref}.${pin}`}>
            <netlabel net={net} connectsTo={`.${ref} > .pin${pin}`} />
          </Fragment>
        )),
      )}
    </group>
  );
}

export const sensorInterfaceBoundary = [
  "V5_LOGIC",
  "V3V3",
  "GND",
  "SENSOR_SDA",
  "SENSOR_SCL",
  "SENSOR_BUS_EN",
  "SENSOR_POWER_EN",
  "SENSOR_POWER_FAULT_N",
] as const;
