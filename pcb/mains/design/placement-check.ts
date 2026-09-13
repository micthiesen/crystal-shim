import type { CircuitJson } from "circuit-json";
import { schematicPortNetNames } from "../../controller/design/schematic-connectivity-check";

const primaryNets = new Set([
  "AC_L_FUSED",
  "FILTER_LINE_L",
  "AC_N",
  "PUMP_L_FILTERED",
  "PUMP_N_FILTERED",
  "PUMP_L_SW",
  "SNUBBER_RC",
]);
// Conservative axis-aligned copper bounds. This tests source pads, not routed
// creepage, assembled metal or the qualified internal U1/K1 insulation boundary.
export function mainsPlacementIsolationErrors(json: CircuitJson) {
  const nets = schematicPortNetNames(json);
  const parts = new Map(
    json
      .filter((e) => e.type === "source_component")
      .map((e) => [e.source_component_id, e.name]),
  );
  const ports = new Map(
    json.filter((e) => e.type === "source_port").map((e) => [e.source_port_id, e]),
  );
  const pcbPorts = new Map(
    json.filter((e) => e.type === "pcb_port").map((e) => [e.pcb_port_id, e]),
  );
  const pads = json
    .filter((e) => e.type === "pcb_smtpad" || e.type === "pcb_plated_hole")
    .map((p) => {
      const port = ports.get(pcbPorts.get(p.pcb_port_id ?? "")?.source_port_id ?? "");
      if (!port) throw new Error("Mains copper has no logical pin owner");
      const ref = parts.get(port.source_component_id!);
      const net = nets.get(port.source_port_id)?.[0];
      const primary = net
        ? primaryNets.has(net)
        : /^J[234]$/.test(ref ?? "") && Boolean(port.do_not_connect);
      const land = p as unknown as Record<string, unknown>;
      const w = Number(
        land.width ?? land.outer_diameter ?? land.rect_pad_width ?? land.outer_width,
      );
      const h = Number(
        land.height ?? land.outer_diameter ?? land.rect_pad_height ?? land.outer_height,
      );
      const angle =
        (Number(land.ccw_rotation ?? land.rect_ccw_rotation ?? 0) * Math.PI) / 180;
      const dx = (Math.abs(w * Math.cos(angle)) + Math.abs(h * Math.sin(angle))) / 2;
      const dy = (Math.abs(w * Math.sin(angle)) + Math.abs(h * Math.cos(angle))) / 2;
      if (![dx, dy, Number(land.x), Number(land.y)].every(Number.isFinite))
        throw new Error("Unsupported mains copper bound");
      return {
        ref: `${ref}.${port.pin_number}`,
        net: net ?? `${ref}.${port.pin_number}`,
        primary,
        x: Number(land.x),
        y: Number(land.y),
        dx,
        dy,
      };
    });
  const errors: string[] = [];
  for (let i = 0; i < pads.length; i++)
    for (const b of pads.slice(i + 1)) {
      const a = pads[i]!;
      if ((!a.primary && !b.primary) || a.net === b.net) continue;
      const required = a.primary === b.primary ? 3.2 : 8;
      const gap = Math.hypot(
        Math.max(0, Math.abs(a.x - b.x) - a.dx - b.dx),
        Math.max(0, Math.abs(a.y - b.y) - a.dy - b.dy),
      );
      if (gap + 1e-7 < required)
        errors.push(
          `${a.ref}/${b.ref}: source copper lower-bound ${gap.toFixed(3)} mm < ${required} mm`,
        );
    }
  return errors;
}
