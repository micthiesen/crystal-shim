import { expect, test } from "bun:test";

type CircuitElement = { type: string; name?: string; [key: string]: unknown };

const circuitPath = new URL(
  "../dist/fixtures/tooling-smoke/circuit.json",
  import.meta.url,
);
const circuit = (await Bun.file(circuitPath).json()) as CircuitElement[];

test("the installed toolchain builds a placed TSX circuit with named nets", () => {
  expect(
    circuit
      .filter(({ type }) => type === "source_component")
      .map(({ name }) => name)
      .sort(),
  ).toEqual(["C1", "R1"]);
  expect(circuit.filter(({ type }) => type === "pcb_component")).toHaveLength(2);
  expect(
    circuit
      .filter(({ type }) => type === "source_net")
      .map(({ name }) => name)
      .sort(),
  ).toEqual(["TOOLING_GND", "TOOLING_IN", "TOOLING_OUT"]);
  expect(circuit.some(({ type }) => type.endsWith("_error"))).toBe(false);
});
