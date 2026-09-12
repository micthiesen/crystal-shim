import { Fragment } from "react";
import { Esp32C6Wroom } from "./esp32-c6-wroom";
import { ControllerButton, StatusLed } from "./assembly-components";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";

// Module pin allocation, boot/reset/maintenance controls and local bypass.
// Fixed references belong to the final controller; placement is provisional.
// UART boundary nets still need accessible unpopulated pads in the full board.
export function ControllerModuleControls() {
  return (
    <group name="ModuleControls" schSheetName="Module">
      <Esp32C6Wroom
        name="U1"
        pcbX={0}
        pcbY={34}
        schX={0}
        schY={0}
        schSheetName="Module"
        connections={{
          GND_1: "net.GND",
          V3V3: "net.V3V3",
          EN: "net.CHIP_EN",
          IO0: "net.SENSOR_BUS_EN",
          IO8: "net.BOOT_STRAP8",
          IO10: "net.RELAY_REQUEST",
          IO11: "net.MAINTENANCE_N",
          IO12: "net.USB_D_N",
          IO13: "net.USB_D_P",
          IO9: "net.BOOT_N",
          IO18: "net.SENSOR_SDA",
          IO19: "net.SENSOR_SCL",
          IO20: "net.STATUS_LED",
          IO21: "net.PSU_GOOD",
          IO22: "net.SENSOR_POWER_EN",
          IO23: "net.SENSOR_POWER_FAULT_N",
          RXD0_IO17: "net.UART0_RX",
          TXD0_IO16: "net.UART0_TX",
          GND_28: "net.GND",
          GND_EP: "net.GND",
        }}
        noConnect={["IO4", "IO5", "IO6", "IO7", "IO1", "IO15", "IO3", "IO2"]}
      />
      <ControllerButton
        name="SW1"
        pcbX={-25}
        pcbY={15}
        schX={-11}
        schY={6}
        schSheetName="Module"
        connections={{
          CONTACT_A: "net.MAINTENANCE_N",
          CONTACT_B: "net.GND",
        }}
      />
      <ControllerButton
        name="SW2"
        pcbX={-25}
        pcbY={5}
        schX={-11}
        schY={1}
        schSheetName="Module"
        connections={{
          CONTACT_A: "net.BOOT_N",
          CONTACT_B: "net.GND",
        }}
      />
      <ControllerButton
        name="SW3"
        pcbX={-25}
        pcbY={-5}
        schX={-11}
        schY={-4}
        schSheetName="Module"
        connections={{
          CONTACT_A: "net.RESET_CONTACT",
          CONTACT_B: "net.GND",
        }}
      />
      <StatusLed
        name="D4"
        pcbX={25}
        pcbY={15}
        schX={11}
        schY={1}
        schSheetName="Module"
        connections={{
          K: "net.GND",
          A: "net.LED_ANODE",
        }}
      />
      <ControllerResistor
        name="R50"
        value="10k"
        pcbX={-15}
        pcbY={15}
        schX={-7}
        schY={6}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.MAINTENANCE_N",
        }}
      />
      <ControllerResistor
        name="R51"
        value="10k"
        pcbX={-15}
        pcbY={5}
        schX={-7}
        schY={1}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.BOOT_N",
        }}
      />
      <ControllerResistor
        name="R52"
        value="10k"
        pcbX={13}
        pcbY={30}
        schX={7}
        schY={6}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.BOOT_STRAP8",
        }}
      />
      <ControllerResistor
        name="R53"
        value="10k"
        pcbX={-13}
        pcbY={25}
        schX={-7}
        schY={-8}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.CHIP_EN",
        }}
      />
      <ControllerResistor
        name="R54"
        value="680"
        pcbX={18}
        pcbY={15}
        schX={7}
        schY={1}
        schSheetName="Module"
        connections={{
          pin1: "net.STATUS_LED",
          pin2: "net.LED_ANODE",
        }}
      />
      <ControllerResistor
        name="R55"
        value="330"
        pcbX={-15}
        pcbY={-5}
        schX={-7}
        schY={-4}
        schSheetName="Module"
        connections={{
          pin1: "net.CHIP_EN",
          pin2: "net.RESET_CONTACT",
        }}
      />
      <ControllerCapacitor
        name="C5"
        value="22uF"
        pcbX={-14}
        pcbY={34}
        schX={7}
        schY={-4}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.GND",
        }}
      />
      <ControllerCapacitor
        name="C6"
        value="100nF"
        pcbX={-14}
        pcbY={29}
        schX={11}
        schY={-4}
        schSheetName="Module"
        connections={{
          pin1: "net.V3V3",
          pin2: "net.GND",
        }}
      />
      <ControllerCapacitor
        name="C9"
        value="1uF"
        pcbX={-14}
        pcbY={21}
        schX={-11}
        schY={-8}
        schSheetName="Module"
        connections={{
          pin1: "net.CHIP_EN",
          pin2: "net.GND",
        }}
      />
      {/* Electrical labels are required; inline text does not join native nets. */}
      {[
        ["GND", ".U1 > .pin1"],
        ["V3V3", ".U1 > .pin2"],
        ["CHIP_EN", ".U1 > .pin3"],
        ["SENSOR_BUS_EN", ".U1 > .pin8"],
        ["BOOT_STRAP8", ".U1 > .pin10"],
        ["RELAY_REQUEST", ".U1 > .pin11"],
        ["MAINTENANCE_N", ".U1 > .pin12"],
        ["USB_D_N", ".U1 > .pin13"],
        ["USB_D_P", ".U1 > .pin14"],
        ["BOOT_N", ".U1 > .pin15"],
        ["SENSOR_SDA", ".U1 > .pin16"],
        ["SENSOR_SCL", ".U1 > .pin17"],
        ["STATUS_LED", ".U1 > .pin18"],
        ["PSU_GOOD", ".U1 > .pin19"],
        ["SENSOR_POWER_EN", ".U1 > .pin20"],
        ["SENSOR_POWER_FAULT_N", ".U1 > .pin21"],
        ["UART0_RX", ".U1 > .pin24"],
        ["UART0_TX", ".U1 > .pin25"],
        ["GND", ".U1 > .pin28"],
        ["GND", ".U1 > .pin29"],
        ["MAINTENANCE_N", ".SW1 > .pin1"],
        ["BOOT_N", ".SW2 > .pin1"],
        ["RESET_CONTACT", ".SW3 > .pin1"],
        ["LED_ANODE", ".D4 > .pin2"],
        ["MAINTENANCE_N", ".R50 > .pin2"],
        ["BOOT_N", ".R51 > .pin2"],
        ["BOOT_STRAP8", ".R52 > .pin2"],
        ["CHIP_EN", ".R53 > .pin2"],
        ["STATUS_LED", ".R54 > .pin1"],
        ["LED_ANODE", ".R54 > .pin2"],
        ["CHIP_EN", ".R55 > .pin1"],
        ["RESET_CONTACT", ".R55 > .pin2"],
        ["CHIP_EN", ".C9 > .pin1"],
      ].map(([net, port]) => (
        <Fragment key={port}>
          <netlabel net={net} connectsTo={port} />
        </Fragment>
      ))}
    </group>
  );
}
