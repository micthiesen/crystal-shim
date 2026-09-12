// Component and pin-map review only; these positions are not a mains PCB layout.
import { mkdir } from "node:fs/promises";
import { Fragment } from "react";
import { Circuit } from "tscircuit";
import { MainsHeader, mainsHeaderNets, type MainsHeaderRef } from "./mains-headers";

const refs: MainsHeaderRef[] = ["J1", "J2", "J3", "J4"];
const circuit = new Circuit();
circuit.add(
  <board width={155} height={90} routingDisabled>
    {refs.map((ref, i) => (
      <Fragment key={ref}>
        <MainsHeader
          name={ref}
          pcbX={i % 2 === 0 ? -52 : 15}
          pcbY={i < 2 ? 17 : -20}
          schX={i % 2 === 0 ? -10 : 10}
          schY={i < 2 ? 7 : -7}
        />
        <netlabel net={mainsHeaderNets[ref][0]} connectsTo={`.${ref} > .LINE`} />
        <netlabel net={mainsHeaderNets[ref][1]} connectsTo={`.${ref} > .NEUTRAL`} />
        <silkscreentext
          text={`${ref}: 1 LINE / 2 NEUTRAL`}
          pcbX={i % 2 === 0 ? -45 : 28}
          pcbY={i < 2 ? 32 : -5}
          fontSize={1}
        />
        <silkscreentext
          text="LATCH ABOVE; BODY POSE PROVISIONAL"
          pcbX={i % 2 === 0 ? -45 : 28}
          pcbY={i < 2 ? 4 : -34}
          fontSize={0.8}
        />
      </Fragment>
    ))}
    <silkscreentext
      text="SABRE HEADER REVIEW / NOT A BOARD"
      pcbX={0}
      pcbY={40}
      fontSize={1.3}
    />
  </board>,
);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = json.filter((e) => e.type.includes("error"));
if (errors.length) throw new Error(JSON.stringify(errors));
const output = "dist/mains/header-review";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, JSON.stringify(json, null, 2) + "\n");
await Bun.write(`${output}/lands.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(`Wrote ${output} (component review only)`);
