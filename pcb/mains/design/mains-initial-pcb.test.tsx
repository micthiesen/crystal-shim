import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { At, parseKicadPcb } from "kicadts";
import MainsCircuit from "./mains.circuit";
import { mainsMountingHoles, mainsPlacements } from "./placements";
import { createMainsInitialPcb } from "./mains-initial-pcb";

test("complete initial mains graph combines datums, PTH mask, connector shapes and buck nets", async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  const input = circuit.getCircuitJson();
  const unchanged = structuredClone(input);
  // Serialization is in memory only. This does not create or adopt native files.
  const board = parseKicadPcb(createMainsInitialPcb(input).getString());
  expect(input).toEqual(unchanged);
  expect(board.footprints).toHaveLength(26);
  const pads = board.footprints.flatMap((fp) => fp.fpPads);
  expect(pads.filter((p) => p.number)).toHaveLength(75);
  expect(pads.filter((p) => p.padType === "np_thru_hole")).toHaveLength(6);
  expect(pads.filter((p) => p.padType === "thru_hole")).toHaveLength(53);
  expect(pads.filter((p) => p.padType === "smd")).toHaveLength(22);
  for (const pad of pads) {
    if (pad.number) expect(pad.solderMaskMargin).toBe(0.05);
    if (pad.padType !== "smd") {
      expect(pad.layers?.layers.some((layer) => layer.endsWith(".Paste"))).toBe(false);
    }
  }
  const footprint = (ref: string) => {
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    expect(matches).toHaveLength(1);
    return matches[0]!;
  };
  for (const [ref, placement] of Object.entries(mainsPlacements)) {
    const fp = footprint(ref);
    if (!(fp.position instanceof At)) throw new Error(`Missing ${ref} pose`);
    expect(fp.position.x).toBeCloseTo(100 + placement.pcbX, 7);
    expect(fp.position.y).toBeCloseTo(100 - placement.pcbY, 7);
    expect(fp.position.angle ?? 0).toBe(placement.pcbRotation);
  }
  const header = footprint("J5");
  for (const hole of mainsMountingHoles) {
    const fp = footprint(hole.ref);
    expect(fp.attr?.boardOnly).toBe(true);
    expect(fp.attr?.excludeFromBom).toBe(true);
    expect(fp.attr?.excludeFromPosFiles).toBe(true);
    expect(fp.fpPads).toHaveLength(1);
    expect(fp.fpPads[0]!.padType).toBe("np_thru_hole");
  }
  expect(footprint("R1").properties.find((p) => p.key === "MPN")?.value).toBe(
    "PR02FS0201000KA100",
  );
  expect(footprint("C1").properties.find((p) => p.key === "MPN")?.value).toBe(
    "B32921C3473K000",
  );
  const first = header.fpPads.find((p) => p.number === "1")!;
  expect(first.shape).toBe("roundrect");
  expect(first.roundrectRatio).toBeCloseTo(0.25 / 1.5, 7);
  expect(first.net?.name).toBe("V5_PSU");
  const buck = footprint("U2");
  expect(buck.fpPads).toHaveLength(6);
  const buckNets = {
    "1": "V5_PSU",
    "2": "V12_RAW",
    "3": "V12_RAW",
    "4": "GND_ISO",
    "5": "BUCK5_SW",
    "6": "BUCK5_BST",
  };
  for (const pad of buck.fpPads)
    expect(pad.net?.name).toBe(buckNets[pad.number as keyof typeof buckNets]);
  const mov = footprint("RV1");
  const slot = mov.fpPads.find((p) => p.number === "2")!;
  expect(slot.net?.name).toBe("AC_N");
  expect(slot.drill?.oval).toBe(true);
  expect([slot.drill?.diameter, slot.drill?.width]).toEqual([3.7, 1.3]);
  expect([slot.size?.width, slot.size?.height]).toEqual([5.3, 2.9]);
  // A stale passive Value string must not disguise changed source quantities
  // while the order code still names the old selected part.
  for (const ref of ["R1", "C1"]) {
    const changed = structuredClone(input);
    const source = changed.find((e) => e.type === "source_component" && e.name === ref);
    if (source?.type !== "source_component") throw new Error(`Missing ${ref}`);
    if (source.ftype === "simple_resistor") source.resistance = 101;
    else if (source.ftype === "simple_capacitor") source.capacitance = 48e-9;
    else throw new Error("Expected selected passive");
    const before = structuredClone(changed);
    expect(() => createMainsInitialPcb(changed)).toThrow(
      `${ref}: missing or changed exact passive identity`,
    );
    expect(changed).toEqual(before);
  }
});
