import {
  chipElectricalContracts,
  type ChipElectricalContract,
  type ElectricalPin,
} from "../../controller/design/pin-electrical-contract";

function passivePins(
  names: readonly string[],
): Readonly<Record<string, ElectricalPin>> {
  return Object.fromEntries(
    names.map((name, i) => [String(i + 1), { name, type: "passive" }]),
  );
}

// Exact component capabilities, not the current connection or software state.
// A source do_not_connect marker never converts a real terminal into an
// internal no_connect pin. The converter initially loses these ERC semantics.
export const mainsChipElectricalContracts: Readonly<
  Record<string, ChipElectricalContract>
> = {
  "IRM-45-12": {
    pins: {
      "1": { name: "AC_N", type: "power_in" },
      "2": { name: "AC_L", type: "power_in" },
      "3": { name: "GND_ISO", type: "power_out" },
      "4": { name: "V12_RAW", type: "power_out" },
    },
    basis:
      "Mean Well IRM-45 specification, Case IRM60 bottom-view functions: AC/N, AC/L, -V and +V. Source adopts native IRM-05 numbering 1/2/3/4; the manufacturer labels functions rather than numbers. Both isolated output terminals supply the secondary circuit, including its return. This ERC declaration does not establish isolation, converter operation or power sequencing.",
  },
  "G5RL-1A-TV8 DC5": {
    pins: {
      "1": { name: "COIL_HIGH", type: "passive" },
      "3": { name: "CONTACT_FIXED", type: "passive" },
      "4": { name: "CONTACT_MOVING", type: "passive" },
      "5": { name: "COIL_LOW", type: "passive" },
    },
    basis:
      "Omron G5RL K132-E1-10 p5 G5RL-1A-TV8 terminal diagram: coil 1/5 and normally-open contacts 3/4. All four are passive conduction terminals. Neither a coil terminal nor the switched contact is an independent supply output.",
  },
  "1868076": {
    pins: passivePins(["LINE", "NEUTRAL"]),
    basis:
      "Phoenix Contact MKDS 5/2-7,62: two passive screw-clamp terminals with one solder pin each, 7.62 mm pitch. Both terminals are used.",
  },
  TMOV14RP175EL2T7: {
    pins: passivePins(["LINE", "NEUTRAL"]),
    basis:
      "Littelfuse TMOV/ iTMOV specification: selected two-lead thermally protected MOV is a nonpolar passive shunt device. It has no powered status or third indicator terminal.",
  },
  "1N4007-E3/54": {
    pins: passivePins(["K", "A"]),
    basis:
      "Vishay 88503 1N4007 rectifier: cathode band; adopted source numbering 1 cathode / 2 anode. Passive coil flyback terminals, with no power-source declaration.",
  },
  "AP63205WU-7": chipElectricalContracts["AP63203WU-7"]!,
  "0215001.MXEP": {
    pins: passivePins(["IN", "OUT"]),
    basis: "Littelfuse 215 axial fuse, passive series current path.",
  },
  "0451003.MRL": {
    pins: passivePins(["IN", "OUT"]),
    basis: "Littelfuse 451 fuse, passive series current path.",
  },
  "43045-0200": chipElectricalContracts["43045-0200"]!,
  "43650-0300": chipElectricalContracts["43650-0300"]!,
};
