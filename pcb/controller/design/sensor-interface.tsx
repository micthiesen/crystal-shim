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
        pcbX={-24}
        pcbY={-10}
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
        value="100nF"
        pcbX={-29}
        pcbY={-10}
        schX={-10}
        schY={8}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_LOGIC", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R65"
        value="10k"
        pcbX={-24}
        pcbY={-5}
        schX={-13}
        schY={6}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SENSOR_POWER_EN", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R66"
        value="10k"
        pcbX={-19}
        pcbY={-5}
        schX={-13}
        schY={3}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_POWER_FAULT_N" }}
      />
      <ControllerCapacitor
        name="C43"
        value="1uF"
        pcbX={-24}
        pcbY={-18}
        schX={-1}
        schY={6}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C44"
        value="10uF"
        pcbX={-29}
        pcbY={-19}
        schX={-1}
        schY={3}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R67"
        value="10k"
        pcbX={-20}
        pcbY={-18}
        schX={-1}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R68"
        value="6.8"
        pcbX={-27}
        pcbY={-26}
        pcbRotation={270}
        schX={5}
        schY={4}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.V5_SENSOR" }}
      />
      <CablePowerTvs
        name="D7"
        pcbX={-27}
        pcbY={-35}
        schX={10}
        schY={4}
        schSheetName="SensorInterface"
        connections={{ K: "net.V5_SENSOR", A: "net.GND" }}
      />
      <SensorHeader
        name="J3"
        pcbX={-26}
        pcbY={-50}
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
        pcbX={-12}
        pcbY={-43}
        schX={7}
        schY={-7}
        schSheetName="SensorInterface"
        connections={{ IO1: "net.SDA_CABLE", IO2: "net.SCL_CABLE", GND: "net.GND" }}
      />
      <ControllerResistor
        name="R62"
        value="22"
        pcbX={-15}
        pcbY={-35}
        schX={0}
        schY={-6}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SDA_BUFFER_A", pin2: "net.SDA_CABLE" }}
      />
      <ControllerResistor
        name="R63"
        value="22"
        pcbX={-11}
        pcbY={-35}
        schX={0}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.SCL_BUFFER_A", pin2: "net.SCL_CABLE" }}
      />
      <SensorBusBuffer
        name="U3"
        pcbX={-10}
        pcbY={-22}
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
        value="100nF"
        pcbX={-13}
        pcbY={-18}
        schX={-11}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C41"
        value="100nF"
        pcbX={-6}
        pcbY={-18}
        schX={-7}
        schY={-10}
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R60"
        value="2.7k"
        pcbX={-10}
        pcbY={-12}
        schX={-13}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_SDA" }}
      />
      <ControllerResistor
        name="R61"
        value="2.7k"
        pcbX={-6}
        pcbY={-12}
        schX={-9}
        schY={0}
        schOrientation="vertical"
        schSheetName="SensorInterface"
        connections={{ pin1: "net.V3V3", pin2: "net.SENSOR_SCL" }}
      />
      <ControllerResistor
        name="R64"
        value="10k"
        pcbX={-14}
        pcbY={-26}
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
