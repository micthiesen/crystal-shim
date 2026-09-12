import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CircuitJsonToKicadPcbConverter } from "circuit-json-to-kicad";
import { At, parseKicadPcb } from "kicadts";
import { Fragment } from "react";
import { controllerMountingHoles } from "./placements";
import {
  controllerMountingFootprint,
  identifyControllerMountsForInitialExport,
} from "./mounting-holes-initial-export";

async function initial() {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={110} layers={4} routingDisabled>
      {controllerMountingHoles.map((hole) => (
        <Fragment key={hole.ref}>
          <hole pcbX={hole.x} pcbY={hole.y} diameter={3.2} />
        </Fragment>
      ))}
    </board>,
  );
  await circuit.renderUntilSettled();
  const converter = new CircuitJsonToKicadPcbConverter(circuit.getCircuitJson());
  converter.runUntilFinished();
  return converter.getOutput();
}

test("initial controller holes retain geometry while gaining stable board-only identities", async () => {
  const board = await initial();
  const before = board.getString();
  const geometry = board.footprints.map((fp) => ({
    at: fp.position!.getString(),
    pads: fp.fpPads.map((pad) => pad.getString()),
    uuid: fp.uuid?.value,
  }));
  identifyControllerMountsForInitialExport(board);
  const native = parseKicadPcb(board.getString());
  expect(native.footprints).toHaveLength(4);
  expect(
    native.footprints.map((fp) => ({
      at: fp.position!.getString(),
      pads: fp.fpPads.map((pad) => pad.getString()),
      uuid: fp.uuid?.value,
    })),
  ).toEqual(geometry);
  for (const hole of controllerMountingHoles) {
    const fp = native.footprints.find((f) =>
      f.properties.some((p) => p.key === "Reference" && p.value === hole.ref),
    )!;
    expect(fp.libraryLink).toBe(controllerMountingFootprint);
    expect(fp.attr?.boardOnly).toBe(true);
    expect(fp.attr?.excludeFromBom).toBe(true);
    expect(fp.attr?.excludeFromPosFiles).toBe(true);
    const at = fp.position as At;
    expect([at.x, at.y]).toEqual([100 + hole.x, 100 - hole.y]);
  }
  const adopted = board.getString();
  expect(() => identifyControllerMountsForInitialExport(board)).toThrow();
  expect(board.getString()).toBe(adopted);
  const shuffled = parseKicadPcb(before);
  shuffled.footprints.reverse();
  identifyControllerMountsForInitialExport(shuffled);
  expect(shuffled.footprints.map((fp) => fp.getString()).sort()).toEqual(
    board.footprints.map((fp) => fp.getString()).sort(),
  );
});

test("initial hole identity rejects late geometry, duplicates and identity drift atomically", async () => {
  const source = (await initial()).getString();
  for (const mutation of [
    (b: ReturnType<typeof parseKicadPcb>) => {
      b.footprints[3]!.fpPads[0]!.drill!.diameter = 3.1;
    },
    (b: ReturnType<typeof parseKicadPcb>) => {
      b.footprints[3]!.position = b.footprints[0]!.position;
    },
    (b: ReturnType<typeof parseKicadPcb>) => {
      b.footprints[3]!.libraryLink = "unreviewed:hole";
    },
    (b: ReturnType<typeof parseKicadPcb>) => {
      b.footprints[3]!.fpPads[0]!.number = "1";
    },
  ]) {
    const board = parseKicadPcb(source);
    mutation(board);
    const before = board.getString();
    expect(() => identifyControllerMountsForInitialExport(board)).toThrow();
    expect(board.getString()).toBe(before);
  }
});
