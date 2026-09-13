import { ControllerLogicPower } from "./logic-power";
import { ControllerModuleControls } from "./module-controls";
import { ControllerRelayDrive } from "./relay-drive";
import { ControllerSensorInterface } from "./sensor-interface";
import { ControllerServiceInput } from "./service-input";
import { ControllerTestPoints } from "./test-points";
import { ControllerUsbInterface } from "./usb-interface";
import { controllerMountingHoles } from "./placements";
import { Fragment } from "react";
import { ControllerPumpDrivers } from "./pump-drivers";
import { ControllerReservoirInterface } from "./reservoir-interface";

// One controller schematic, using the final-use electrical sections. The source
// uses explicit complete-board placements. Do not export for fabrication until
// placement review, mechanical fit and declared native augmentations pass.
export default function ControllerCircuit() {
  return (
    <board
      width={110}
      height={110}
      thickness={1.6}
      layers={4}
      material="fr4"
      routingDisabled
      pcbRelative
    >
      <schematicsheet
        name="Relay"
        displayName="Relay permission and mains-board harness"
        sheetIndex={0}
      />
      <schematicsheet name="Power" displayName="Logic power" sheetIndex={1} />
      <schematicsheet
        name="Service"
        displayName="Known-adapter service input"
        sheetIndex={2}
      />
      <schematicsheet
        name="Module"
        displayName="ESP module and local controls"
        sheetIndex={3}
      />
      <schematicsheet
        name="USB"
        displayName="Self-powered USB data interface"
        sheetIndex={4}
      />
      <schematicsheet
        name="SensorInterface"
        displayName="Protected sensor feed and buffered bus"
        sheetIndex={5}
      />
      <schematicsheet
        name="TestPoints"
        displayName="Test and UART service pads"
        sheetIndex={6}
      />
      <schematicsheet
        name="Pumps"
        displayName="Three future accessory pump outputs"
        sheetIndex={7}
      />
      <schematicsheet
        name="Reservoir"
        displayName="Second short sensor interface"
        sheetIndex={8}
      />
      <ControllerPumpDrivers />
      <ControllerReservoirInterface />
      <ControllerRelayDrive />
      <ControllerLogicPower />
      <ControllerServiceInput />
      <ControllerModuleControls />
      <ControllerUsbInterface />
      <ControllerSensorInterface />
      <ControllerTestPoints />
      {controllerMountingHoles.map((hole) => (
        <Fragment key={hole.ref}>
          <hole name={hole.ref} pcbX={hole.x} pcbY={hole.y} diameter={3.2} />
        </Fragment>
      ))}
    </board>
  );
}
