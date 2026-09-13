import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, PadLayers, Property, parseKicadPcb } from "kicadts";
import MainsCircuit from "./mains.circuit";
import { mainsMountingHoles } from "./placements";
import {
  identifyMainsMountsForInitialExport,
  mainsMountingFootprint,
  mainsMountingValue,
} from "./mounting-holes-initial-export";

const initial = (async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson());
  converter.runUntilFinished();
  return converter.getOutput().getString();
})();

test("mains mounts gain four board-only identities without changing physical geometry", async () => {
  const source = await initial;
  const board = parseKicadPcb(source);
  const electrical = board.footprints.filter((fp) => fp.properties.length);
  const priorElectrical = electrical.map((fp) => fp.getString());
  const mounts = board.footprints.filter((fp) => !fp.properties.length);
  const physical = () =>
    mounts.map((fp) => ({
      position: fp.position?.getString(),
      pads: fp.fpPads.map((pad) => pad.getString()),
      uuid: fp.uuid?.value,
    }));
  const before = physical();
  identifyMainsMountsForInitialExport(board);
  expect(physical()).toEqual(before);
  expect(electrical.map((fp) => fp.getString())).toEqual(priorElectrical);
  const saved = parseKicadPcb(board.getString());
  expect(saved.footprints).toHaveLength(27);
  for (const hole of mainsMountingHoles) {
    const matches = saved.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === hole.ref),
    );
    expect(matches).toHaveLength(1);
    const fp = matches[0]!;
    expect(fp.libraryLink).toBe(mainsMountingFootprint);
    expect(fp.properties.find((p) => p.key === "Value")?.value).toBe(
      mainsMountingValue,
    );
    expect(fp.attr?.boardOnly).toBe(true);
    expect(fp.attr?.excludeFromBom).toBe(true);
    expect(fp.attr?.excludeFromPosFiles).toBe(true);
    const at = fp.position as At;
    expect([at.x, at.y]).toEqual([100 + hole.x, 100 - hole.y]);
  }
  const prepared = board.getString();
  expect(() => identifyMainsMountsForInitialExport(board)).toThrow();
  expect(board.getString()).toBe(prepared);
  const shuffled = parseKicadPcb(source);
  shuffled.footprints = [...shuffled.footprints].reverse();
  expect(shuffled.getString()).not.toBe(source);
  identifyMainsMountsForInitialExport(shuffled);
  expect(shuffled.footprints.map((fp) => fp.getString()).sort()).toEqual(
    board.footprints.map((fp) => fp.getString()).sort(),
  );
});

test("mains mount identification refuses malformed late holes atomically", async () => {
  type Board = ReturnType<typeof parseKicadPcb>;
  const source = await initial;
  const anonymous = (board: Board) =>
    board.footprints.filter((fp) => !fp.properties.length);
  const last = (board: Board) => anonymous(board)[3]!;
  const mutations: ((board: Board) => void)[] = [
    (b) => {
      last(b).fpPads[0]!.drill!.diameter = 3.1;
    },
    (b) => {
      last(b).position = anonymous(b)[0]!.position;
    },
    (b) => {
      last(b).libraryLink = "unreviewed:hole";
    },
    (b) => {
      last(b).fpPads[0]!.number = "1";
    },
    (b) => {
      last(b).fpPads[0]!.layers = new PadLayers(["*.Cu", "*.Mask", "F.Paste"]);
    },
    (b) => {
      last(b).fpPads[0]!.padType = "thru_hole";
    },
    (b) => {
      last(b).fpPads[0]!.solderMaskMargin = 0.1;
    },
    (b) => {
      b.footprints = b.footprints.filter((fp) => fp !== last(b));
    },
    (b) => {
      b.footprints = [...b.footprints, last(b)];
    },
    (b) => {
      const fp = b.footprints.find((f) => f.properties.length)!;
      fp.properties = [
        ...fp.properties,
        new Property({ key: "Reference", value: "H1" }),
      ];
    },
  ];
  for (const mutate of mutations) {
    const board = parseKicadPcb(source);
    mutate(board);
    const before = board.getString();
    expect(before).not.toBe(source);
    expect(() => identifyMainsMountsForInitialExport(board)).toThrow();
    expect(board.getString()).toBe(before);
  }
});
