import { controllerPlacements } from "./placements";
import { UsbConnector } from "./usb-connector";
import { UsbDataSwitch, UsbPresenceDetector } from "./logic-components";
import { UsbEsdProtection } from "./protection-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

// Connected final-controller section, with reserved references and named-net
// boundaries. Render inside a routingDisabled board. These separate-section
// placements are provisional; USB routing and module-side resistor placement
// belong to the complete controller layout.
export function ControllerUsbInterface() {
  return (
    <group name="UsbInterface" schSheetName="USB">
      <UsbConnector
        name="J4"
        {...controllerPlacements.J4}
        schX={-11}
        schY={0}
        schSheetName="USB"
        connections={{
          A1: "net.GND",
          A12: "net.GND",
          B1: "net.GND",
          B12: "net.GND",
          SH: "net.GND",
          A4: "net.USB_VBUS",
          A9: "net.USB_VBUS",
          B4: "net.USB_VBUS",
          B9: "net.USB_VBUS",
          A5: "net.USB_CC1",
          B5: "net.USB_CC2",
          A6: "net.USB_D_PORT_P",
          B6: "net.USB_D_PORT_P",
          A7: "net.USB_D_PORT_N",
          B7: "net.USB_D_PORT_N",
        }}
        noConnect={["A8", "B8"]}
      />
      {/* Short, separately named wire islands preserve flat net names without
          routing signal loops between every part. Each label serves real pins. */}
      <netlabel
        net="GND"
        connectsTo=".J4 > .pin1"
        schX={-13}
        schY={0.8}
        anchorSide="right"
      />
      <netlabel
        net="GND"
        connectsTo={[".J4 > .pin8", ".J4 > .pin9"]}
        schX={-13}
        schY={-0.7}
        anchorSide="right"
      />
      <netlabel
        net="GND"
        connectsTo=".U8 > .pin2"
        schX={2.5}
        schY={0.2}
        anchorSide="right"
      />
      <netlabel
        net="GND"
        connectsTo=".U8 > .pin5"
        schX={2.5}
        schY={-0.4}
        anchorSide="right"
      />
      <netlabel
        net="USB_CC1"
        connectsTo=".J4 > .pin3"
        schX={-14}
        schY={0.4}
        anchorSide="right"
      />
      <netlabel
        net="USB_CC1"
        connectsTo=".R40 > .pin1"
        schX={-12}
        schY={5.5}
        anchorSide="bottom"
      />
      <netlabel
        net="USB_CC2"
        connectsTo=".J4 > .pin11"
        schX={-8.5}
        schY={-0.5}
        anchorSide="left"
      />
      <netlabel
        net="USB_CC2"
        connectsTo=".R41 > .pin1"
        schX={-6}
        schY={5.5}
        anchorSide="bottom"
      />
      <netlabel
        net="USB_D_PORT_P"
        connectsTo={[".J4 > .pin4", ".J4 > .pin12"]}
        schX={-8.5}
        schY={1.8}
        anchorSide="left"
      />
      <netlabel
        net="USB_D_PORT_P"
        connectsTo={[".U9 > .pin1", ".U9 > .pin6"]}
        schX={-3.5}
        schY={1.5}
        anchorSide="bottom"
      />
      <netlabel
        net="USB_D_PORT_P"
        connectsTo=".U8 > .pin3"
        schX={1.5}
        schY={0}
        anchorSide="right"
      />
      <netlabel
        net="USB_D_PORT_N"
        connectsTo={[".J4 > .pin5", ".J4 > .pin13"]}
        schX={-7.5}
        schY={-2}
        anchorSide="left"
      />
      <netlabel
        net="USB_D_PORT_N"
        connectsTo={[".U9 > .pin3", ".U9 > .pin4"]}
        schX={-3.5}
        schY={-1.5}
        anchorSide="top"
      />
      <netlabel
        net="USB_D_PORT_N"
        connectsTo=".U8 > .pin4"
        schX={1.5}
        schY={-0.2}
        anchorSide="right"
      />
      <netlabel
        net="USB_SWITCH_OE_N"
        connectsTo=".U7 > .pin4"
        schX={-1}
        schY={-8.1}
        anchorSide="left"
      />
      <netlabel
        net="USB_SWITCH_OE_N"
        connectsTo={[".U8 > .pin10", ".R46 > .pin2"]}
        schX={7}
        schY={1.5}
        anchorSide="left"
      />
      <netlabel
        net="USB_D_SWITCH_N"
        connectsTo=".U8 > .pin6"
        schX={7}
        schY={-1.2}
        anchorSide="left"
      />
      <netlabel
        net="USB_D_SWITCH_N"
        connectsTo=".R44 > .pin1"
        schX={9}
        schY={-2}
        anchorSide="right"
      />
      <netlabel
        net="USB_D_SWITCH_P"
        connectsTo=".U8 > .pin7"
        schX={7}
        schY={-0.2}
        anchorSide="left"
      />
      <netlabel
        net="USB_D_SWITCH_P"
        connectsTo=".R45 > .pin1"
        schX={9}
        schY={2}
        anchorSide="right"
      />
      <netlabel net="USB_D_N" connectsTo=".R44 > .pin2" schX={14} schY={-2} />
      <netlabel net="USB_D_P" connectsTo=".R45 > .pin2" schX={14} schY={2} />
      <ControllerResistor
        name="R40"
        {...controllerPlacements.R40}
        value="5.1k"
        schX={-12}
        schY={4}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_CC1", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R41"
        {...controllerPlacements.R41}
        value="5.1k"
        schX={-6}
        schY={4}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_CC2", pin2: "net.GND" }}
      />
      <UsbEsdProtection
        name="U9"
        {...controllerPlacements.U9}
        schX={-3.5}
        schY={0}
        schSheetName="USB"
        connections={{
          IO1_1: "net.USB_D_PORT_P",
          IO1_6: "net.USB_D_PORT_P",
          IO2_3: "net.USB_D_PORT_N",
          IO2_4: "net.USB_D_PORT_N",
          GND: "net.GND",
          VBUS: "net.USB_VBUS",
        }}
      />
      <UsbDataSwitch
        name="U8"
        {...controllerPlacements.U8}
        schX={4.5}
        schY={0}
        schSheetName="USB"
        connections={{
          VCC: "net.V3V3",
          SEL: "net.GND",
          D_P: "net.USB_D_PORT_P",
          D_N: "net.USB_D_PORT_N",
          GND: "net.GND",
          HSD1_N: "net.USB_D_SWITCH_N",
          HSD1_P: "net.USB_D_SWITCH_P",
          OE_N: "net.USB_SWITCH_OE_N",
        }}
        noConnect={["HSD2_N", "HSD2_P"]}
      />
      <ControllerCapacitor
        name="C31"
        {...controllerPlacements.C31}
        value="100nF"
        schX={4.5}
        schY={-6}
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      {/* These two series resistors must end up close to WROOM pads 13/14. */}
      <ControllerResistor
        name="R44"
        {...controllerPlacements.R44}
        value="22"
        schX={11}
        schY={-2}
        schSheetName="USB"
        connections={{ pin1: "net.USB_D_SWITCH_N", pin2: "net.USB_D_N" }}
      />
      <ControllerResistor
        name="R45"
        {...controllerPlacements.R45}
        value="22"
        schX={11}
        schY={2}
        schSheetName="USB"
        connections={{ pin1: "net.USB_D_SWITCH_P", pin2: "net.USB_D_P" }}
      />
      <ControllerResistor
        name="R42"
        {...controllerPlacements.R42}
        value="1k"
        schX={-11}
        schY={-7}
        schSheetName="USB"
        connections={{ pin1: "net.USB_VBUS", pin2: "net.USB_VBUS_SENSE" }}
      />
      <ControllerResistor
        name="R43"
        {...controllerPlacements.R43}
        value="100k"
        schX={-11}
        schY={-11}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_VBUS_SENSE", pin2: "net.GND" }}
      />
      <UsbPresenceDetector
        name="U7"
        {...controllerPlacements.U7}
        schX={-3.5}
        schY={-8}
        schSheetName="USB"
        connections={{
          A: "net.USB_VBUS_SENSE",
          GND: "net.GND",
          Y: "net.USB_SWITCH_OE_N",
          VCC: "net.V3V3",
        }}
      />
      <ControllerCapacitor
        name="C30"
        {...controllerPlacements.C30}
        value="100nF"
        schX={-3.5}
        schY={-12}
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R46"
        {...controllerPlacements.R46}
        value="10k"
        schX={7}
        schY={3}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.USB_SWITCH_OE_N" }}
      />
    </group>
  );
}

export const usbInterfaceBoundary = ["V3V3", "GND", "USB_D_P", "USB_D_N"] as const;
