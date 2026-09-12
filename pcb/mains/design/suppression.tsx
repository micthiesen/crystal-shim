import {
  CoilFlyback,
  SnubberCapacitor,
  SnubberResistor,
} from "./suppression-components";
import type { MainsPlacement } from "./placements";

const reviewPlacements = {
  D1: { pcbX: -5, pcbY: -12, pcbRotation: 0, layer: "top" },
  R1: { pcbX: -17, pcbY: 14, pcbRotation: 0, layer: "top" },
  C1: { pcbX: 7, pcbY: 14, pcbRotation: 0, layer: "top" },
} as const;

// Final circuit and references. The complete board passes its placement proposal;
// standalone defaults are a component-review canvas, not an isolation layout.
export function MainsSuppression({
  placements = reviewPlacements,
  sheetName,
}: {
  placements?: Record<keyof typeof reviewPlacements, MainsPlacement>;
  sheetName?: string;
} = {}) {
  return (
    <group name="LoadSuppression" schSheetName={sheetName}>
      <CoilFlyback
        name="D1"
        schX={-7}
        schY={-6}
        {...placements.D1}
        connections={{ K: "net.V5_PSU", A: "net.COIL_DRAIN" }}
      />
      <SnubberResistor
        name="R1"
        schX={-7}
        schY={5}
        {...placements.R1}
        connections={{ pin1: "net.PUMP_L_SW", pin2: "net.SNUBBER_RC" }}
      />
      <SnubberCapacitor
        name="C1"
        schX={6}
        schY={5}
        {...placements.C1}
        connections={{ pin1: "net.SNUBBER_RC", pin2: "net.PUMP_N_FILTERED" }}
      />
      <netlabel net="V5_PSU" connectsTo=".D1 > .K" />
      <netlabel net="COIL_DRAIN" connectsTo=".D1 > .A" />
      <netlabel net="PUMP_L_SW" connectsTo=".R1 > .pin1" />
      <netlabel net="SNUBBER_RC" connectsTo=".R1 > .pin2" />
      <netlabel net="SNUBBER_RC" connectsTo=".C1 > .pin1" />
      <netlabel net="PUMP_N_FILTERED" connectsTo=".C1 > .pin2" />
    </group>
  );
}
