import type { CircuitJson } from "circuit-json";

type Point = { x: number; y: number };

function onSegment(p: Point, from: Point, to: Point) {
  const cross = (p.x - from.x) * (to.y - from.y) - (p.y - from.y) * (to.x - from.x);
  return (
    Math.abs(cross) < 1e-7 &&
    p.x >= Math.min(from.x, to.x) - 1e-7 &&
    p.x <= Math.max(from.x, to.x) + 1e-7 &&
    p.y >= Math.min(from.y, to.y) - 1e-7 &&
    p.y <= Math.max(from.y, to.y) + 1e-7
  );
}

class Connections {
  private parents = new Map<string, string>();

  root(id: string): string {
    const parent = this.parents.get(id);
    if (parent === undefined || parent === id) {
      this.parents.set(id, id);
      return id;
    }
    const result = this.root(parent);
    this.parents.set(id, result);
    return result;
  }

  join(ids: string[]) {
    const first = ids[0];
    if (first === undefined) return;
    for (const id of ids.slice(1)) this.parents.set(this.root(id), this.root(first));
  }
}

/** Actual drawn-wire reachability, keyed by source_port_id. This deliberately
 * ignores source_trace IDs, internal IC connections and schematic_text. Only
 * real label anchors name an electrical island. Coordinates on different
 * schematic sheets never join. Crossings join only when a wire endpoint, pin,
 * label anchor or explicit junction lies on the crossing. */
export function schematicPortNetNames(json: CircuitJson): Map<string, string[]> {
  const key = (sheet: string | undefined, p: Point) =>
    JSON.stringify([sheet ?? null, Math.round(p.x * 1e8), Math.round(p.y * 1e8)]);
  const ports = json.filter((e) => e.type === "schematic_port");
  const labels = json.filter((e) => e.type === "schematic_net_label");
  const traces = json.filter((e) => e.type === "schematic_trace");
  const points = new Map<string, { sheet: string | undefined; point: Point }>();
  const add = (sheet: string | undefined, point: Point) => {
    points.set(key(sheet, point), { sheet, point });
  };
  for (const trace of traces) {
    for (const edge of trace.edges) {
      add(trace.schematic_sheet_id, edge.from);
      add(trace.schematic_sheet_id, edge.to);
    }
    for (const junction of trace.junctions) add(trace.schematic_sheet_id, junction);
  }
  for (const port of ports) add(port.schematic_sheet_id, port.center);
  for (const label of labels)
    add(label.schematic_sheet_id, label.anchor_position ?? label.center);

  const connected = new Connections();
  for (const trace of traces) {
    for (const edge of trace.edges) {
      for (const [id, { sheet, point: p }] of points) {
        if (sheet !== trace.schematic_sheet_id) continue;
        if (onSegment(p, edge.from, edge.to)) {
          connected.join([id, key(sheet, edge.from)]);
        }
      }
    }
  }
  const netNames = new Map<string, Set<string>>();
  for (const label of labels) {
    const island = connected.root(
      key(label.schematic_sheet_id, label.anchor_position ?? label.center),
    );
    if (!netNames.has(island)) netNames.set(island, new Set());
    netNames.get(island)!.add(label.text);
  }
  const result = new Map<string, string[]>();
  for (const port of ports) {
    const island = connected.root(key(port.schematic_sheet_id, port.center));
    result.set(
      port.source_port_id,
      [
        ...new Set([
          ...(result.get(port.source_port_id) ?? []),
          ...(netNames.get(island) ?? []),
        ]),
      ].sort(),
    );
  }
  return result;
}

/** Compare a named-net source design against the actual schematic. Numeric
 * physical pins, including NC, must have schematic ports. Unnumbered synthetic
 * ports used for repeated PCB pads need no extra schematic pin. Connected source
 * ports without a named net are reported as unsupported, never silently passed. */
export function schematicConnectivityErrors(json: CircuitJson): string[] {
  const actual = schematicPortNetNames(json);
  const ports = json.filter((e) => e.type === "source_port");
  const components = json.filter((e) => e.type === "source_component");
  const nets = json.filter((e) => e.type === "source_net");
  const traces = json.filter((e) => e.type === "source_trace");
  const expected = new Connections();
  const connectedPorts = new Set<string>();
  for (const trace of traces) {
    expected.join([
      ...trace.connected_source_port_ids,
      ...trace.connected_source_net_ids.map((id) => `net:${id}`),
    ]);
    for (const id of trace.connected_source_port_ids) connectedPorts.add(id);
  }
  for (const component of components) {
    for (const group of component.internally_connected_source_port_ids ?? [])
      expected.join(group);
  }
  const errors: string[] = [];
  for (const port of ports) {
    if (port.pin_number === undefined && !actual.has(port.source_port_id)) continue;
    const component = components.find(
      (e) => e.source_component_id === port.source_component_id,
    );
    const name = `${component?.name ?? port.source_component_id}.${port.name ?? port.pin_number}`;
    const wanted = [
      ...new Set(
        nets
          .filter(
            (net) =>
              expected.root(`net:${net.source_net_id}`) ===
              expected.root(port.source_port_id),
          )
          .map((net) => net.name),
      ),
    ].sort();
    const schematicPorts = json
      .filter((e) => e.type === "schematic_port")
      .filter((e) => e.source_port_id === port.source_port_id);
    if (schematicPorts.length !== 1) {
      errors.push(
        `${name}: expected one schematic port, found ${schematicPorts.length}`,
      );
      continue;
    }
    if (!wanted.length && connectedPorts.has(port.source_port_id)) {
      errors.push(
        `${name}: connected source port has no named net for schematic comparison`,
      );
    }
    // An unlabeled wire between unused pins still violates NC intent. Looking
    // only for reachable net names would incorrectly accept that wire island.
    if (!wanted.length && !connectedPorts.has(port.source_port_id)) {
      const schematicPort = schematicPorts[0]!;
      const wired = json.some(
        (entry) =>
          entry.type === "schematic_trace" &&
          entry.schematic_sheet_id === schematicPort.schematic_sheet_id &&
          entry.edges.some((edge) =>
            onSegment(schematicPort.center, edge.from, edge.to),
          ),
      );
      if (wired) errors.push(`${name}: source NC pin touches a drawn schematic wire`);
    }
    const found = actual.get(port.source_port_id) ?? [];
    if (JSON.stringify(wanted) !== JSON.stringify(found)) {
      errors.push(
        `${name}: source nets ${JSON.stringify(wanted)}, drawn schematic nets ${JSON.stringify(found)}`,
      );
    }
  }
  return errors;
}
