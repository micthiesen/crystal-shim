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
        pcbX={-20}
        pcbY={0}
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
          A6: "net.USB_D_P_PORT",
          B6: "net.USB_D_P_PORT",
          A7: "net.USB_D_N_PORT",
          B7: "net.USB_D_N_PORT",
        }}
        noConnect={["A8", "B8"]}
      />
      {/* The pinned schematic router needs these explicit GND labels to avoid
          a disconnected connector wire island. Keep every contact explicit. */}
      <netlabel net="GND" connectsTo=".J4 > .pin1" schX={-13} schY={0.8} />
      <netlabel net="GND" connectsTo=".J4 > .pin8" schX={-13} schY={-0.6} />
      <netlabel net="GND" connectsTo=".J4 > .pin9" schX={-13} schY={-0.8} />
      {/* Use actual anchored net labels for signal wire islands. The pinned
          router can otherwise render their names as non-electrical inline text. */}
      <netlabel
        net="USB_CC1"
        connectsTo={[".J4 > .pin3", ".R40 > .pin1"]}
        schX={-14}
        schY={2}
      />
      <netlabel
        net="USB_CC2"
        connectsTo={[".J4 > .pin11", ".R41 > .pin1"]}
        schX={-7}
        schY={3}
      />
      <netlabel
        net="USB_D_P_PORT"
        connectsTo={[
          ".J4 > .pin4",
          ".J4 > .pin12",
          ".U9 > .pin1",
          ".U9 > .pin6",
          ".U8 > .pin3",
        ]}
        schX={-5}
        schY={2}
      />
      <netlabel
        net="USB_D_N_PORT"
        connectsTo={[
          ".J4 > .pin5",
          ".J4 > .pin13",
          ".U9 > .pin3",
          ".U9 > .pin4",
          ".U8 > .pin4",
        ]}
        schX={-6}
        schY={-2}
      />
      <netlabel
        net="USB_SWITCH_OE_N"
        connectsTo={[".U7 > .pin4", ".U8 > .pin10", ".R46 > .pin2"]}
        schX={2}
        schY={-4}
      />
      <netlabel
        net="USB_D_N_SWITCH"
        connectsTo={[".U8 > .pin6", ".R44 > .pin1"]}
        schX={9}
        schY={-2}
      />
      <netlabel
        net="USB_D_P_SWITCH"
        connectsTo={[".U8 > .pin7", ".R45 > .pin1"]}
        schX={9}
        schY={2}
      />
      <netlabel net="USB_D_N" connectsTo=".R44 > .pin2" schX={14} schY={-2} />
      <netlabel net="USB_D_P" connectsTo=".R45 > .pin2" schX={14} schY={2} />
      <ControllerResistor
        name="R40"
        value="5.1k"
        pcbX={-22}
        pcbY={8}
        schX={-12}
        schY={4}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_CC1", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R41"
        value="5.1k"
        pcbX={-18}
        pcbY={8}
        schX={-6}
        schY={4}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_CC2", pin2: "net.GND" }}
      />
      <UsbEsdProtection
        name="U9"
        pcbX={-12}
        pcbY={3.5}
        schX={-3.5}
        schY={0}
        schSheetName="USB"
        connections={{
          IO1_1: "net.USB_D_P_PORT",
          IO1_6: "net.USB_D_P_PORT",
          IO2_3: "net.USB_D_N_PORT",
          IO2_4: "net.USB_D_N_PORT",
          GND: "net.GND",
          VBUS: "net.USB_VBUS",
        }}
      />
      <UsbDataSwitch
        name="U8"
        pcbX={-4}
        pcbY={3.5}
        schX={4.5}
        schY={0}
        schSheetName="USB"
        connections={{
          VCC: "net.V3V3",
          SEL: "net.GND",
          D_P: "net.USB_D_P_PORT",
          D_N: "net.USB_D_N_PORT",
          GND: "net.GND",
          HSD1_N: "net.USB_D_N_SWITCH",
          HSD1_P: "net.USB_D_P_SWITCH",
          OE_N: "net.USB_SWITCH_OE_N",
        }}
        noConnect={["HSD2_N", "HSD2_P"]}
      />
      <ControllerCapacitor
        name="C31"
        value="100nF"
        pcbX={-4}
        pcbY={-1}
        schX={4.5}
        schY={-6}
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      {/* These two series resistors must end up close to WROOM pads 13/14. */}
      <ControllerResistor
        name="R44"
        value="22"
        pcbX={6}
        pcbY={3}
        schX={11}
        schY={-2}
        schSheetName="USB"
        connections={{ pin1: "net.USB_D_N_SWITCH", pin2: "net.USB_D_N" }}
      />
      <ControllerResistor
        name="R45"
        value="22"
        pcbX={6}
        pcbY={6}
        schX={11}
        schY={2}
        schSheetName="USB"
        connections={{ pin1: "net.USB_D_P_SWITCH", pin2: "net.USB_D_P" }}
      />
      <ControllerResistor
        name="R42"
        value="1k"
        pcbX={-23}
        pcbY={-7}
        schX={-11}
        schY={-7}
        schSheetName="USB"
        connections={{ pin1: "net.USB_VBUS", pin2: "net.USB_VBUS_SENSE" }}
      />
      <ControllerResistor
        name="R43"
        value="100k"
        pcbX={-18}
        pcbY={-8}
        schX={-11}
        schY={-11}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.USB_VBUS_SENSE", pin2: "net.GND" }}
      />
      <UsbPresenceDetector
        name="U7"
        pcbX={-12}
        pcbY={-5}
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
        value="100nF"
        pcbX={-8}
        pcbY={-5}
        schX={-3.5}
        schY={-12}
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.GND" }}
      />
      <ControllerResistor
        name="R46"
        value="10k"
        pcbX={1}
        pcbY={-1}
        schX={4.5}
        schY={-8}
        schOrientation="vertical"
        schSheetName="USB"
        connections={{ pin1: "net.V3V3", pin2: "net.USB_SWITCH_OE_N" }}
      />
    </group>
  );
}

export const usbInterfaceBoundary = ["V3V3", "GND", "USB_D_P", "USB_D_N"] as const;
