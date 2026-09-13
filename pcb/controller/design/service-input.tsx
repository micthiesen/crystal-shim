import { controllerPlacements } from "./placements";
import { ServiceHeader } from "./micro-fit-components";
import { ControllerCapacitor } from "./passive-components";

// Known 5 V adapter, fused in its service lead. Mains-disconnected servicing only.
// D2 in logic-power retains polarity/source isolation; no second eFuse bank.
export function ControllerServiceInput() {
  return (
    <group name="ServiceInput" schSheetName="Service">
      <ServiceHeader
        name="J2"
        {...controllerPlacements.J2}
        schX={-4}
        schY={0}
        schSheetName="Service"
        connections={{ POSITIVE: "net.V5_SERVICE", RETURN: "net.GND" }}
      />
      <ControllerCapacitor
        name="C20"
        {...controllerPlacements.C20}
        value="1uF"
        schX={0}
        schY={0}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE", pin2: "net.GND" }}
      />
      <ControllerCapacitor
        name="C21"
        {...controllerPlacements.C21}
        value="100nF"
        schX={4}
        schY={0}
        schSheetName="Service"
        connections={{ pin1: "net.V5_SERVICE", pin2: "net.GND" }}
      />
      <netlabel net="V5_SERVICE" connectsTo=".J2 > .pin1" />
    </group>
  );
}
export const serviceInputBoundary = ["V5_SERVICE", "GND"] as const;
