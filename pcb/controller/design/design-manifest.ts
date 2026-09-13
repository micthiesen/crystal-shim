import { createControllerInitialPcb } from "./controller-initial-pcb";
import {
  controllerGeometryIdentities,
  controllerSourceGeometrySha256,
} from "./footprint-geometry-identity";
import type { CircuitJson } from "circuit-json";
import packageJson from "../../package.json";
import { controllerMountingHoles, controllerPlacements } from "./placements";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "./schematic-connectivity-check";
import { controllerPlacementErrors } from "./placement-check";
import { controllerDatasheets } from "./manifest-parts";
import { usbConnectorPins } from "./usb-connector";
import { prepareUsbForInitialExport } from "./usb-initial-export";
import { prepareFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import {
  controllerMountingFootprint,
  controllerMountingValue,
} from "./mounting-holes-initial-export";

export const controllerBoardId = "controller.board.main";
export const controllerNativeLibrary = "CrystalShim_Controller";
const refs = new Set<string>([
  ...Object.keys(controllerPlacements),
  ...controllerMountingHoles.map((hole) => hole.ref),
]);
export const controllerComponentId = (ref: string) => {
  if (!refs.has(ref)) throw new Error(`Unknown controller reference ${ref}`);
  return `controller.component.${ref.toLowerCase()}`;
};
export const controllerNativeFootprint = (ref: string) => {
  controllerComponentId(ref);
  return `${controllerNativeLibrary}:Controller_${ref}`;
};

export const controllerProjectSymbol = (ref: string) => {
  controllerComponentId(ref);
  if (!Object.hasOwn(controllerPlacements, ref))
    throw new Error(`No schematic symbol for ${ref}`);
  return `${controllerNativeLibrary}:Controller_${ref}`;
};

// Source metadata, not a native-board snapshot. Stable IDs never depend on
// generated source_component_N IDs, traversal order or KiCad UUIDs. Per-ref
// native entries preserve exact instance graphics, including test-pad labels.
export function createControllerManifest(json: CircuitJson) {
  const errors = [
    ...json.filter((e) => "error_type" in e || e.type.endsWith("_error")),
    ...schematicConnectivityErrors(json),
    ...controllerPlacementErrors(json),
  ];
  if (errors.length)
    throw new Error(`Controller source is invalid: ${JSON.stringify(errors)}`);
  const boards = json.filter((e) => e.type === "pcb_board");
  const board = boards[0];
  if (
    boards.length !== 1 ||
    !board ||
    board.width !== 110 ||
    board.height !== 110 ||
    board.num_layers !== 4 ||
    board.thickness !== 1.6 ||
    board.material !== "fr4" ||
    board.center.x !== 0 ||
    board.center.y !== 0
  )
    throw new Error("Controller board specification changed");
  const sources = json.filter((e) => e.type === "source_component");
  const ports = json
    .filter((e) => e.type === "source_port")
    .filter((e) => e.pin_number !== undefined);
  const normalized = prepareFootprintOriginsForInitialExport(
    prepareUsbForInitialExport(json, ["J4"]),
    ["U1", "J1", "J2", "J3", "J5", "J6", "J7", "J8", "J9", "D4", "SW1", "SW2", "SW3"],
  );
  const geometry = controllerGeometryIdentities(createControllerInitialPcb(normalized));
  const physical = normalized.filter((e) => e.type === "pcb_component");
  const physicalIds = new Set(physical.map((e) => e.pcb_component_id));
  const physicalElements = normalized.filter(
    (e) =>
      e.type.startsWith("pcb_") &&
      !["pcb_component", "pcb_port", "pcb_board", "pcb_group"].includes(e.type) &&
      !e.type.endsWith("_warning"),
  );
  for (const element of physicalElements)
    if (
      "pcb_component_id" in element &&
      element.pcb_component_id &&
      !physicalIds.has(element.pcb_component_id)
    )
      throw new Error("Physical source element has an unknown component owner");
  // The compiler emits 50 THT paste records without a component reference.
  // Preserve all unowned physical intent as board geometry; never guess owners
  // from coincident positions or silently drop future unowned graphics.
  const unownedGeometry = physicalElements.filter(
    (e) => !("pcb_component_id" in e) || !e.pcb_component_id,
  );
  const schematics = json.filter((e) => e.type === "schematic_component");
  if (sources.length !== 113 || new Set(sources.map((e) => e.name)).size !== 113)
    throw new Error("Expected 113 unique controller source references");
  const pin = (ref: string, number: number) => {
    if (ref !== "J4") return String(number);
    const native = (usbConnectorPins as Record<string, string>)[`pin${number}`];
    if (!native) throw new Error(`Unknown USB pin ${number}`);
    return native;
  };
  const components = sources.map((source) => {
    const ref = source.name;
    const stable_id = controllerComponentId(ref);
    const placement = controllerPlacements[ref as keyof typeof controllerPlacements];
    const candidates = physical.filter(
      (e) => e.source_component_id === source.source_component_id,
    );
    const placed = candidates[0];
    const sourceFootprint = placed?.metadata?.kicad_footprint?.footprintName;
    if (
      !placement ||
      candidates.length !== 1 ||
      !sourceFootprint ||
      placed?.layer !== "top" ||
      placed.rotation !== placement.pcbRotation ||
      Math.abs(placed.center.x - placement.pcbX) > 1e-6 ||
      Math.abs(placed.center.y - placement.pcbY) > 1e-6
    )
      throw new Error(`${ref}: missing exact source footprint/placement`);
    const schematic = schematics.filter(
      (e) => e.source_component_id === source.source_component_id,
    );
    if (schematic.length !== 1) throw new Error(`${ref}: missing unique source symbol`);
    const mpn = source.manufacturer_part_number;
    const datasheet = mpn && controllerDatasheets[mpn];
    if (source.ftype !== "simple_test_point" && (!mpn || !datasheet))
      throw new Error(`${ref}: unknown selected MPN/datasheet`);
    const value =
      source.ftype === "simple_resistor"
        ? source.display_resistance
        : source.ftype === "simple_capacitor"
          ? source.display_capacitance
          : source.ftype === "simple_inductor"
            ? source.display_inductance
            : source.ftype === "simple_test_point"
              ? ref
              : mpn;
    if (!value) throw new Error(`${ref}: missing source value`);
    const symbol = controllerProjectSymbol(ref);
    const pads = ports
      .filter((e) => e.source_component_id === source.source_component_id)
      .map((p) => pin(ref, p.pin_number!))
      .sort();
    if (!pads.length || new Set(pads).size !== pads.length)
      throw new Error(`${ref}: invalid logical pin set`);
    return {
      stable_id,
      ref,
      value,
      symbol,
      fields: {
        ...(mpn ? { manufacturer_part_number: mpn, datasheet_url: datasheet! } : {}),
        ...(source.ftype === "simple_test_point"
          ? { exclude_from_bom: true, exclude_from_cpl: true }
          : {}),
      },
      footprint: {
        tscircuit: `tscircuit:${sourceFootprint}`,
        kicad: controllerNativeFootprint(ref),
        source_geometry_sha256: controllerSourceGeometrySha256(
          normalized.filter(
            (e) =>
              "pcb_component_id" in e &&
              e.pcb_component_id === placed.pcb_component_id &&
              e.type.startsWith("pcb_") &&
              e.type !== "pcb_component" &&
              e.type !== "pcb_port" &&
              !e.type.endsWith("_warning"),
          ),
          placed.center,
        ),
        initial_geometry_sha256: geometry.get(ref)!,
        pad_numbers: pads,
      },
      placement: {
        x_mm: placement.pcbX,
        y_mm: placement.pcbY,
        rotation_deg: placement.pcbRotation,
        side: "front",
      },
    };
  });
  const componentBySource = new Map(sources.map((s) => [s.source_component_id, s]));
  const drawn = schematicPortNetNames(json);
  const sourceNets = json.filter((e) => e.type === "source_net");
  if (sourceNets.length !== 63 || new Set(sourceNets.map((n) => n.name)).size !== 63)
    throw new Error("Expected 61 unique named controller nets");
  // KiCad differential routing recognizes polarity at the end of the name.
  // Preserve accepted net identities across the USB display-name correction.
  const acceptedUsbNetNames: Record<string, string> = {
    USB_D_PORT_N: "usb_d_n_port",
    USB_D_PORT_P: "usb_d_p_port",
    USB_D_SWITCH_N: "usb_d_n_switch",
    USB_D_SWITCH_P: "usb_d_p_switch",
  };
  const nets = sourceNets
    .map((net) => ({
      stable_id: `controller.net.${acceptedUsbNetNames[net.name] ?? net.name.toLowerCase()}`,
      name: net.name,
      endpoints: ports
        .filter((port) => drawn.get(port.source_port_id)?.includes(net.name))
        .map((port) => {
          const source = componentBySource.get(port.source_component_id ?? "");
          if (!source) throw new Error("Controller net contains an orphan source port");
          return {
            component: controllerComponentId(source.name),
            pad: pin(source.name, port.pin_number!),
          };
        })
        .sort((a, b) =>
          `${a.component}.${a.pad}`.localeCompare(`${b.component}.${b.pad}`),
        ),
    }))
    .sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  if (
    nets.some((net) => net.endpoints.length === 0) ||
    nets.reduce((n, net) => n + net.endpoints.length, 0) !== 303
  )
    throw new Error("Controller named-net endpoint coverage changed");
  const holes = json
    .filter((e) => e.type === "pcb_hole")
    .map((hole) => {
      if (hole.hole_shape !== "circle")
        throw new Error("Unsupported controller hole shape");
      const placed = physical.find((p) => p.pcb_component_id === hole.pcb_component_id);
      const source = placed && componentBySource.get(placed.source_component_id);
      const mount =
        !hole.pcb_component_id &&
        controllerMountingHoles.find(
          (m) => Math.abs(hole.x - m.x) < 1e-6 && Math.abs(hole.y - m.y) < 1e-6,
        );
      const ref = source?.name ?? (mount && mount.ref);
      if (!ref) throw new Error("Unidentified controller NPTH");
      const siblings = json
        .filter((e) => e.type === "pcb_hole")
        .filter((e) => e.pcb_component_id === hole.pcb_component_id)
        .sort((a, b) => a.x - b.x || a.y - b.y);
      return {
        stable_id: mount
          ? `controller.hole.${ref.toLowerCase()}`
          : `controller.hole.${ref.toLowerCase()}.locator-${siblings.indexOf(hole) + 1}`,
        ref,
        x_mm: hole.x,
        y_mm: hole.y,
        drill_mm: hole.hole_diameter,
        plated: false,
      };
    })
    .sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  if (holes.length !== 14 || new Set(holes.map((h) => h.stable_id)).size !== 14)
    throw new Error("Expected fourteen individually identified controller NPTHs");
  const mechanical = controllerMountingHoles.map((hole) => ({
    stable_id: controllerComponentId(hole.ref),
    ref: hole.ref,
    value: controllerMountingValue,
    symbol: "Mechanical:MountingHole",
    fields: { exclude_from_bom: true, exclude_from_cpl: true },
    footprint: {
      tscircuit: `tscircuit:${controllerMountingFootprint}`,
      kicad: controllerNativeFootprint(hole.ref),
      source_geometry_sha256: controllerSourceGeometrySha256(
        holes.filter((item) => item.ref === hole.ref),
        hole,
      ),
      initial_geometry_sha256: geometry.get(hole.ref)!,
      pad_numbers: [] as string[],
    },
    placement: { x_mm: hole.x, y_mm: hole.y, rotation_deg: 0, side: "front" },
  }));
  return {
    schema_version: 1,
    board: {
      stable_id: controllerBoardId,
      width_mm: 110,
      height_mm: 110,
      layer_count: 4,
      coordinate_system: "center-x-right-y-up",
      kicad_origin_mm: [100, 100],
      specs: {
        material: "FR4",
        thickness_mm: 1.6,
        assembly_sides: ["front"],
        compiled_board_sha256: controllerSourceGeometrySha256([board], { x: 0, y: 0 }),
        unowned_physical_geometry_sha256: controllerSourceGeometrySha256(
          unownedGeometry,
          { x: 0, y: 0 },
        ),
      },
      outline: { kind: "rectangle", center_mm: [0, 0], width_mm: 110, height_mm: 110 },
      holes,
    },
    versions: {
      tscircuit: packageJson.dependencies.tscircuit,
      circuit_json_to_kicad: packageJson.dependencies["circuit-json-to-kicad"],
      node: process.version.replace(/^v/, ""),
      bun: Bun.version,
    },
    components: [...components, ...mechanical].sort((a, b) =>
      a.stable_id.localeCompare(b.stable_id),
    ),
    nets,
    metadata: {
      board_designator: "Controller",
      title: "Crystal Shim isolated controller",
      physical_numbered_pad_count: 332,
      connected_logical_pin_count: 303,
      unused_logical_pin_count: 12,
      native_footprint_policy:
        "Per-reference source-derived native library; never substitute stock geometry.",
      status:
        "Source manifest only; augmentation, clean ERC/DRC and accepted handoff remain open.",
    },
  };
}
