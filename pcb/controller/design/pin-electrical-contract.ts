import type { SymbolPin } from "kicadts";

export type ElectricalType = NonNullable<SymbolPin["pinElectricalType"]>;
export type ElectricalPin = { name: string; type: ElectricalType };
export type ChipElectricalContract = {
  pins: Readonly<Record<string, ElectricalPin>>;
  basis: string;
};

function pins(
  entries: readonly (readonly [string, ElectricalType])[],
): Readonly<Record<string, ElectricalPin>> {
  return Object.fromEntries(
    entries.map(([name, type], i) => [String(i + 1), { name, type }]),
  );
}

// Explicit source-owned ERC semantics, keyed by exact MPN and physical pin.
// The pinned converter ignores port kicadPinMetadata and emits passive pins.
// The initial graph adapter applies this table before the first native write.
// Types describe the component, not its current software configuration. ERC
// cannot prove analogue operating conditions, power sequencing or pull-up size.
export const chipElectricalContracts: Readonly<Record<string, ChipElectricalContract>> =
  {
    "AP63203WU-7": {
      pins: pins([
        ["FB", "input"],
        ["EN", "input"],
        ["VIN", "power_in"],
        ["GND", "power_in"],
        ["SW", "power_out"],
        ["BST", "passive"],
      ]),
      basis:
        "Diodes DS41326 Rev 3-2 pin descriptions: SW is the switched power stage; BST is the floating bootstrap-capacitor terminal, not a board supply input. Its voltage/connection require circuit review.",
    },
    AO3400A: {
      pins: pins([
        ["G", "input"],
        ["S", "passive"],
        ["D", "passive"],
      ]),
      basis:
        "AOS AO3400A pin diagram: insulated gate input, source/drain conduction terminals. No intrinsic logic or board power source is inferred from a MOSFET drain.",
    },
    TCA9517ADGKR: {
      pins: pins([
        ["VCCA", "power_in"],
        ["SCLA", "bidirectional"],
        ["SDAA", "bidirectional"],
        ["GND", "power_in"],
        ["EN", "input"],
        ["SDAB", "bidirectional"],
        ["SCLB", "bidirectional"],
        ["VCCB", "power_in"],
      ]),
      basis:
        "TI SCPS245E pin functions: both sides are bidirectional open-drain I2C buffer ports, with two supply inputs and active-high enable. Bidirectional preserves receiving and driving; pull-ups and the B-side offset still need circuit review.",
    },
    TPS3808G01DBVR: {
      pins: pins([
        ["RESET_N", "open_collector"],
        ["GND", "power_in"],
        ["MR_N", "input"],
        ["CT", "passive"],
        ["SENSE", "input"],
        ["VDD", "power_in"],
      ]),
      basis:
        "TI TPS3808 pin functions: open-drain reset, manual-reset/sense inputs, CT timing-capacitor terminal. KiCad calls open-drain outputs open_collector. Intentionally open CT selects the datasheet delay and is not an internal NC.",
    },
    TPS2553DBVR: {
      pins: pins([
        ["IN", "power_in"],
        ["GND", "power_in"],
        ["EN", "input"],
        ["FAULT_N", "open_collector"],
        ["ILIM", "passive"],
        ["OUT", "power_out"],
      ]),
      basis:
        "TI SLVS841F pin functions: supply IN, switched power OUT, enable input, open-drain fault and current-limit programming-resistor terminal. ILIM analogue bounds are not modelled by ERC.",
    },
    SN74LVC1G08DBVR: {
      pins: pins([
        ["A", "input"],
        ["B", "input"],
        ["GND", "power_in"],
        ["Y", "output"],
        ["VCC", "power_in"],
      ]),
      basis: "TI SN74LVC1G08 DBV pin functions: two inputs and push-pull AND output.",
    },
    SN74LVC1G14DBVR: {
      pins: pins([
        ["NC", "no_connect"],
        ["A", "input"],
        ["GND", "power_in"],
        ["Y", "output"],
        ["VCC", "power_in"],
      ]),
      basis:
        "TI SCES218AA DBV pin functions: pin 1 has no internal connection, Schmitt input and push-pull inverter output.",
    },
    FSUSB42MUX: {
      pins: pins([
        ["VCC", "power_in"],
        ["SEL", "input"],
        ["D_P", "passive"],
        ["D_N", "passive"],
        ["GND", "power_in"],
        ["HSD1_N", "passive"],
        ["HSD1_P", "passive"],
        ["HSD2_N", "passive"],
        ["HSD2_P", "passive"],
        ["OE_N", "input"],
      ]),
      basis:
        "onsemi FSUSB42 pin descriptions/function table: bidirectional analogue switch paths are passive terminals, not USB transceiver drivers. SEL and active-low OE are control inputs.",
    },
    TPS259470ARPWR: {
      pins: pins([
        ["EN_UVLO", "input"],
        ["OVLO", "input"],
        ["AUXOFF", "open_collector"],
        ["FLT_N", "open_collector"],
        ["IN", "power_in"],
        ["OUT", "power_out"],
        ["DVDT", "passive"],
        ["GND", "power_in"],
        ["ILM", "passive"],
        ["ITIMER", "passive"],
      ]),
      basis:
        "TI SLVSFC9C Table 5-1: power IN/OUT, enable/OVLO inputs, open-drain AUXOFF and fault outputs; DVDT, ILM and ITIMER are analogue programming terminals. The package has no extra ground exposed pad.",
    },
    "ESP32-C6-WROOM-1-N8": {
      pins: pins([
        ["GND_1", "power_in"],
        ["V3V3", "power_in"],
        ["EN", "input"],
        ...[
          "IO4",
          "IO5",
          "IO6",
          "IO7",
          "IO0",
          "IO1",
          "IO8",
          "IO10",
          "IO11",
          "IO12",
          "IO13",
          "IO9",
          "IO18",
          "IO19",
          "IO20",
          "IO21",
          "IO22",
          "IO23",
        ].map((name) => [name, "bidirectional"] as const),
        ["NC", "no_connect"],
        ["IO15", "bidirectional"],
        ["RXD0_IO17", "bidirectional"],
        ["TXD0_IO16", "bidirectional"],
        ["IO3", "bidirectional"],
        ["IO2", "bidirectional"],
        ["GND_28", "power_in"],
        ["GND_EP", "power_in"],
      ]),
      basis:
        "Espressif module datasheet v1.4 Table 3-1: module pad numbers, all GPIOs I/O including default UART pins; pad 22 is NC. Three ground pins, one 3.3 V input, active-high chip enable. Boot straps/USB roles remain separate board contracts.",
    },
    STPS2L40U: {
      pins: pins([
        ["K", "passive"],
        ["A", "passive"],
      ]),
      basis:
        "ST DS2146 diode terminals with adopted 1 cathode / 2 anode numbering; conduction does not create a power source declaration.",
    },
    "SMBJ7.0A": {
      pins: pins([
        ["K", "passive"],
        ["A", "passive"],
      ]),
      basis: "Littelfuse SMBJ unidirectional TVS, passive clamp terminals.",
    },
    "SMBJ8.0CA": {
      pins: pins([
        ["TERMINAL_1", "passive"],
        ["TERMINAL_2", "passive"],
      ]),
      basis: "Littelfuse SMBJ CA bidirectional TVS, nonpolar passive clamp terminals.",
    },
    "USBLC6-2SC6": {
      pins: pins([
        ["IO1_1", "passive"],
        ["GND", "passive"],
        ["IO2_3", "passive"],
        ["IO2_4", "passive"],
        ["VBUS", "passive"],
        ["IO1_6", "passive"],
      ]),
      basis:
        "ST DS4260 internal diode network: passive steering/clamp terminals, not an active powered USB repeater. Straight-through pairs remain the source connectivity contract.",
    },
    ESDS312DBVR: {
      pins: pins([
        ["NC_1", "no_connect"],
        ["GND", "passive"],
        ["NC_3", "no_connect"],
        ["IO1", "passive"],
        ["IO2", "passive"],
      ]),
      basis: "TI SLVSEG9C DBV diagram: passive ESD clamps and two internal NC pins.",
    },
    WP710A10LGD: {
      pins: pins([
        ["K", "passive"],
        ["A", "passive"],
      ]),
      basis: "Kingbright DSAL0509 LED; adopted 1 cathode / 2 anode numbering.",
    },
    "B3F-1002-G": {
      pins: pins([
        ["CONTACT_A", "passive"],
        ["CONTACT_B", "passive"],
      ]),
      basis:
        "Omron B3F contact diagram: two switched nodes, each with two permanently joined physical legs. Source logical pin numbers are the adopted native pairs.",
    },
    "43650-0300": {
      pins: pins([
        ["V5_PSU", "passive"],
        ["GND", "passive"],
        ["COIL_DRAIN", "passive"],
      ]),
      basis:
        "Molex passive connector; external power-source declarations belong to the board harness contract, not to the connector symbol.",
    },
    "43045-0200": {
      pins: pins([
        ["V5_SERVICE_RAW", "passive"],
        ["GND", "passive"],
      ]),
      basis: "Molex passive connector; external service supply is separately declared.",
    },
    "43045-0600": {
      pins: pins([
        ["V5_SENSOR", "passive"],
        ["SDA_CABLE", "passive"],
        ["SCL_CABLE", "passive"],
        ["GND_4", "passive"],
        ["GND_5", "passive"],
        ["GND_6", "passive"],
      ]),
      basis:
        "Molex passive connector; preserve component-side 1/2/3 then 4/5/6 numbering.",
    },
    "USB4105-GF-A": {
      pins: Object.fromEntries(
        [
          "A1",
          "A4",
          "A5",
          "A6",
          "A7",
          "A8",
          "A9",
          "A12",
          "B1",
          "B4",
          "B5",
          "B6",
          "B7",
          "B8",
          "B9",
          "B12",
          "SH",
        ].map((name) => [name, { name, type: "passive" }]),
      ),
      basis:
        "GCT USB4105 B4 passive receptacle contacts after native A/B/SH numbering adapter. VBUS is detected only, with no power path into controller rails.",
    },
  };
