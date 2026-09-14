import { expect, test } from "bun:test";
import type { CircuitJson } from "circuit-json";
import { Circuit } from "tscircuit";
import { PadNet, parseKicadPcb } from "kicadts";
import MainsCircuit from "./mains.circuit";
import { createMainsInitialPcb } from "./mains-initial-pcb";
import {
  assertMainsInitialPadNets,
  mainsSchematicConnectivityErrors,
} from "./schematic-connectivity-check";

const compiled = (async () => {
  const circuit = new Circuit();
  circuit.add(<MainsCircuit />);
  await circuit.renderUntilSettled();
  return circuit.getCircuitJson();
})();

test("product net contract refuses coordinated renames, NC changes and orphan identities", async () => {
  const source = await compiled;
  expect(mainsSchematicConnectivityErrors(source)).toEqual([]);
  const mutations: ((json: CircuitJson) => void)[] = [
    (json) => {
      for (const entry of json) {
        if (entry.type === "source_net" && entry.name === "PUMP_L_FILTERED")
          entry.name = "WRONG_NET";
        if (entry.type === "schematic_net_label" && entry.text === "PUMP_L_FILTERED")
          entry.text = "WRONG_NET";
      }
    },
    (json) => {
      const pin = json.find((e) => e.type === "source_port");
      if (pin?.type === "source_port") pin.do_not_connect = true;
    },
    (json) => {
      const net = json.find((e) => e.type === "source_net");
      if (net?.type === "source_net") net.name = "WRONG_NET";
    },
    (json) => {
      const port = json.find((e) => e.type === "source_port");
      if (port?.type === "source_port") port.source_component_id = "missing_component";
    },
    (json) => {
      const trace = json.find((e) => e.type === "source_trace");
      if (trace?.type === "source_trace")
        trace.connected_source_port_ids.push("missing_port");
    },
    (json) => {
      const net = json.find((e) => e.type === "source_net");
      if (net) json.push(structuredClone(net));
    },
    (json) => {
      const port = json.find((e) => e.type === "pcb_port");
      if (port) json.splice(json.indexOf(port), 1);
    },
  ];
  for (const mutate of mutations) {
    const json = structuredClone(source);
    mutate(json);
    expect(json).not.toEqual(source);
    const before = structuredClone(json);
    expect(mainsSchematicConnectivityErrors(json).length).toBeGreaterThan(0);
    expect(() => createMainsInitialPcb(json)).toThrow("Invalid mains source:");
    expect(json).toEqual(before);
  }
});

test("native admission checks every terminal pad and net number", async () => {
  const initial = createMainsInitialPcb(await compiled).getString();
  const original = parseKicadPcb(initial);
  expect(() => assertMainsInitialPadNets(original)).not.toThrow();
  const cases = [
    ["K1", "3"],
    ["U2", "5"],
    ["J5", "3"],
    ["J3", "2"],
    ["F2", "2"],
  ] as const;
  for (const [ref, number] of cases) {
    const board = parseKicadPcb(initial);
    const fp = board.footprints.find((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    )!;
    const pad = fp.fpPads.find((p) => p.number === number)!;
    pad.net = new PadNet(9001, "WRONG_NET");
    const before = board.getString();
    expect(before).not.toBe(initial);
    expect(() => assertMainsInitialPadNets(board)).toThrow(
      `${ref}.${number}: native product net changed`,
    );
    expect(board.getString()).toBe(before);
  }
  const wrongId = parseKicadPcb(initial);
  const pad = wrongId.footprints
    .flatMap((fp) => fp.fpPads)
    .find((p) => p.net?.name === "V5_PSU")!;
  pad.net!.id = 9001;
  expect(() => assertMainsInitialPadNets(wrongId)).toThrow(
    "native product net changed",
  );
  const duplicate = parseKicadPcb(initial);
  duplicate.nets = [...duplicate.nets, duplicate.nets[0]!];
  expect(() => assertMainsInitialPadNets(duplicate)).toThrow(
    "Native mains net table changed",
  );
});
