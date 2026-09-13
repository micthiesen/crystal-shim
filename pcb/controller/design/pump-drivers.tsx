import { Fragment } from "react";
import { controllerPlacements as placements } from "./placements";
import { ServiceHeader } from "./micro-fit-components";
import { RelayMosfet } from "./ic-components";
import { PowerSchottky } from "./protection-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

export const pumpChannels = [
  {
    header: "J7",
    mosfet: "Q2",
    diode: "D9",
    series: "R80",
    pulldown: "R81",
    command: "PUMP_TRANSFER",
    gate: "TRANSFER_GATE",
    drain: "TRANSFER_DRAIN",
  },
  {
    header: "J8",
    mosfet: "Q3",
    diode: "D10",
    series: "R82",
    pulldown: "R83",
    command: "PUMP_CHLORINE",
    gate: "CHLORINE_GATE",
    drain: "CHLORINE_DRAIN",
  },
  {
    header: "J9",
    mosfet: "Q4",
    diode: "D11",
    series: "R84",
    pulldown: "R85",
    command: "PUMP_DECHLOR",
    gate: "DECHLOR_GATE",
    drain: "DECHLOR_DRAIN",
  },
] as const;

// On/off 12 V brushed DC loads, <=1 A continuous each and <=2 A combined.
// Fused supply enters J6; high-current return runs directly to J6.2.
// Present firmware holds all three commands low; future control is deferred.
export function ControllerPumpDrivers() {
  return (
    <group name="PumpDrivers" schSheetName="Pumps">
      <ServiceHeader
        name="J6"
        {...placements.J6}
        schX={-15}
        schY={12}
        schSheetName="Pumps"
        connections={{ POSITIVE: "net.V12_PUMP", RETURN: "net.GND" }}
      />
      <ControllerCapacitor
        name="C47"
        {...placements.C47}
        value="22uF"
        schX={-10}
        schY={12}
        schSheetName="Pumps"
        connections={{ pin1: "net.V12_PUMP", pin2: "net.GND" }}
      />
      {pumpChannels.map((c, i) => {
        const y = 6 - i * 10;
        return (
          <Fragment key={c.header}>
            <ServiceHeader
              name={c.header}
              {...placements[c.header]}
              schX={10}
              schY={y}
              schSheetName="Pumps"
              connections={{ POSITIVE: "net.V12_PUMP", RETURN: `net.${c.drain}` }}
            />
            <PowerSchottky
              name={c.diode}
              {...placements[c.diode]}
              schX={5}
              schY={y}
              schSheetName="Pumps"
              connections={{ K: "net.V12_PUMP", A: `net.${c.drain}` }}
            />
            <RelayMosfet
              name={c.mosfet}
              {...placements[c.mosfet]}
              schX={0}
              schY={y}
              schSheetName="Pumps"
              connections={{ G: `net.${c.gate}`, S: "net.GND", D: `net.${c.drain}` }}
            />
            <ControllerResistor
              name={c.series}
              {...placements[c.series]}
              value="100"
              schX={-6}
              schY={y}
              schSheetName="Pumps"
              connections={{ pin1: `net.${c.command}`, pin2: `net.${c.gate}` }}
            />
            <ControllerResistor
              name={c.pulldown}
              {...placements[c.pulldown]}
              value="10k"
              schX={-6}
              schY={y - 3}
              schSheetName="Pumps"
              connections={{ pin1: `net.${c.gate}`, pin2: "net.GND" }}
            />
            {[
              [c.command, `.${c.series} > .pin1`],
              [c.gate, `.${c.mosfet} > .pin1`],
              [c.gate, `.${c.series} > .pin2`],
              [c.gate, `.${c.pulldown} > .pin1`],
              [c.drain, `.${c.mosfet} > .pin3`],
              [c.drain, `.${c.diode} > .pin2`],
              [c.drain, `.${c.header} > .pin2`],
            ].map(([net, port]) => (
              <Fragment key={port}>
                <netlabel net={net} connectsTo={port} />
              </Fragment>
            ))}
          </Fragment>
        );
      })}
    </group>
  );
}
