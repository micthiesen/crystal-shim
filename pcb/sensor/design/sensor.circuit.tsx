import { Fragment } from "react";
import { SensorHeader } from "../../controller/design/micro-fit-components";
import { ControllerCapacitor } from "../../controller/design/passive-components";
import { CableSignalEsd } from "../../controller/design/cable-protection-components";
import { PowerSchottky } from "../../controller/design/protection-components";
import { Fdc1004, SensorLdo, SensorResistor } from "./components";
import { Electrodes, electrodeRectangles, electrodeNets } from "./electrodes";
import { sensorPlacements as p } from "./placements";
export const sensorConnections: Record<string, Record<string, string>> = {
  J1: {
    V5_SENSOR: "V5_SENSOR",
    SDA_CABLE: "SDA_CABLE",
    SCL_CABLE: "SCL_CABLE",
    GND_4: "GND",
    GND_5: "GND",
    GND_6: "GND",
  },
  U1: {
    SHLD1: "SHLD1",
    CIN_LEVEL: "CIN_LEVEL",
    CIN_RL: "CIN_RL",
    SHLD2: "SHLD2",
    GND: "GND",
    VDD: "V3V3_SENSOR",
    SDA: "I2C_SDA",
    SCL: "I2C_SCL",
  },
  U2: { IN: "V5_SENSOR", GND: "GND", EN: "V5_SENSOR", NC: "GND", OUT: "V3V3_SENSOR" },
  U3: { IO1: "SDA_CABLE", IO2: "SCL_CABLE", GND: "GND" },
  D2: { K: "V5_SENSOR", A: "V3V3_SENSOR" },
  C1: { pin1: "V5_SENSOR", pin2: "GND" },
  C2: { pin1: "V3V3_SENSOR", pin2: "GND" },
  C3: { pin1: "V3V3_SENSOR", pin2: "GND" },
  C4: { pin1: "V3V3_SENSOR", pin2: "GND" },
  R1: { pin1: "SDA_CABLE", pin2: "I2C_SDA" },
  R2: { pin1: "SCL_CABLE", pin2: "I2C_SCL" },
  R3: { pin1: "V3V3_SENSOR", pin2: "I2C_SDA" },
  R4: { pin1: "V3V3_SENSOR", pin2: "I2C_SCL" },
  R5: { pin1: "V5_SENSOR", pin2: "GND" },
  R6: { pin1: "V3V3_SENSOR", pin2: "GND" },
  E1: Object.fromEntries(
    electrodeRectangles.map(([id, pin]) => [id, electrodeNets[pin]]),
  ),
};
const conn = (ref: string) =>
  Object.fromEntries(
    Object.entries(sensorConnections[ref]!).map(([pin, net]) => [pin, `net.${net}`]),
  );
export default function SensorCircuit() {
  return (
    <board
      width={38}
      height={86}
      layers={2}
      thickness={1.6}
      material="fr4"
      routingDisabled
      pcbRelative
    >
      <schematicsheet
        name="TankSensor"
        displayName="Tank sensor, local 3.3 V and stored dry baseline"
        sheetIndex={0}
        sheetWidth={420}
        sheetHeight={280}
      />
      <group name="Sensor" schSheetName="TankSensor">
        <SensorHeader
          name="J1"
          {...p.J1}
          schX={-16}
          schY={8}
          schSheetName="TankSensor"
          connections={conn("J1")}
        />
        <Fdc1004
          name="U1"
          {...p.U1}
          schX={4}
          schY={-7}
          schSheetName="TankSensor"
          connections={conn("U1")}
        />
        <SensorLdo
          name="U2"
          {...p.U2}
          schX={0}
          schY={8}
          schSheetName="TankSensor"
          connections={conn("U2")}
        />
        <CableSignalEsd
          name="U3"
          {...p.U3}
          schX={-16}
          schY={-2}
          schSheetName="TankSensor"
          connections={conn("U3")}
        />

        <PowerSchottky
          name="D2"
          {...p.D2}
          schX={0}
          schY={14}
          schSheetName="TankSensor"
          connections={conn("D2")}
        />
        {(
          [
            ["C1", "10uF", -6, 8],
            ["C2", "10uF", 6, 8],
            ["C3", "100nF", 3, -13],
            ["C4", "1uF", 7, -13],
          ] as const
        ).map(([ref, value, x, y]) => (
          <ControllerCapacitor
            key={ref}
            name={ref}
            {...p[ref]}
            value={value}
            schX={x}
            schY={y}
            schSheetName="TankSensor"
            connections={conn(ref)}
          />
        ))}
        {(
          [
            ["R1", "22", -10, -5],
            ["R2", "22", -10, -9],
            ["R3", "2.7k", -4, -5],
            ["R4", "2.7k", -4, -9],
            ["R5", "10k", -6, 13],
            ["R6", "3.01k", 10, 8],
          ] as const
        ).map(([ref, value, x, y]) => (
          <SensorResistor
            key={ref}
            name={ref}
            {...p[ref]}
            value={value}
            schX={x}
            schY={y}
            schSheetName="TankSensor"
            connections={conn(ref)}
          />
        ))}
        <Electrodes />
        {Object.entries(sensorConnections).flatMap(([ref, pins]) =>
          Object.entries(pins)
            .filter(([, net]) => !["GND", "V5_SENSOR", "V3V3_SENSOR"].includes(net))
            .map(([pin, net]) => (
              <Fragment key={`${ref}.${pin}`}>
                <netlabel net={net} connectsTo={`.${ref} > .${pin}`} />
              </Fragment>
            )),
        )}
      </group>
    </board>
  );
}
