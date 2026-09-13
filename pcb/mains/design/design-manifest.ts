import type { CircuitJson } from "circuit-json";
import packageJson from "../../package.json";
import {
  controllerFootprintGeometrySha256 as footprintGeometrySha256,
  controllerSourceGeometrySha256 as sourceGeometrySha256,
} from "../../controller/design/footprint-geometry-identity";
import { schematicPortNetNames } from "../../controller/design/schematic-connectivity-check";
import {
  mainsSchematicConnectivityErrors,
  mainsExpectedNc,
} from "./schematic-connectivity-check";
import { controllerDatasheets } from "../../controller/design/manifest-parts";
import { controllerCapacitors } from "../../controller/design/passive-components";
import {
  psuHeaderPattern,
  serviceHeaderPattern,
} from "../../controller/design/micro-fit-components";
import { mainsMountingHoles, mainsPlacements, mainsBoardSize } from "./placements";
import {
  mainsHeaderDefinitions,
  mainsHeaderPattern,
  mainsHeaderPhysical,
} from "./mains-headers";
import {
  branchFusePattern,
  branchFusePhysical,
  isolatedSupplyPattern,
  isolatedSupplyPhysical,
  pumpRelayPattern,
  pumpRelayPhysical,
} from "./power-components";
import {
  flybackPattern,
  flybackPhysical,
  snubberResistorPattern,
  snubberResistorPhysical,
  snubberCapacitorPattern,
  snubberCapacitorPhysical,
} from "./suppression-components";
import { buckInductorPattern } from "../../controller/design/assembly-components";
import { mainsBuckPattern, motorFusePattern } from "./secondary-components";
import { movCapture } from "./mov-component";
import { prepareMainsFootprintOriginsForInitialExport } from "./footprint-origin-initial-export";
import { createMainsInitialPcb } from "./mains-initial-pcb";
import {
  mainsMountingFootprint,
  mainsMountingValue,
} from "./mounting-holes-initial-export";

export const mainsBoardId = "mains.board.main";
export const mainsNativeLibrary = "CrystalShim_Mains";
const refs = new Set<string>([
  ...Object.keys(mainsPlacements),
  ...mainsMountingHoles.map((h) => h.ref),
]);
export function mainsComponentId(ref: string) {
  if (!refs.has(ref)) throw new Error(`Unknown mains reference ${ref}`);
  return `mains.component.${ref.toLowerCase()}`;
}
export function mainsNativeFootprint(ref: string) {
  mainsComponentId(ref);
  return `${mainsNativeLibrary}:Mains_${ref}`;
}
export function mainsProjectSymbol(ref: string) {
  if (!Object.hasOwn(mainsPlacements, ref))
    throw new Error(`No mains schematic symbol for ${ref}`);
  return mainsNativeFootprint(ref);
}

type Part = {
  mpn: string;
  footprint: string;
  datasheet: string;
  pins: readonly number[];
  value?: string;
  quantity?: number | string;
  voltage?: number;
};
// Ref-bound selected parts, never merely any known part of the same family.
// Circuit JSON omits datasheet URLs; retain the exact source model evidence.
const parts: Readonly<Record<string, Part>> = {
  ...Object.fromEntries(
    Object.entries(mainsHeaderDefinitions).map(([ref, p]) => [
      ref,
      {
        mpn: p.mpn,
        footprint: mainsHeaderPattern(ref as keyof typeof mainsHeaderDefinitions).id,
        datasheet: mainsHeaderPhysical(ref as keyof typeof mainsHeaderDefinitions)
          .source.url,
        pins: Array.from({ length: p.circuits }, (_, i) => i + 1),
      },
    ]),
  ),
  U1: {
    mpn: "IRM-45-12",
    footprint: isolatedSupplyPattern.id,
    datasheet: isolatedSupplyPhysical.source.url,
    pins: [1, 2, 3, 4],
  },
  K1: {
    mpn: "G5RL-1A-TV8 DC5",
    footprint: pumpRelayPattern.id,
    datasheet: pumpRelayPhysical.source.url,
    pins: [1, 3, 4, 5],
  },
  RV1: {
    mpn: movCapture.mpn,
    footprint: movCapture.footprint,
    datasheet: movCapture.source,
    pins: [1, 2],
  },
  D1: {
    mpn: "1N4007-E3/54",
    footprint: flybackPattern.id,
    datasheet: flybackPhysical.source.url,
    pins: [1, 2],
  },
  R1: {
    mpn: "PR02FS0201000KA100",
    footprint: snubberResistorPattern.id,
    datasheet: snubberResistorPhysical.source.url,
    pins: [1, 2],
    value: "100Ω",
    quantity: 100,
  },
  C1: {
    mpn: "B32921C3473K000",
    footprint: snubberCapacitorPattern.id,
    datasheet: snubberCapacitorPhysical.source.url,
    pins: [1, 2],
    value: "47nF",
    quantity: 47e-9,
    voltage: 305,
  },
  J5: {
    mpn: "43650-0300",
    footprint: psuHeaderPattern.id,
    datasheet: controllerDatasheets["43650-0300"]!,
    pins: [1, 2, 3],
  },
  U2: {
    mpn: "AP63205WU-7",
    footprint: mainsBuckPattern.id,
    datasheet: mainsBuckPattern.source.url,
    pins: [1, 2, 3, 4, 5, 6],
  },
  L1: {
    mpn: "SRP5030TA-4R7M",
    footprint: buckInductorPattern.id,
    datasheet: buckInductorPattern.source.url,
    pins: [1, 2],
    value: "4.7µH",
    quantity: "4.7uH",
  },
  F3: {
    mpn: "0215001.MXEP",
    footprint: branchFusePattern.id,
    datasheet: branchFusePhysical.source.url,
    pins: [1, 2],
  },
  F2: {
    mpn: "0451003.MRL",
    footprint: motorFusePattern.id,
    datasheet: motorFusePattern.source.url,
    pins: [1, 2],
  },
  J6: {
    mpn: "43045-0200",
    footprint: serviceHeaderPattern.id,
    datasheet: controllerDatasheets["43045-0200"]!,
    pins: [1, 2],
  },
  ...Object.fromEntries(
    (
      [
        ["C2", "22uF", 22e-6, 25],
        ["C3", "22uF", 22e-6, 25],
        ["C4", "22uF", 22e-6, 25],
        ["C5", "100nF", 100e-9, 50],
        ["C6", "22uF", 22e-6, 25],
        ["C7", "100nF", 100e-9, 50],
      ] as const
    ).map(([ref, value, quantity, voltage]) => {
      const part = controllerCapacitors[value];
      return [
        ref,
        {
          mpn: part.mpn,
          footprint: part.pattern.id,
          datasheet: part.datasheetUrl,
          pins: [1, 2],
          value,
          quantity,
          voltage,
        },
      ];
    }),
  ),
};
const unusedPins = new Set(mainsExpectedNc);
const close = (a: number, b: number) => Number.isFinite(a) && Math.abs(a - b) < 1e-6;

function uniqueIds(elements: readonly Record<string, unknown>[], key: string) {
  const ids = elements.map((e) => e[key]);
  if (
    ids.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(ids).size !== ids.length
  )
    throw new Error(`Missing or duplicate ${key}`);
}

// Source manifest only. Hash schema names are the existing versioned shared
// projection contract; they do not confer controller identities on this board.
// This constructs fresh in-memory graphs and never emits or loads native files.
export function createMainsManifest(json: CircuitJson) {
  const errors = mainsSchematicConnectivityErrors(json);
  if (errors.length)
    throw new Error(`Mains source is invalid: ${JSON.stringify(errors)}`);
  // Check generated IDs before any converter lookup can silently choose one.
  for (const type of new Set(json.map((e) => e.type))) {
    const elements = json.filter((e) => e.type === type) as unknown as Record<
      string,
      unknown
    >[];
    const key = `${type}_id`;
    const requiresId =
      type.startsWith("pcb_") ||
      type.startsWith("schematic_") ||
      [
        "source_board",
        "source_component",
        "source_net",
        "source_port",
        "source_trace",
        "source_group",
      ].includes(type);
    if ((requiresId && !type.endsWith("_warning")) || elements.some((e) => key in e))
      uniqueIds(elements, key);
  }
  const boards = json.filter((e) => e.type === "pcb_board");
  const board = boards[0];
  if (
    boards.length !== 1 ||
    !board ||
    board.width !== mainsBoardSize.width ||
    board.height !== mainsBoardSize.height ||
    board.num_layers !== 2 ||
    board.thickness !== 1.6 ||
    board.material !== "fr4" ||
    board.center.x !== 0 ||
    board.center.y !== 0 ||
    board.outline !== undefined ||
    (board.shape !== undefined && board.shape !== "rect")
  )
    throw new Error("Mains board specification changed");
  const sources = json.filter((e) => e.type === "source_component");
  if (
    sources.length !== 22 ||
    new Set(sources.map((e) => e.name)).size !== 22 ||
    sources.some((e) => !Object.hasOwn(parts, e.name))
  )
    throw new Error("Expected exactly 22 unique mains source references");
  const bySource = new Map(sources.map((e) => [e.source_component_id, e]));
  const ports = json.filter((e) => e.type === "source_port");
  const schematics = json.filter((e) => e.type === "schematic_component");
  const physicalPorts = json.filter((e) => e.type === "pcb_port");
  const allLands = json.filter(
    (e) => e.type === "pcb_smtpad" || e.type === "pcb_plated_hole",
  );
  if (
    ports.length !== 60 ||
    physicalPorts.length !== 60 ||
    schematics.length !== 22 ||
    allLands.length !== 75 ||
    ports.some(
      (p) =>
        !bySource.has(p.source_component_id ?? "") || !Number.isInteger(p.pin_number),
    )
  )
    throw new Error("Mains logical/physical pin coverage changed");
  const normalized = prepareMainsFootprintOriginsForInitialExport(json);
  const physical = normalized.filter((e) => e.type === "pcb_component");
  if (
    physical.length !== 22 ||
    physical.some((p) => !bySource.has(p.source_component_id))
  )
    throw new Error("Mains physical component coverage changed");
  const physicalIds = new Set(physical.map((p) => p.pcb_component_id));
  const physicalElements = normalized.filter(
    (e) =>
      e.type.startsWith("pcb_") &&
      !["pcb_component", "pcb_port", "pcb_board", "pcb_group"].includes(e.type) &&
      !e.type.endsWith("_warning"),
  );
  for (const e of physicalElements)
    if (
      "pcb_component_id" in e &&
      e.pcb_component_id &&
      !physicalIds.has(e.pcb_component_id)
    )
      throw new Error("Physical source element has an unknown component owner");
  const unowned = physicalElements.filter(
    (e) => !("pcb_component_id" in e) || !e.pcb_component_id,
  );
  const native = createMainsInitialPcb(normalized);
  const nativeByRef = new Map(
    native.footprints.flatMap((fp) => {
      const names = fp.properties.filter((p) => p.key === "Reference");
      if (!names.length) return [];
      if (names.length !== 1 || !refs.has(names[0]!.value))
        throw new Error("Unknown native mains reference");
      return [[names[0]!.value, fp] as const];
    }),
  );
  if (nativeByRef.size !== 26 || native.footprints.length !== 26)
    throw new Error("Mains native footprint coverage changed");
  const drawn = schematicPortNetNames(json);
  const physicalPadNumbers: Record<string, string[]> = {};
  const logicalPins: Record<
    string,
    { number: string; name: string; no_connect: boolean }[]
  > = {};
  const components = sources.map((source) => {
    const ref = source.name,
      selected = parts[ref]!;
    const placement = mainsPlacements[ref as keyof typeof mainsPlacements];
    const candidates = physical.filter(
      (p) => p.source_component_id === source.source_component_id,
    );
    const placed = candidates[0];
    const symbol = schematics.filter(
      (s) => s.source_component_id === source.source_component_id,
    );
    const expectedKind =
      selected.quantity === undefined
        ? "simple_chip"
        : ref.startsWith("R")
          ? "simple_resistor"
          : ref.startsWith("L")
            ? "simple_inductor"
            : "simple_capacitor";
    const value =
      source.ftype === "simple_resistor"
        ? source.display_resistance
        : source.ftype === "simple_capacitor"
          ? source.display_capacitance
          : source.ftype === "simple_inductor"
            ? source.display_inductance
            : source.manufacturer_part_number;
    const quantity =
      source.ftype === "simple_resistor"
        ? source.resistance
        : source.ftype === "simple_capacitor"
          ? source.capacitance
          : source.ftype === "simple_inductor"
            ? source.inductance
            : undefined;
    if (
      source.manufacturer_part_number !== selected.mpn ||
      source.ftype !== expectedKind ||
      value !== (selected.value ?? selected.mpn) ||
      quantity !== selected.quantity ||
      (source.ftype === "simple_capacitor" &&
        source.max_voltage_rating !== selected.voltage) ||
      !selected.datasheet
    )
      throw new Error(`${ref}: changed selected MPN/value/datasheet`);
    if (
      candidates.length !== 1 ||
      !placed ||
      placed.metadata?.kicad_footprint?.footprintName !== selected.footprint ||
      placed.layer !== "top" ||
      placed.do_not_place ||
      placed.rotation !== placement.pcbRotation ||
      !close(placed.center.x, placement.pcbX) ||
      !close(placed.center.y, placement.pcbY) ||
      symbol.length !== 1
    )
      throw new Error(`${ref}: missing exact source footprint/placement/symbol`);
    const ownPorts = ports.filter(
      (p) => p.source_component_id === source.source_component_id,
    );
    if (
      ownPorts.some((p) => typeof p.name !== "string" || !p.name.trim()) ||
      new Set(ownPorts.map((p) => p.name)).size !== ownPorts.length
    )
      throw new Error(`${ref}: missing or duplicate logical pin names`);
    logicalPins[ref] = ownPorts
      .map((p) => ({
        number: String(p.pin_number),
        name: p.name!,
        no_connect: Boolean(p.do_not_connect),
      }))
      .sort((a, b) => a.number.localeCompare(b.number));
    const padNumbers = ownPorts.map((p) => String(p.pin_number)).sort();
    if (JSON.stringify(padNumbers) !== JSON.stringify(selected.pins.map(String).sort()))
      throw new Error(`${ref}: logical pin set changed`);
    const ownLandNumbers = ownPorts
      .flatMap((port) => {
        const pin = `${ref}.${port.pin_number}`;
        const nc = unusedPins.has(pin);
        if (
          Boolean(port.do_not_connect) !== nc ||
          (drawn.get(port.source_port_id)?.length ?? 0) !== (nc ? 0 : 1)
        )
          throw new Error(`${pin}: connected/unused pin intent changed`);
        const pcbPorts = physicalPorts.filter(
          (p) => p.source_port_id === port.source_port_id,
        );
        if (
          pcbPorts.length !== 1 ||
          pcbPorts[0]!.pcb_component_id !== placed.pcb_component_id
        )
          throw new Error(`${pin}: physical port ownership changed`);
        const lands = allLands.filter(
          (p) => p.pcb_port_id === pcbPorts[0]!.pcb_port_id,
        );
        const count = /^J[1-4]$/.test(ref) ? 2 : 1;
        if (
          lands.length !== count ||
          lands.some((p) => p.pcb_component_id !== placed.pcb_component_id)
        )
          throw new Error(`${pin}: physical land multiplicity/owner changed`);
        return lands.map(() => String(port.pin_number));
      })
      .sort();
    const fp = nativeByRef.get(ref)!;
    if (
      JSON.stringify(
        fp.fpPads
          .filter((p) => p.number)
          .map((p) => p.number)
          .sort(),
      ) !== JSON.stringify(ownLandNumbers)
    )
      throw new Error(`${ref}: native pad multiplicity changed`);
    physicalPadNumbers[ref] = ownLandNumbers;
    return {
      stable_id: mainsComponentId(ref),
      ref,
      value: value!,
      symbol: mainsProjectSymbol(ref),
      fields: {
        manufacturer_part_number: selected.mpn,
        datasheet_url: selected.datasheet,
      },
      footprint: {
        tscircuit: `tscircuit:${selected.footprint}`,
        kicad: mainsNativeFootprint(ref),
        source_geometry_sha256: sourceGeometrySha256(
          physicalElements.filter(
            (e) =>
              "pcb_component_id" in e && e.pcb_component_id === placed.pcb_component_id,
          ),
          placed.center,
        ),
        initial_geometry_sha256: footprintGeometrySha256(fp),
        pad_numbers: padNumbers,
      },
      placement: {
        x_mm: placement.pcbX,
        y_mm: placement.pcbY,
        rotation_deg: placement.pcbRotation,
        side: "front",
      },
    };
  });
  const sourceNets = json.filter((e) => e.type === "source_net");
  if (sourceNets.length !== 14 || new Set(sourceNets.map((n) => n.name)).size !== 14)
    throw new Error("Expected 14 unique named mains nets");
  const nets = sourceNets
    .map((net) => ({
      stable_id: `mains.net.${net.name.toLowerCase()}`,
      name: net.name,
      endpoints: ports
        .filter((p) => drawn.get(p.source_port_id)?.includes(net.name))
        .map((p) => ({
          component: mainsComponentId(bySource.get(p.source_component_id!)!.name),
          pad: String(p.pin_number),
        }))
        .sort((a, b) =>
          `${a.component}.${a.pad}`.localeCompare(`${b.component}.${b.pad}`),
        ),
    }))
    .sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  if (
    nets.some((n) => !n.endpoints.length) ||
    nets.reduce((sum, n) => sum + n.endpoints.length, 0) !== 53
  )
    throw new Error("Mains named-net endpoint coverage changed");
  const sourceHoles = normalized.filter((e) => e.type === "pcb_hole");
  const holes = sourceHoles
    .map((hole) => {
      if (hole.hole_shape !== "circle") throw new Error("Unsupported mains NPTH shape");
      const mount =
        !hole.pcb_component_id &&
        mainsMountingHoles.find((m) => close(m.x, hole.x) && close(m.y, hole.y));
      const placed = physical.find((p) => p.pcb_component_id === hole.pcb_component_id);
      const owner = placed && bySource.get(placed.source_component_id)?.name;
      const ref = mount ? mount.ref : owner;
      if (
        (!mount && owner !== "J5" && owner !== "J6") ||
        !ref ||
        hole.hole_diameter !== (mount ? 3.2 : 3) ||
        hole.is_covered_with_solder_mask
      )
        throw new Error("Unidentified or changed mains NPTH");
      return {
        stable_id: mount
          ? `mains.hole.${ref.toLowerCase()}`
          : `mains.hole.${ref.toLowerCase()}.locator-1`,
        ref,
        x_mm: hole.x,
        y_mm: hole.y,
        drill_mm: hole.hole_diameter,
        plated: false,
      };
    })
    .sort((a, b) => a.stable_id.localeCompare(b.stable_id));
  if (holes.length !== 6 || new Set(holes.map((h) => h.stable_id)).size !== 6)
    throw new Error("Expected six unique mains NPTH identities");
  const mechanical = mainsMountingHoles.map((hole) => {
    // The shared initial PCB path has validated and identified this exact hole
    // before hashing, including its board-only/BOM/CPL attributes.
    const fp = nativeByRef.get(hole.ref);
    if (!fp || fp.libraryLink !== mainsMountingFootprint)
      throw new Error(`${hole.ref}: initial mounting geometry changed`);
    return {
      stable_id: mainsComponentId(hole.ref),
      ref: hole.ref,
      value: mainsMountingValue,
      symbol: "Mechanical:MountingHole",
      fields: { exclude_from_bom: true, exclude_from_cpl: true },
      footprint: {
        tscircuit: `tscircuit:${mainsMountingFootprint}`,
        kicad: mainsNativeFootprint(hole.ref),
        source_geometry_sha256: sourceGeometrySha256(
          sourceHoles.filter(
            (h) => !h.pcb_component_id && close(h.x, hole.x) && close(h.y, hole.y),
          ),
          hole,
        ),
        initial_geometry_sha256: footprintGeometrySha256(fp),
        pad_numbers: [] as string[],
      },
      placement: { x_mm: hole.x, y_mm: hole.y, rotation_deg: 0, side: "front" },
    };
  });
  return {
    schema_version: 1,
    board: {
      stable_id: mainsBoardId,
      width_mm: mainsBoardSize.width,
      height_mm: mainsBoardSize.height,
      layer_count: 2,
      coordinate_system: "center-x-right-y-up",
      kicad_origin_mm: [100, 100],
      specs: {
        material: "FR4",
        thickness_mm: 1.6,
        assembly_sides: ["front"],
        compiled_board_sha256: sourceGeometrySha256([board], { x: 0, y: 0 }),
        unowned_physical_geometry_sha256: sourceGeometrySha256(unowned, { x: 0, y: 0 }),
      },
      outline: {
        kind: "rectangle",
        center_mm: [0, 0],
        width_mm: mainsBoardSize.width,
        height_mm: mainsBoardSize.height,
      },
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
      board_designator: "Mains",
      title: "Crystal Shim isolated mains switching",
      physical_numbered_pad_count: 75,
      connected_logical_pin_count: 53,
      unused_logical_pin_count: 7,
      physical_pad_numbers: Object.fromEntries(
        Object.entries(physicalPadNumbers).sort(([a], [b]) => a.localeCompare(b)),
      ),
      logical_pins: Object.fromEntries(
        Object.entries(logicalPins).sort(([a], [b]) => a.localeCompare(b)),
      ),
      source_paste_record_count: normalized.filter((e) => e.type === "pcb_solder_paste")
        .length,
      native_footprint_policy:
        "Per-reference source-derived native library; never substitute stock geometry.",
      status:
        "Source manifest only; augmentation, clean ERC/DRC and accepted handoff remain open.",
    },
  };
}
