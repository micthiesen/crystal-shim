// A compiler/visual review of actual part models, never a product-board export.
import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { Esp32C6Wroom } from "./esp32-c6-wroom";
import { ControllerBuck, RelayMosfet, SensorBusBuffer } from "./ic-components";
import {
  PsuSupervisor,
  SensorPowerFeed,
  RelayPermissionGate,
  UsbPresenceDetector,
  UsbDataSwitch,
} from "./logic-components";

const circuit = new Circuit();
circuit.add(
  <board width={110} height={85} routingDisabled>
    <Esp32C6Wroom name="U1" pcbX={-25} pcbY={0} schX={-20} schY={0} />
    <ControllerBuck name="U2" pcbX={0} pcbY={12} schX={0} schY={0} />
    <RelayMosfet name="Q1" pcbX={25} pcbY={12} schX={15} schY={0} />
    <SensorBusBuffer name="U3" pcbX={0} pcbY={-10} schX={0} schY={-15} />
    <PsuSupervisor name="U4" pcbX={25} pcbY={-10} schX={20} schY={-15} />
    <SensorPowerFeed name="U5" pcbX={-25} pcbY={-30} schX={-20} schY={-30} />
    <RelayPermissionGate name="U6" pcbX={0} pcbY={-30} schX={0} schY={-30} />
    <UsbPresenceDetector name="U7" pcbX={25} pcbY={-30} schX={20} schY={-30} />
    <UsbDataSwitch name="U8" pcbX={42} pcbY={0} schX={35} schY={0} />
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
