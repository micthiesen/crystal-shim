// Visual review of selected component models, not a mains board or fabrication input.
import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { IsolatedSupply, PumpRelay } from "./power-components";

const circuit = new Circuit();
circuit.add(
  <board width={125} height={70} routingDisabled>
    <IsolatedSupply name="U1" pcbX={-53} pcbY={15} schX={-7} />
    <PumpRelay name="K1" pcbX={14} pcbY={8} schX={7} />
    <silkscreentext
      text="COMPONENT-SIDE LAND REVIEW / NOT A BOARD"
      pcbX={0}
      pcbY={27}
      fontSize={1.3}
    />
    <silkscreentext text="IRM-10-5" pcbX={-31} pcbY={20} fontSize={1.3} />
    <silkscreentext text="G5RL-1A-TV8 DC5" pcbX={27} pcbY={20} fontSize={1.3} />
    <silkscreentext text="3: -V / 4: +V" pcbX={-43} pcbY={-18} fontSize={1} />
    <silkscreentext text="1: N / 2: L" pcbX={-18} pcbY={-18} fontSize={1} />
    <silkscreentext text="3/4: CONTACTS" pcbX={16} pcbY={-10} fontSize={1} />
    <silkscreentext text="1/5: COIL" pcbX={39} pcbY={-10} fontSize={1} />
  </board>,
);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = json.filter((e) => e.type.includes("error"));
if (errors.length) throw new Error(JSON.stringify(errors));
const output = "dist/mains/power-part-review";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, JSON.stringify(json, null, 2) + "\n");
await Bun.write(`${output}/lands.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(`Wrote ${output} (component review only)`);
