import type { CircuitJson } from "circuit-json";
import type { KicadPcb } from "kicadts";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";

// Product electrical contract from mains-design-basis.md and power-protection-review.md.
// Keep the integration test's independent transcription as a cross-check.
export const mainsExpectedNets = {
  FILTER_LINE_L: ["F3.2", "J2.1"],
  AC_L_FUSED: ["F3.1", "J1.1", "RV1.1", "U1.2"],
  AC_N: ["J1.2", "J2.2", "RV1.2", "U1.1"],
  PUMP_L_FILTERED: ["J3.1", "K1.3"],
  PUMP_N_FILTERED: ["C1.2", "J3.2", "J4.2"],
  PUMP_L_SW: ["J4.1", "K1.4", "R1.1"],
  SNUBBER_RC: ["C1.1", "R1.2"],
  V12_RAW: ["C2.1", "C3.1", "C7.1", "F2.1", "U1.4", "U2.2", "U2.3"],
  V12_MOTOR: ["F2.2", "J6.1"],
  V5_PSU: ["C4.1", "C6.1", "D1.1", "J5.1", "K1.1", "L1.2", "U2.1"],
  COIL_DRAIN: ["D1.2", "J5.3", "K1.5"],
  GND_ISO: ["C2.2", "C3.2", "C4.2", "C6.2", "C7.2", "J5.2", "J6.2", "U1.3", "U2.4"],
  BUCK5_SW: ["C5.2", "L1.1", "U2.5"],
  BUCK5_BST: ["C5.1", "U2.6"],
} as const;
export const mainsExpectedPins = {
  C1: [1, 2],
  C2: [1, 2],
  C3: [1, 2],
  C4: [1, 2],
  C5: [1, 2],
  C6: [1, 2],
  C7: [1, 2],
  D1: [1, 2],
  F3: [1, 2],
  F2: [1, 2],
  J1: [1, 2],
  J2: [1, 2, 3],
  J3: [1, 2, 3, 4],
  J4: [1, 2, 3, 4, 5, 6],
  J5: [1, 2, 3],
  J6: [1, 2],
  K1: [1, 3, 4, 5],
  L1: [1, 2],
  R1: [1, 2],
  RV1: [1, 2],
  U1: [1, 2, 3, 4],
  U2: [1, 2, 3, 4, 5, 6],
} as const;
export const mainsExpectedNc = ["J2.3", "J3.3", "J3.4", "J4.3", "J4.4", "J4.5", "J4.6"];

const expectedByPin = new Map<string, string>(
  Object.entries(mainsExpectedNets).flatMap(([net, pins]) =>
    pins.map((pin) => [pin, net] as const),
  ),
);
const same = (a: readonly (number | string)[], b: readonly (number | string)[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Admission for the complete product source. Generic source/drawing agreement
 * alone could accept a coordinated but incorrect edit on both sides. */
export function mainsSchematicConnectivityErrors(json: CircuitJson): string[] {
  const errors = schematicConnectivityErrors(json);
  if (json.some((e) => "error_type" in e || e.type.endsWith("_error")))
    errors.push("Mains compiler errors remain");
  const parts = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const drawn = schematicPortNetNames(json);
  if (
    !same(
      parts.map((p) => p.name),
      Object.keys(mainsExpectedPins),
    ) ||
    new Set(parts.map((p) => p.source_component_id)).size !== parts.length
  )
    errors.push("Mains component identities changed");
  if (ports.length !== 60 || new Set(ports.map((p) => p.source_port_id)).size !== 60)
    errors.push("Mains port identities changed");
  if (
    !same(
      nets.map((n) => n.name),
      Object.keys(mainsExpectedNets),
    ) ||
    new Set(nets.map((n) => n.source_net_id)).size !== nets.length
  )
    errors.push("Mains named net identities changed");
  const partsById = new Map(parts.map((p) => [p.source_component_id, p]));
  const portsById = new Map(ports.map((p) => [p.source_port_id, p]));
  const netIds = new Set(nets.map((n) => n.source_net_id));
  for (const trace of traces) {
    if (
      trace.connected_source_port_ids.some((id) => !portsById.has(id)) ||
      trace.connected_source_net_ids.some((id) => !netIds.has(id))
    )
      errors.push("Mains trace has an unknown endpoint");
  }
  for (const part of parts) {
    const expected = mainsExpectedPins[part.name as keyof typeof mainsExpectedPins];
    const pins = ports.filter(
      (p) => p.source_component_id === part.source_component_id,
    );
    if (
      !expected ||
      !same(
        pins.map((p) => p.pin_number ?? "missing"),
        expected,
      )
    )
      errors.push(`${part.name}: logical pin set changed`);
  }
  for (const port of ports) {
    const part = partsById.get(port.source_component_id ?? "");
    const endpoint = `${part?.name}.${port.pin_number}`;
    const net = expectedByPin.get(endpoint);
    const nc = mainsExpectedNc.includes(endpoint);
    if (!part || (!net && !nc)) errors.push(`${endpoint}: unexpected pin`);
    if (Boolean(port.do_not_connect) !== nc)
      errors.push(`${endpoint}: NC intent changed`);
    if (!same(drawn.get(port.source_port_id) ?? [], net ? [net] : []))
      errors.push(`${endpoint}: drawn product net changed`);
    if (
      nc &&
      traces.some((t) => t.connected_source_port_ids.includes(port.source_port_id))
    )
      errors.push(`${endpoint}: NC has a source connection`);
    if (
      json.filter(
        (e) => e.type === "pcb_port" && e.source_port_id === port.source_port_id,
      ).length !== 1
    )
      errors.push(`${endpoint}: physical port identity changed`);
  }
  return errors;
}

/** Compare every physical tail and SMT pad to the already validated product
 * contract. Read-only, before any correction; no native saved input is used. */
export function assertMainsInitialPadNets(board: KicadPcb) {
  const nets = board.nets;
  if (
    !same(
      nets.filter((net) => net.name).map((net) => net.name),
      Object.keys(mainsExpectedNets),
    ) ||
    new Set(nets.map((net) => net.id)).size !== nets.length ||
    nets.some(
      (net) => !Number.isInteger(net.id) || (net.name ? net.id <= 0 : net.id !== 0),
    )
  )
    throw new Error("Native mains net table changed");
  const ids = new Map(nets.map((net) => [net.name, net.id]));
  for (const [ref, pins] of Object.entries(mainsExpectedPins)) {
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    const fp = matches[0];
    if (
      matches.length !== 1 ||
      !fp ||
      fp.properties.filter((p) => p.key === "Reference").length !== 1
    )
      throw new Error(`${ref}: native identity changed`);
    const multiplicity = /^J[1-4]$/.test(ref) ? 2 : 1;
    const numbered = fp.fpPads.filter((p) => p.number);
    if (
      !same(
        numbered.map((p) => p.number),
        pins.flatMap((pin) => Array<string>(multiplicity).fill(String(pin))),
      )
    )
      throw new Error(`${ref}: native pin multiset changed`);
    for (const pad of fp.fpPads) {
      const expected = expectedByPin.get(`${ref}.${pad.number}`) ?? "";
      if (
        (pad.net?.name ?? "") !== expected ||
        (expected ? pad.net?.id !== ids.get(expected) : (pad.net?.id ?? 0) !== 0)
      )
        throw new Error(`${ref}.${pad.number}: native product net changed`);
    }
  }
}
