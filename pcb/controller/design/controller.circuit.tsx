import { ControllerLogicPower } from "./logic-power";
import { ControllerModuleControls } from "./module-controls";
import { ControllerRelayDrive } from "./relay-drive";
import { ControllerSensorInterface } from "./sensor-interface";
import { ControllerServiceInput } from "./service-input";
import { ControllerTestPoints } from "./test-points";
import { ControllerUsbInterface } from "./usb-interface";

// One controller schematic, using the final-use electrical sections. The source
// currently retains their review placements. Do not export for fabrication until
// complete placement, mechanical fit and declared native augmentations pass.
export default function ControllerCircuit() {
  return (
    <board width={70} height={110} routingDisabled pcbRelative>
      <schematicsheet
        name="Relay"
        displayName="Relay permission and mains-board harness"
        sheetIndex={0}
      />
      <schematicsheet name="Power" displayName="Logic power" sheetIndex={1} />
      <schematicsheet
        name="Service"
        displayName="Protected isolated service input"
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
      <ControllerRelayDrive />
      <ControllerLogicPower />
      <ControllerServiceInput />
      <ControllerModuleControls />
      <ControllerUsbInterface />
      <ControllerSensorInterface />
      <ControllerTestPoints />
    </board>
  );
}
