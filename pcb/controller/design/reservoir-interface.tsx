import { Fragment } from "react";
import { controllerPlacements as p } from "./placements";
import { SensorBusBuffer } from "./ic-components";
import { SensorHeader } from "./micro-fit-components";
import { CablePowerTvs, CableSignalEsd } from "./cable-protection-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

// Second fixed-address FDC1004 gets its own two-wire bus. Both short sensor
// ports share the existing switched feed and recovery enable; no I/O expander.
export function ControllerReservoirInterface() {
  return (
    <group name="ReservoirInterface" schSheetName="Reservoir">
      <SensorHeader
        name="J5"
        {...p.J5}
        schX={12}
        schY={0}
        schSheetName="Reservoir"
        connections={{
          V5_SENSOR: "net.V5_RESERVOIR",
          SDA_CABLE: "net.RESERVOIR_SDA_CABLE",
          SCL_CABLE: "net.RESERVOIR_SCL_CABLE",
          GND_4: "net.GND",
          GND_5: "net.GND",
          GND_6: "net.GND",
        }}
      />
      <SensorBusBuffer
        name="U12"
        {...p.U12}
        schX={0}
        schY={0}
        schSheetName="Reservoir"
        connections={{
          VCCA: "net.V3V3",
          VCCB: "net.V3V3",
          GND: "net.GND",
          EN: "net.SENSOR_BUS_EN",
          SDAA: "net.RESERVOIR_SDA_PROTECTED",
          SCLA: "net.RESERVOIR_SCL_PROTECTED",
          SDAB: "net.RESERVOIR_SDA",
          SCLB: "net.RESERVOIR_SCL",
        }}
      />
      <CableSignalEsd
        name="U13"
        {...p.U13}
        schX={8}
        schY={-5}
        schSheetName="Reservoir"
        connections={{
          IO1: "net.RESERVOIR_SDA_CABLE",
          IO2: "net.RESERVOIR_SCL_CABLE",
          GND: "net.GND",
        }}
      />
      <CablePowerTvs
        name="D8"
        {...p.D8}
        schX={12}
        schY={6}
        schSheetName="Reservoir"
        connections={{ K: "net.V5_RESERVOIR", A: "net.GND" }}
      />
      <ControllerResistor
        name="R69"
        {...p.R69}
        value="6.8"
        schX={6}
        schY={6}
        schSheetName="Reservoir"
        connections={{ pin1: "net.V5_SENSOR_SW", pin2: "net.V5_RESERVOIR" }}
      />
      {[
        ["R70", "22", "RESERVOIR_SDA_CABLE", "RESERVOIR_SDA_PROTECTED", 6, 2],
        ["R71", "22", "RESERVOIR_SCL_CABLE", "RESERVOIR_SCL_PROTECTED", 6, -2],
        ["R72", "2.7k", "V3V3", "RESERVOIR_SDA", -6, 2],
        ["R73", "2.7k", "V3V3", "RESERVOIR_SCL", -6, -2],
      ].map(([ref, value, a, b, x, y]) => (
        <ControllerResistor
          key={ref}
          name={ref as "R70"}
          {...p[ref as "R70"]}
          value={value as "22" | "2.7k"}
          schX={x as number}
          schY={y as number}
          schSheetName="Reservoir"
          connections={{ pin1: `net.${a}`, pin2: `net.${b}` }}
        />
      ))}
      <ControllerCapacitor
        name="C45"
        {...p.C45}
        value="100nF"
        schX={-3}
        schY={6}
        schSheetName="Reservoir"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C46"
        {...p.C46}
        value="100nF"
        schX={0}
        schY={6}
        schSheetName="Reservoir"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      {[
        ["SENSOR_BUS_EN", ".U12 > .pin5"],
        ["V5_RESERVOIR", ".J5 > .pin1"],
        ["V5_RESERVOIR", ".R69 > .pin2"],
        ["V5_RESERVOIR", ".D8 > .pin1"],
        ["RESERVOIR_SDA_CABLE", ".J5 > .pin2"],
        ["RESERVOIR_SCL_CABLE", ".J5 > .pin3"],
        ["RESERVOIR_SDA_CABLE", ".R70 > .pin1"],
        ["RESERVOIR_SCL_CABLE", ".R71 > .pin1"],
        ["RESERVOIR_SDA_CABLE", ".U13 > .pin4"],
        ["RESERVOIR_SCL_CABLE", ".U13 > .pin5"],
        ["RESERVOIR_SDA_PROTECTED", ".R70 > .pin2"],
        ["RESERVOIR_SCL_PROTECTED", ".R71 > .pin2"],
        ["RESERVOIR_SDA_PROTECTED", ".U12 > .pin3"],
        ["RESERVOIR_SCL_PROTECTED", ".U12 > .pin2"],
        ["RESERVOIR_SDA", ".U12 > .pin6"],
        ["RESERVOIR_SCL", ".U12 > .pin7"],
        ["RESERVOIR_SDA", ".R72 > .pin2"],
        ["RESERVOIR_SCL", ".R73 > .pin2"],
      ].map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}
