import { mkdir } from "node:fs/promises";
import { Circuit } from "tscircuit";
import { Fragment } from "react";
import { schematicConnectivityErrors } from "../../controller/design/schematic-connectivity-check";
import { MainsSecondaryPower, secondaryPowerReviewPlacements } from "./secondary-power";

// Component-review canvas only. These bounds are not a mains-board specification.
const circuit = new Circuit();
circuit.add(
  <board width={180} height={110} routingDisabled pcbRelative>
    <schematicsheet
      name="Secondary"
      displayName="Mains isolated secondary protection"
      sheetIndex={0}
      sheetWidth={400}
      sheetHeight={180}
    />
    <MainsSecondaryPower />
    {Object.entries(secondaryPowerReviewPlacements).map(([ref, placement]) => (
      <Fragment key={ref}>
        <silkscreentext
          text={ref}
          pcbX={placement.pcbX}
          pcbY={placement.pcbY - 2.5}
          fontSize={1}
        />
      </Fragment>
    ))}
    <silkscreentext
      text="SECONDARY PART REVIEW / PROVISIONAL PLACEMENT"
      pcbX={0}
      pcbY={27}
      fontSize={1.3}
    />
  </board>,
);
await circuit.renderUntilSettled();
const json = circuit.getCircuitJson();
const errors = [
  ...json.filter((e) => "error_type" in e || e.type.endsWith("_error")),
  ...schematicConnectivityErrors(json),
];
if (errors.length) throw new Error(JSON.stringify(errors));
const output = "dist/mains/secondary-review";
await mkdir(output, { recursive: true });
await Bun.write(`${output}/circuit.json`, `${JSON.stringify(json, null, 2)}\n`);
await Bun.write(`${output}/pcb.svg`, await circuit.getSvg({ view: "pcb" }));
await Bun.write(`${output}/schematic.svg`, await circuit.getSvg({ view: "schematic" }));
console.log(`Wrote ${output} (section review; no native export)`);
