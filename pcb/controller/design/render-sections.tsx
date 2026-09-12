import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { ControllerRelayDrive } from "./relay-drive";
import { ControllerLogicPower } from "./logic-power";

const circuit = new Circuit();
circuit.add(
  <board width={70} height={110} routingDisabled>
    <schematicsheet
      name="Relay"
      displayName="Controller relay permission"
      sheetIndex={0}
    />
    <ControllerRelayDrive />
    <silkscreentext
      text="INCOMPLETE CONTROLLER / RELAY SECTION"
      pcbX={0}
      pcbY={10}
      fontSize={1.3}
    />
  </board>,
);
await circuit.renderUntilSettled();
const output = "dist/controller/section-review";
await mkdir(output, { recursive: true });
await Bun.write(
  `${output}/circuit.json`,
  `${JSON.stringify(circuit.getCircuitJson(), null, 2)}\n`,
);
await Bun.write(`${output}/pcb.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(`Wrote ${output} (incomplete controller section review)`);

const power = new Circuit();
power.add(
  <board width={70} height={110} routingDisabled>
    <schematicsheet name="Power" displayName="Controller logic power" sheetIndex={0} />
    <ControllerLogicPower />
    <silkscreentext
      text="INCOMPLETE CONTROLLER / POWER SECTION"
      pcbX={0}
      pcbY={10}
      fontSize={1.3}
    />
  </board>,
);
await power.renderUntilSettled();
await Bun.write(
  `${output}/power-circuit.json`,
  `${JSON.stringify(power.getCircuitJson(), null, 2)}\n`,
);
await Bun.write(`${output}/power-pcb.svg`, await power.getSvg({ view: "pcb" }));
await Bun.write(
  `${output}/power-schematic.svg`,
  await power.getSvg({ view: "schematic" }),
);
