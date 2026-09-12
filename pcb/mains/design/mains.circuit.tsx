import { Fragment } from "react";
import { MainsPrimary } from "./primary";
import { mainsMountingHoles, mainsPlacements } from "./placements";
import { MainsSecondaryPower } from "./secondary-power";
import { MainsSuppression } from "./suppression";

// Complete electrical capture on the final-use board's proposed allocation.
// Two-layer routing is a project starting choice, not a fabrication profile.
// Conditional occupied/mated envelopes and native isolation/routing review remain.
export default function MainsCircuit() {
  return (
    <board
      width={135}
      height={75}
      thickness={1.6}
      layers={2}
      material="fr4"
      routingDisabled
      pcbRelative
    >
      <schematicsheet
        name="Primary"
        displayName="Fused input, filter interfaces and isolated switching"
        sheetIndex={0}
        sheetWidth={550}
        sheetHeight={280}
      />
      <schematicsheet
        name="Secondary"
        displayName="Protected isolated supply and controller harness"
        sheetIndex={1}
        sheetWidth={400}
        sheetHeight={180}
      />
      <schematicsheet
        name="Suppression"
        displayName="Coil clamp and load-side RC suppression"
        sheetIndex={2}
        sheetWidth={300}
        sheetHeight={200}
      />
      <MainsPrimary />
      <MainsSecondaryPower placements={mainsPlacements} />
      <MainsSuppression placements={mainsPlacements} sheetName="Suppression" />
      {mainsMountingHoles.map((hole) => (
        <Fragment key={hole.ref}>
          <hole name={hole.ref} pcbX={hole.x} pcbY={hole.y} diameter={3.2} />
        </Fragment>
      ))}
    </board>
  );
}
