import type { CircuitJson } from "circuit-json";
import packageJson from "../../package.json";
import { schematicPortNetNames } from "../../controller/design/schematic-connectivity-check";
import {
  controllerFootprintGeometrySha256 as footprintHash,
  controllerSourceGeometrySha256 as sourceHash,
} from "../../controller/design/footprint-geometry-identity";
import { controllerCapacitors } from "../../controller/design/passive-components";
import { esds312 } from "../../controller/design/cable-protection-land-patterns";
import { stps2l40u } from "../../controller/design/protection-land-patterns";
import { panasonic0603 } from "../../controller/design/passive-land-patterns";
import { fdcPattern, ldoPattern, sensorResistors } from "./components";
import { electrodeRectangles } from "./electrodes";
import { sensorPlacements } from "./placements";
import { sensorConnections } from "./sensor.circuit";
import { createSensorInitialPcb, prepareSensorInitialJson } from "./sensor-initial-pcb";
export const sensorComponentId = (ref: string) =>
  `sensor.component.${ref.toLowerCase()}`;
export const sensorNativeFootprint = (ref: string) =>
  `CrystalShim_Sensor:Sensor_${ref}`;
export const sensorProjectSymbol = sensorNativeFootprint;
export const sensorExpectedNc = ["U1.4", "U1.5", "U3.1", "U3.3"];
export const sensorParts = {
  J1: { mpn: "PCB-SENSOR-PIGTAIL-6", url: "" },
  U1: { mpn: "FDC1004DGSR", url: fdcPattern.source.url },
  U2: { mpn: "TPS7A2433DBVR", url: ldoPattern.source.url },
  U3: { mpn: "ESDS312DBVR", url: esds312.source.url },
  D2: { mpn: "STPS2L40U", url: stps2l40u.source.url },
  ...Object.fromEntries(
    (
      [
        ["C1", "10uF"],
        ["C2", "10uF"],
        ["C3", "100nF"],
        ["C4", "1uF"],
      ] as const
    ).map(([ref, value]) => [
      ref,
      {
        mpn: controllerCapacitors[value].mpn,
        url: controllerCapacitors[value].datasheetUrl,
      },
    ]),
  ),
  ...Object.fromEntries(
    (
      [
        ["R1", "22"],
        ["R2", "22"],
        ["R3", "2.7k"],
        ["R4", "2.7k"],
        ["R5", "10k"],
        ["R6", "3.01k"],
      ] as const
    ).map(([ref, value]) => [
      ref,
      { mpn: sensorResistors[value], url: panasonic0603.source.url },
    ]),
  ),
  E1: {
    mpn: "PCB-COPPER-OOP-50",
    url: "https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf",
  },
} as Record<string, { mpn: string; url: string }>;
export function sensorSchematicConnectivityErrors(json: CircuitJson) {
  const errors: string[] = [];
  const source = json.filter((e) => e.type === "source_component");
  const ports = json
    .filter((e) => e.type === "source_port")
    .filter((e) => e.pin_number !== undefined);
  const drawn = schematicPortNetNames(json);
  const internalPorts = json
    .filter((e) => e.type === "source_port")
    .filter((e) => e.pin_number === undefined);
  for (const port of internalPorts) {
    const owner = source.find(
      (s) => s.source_component_id === port.source_component_id,
    );
    const terminal = ports.find(
      (p) => p.source_component_id === port.source_component_id && p.pin_number === 1,
    );
    const declared = json
      .filter((e) => e.type === "source_component_internal_connection")
      .some(
        (c) =>
          c.source_component_id === port.source_component_id &&
          c.source_port_ids.includes(port.source_port_id) &&
          terminal &&
          c.source_port_ids.includes(terminal.source_port_id),
      );
    if (
      owner?.name !== "E1" ||
      !/^pin1_internal_[1-9]$/.test(port.name ?? "") ||
      !declared
    )
      errors.push("Unexpected unnumbered source terminal");
  }
  if (source.length !== 16 || new Set(source.map((e) => e.name)).size !== 16)
    errors.push("Expected16 unique sensor references");
  for (const s of source) {
    if (s.manufacturer_part_number !== sensorParts[s.name]?.mpn)
      errors.push(`${s.name}: unexpected MPN`);
    for (const port of ports.filter(
      (e) => e.source_component_id === s.source_component_id,
    )) {
      const id = `${s.name}.${port.pin_number}`;
      const expected = sensorConnections[s.name]?.[port.name ?? ""];
      const nets = drawn.get(port.source_port_id) ?? [];
      if (sensorExpectedNc.includes(id)) {
        if (!port.do_not_connect || nets.length) errors.push(`${id}: expected open`);
      } else if (
        !expected ||
        nets.length !== 1 ||
        nets[0] !== expected ||
        port.do_not_connect
      )
        errors.push(`${id}: expected ${expected}, drawn ${nets.join(",")}`);
    }
  }
  return errors;
}
export function createSensorManifest(json: CircuitJson) {
  const errors = sensorSchematicConnectivityErrors(json);
  if (errors.length) throw new Error(errors.join("; "));
  const board = json.find((e) => e.type === "pcb_board");
  if (
    !board ||
    board.width !== 18 ||
    board.height !== 64 ||
    board.num_layers !== 4 ||
    board.thickness !== 1.6
  )
    throw new Error("Sensor board envelope changed");
  const normalized = prepareSensorInitialJson(json);
  const native = createSensorInitialPcb(json);
  const source = json.filter((e) => e.type === "source_component");
  const ports = json
    .filter((e) => e.type === "source_port")
    .filter((e) => e.pin_number !== undefined);
  const drawn = schematicPortNetNames(json);
  const components = source.map((s) => {
    const p = normalized.find(
      (e) =>
        e.type === "pcb_component" && e.source_component_id === s.source_component_id,
    );
    if (!p || p.type !== "pcb_component")
      throw new Error(`${s.name}: missing placement`);
    const expected = sensorPlacements[s.name as keyof typeof sensorPlacements];
    if (
      !expected ||
      Math.abs(p.center.x - expected.pcbX) > 1e-6 ||
      Math.abs(p.center.y - expected.pcbY) > 1e-6 ||
      p.rotation !== expected.pcbRotation
    )
      throw new Error(`${s.name}: changed placement`);
    const fp = native.footprints.find((f) =>
      f.properties.some((v) => v.key === "Reference" && v.value === s.name),
    );
    if (!fp) throw new Error(`${s.name}: no native footprint`);
    return {
      stable_id: sensorComponentId(s.name),
      ref: s.name,
      value:
        s.ftype === "simple_resistor"
          ? s.display_resistance!
          : s.ftype === "simple_capacitor"
            ? s.display_capacitance!
            : s.manufacturer_part_number!,
      symbol: sensorProjectSymbol(s.name),
      fields: {
        manufacturer_part_number: sensorParts[s.name]!.mpn,
        datasheet_url: sensorParts[s.name]!.url,
        ...(["E1", "J1"].includes(s.name)
          ? { exclude_from_bom: true, exclude_from_cpl: true }
          : {}),
      },
      footprint: {
        tscircuit: `tscircuit:${p.metadata?.kicad_footprint?.footprintName}`,
        kicad: sensorNativeFootprint(s.name),
        source_geometry_sha256: sourceHash(
          json.filter(
            (e) => "pcb_component_id" in e && e.pcb_component_id === p.pcb_component_id,
          ),
          p.center,
        ),
        initial_geometry_sha256: footprintHash(fp),
        pad_numbers: ports
          .filter((e) => e.source_component_id === s.source_component_id)
          .map((e) => String(e.pin_number))
          .sort(),
      },
      placement: {
        x_mm: expected.pcbX,
        y_mm: expected.pcbY,
        rotation_deg: expected.pcbRotation,
        side: "front",
      },
    };
  });
  const nets = json
    .filter((e) => e.type === "source_net")
    .map((n) => ({
      stable_id: `sensor.net.${n.name.toLowerCase()}`,
      name: n.name,
      endpoints: ports
        .filter((p) => drawn.get(p.source_port_id)?.includes(n.name))
        .map((p) => ({
          component: sensorComponentId(
            source.find((s) => s.source_component_id === p.source_component_id)!.name,
          ),
          pad: String(p.pin_number),
        }))
        .sort((a, b) =>
          `${a.component}.${a.pad}`.localeCompare(`${b.component}.${b.pad}`),
        ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    schema_version: 1,
    board: {
      stable_id: "sensor.board.main",
      width_mm: 18,
      height_mm: 64,
      layer_count: 4,
      coordinate_system: "center-x-right-y-up",
      kicad_origin_mm: [100, 100],
      specs: {
        material: "FR4",
        thickness_mm: 1.6,
        assembly_sides: ["front"],
        compiled_board_sha256: sourceHash([board], { x: 0, y: 0 }),
      },
      outline: { kind: "rectangle", center_mm: [0, 0], width_mm: 18, height_mm: 64 },
      holes: json
        .filter((e) => e.type === "pcb_hole")
        .map((h, i) => ({
          stable_id: `sensor.hole.j1.locator-${i + 1}`,
          ref: "J1",
          x_mm: h.x,
          y_mm: h.y,
          drill_mm: h.hole_shape === "circle" ? h.hole_diameter : 0,
          plated: false,
        })),
    },
    versions: {
      tscircuit: packageJson.dependencies.tscircuit,
      circuit_json_to_kicad: packageJson.dependencies["circuit-json-to-kicad"],
      node: process.version.replace(/^v/, ""),
      bun: Bun.version,
    },
    components,
    nets,
    metadata: {
      title: "Crystal Shim tank level sensor",
      electrode_geometry: electrodeRectangles,
      normal_input_budget_ma: 10,
      physical_sensing_span_mm: 50,
      glass_thickness_mm: 5,
      status:
        "Source capture and placement; native ERC/DRC and handoff are separate gates.",
    },
  };
}
