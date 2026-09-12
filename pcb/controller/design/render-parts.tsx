// A compiler/visual review of actual part models, never a product-board export.
import { mkdir } from "node:fs/promises";
import { Fragment } from "react";
import { Circuit } from "tscircuit";
import { Esp32C6Wroom } from "./esp32-c6-wroom";
import { ControllerBuck, RelayMosfet, SensorBusBuffer } from "./ic-components";
import { PowerSchottky, UsbEsdProtection } from "./protection-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";
import { BuckInductor, ControllerButton, StatusLed } from "./assembly-components";
import { PsuHeader, SensorHeader, ServiceHeader } from "./micro-fit-components";
import { UsbConnector } from "./usb-connector";
import { ServiceEfuse, BidirectionalSupplyTvs } from "./service-protection-components";
import {
  PsuSupervisor,
  SensorPowerFeed,
  RelayPermissionGate,
  UsbPresenceDetector,
  UsbDataSwitch,
} from "./logic-components";

const circuit = new Circuit();
circuit.add(
  <board width={140} height={170} routingDisabled>
    <SensorHeader name="J1" pcbX={-50} pcbY={42} schX={-50} schY={25} />
    <ServiceHeader name="J2" pcbX={-25} pcbY={42} schX={-25} schY={25} />
    <PsuHeader name="J3" pcbX={0} pcbY={42} schX={0} schY={25} />
    <UsbConnector name="J4" pcbX={25} pcbY={42} schX={25} schY={25} />
    <silkscreenrect pcbX={25} pcbY={42} width={8.94} height={7.35} />
    <silkscreentext text="MATING / PCB EDGE" pcbX={25} pcbY={36} fontSize={0.8} />
    <ServiceEfuse name="U10" pcbX={50} pcbY={42} schX={50} schY={25} />
    <BidirectionalSupplyTvs name="D5" pcbX={-50} pcbY={12} schX={-40} schY={0} />
    <Esp32C6Wroom name="U1" pcbX={-25} pcbY={0} schX={-20} schY={0} />
    <ControllerBuck name="U2" pcbX={0} pcbY={12} schX={0} schY={0} />
    <RelayMosfet name="Q1" pcbX={25} pcbY={12} schX={15} schY={0} />
    <SensorBusBuffer name="U3" pcbX={0} pcbY={-10} schX={0} schY={-15} />
    <PsuSupervisor name="U4" pcbX={25} pcbY={-10} schX={20} schY={-15} />
    <SensorPowerFeed name="U5" pcbX={-25} pcbY={-30} schX={-20} schY={-30} />
    <RelayPermissionGate name="U6" pcbX={0} pcbY={-30} schX={0} schY={-30} />
    <UsbPresenceDetector name="U7" pcbX={25} pcbY={-30} schX={20} schY={-30} />
    <UsbDataSwitch name="U8" pcbX={42} pcbY={0} schX={35} schY={0} />
    <PowerSchottky name="D1" pcbX={-50} pcbY={-50} schX={-50} schY={-50} />
    <UsbEsdProtection name="U9" pcbX={-25} pcbY={-50} schX={-25} schY={-50} />
    <ControllerResistor name="R1" value="22" pcbX={0} pcbY={-50} schX={0} schY={-50} />
    <ControllerResistor
      name="R2"
      value="330"
      pcbX={25}
      pcbY={-50}
      schX={25}
      schY={-50}
    />
    <ControllerCapacitor
      name="C1"
      value="100nF"
      pcbX={50}
      pcbY={-50}
      schX={50}
      schY={-50}
    />
    <ControllerCapacitor
      name="C2"
      value="1uF"
      pcbX={-50}
      pcbY={-70}
      schX={-50}
      schY={-70}
    />
    <BuckInductor name="L1" pcbX={-25} pcbY={-70} schX={-25} schY={-70} />
    <StatusLed name="D4" pcbX={0} pcbY={-70} schX={0} schY={-70} />
    <ControllerButton name="SW1" pcbX={25} pcbY={-70} schX={25} schY={-70} />
    <ControllerCapacitor
      name="C3"
      value="22uF"
      pcbX={50}
      pcbY={-70}
      schX={50}
      schY={-70}
    />
    {[
      ["SENSOR 43045-0600", -47, 54],
      ["SERVICE 43045-0200", -25, 54],
      ["PSU 43650-0300", 3, 54],
      ["USB4105-GF-A", 25, 54],
      ["TPS259470A", 50, 54],
      ["SMBJ8.0CA", -50, 17],
      ["STPS2L40U", -50, -45],
      ["USBLC6-2SC6", -25, -45],
      ["ERJ 22R", 0, -45],
      ["ERA 330R", 25, -45],
      ["TDK 100nF", 50, -45],
      ["TDK 1uF", -50, -65],
      ["SRP5030TA", -25, -65],
      ["LED K / A", 0, -65],
      ["B3F-1002-G", 28, -65],
      ["MURATA 22uF", 50, -65],
    ].map(([text, x, y]) => (
      <Fragment key={String(text)}>
        <silkscreentext
          text={String(text)}
          pcbX={Number(x)}
          pcbY={Number(y)}
          fontSize={1.1}
        />
      </Fragment>
    ))}
    <silkscreentext
      text="COMPONENT LAND REVIEW / NOT A BOARD"
      pcbX={0}
      pcbY={26}
      fontSize={1.4}
    />
    <silkscreentext text="ESP32-C6-WROOM-1" pcbX={-25} pcbY={-13} fontSize={1.2} />
    <silkscreentext text="AP63203" pcbX={0} pcbY={17} fontSize={1.2} />
    <silkscreentext text="AO3400A" pcbX={25} pcbY={17} fontSize={1.2} />
    <silkscreentext text="TCA9517A" pcbX={0} pcbY={-5} fontSize={1.2} />
    <silkscreentext text="TPS3808" pcbX={25} pcbY={-5} fontSize={1.2} />
    <silkscreentext text="TPS2553" pcbX={-25} pcbY={-25} fontSize={1.2} />
    <silkscreentext text="LVC1G08" pcbX={0} pcbY={-25} fontSize={1.2} />
    <silkscreentext text="LVC1G14" pcbX={25} pcbY={-25} fontSize={1.2} />
    <silkscreentext text="FSUSB42" pcbX={42} pcbY={5} fontSize={1.2} />
  </board>,
);
await circuit.renderUntilSettled();
const output = "dist/controller/part-review";
await mkdir(output, { recursive: true });
await Bun.write(
  `${output}/circuit.json`,
  `${JSON.stringify(circuit.getCircuitJson(), null, 2)}\n`,
);
await Bun.write(`${output}/lands.svg`, await circuit.getSvg({ view: "pcb" }));
console.log(`Wrote ${output}/lands.svg and circuit.json (component review only)`);
