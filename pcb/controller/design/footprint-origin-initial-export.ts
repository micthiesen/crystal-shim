import type { CircuitJson } from "circuit-json";
import { wroomPattern } from "./esp32-c6-wroom";
import { buttonPattern, statusLedPattern } from "./assembly-components";
import {
  psuHeaderPattern,
  sensorHeaderPattern,
  serviceHeaderPattern,
} from "./micro-fit-components";

type Point = { x: number; y: number };
type Pattern = {
  id: string;
  pads: (Point & { number: string })[];
  holes?: Point[];
};

const patterns: Readonly<Record<string, Pattern>> = {
  "ESP32-C6-WROOM-1-N8": wroomPattern,
  "B3F-1002-G": buttonPattern,
  WP710A10LGD: statusLedPattern,
  "43650-0300": psuHeaderPattern,
  "43045-0600": sensorHeaderPattern,
  "43045-0200": serviceHeaderPattern,
};

function sourceOffset(point: Point, rotation: number): Point {
  const radians = (rotation * Math.PI) / 180;
  return {
    x: point.x * Math.cos(radians) + point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) - point.y * Math.cos(radians),
  };
}

const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6;

// Derived Circuit JSON ONLY, before the first native conversion. The compiler
// stores copper-bounds centres; native footprints need their manufacturer datum.
// Infer it from the complete numbered-land/locator multiset, never from a guessed
// bounding-box offset or input order. Only centres in the returned copy change.
// USB has a separate adapter that also owns its alphanumeric pin conversion.
export function prepareFootprintOriginsForInitialExport(
  input: CircuitJson,
  refs: readonly string[],
): CircuitJson {
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate origin reference");
  const json = structuredClone(input);
  for (const ref of refs) {
    const sources = json
      .filter((e) => e.type === "source_component")
      .filter((e) => e.name === ref);
    const source = sources[0];
    const pattern = source && patterns[source.manufacturer_part_number ?? ""];
    if (sources.length !== 1 || !source || !pattern)
      throw new Error(`${ref}: unsupported footprint origin source`);
    const components = json
      .filter((e) => e.type === "pcb_component")
      .filter((e) => e.source_component_id === source.source_component_id);
    const component = components[0];
    if (
      components.length !== 1 ||
      !component ||
      component.layer !== "top" ||
      !Number.isFinite(component.rotation) ||
      component.rotation % 90 !== 0 ||
      component.metadata?.kicad_footprint?.footprintName !== pattern.id
    )
      throw new Error(`${ref}: unsupported footprint origin placement`);
    const ports = json
      .filter((e) => e.type === "source_port")
      .filter((e) => e.source_component_id === source.source_component_id);
    const pcbPorts = json
      .filter((e) => e.type === "pcb_port")
      .filter((e) => e.pcb_component_id === component.pcb_component_id);
    const actual = json
      .filter((e) => e.type === "pcb_smtpad" || e.type === "pcb_plated_hole")
      .filter((e) => e.pcb_component_id === component.pcb_component_id)
      .map((pad) => {
        const pcbPort = pcbPorts.find((p) => p.pcb_port_id === pad.pcb_port_id);
        const port = ports.find((p) => p.source_port_id === pcbPort?.source_port_id);
        const hints = port?.port_hints?.filter((hint) => /^pin[1-9]\d*$/.test(hint));
        const number = hints?.length === 1 ? hints[0]!.slice(3) : undefined;
        if (
          !port ||
          !number ||
          !("x" in pad) ||
          !pad.port_hints?.includes(`pin${number}`) ||
          (port.pin_number !== undefined && String(port.pin_number) !== number) ||
          (port.pin_number === undefined &&
            (pattern.pads.filter((p) => p.number === number).length < 2 ||
              !new RegExp(`^pin${number}_internal_[1-9]\\d*$`).test(port.name)))
        )
          throw new Error(`${ref}: missing numbered origin land`);
        return { x: pad.x, y: pad.y, number };
      });
    const holes = json
      .filter((e) => e.type === "pcb_hole")
      .filter((e) => e.pcb_component_id === component.pcb_component_id)
      .map((hole) => ({ x: hole.x, y: hole.y, number: "" }));
    const expected = [
      ...pattern.pads,
      ...(pattern.holes ?? []).map((hole) => ({ ...hole, number: "" })),
    ].map((pad) => ({ ...sourceOffset(pad, component.rotation), number: pad.number }));
    actual.push(...holes);
    if (actual.length !== expected.length)
      throw new Error(`${ref}: footprint origin land/locator count changed`);
    const anchor = expected[0]!;
    const candidates = actual
      .filter((p) => p.number === anchor.number)
      .map((p) => ({ x: p.x - anchor.x, y: p.y - anchor.y }))
      .filter((origin) => {
        const remaining = [...actual];
        for (const pad of expected) {
          const index = remaining.findIndex(
            (p) =>
              p.number === pad.number &&
              close(p.x, origin.x + pad.x) &&
              close(p.y, origin.y + pad.y),
          );
          if (index < 0) return false;
          remaining.splice(index, 1);
        }
        return remaining.length === 0;
      });
    if (candidates.length !== 1)
      throw new Error(`${ref}: footprint origin geometry changed or ambiguous`);
    component.center = candidates[0]!;
  }
  return json;
}
