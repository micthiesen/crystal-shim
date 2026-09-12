import {
  CoilFlyback,
  SnubberCapacitor,
  SnubberResistor,
} from "./suppression-components";

// Final circuit and references, provisional review coordinates. Do not use this
// canvas as a board outline or a mains/secondary isolation layout.
export function MainsSuppression() {
  return (
    <group name="LoadSuppression">
      <CoilFlyback
        name="D1"
        schX={-7}
        schY={-6}
        pcbX={-5}
        pcbY={-12}
        connections={{ K: "net.V5_PSU", A: "net.COIL_DRAIN" }}
      />
      <SnubberResistor
        name="R1"
        schX={-7}
        schY={5}
        pcbX={-17}
        pcbY={14}
        connections={{ pin1: "net.PUMP_L_SW", pin2: "net.SNUBBER_RC" }}
      />
      <SnubberCapacitor
        name="C1"
        schX={6}
        schY={5}
        pcbX={7}
        pcbY={14}
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
