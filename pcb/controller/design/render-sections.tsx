import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { ControllerRelayDrive } from "./relay-drive";
import { ControllerLogicPower } from "./logic-power";
import { ControllerServiceInput } from "./service-input";
import { ControllerModuleControls } from "./module-controls";
import { ControllerUsbInterface } from "./usb-interface";
import { ControllerTestPoints } from "./test-points";
import { ControllerSensorInterface } from "./sensor-interface";

const sections = [
  {
    prefix: "",
    name: "Relay",
    title: "Controller relay permission",
    content: <ControllerRelayDrive />,
    captionY: 10,
  },
  {
    prefix: "power-",
    name: "Power",
    title: "Controller logic power",
    content: <ControllerLogicPower />,
    captionY: 10,
  },
  {
    prefix: "service-",
    name: "Service",
    title: "Controller service protection",
    content: <ControllerServiceInput />,
    captionY: 10,
  },
  {
    prefix: "module-",
    name: "Module",
    title: "ESP module and local controls",
    content: <ControllerModuleControls />,
    captionY: -30,
  },
  {
    prefix: "usb-",
    name: "USB",
    title: "Controller self-powered USB interface",
    content: <ControllerUsbInterface />,
    captionY: -30,
  },
  {
    prefix: "sensor-",
    name: "SensorInterface",
    title: "Controller sensor power and bus interface",
    content: <ControllerSensorInterface />,
    captionY: 10,
  },
  {
    prefix: "test-points-",
    name: "TestPoints",
    title: "Controller test and UART service pads",
    content: <ControllerTestPoints />,
    captionY: 10,
  },
];
const output = "dist/controller/section-review";
await mkdir(output, { recursive: true });
for (const section of sections) {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} routingDisabled>
      <schematicsheet name={section.name} displayName={section.title} sheetIndex={0} />
      {section.content}
      <silkscreentext
        text={`INCOMPLETE CONTROLLER / ${section.name.toUpperCase()} SECTION`}
        pcbX={0}
        pcbY={section.captionY}
        fontSize={1.3}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  await Bun.write(
    `${output}/${section.prefix}circuit.json`,
    `${JSON.stringify(circuit.getCircuitJson(), null, 2)}\n`,
  );
  await Bun.write(
    `${output}/${section.prefix}pcb.svg`,
    await circuit.getSvg({ view: "pcb" }),
  );
  await Bun.write(
    `${output}/${section.prefix}schematic.svg`,
    await circuit.getSvg({ view: "schematic" }),
  );
}
console.log(`Wrote ${sections.length} incomplete controller sections to ${output}`);
