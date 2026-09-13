import type { CircuitJson } from "circuit-json";
import { controllerMountingHoles, controllerPlacements } from "./placements";

type Bounds = { ref: string; left: number; right: number; bottom: number; top: number };

// Check compiled geometry, not the placement proposal's assumed package sizes.
// The square bound around each circular test-pad courtyard is conservative.
// This does not establish cable mating, enclosure fit, thermal or routed DRC.
export function controllerPlacementErrors(json: CircuitJson): string[] {
  const errors: string[] = [];
  const sources = json.filter((e) => e.type === "source_component");
  const bounds: Bounds[] = [];
  for (const component of json.filter((e) => e.type === "pcb_component")) {
    const source = sources.find(
      (s) => s.source_component_id === component.source_component_id,
    );
    const ref = source?.name ?? component.pcb_component_id;
    const outlines = json
      .filter(
        (e) => e.type === "pcb_courtyard_outline" || e.type === "pcb_courtyard_circle",
      )
      .filter((e) => e.pcb_component_id === component.pcb_component_id);
    if (outlines.length !== 1) {
      errors.push(`${ref}: expected one explicit courtyard`);
      continue;
    }
    const outline = outlines[0]!;
    const points =
      outline.type === "pcb_courtyard_circle"
        ? [
            {
              x: outline.center.x - outline.radius,
              y: outline.center.y - outline.radius,
            },
            {
              x: outline.center.x + outline.radius,
              y: outline.center.y + outline.radius,
            },
          ]
        : outline.outline;
    if (
      !points.length ||
      points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
    ) {
      errors.push(`${ref}: invalid courtyard geometry`);
      continue;
    }
    const box = {
      ref,
      left: Math.min(...points.map((p) => p.x)),
      right: Math.max(...points.map((p) => p.x)),
      bottom: Math.min(...points.map((p) => p.y)),
      top: Math.max(...points.map((p) => p.y)),
    };
    bounds.push(box);
    // Only the module's antenna overhang and the flush USB connector assembly
    // margin may cross the board edge. These are exact physical allowances.
    const bottom = ref === "J4" ? -55.575 : -55;
    const top = ref === "U1" ? 61.6 : 55;
    if (
      box.left < -75 - 1e-6 ||
      box.right > 75 + 1e-6 ||
      box.bottom < bottom - 1e-6 ||
      box.top > top + 1e-6
    )
      errors.push(`${ref}: courtyard exceeds its board-edge allowance`);
    for (const hole of controllerMountingHoles) {
      const dx = Math.max(box.left - hole.x, 0, hole.x - box.right);
      const dy = Math.max(box.bottom - hole.y, 0, hole.y - box.top);
      if (Math.hypot(dx, dy) < 4 - 1e-6)
        errors.push(`${ref}: courtyard enters ${hole.ref} 4 mm mounting reserve`);
    }
  }
  if (bounds.length !== Object.keys(controllerPlacements).length)
    errors.push("Expected all component courtyards");
  for (const [i, a] of bounds.entries()) {
    for (const b of bounds.slice(i + 1)) {
      if (
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1e-6 &&
        Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom) > 1e-6
      )
        errors.push(`${a.ref}/${b.ref}: courtyard overlap`);
    }
  }
  const holes = json
    .filter((e) => e.type === "pcb_hole")
    .filter((e) => !e.pcb_component_id);
  if (
    holes.length !== 4 ||
    controllerMountingHoles.some(
      (expected) =>
        !holes.some(
          (actual) =>
            actual.hole_shape === "circle" &&
            Math.abs(actual.hole_diameter - 3.2) < 1e-6 &&
            Math.abs(actual.x - expected.x) < 1e-6 &&
            Math.abs(actual.y - expected.y) < 1e-6,
        ),
    )
  )
    errors.push("Expected four source-owned 3.2 mm NPTH mounting holes");
  return errors;
}
