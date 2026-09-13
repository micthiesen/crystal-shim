import { randomUUID } from "node:crypto";
import type { CircuitJson } from "circuit-json";
import {
  At,
  KicadSym,
  SchematicSymbol,
  SymbolLibId,
  SymbolPin,
  SymbolPower,
  SymbolProperty,
  SymbolPolyline,
  Pts,
  Xy,
  parseKicadSym,
  SymbolInstances,
  SymbolInstancesProject,
  SymbolInstancePath,
  type KicadSch,
  SymbolPinNumber,
  SymbolPinNames,
  SymbolPinNumbers,
  SymbolPinName,
  TextEffects,
  TextEffectsFont,
  Stroke,
  SymbolPolylineFill,
} from "kicadts";
import {
  controllerProjectSymbol,
  type createControllerManifest,
} from "./design-manifest";
import { chipElectricalContracts } from "./pin-electrical-contract";

type Manifest = ReturnType<typeof createControllerManifest>;
export const controllerSymbolLibraryFilename = "CrystalShim_Controller.kicad_sym";
export const controllerPowerFlagId = "CrystalShim_Controller:PWR_FLAG";
const reference = (s: SchematicSymbol) =>
  s.properties.find((p) => p.key === "Reference")?.value;
const pins = (s: SchematicSymbol): SymbolPin[] => [
  ...s.pins,
  ...s.subSymbols.flatMap(pins),
];
const clone = (s: SchematicSymbol) =>
  parseKicadSym(new KicadSym({ symbols: [s] }).getString()).symbols[0]!;
const sorted = (items: string[]) => JSON.stringify([...items].sort());
const effects = () => {
  const font = new TextEffectsFont();
  font.size = { height: 1.27, width: 1.27 };
  return new TextEffects({ font });
};
const shape = (s: SchematicSymbol) => {
  const copy = clone(s);
  copy.properties = [];
  // Relative subtraction in the converter leaves ~1e-14 mm noise between
  // repeated symbols. Compare at 1 nm while retaining the unrounded graph.
  const round = (node: object) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "number")
        Reflect.set(node, key, Math.round(value * 1e9) / 1e9);
      else if (value && typeof value === "object") round(value);
    }
  };
  round(copy);
  return copy.getString();
};

// Only the complete fresh converter graph, after USB numbering and reviewed pin
// typing, before first serialization. All validation and cloning precedes mutation.
// Per-reference entries preserve differently oriented symbols and default values.
export function applyControllerProjectSymbolsForInitialExport(
  json: CircuitJson,
  sheets: readonly KicadSch[],
  manifest: Manifest,
): SchematicSymbol[] {
  const source = json.filter((e) => e.type === "source_component");
  const expected = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  if (sheets.length !== 10 || source.length !== 113 || expected.length !== 113)
    throw new Error("Project library requires the complete 113-part initial hierarchy");
  const byRef = new Map(source.map((s) => [s.name, s]));
  const byManifest = new Map(expected.map((c) => [c.ref, c]));
  if (byRef.size !== 113 || byManifest.size !== 113)
    throw new Error("Duplicate project source reference");
  const seen = new Set<string>();
  const library: SchematicSymbol[] = [];
  const plans = sheets.map((sheet) => {
    const cache = sheet.libSymbols?.symbols ?? [];
    if (
      sorted(cache.map((s) => s.libraryId ?? "")) !==
      sorted(sheet.symbols.map((s) => s.libraryId ?? ""))
    )
      throw new Error("Initial symbol cache multiset differs from its instances");
    const entries = sheet.symbols.map((instance) => {
      const ref = reference(instance);
      const s = ref ? byRef.get(ref) : undefined;
      const component = ref ? byManifest.get(ref) : undefined;
      if (
        !ref ||
        !s ||
        !component ||
        seen.has(ref) ||
        instance.properties.filter((p) => p.key === "Reference").length !== 1
      )
        throw new Error(`Unknown or repeated initial project reference ${ref}`);
      seen.add(ref);
      const sc = json
        .filter((e) => e.type === "schematic_component")
        .filter((e) => e.source_component_id === s.source_component_id);
      if (sc.length !== 1) throw new Error(`${ref}: missing source symbol`);
      const oldId =
        s.ftype === "simple_test_point"
          ? `Custom:ControllerTestPoint_${ref}`
          : s.ftype === "simple_chip"
            ? `Device:U_${s
                .manufacturer_part_number!.replace(/[^A-Za-z0-9_-]+/g, "_")
                .replace(/_+/g, "_")
                .replace(/^_|_$/g, "")}`
            : `Device:${sc[0]!.symbol_name}`;
      const id = controllerProjectSymbol(ref);
      if (
        instance.libraryId !== oldId ||
        component.symbol !== id ||
        oldId.endsWith(":undefined")
      )
        throw new Error(`${ref}: not a fresh expected project symbol`);
      const candidates = cache.filter((c) => c.libraryId === oldId);
      if (
        !candidates.length ||
        candidates.some((c) => shape(c) !== shape(candidates[0]!))
      )
        throw new Error(`${ref}: ambiguous initial library geometry or pin types`);
      const lib = clone(candidates[0]!);
      if (
        sorted(pins(lib).map((p) => p.numberString ?? "")) !==
          sorted(component.footprint.pad_numbers) ||
        sorted(pins(instance).map((p) => p.numberString ?? "")) !==
          sorted(component.footprint.pad_numbers)
      )
        throw new Error(`${ref}: project pin multiset changed`);
      const contract =
        s.ftype === "simple_chip"
          ? chipElectricalContracts[s.manufacturer_part_number!]
          : undefined;
      if (s.ftype === "simple_chip" && !contract)
        throw new Error(`${ref}: unknown pin contract`);
      for (const pin of pins(lib)) {
        const declared = contract?.pins[pin.numberString!];
        if (
          pin.pinElectricalType !== (declared?.type ?? "passive") ||
          pin.name !== (declared?.name ?? pin.numberString)
        )
          throw new Error(`${ref}.${pin.numberString}: reviewed pin metadata changed`);
      }
      const base = oldId.split(":").at(-1)!;
      const name = id.split(":")[1]!;
      for (const sub of lib.subSymbols) {
        if (!sub.libraryId?.startsWith(`${base}_`) || sub.subSymbols.length)
          throw new Error(`${ref}: unknown initial symbol child naming`);
        sub.libraryId = name + sub.libraryId.slice(base.length);
      }
      lib.libraryId = id;
      // Shared converter IDs can carry another resistor/capacitor's defaults.
      // The project entry is source-specific, so re-adding it in KiCad must offer
      // this exact value, footprint and selected part identity, not the first
      // duplicate's defaults. Existing text anchors and all pin geometry stay.
      const prefix = /^([A-Z]+)\d+$/.exec(ref)?.[1];
      const excludeBom =
        "exclude_from_bom" in component.fields &&
        component.fields.exclude_from_bom === true;
      const excludeSim = s.ftype === "simple_test_point";
      if (
        !prefix ||
        instance.inBom !== !excludeBom ||
        instance.excludeFromSim !== excludeSim
      )
        throw new Error(
          `${ref}: initial source assembly/simulation attributes changed`,
        );
      lib.inBom = instance.inBom;
      lib.excludeFromSim = instance.excludeFromSim;
      const defaults = {
        Reference: prefix,
        Value: component.value,
        Footprint: component.footprint.kicad,
        // KiCad KLC S5.2: a colon includes the library in the filter. Exact
        // per-ref names intentionally allow no unreviewed alternate footprint.
        // https://klc.kicad.org/symbol/s5/s5.2/
        ki_fp_filters: component.footprint.kicad,
        MPN:
          "manufacturer_part_number" in component.fields
            ? (component.fields.manufacturer_part_number ?? "")
            : "",
        Datasheet:
          "datasheet_url" in component.fields
            ? (component.fields.datasheet_url ?? "")
            : "",
      };
      for (const [key, value] of Object.entries(defaults)) {
        const props = lib.properties.filter((p) => p.key === key);
        if (props.length > 1)
          throw new Error(`${ref}: ambiguous library ${key} default`);
        if (props[0]) props[0].value = value;
        else
          lib.properties = [
            ...lib.properties,
            new SymbolProperty({
              key,
              value,
              at: new At([0, 0, 0]),
              effects: effects(),
              hidden: key !== "Value",
            }),
          ];
      }
      const standalone = clone(lib);
      standalone.libraryId = name;
      library.push(standalone);
      return { instance, id, lib };
    });
    return { sheet, entries };
  });
  if (seen.size !== 113)
    throw new Error("Project library did not cover every source reference");
  for (const { sheet, entries } of plans) {
    for (const { instance, id } of entries) instance.libraryId = new SymbolLibId(id);
    if (sheet.libSymbols) sheet.libSymbols.symbols = entries.map((e) => e.lib);
  }
  return library;
}

// Revision 1, project-owned ERC annotation. One zero-length power_out pin at its
// anchor; no physical footprint, purchase, BOM/CPL or PCB presence. The # prefix
// excludes it from native XML electrical parts and endpoints. No component type
// is weakened and these flags do not certify live power or resolve output conflicts.
export function controllerPowerFlagDefinition(): SchematicSymbol {
  const pin = new SymbolPin();
  pin.pinElectricalType = "power_out";
  pin.pinGraphicStyle = "line";
  pin.at = new At([0, 0, 90]);
  pin.length = 0;
  pin._sxNumber = new SymbolPinNumber({ value: "1", effects: effects() });
  pin._sxName = new SymbolPinName({ value: "", effects: effects() });
  const stroke = new Stroke();
  stroke.width = 0;
  stroke.type = "default";
  const fill = new SymbolPolylineFill();
  fill.type = "none";
  const pinNames = new SymbolPinNames();
  pinNames.hide = true;
  pinNames.offset = 0;
  const pinNumbers = new SymbolPinNumbers();
  pinNumbers.hide = true;
  const flag = new SchematicSymbol({
    libraryId: "PWR_FLAG",
    pinNames,
    pinNumbers,
    inBom: false,
    onBoard: false,
    inPosFiles: false,
    excludeFromSim: true,
    properties: [
      new SymbolProperty({
        effects: effects(),
        key: "Reference",
        value: "#FLG",
        at: new At([0, 1.905, 0]),
        hidden: true,
      }),
      new SymbolProperty({
        effects: effects(),
        key: "Value",
        value: "PWR_FLAG",
        at: new At([0, 3.81, 0]),
      }),
    ],
    subSymbols: [
      new SchematicSymbol({ libraryId: "PWR_FLAG_0_0", pins: [pin] }),
      new SchematicSymbol({
        libraryId: "PWR_FLAG_0_1",
        polylines: [
          new SymbolPolyline({
            stroke,
            fill,
            points: new Pts(
              [
                [0, 0],
                [0, 1.27],
                [-1.016, 1.905],
                [0, 2.54],
                [1.016, 1.905],
                [0, 1.27],
              ].map(([x, y]) => new Xy(x!, y!)),
            ),
          }),
        ],
      }),
    ],
  });
  flag._sxPower = new SymbolPower("global");
  return flag;
}

export const controllerPowerFlags = [
  {
    ref: "#FLG0101",
    net: "V5_LOGIC",
    witness: "U2",
    pin: "3",
    basis: "Passive PSU/service diode OR feeds the logic rail",
    rotation: 90,
  },
  {
    ref: "#FLG0102",
    net: "V3V3",
    witness: "U2",
    pin: "1",
    basis: "AP63203 output after L1 feeds 3.3 V",
    rotation: 90,
  },
  {
    ref: "#FLG0103",
    net: "V5_SERVICE",
    witness: "J2",
    pin: "1",
    basis: "External service supply enters through J2",
    rotation: 90,
  },
  {
    ref: "#FLG0104",
    net: "GND",
    witness: "U1",
    pin: "1",
    basis: "Power connector return defines common low-voltage ground",
    rotation: 270,
  },
] as const;

export function addControllerPowerFlagsForInitialExport(
  sheets: readonly KicadSch[],
  manifest: Manifest,
) {
  const instances = sheets.flatMap((sheet) =>
    sheet.symbols.map((instance) => ({ sheet, instance })),
  );
  if (
    sheets.length !== 10 ||
    instances.length !== 113 ||
    instances.some((e) => reference(e.instance)?.startsWith("#"))
  )
    throw new Error("Power flags require the unannotated 113-part initial hierarchy");
  const definition = controllerPowerFlagDefinition();
  const plans = controllerPowerFlags.map((declaration) => {
    const net = manifest.nets.find((n) => n.name === declaration.net);
    const donor = instances.filter(
      (e) => reference(e.instance) === declaration.witness,
    );
    if (
      !net ||
      donor.length !== 1 ||
      !net.endpoints.some(
        (e) =>
          e.pad === declaration.pin &&
          e.component === `controller.component.${declaration.witness.toLowerCase()}`,
      )
    )
      throw new Error(`${declaration.net}: declared power witness changed`);
    // Supply annotation is unnecessary or potentially masks a design change if
    // a real power_out is newly connected to this exact manifest net.
    for (const endpoint of net.endpoints) {
      const c = manifest.components.find((c) => c.stable_id === endpoint.component)!;
      const match = instances.filter((e) => reference(e.instance) === c.ref);
      const found = match[0];
      const libs =
        found?.sheet.libSymbols?.symbols.filter(
          (l) => l.libraryId === found.instance.libraryId,
        ) ?? [];
      const pin =
        libs.length === 1
          ? pins(libs[0]!).filter((p) => p.numberString === endpoint.pad)
          : [];
      if (
        match.length !== 1 ||
        pin.length !== 1 ||
        pin[0]!.pinElectricalType === "power_out"
      )
        throw new Error(
          `${declaration.net}: unexpected source or conflicting power output`,
        );
    }
    const { sheet, instance: witness } = donor[0]!;
    const anchor = sheet.globalLabels.find((l) => l.value === declaration.net);
    if (
      !anchor?.at ||
      !witness.instances?.projects.length ||
      sheet.libSymbols?.symbols.some((s) => s.libraryId === controllerPowerFlagId)
    )
      throw new Error(
        `${declaration.net}: missing fresh electrical anchor or hierarchy path`,
      );
    const x = anchor.at.x,
      y = anchor.at.y;
    const pin = new SymbolPin();
    pin.numberString = "1";
    pin.uuid = randomUUID();
    const flag = new SchematicSymbol({
      at: new At([x, y, declaration.rotation]),
      unit: 1,
      uuid: randomUUID(),
      pins: [pin],
      inBom: false,
      onBoard: false,
      inPosFiles: false,
      excludeFromSim: true,
      dnp: false,
      properties: [
        new SymbolProperty({
          effects: effects(),
          key: "Reference",
          value: declaration.ref,
          at: new At([x, y - 4, 0]),
          hidden: true,
        }),
        new SymbolProperty({
          effects: effects(),
          key: "Value",
          value: "PWR_FLAG",
          at: new At([x, y - 3.81, 0]),
          hidden: true,
        }),
        new SymbolProperty({
          effects: effects(),
          key: "Description",
          value: `ERC annotation revision 1: ${declaration.net}; ${declaration.basis}. ERC only; do not populate. Not a physical part.`,
          at: new At([x, y, declaration.rotation]),
          hidden: true,
        }),
      ],
    });
    flag.libraryId = new SymbolLibId(controllerPowerFlagId);
    const paths = new SymbolInstances();
    paths.projects = witness.instances.projects.map((project) => {
      const next = new SymbolInstancesProject(project.name);
      next.paths = project.paths.map((path) => {
        const p = new SymbolInstancePath(path.value);
        p.reference = declaration.ref;
        p.unit = 1;
        return p;
      });
      return next;
    });
    if (paths.projects.some((p) => p.paths.length !== 1))
      throw new Error("Ambiguous power annotation instance path");
    flag.instances = paths;
    return { sheet, flag };
  });
  for (const sheet of sheets) {
    const flags = plans.filter((p) => p.sheet === sheet).map((p) => p.flag);
    if (!flags.length) continue;
    const cache = clone(definition);
    cache.libraryId = controllerPowerFlagId;
    sheet.libSymbols!.symbols = [...sheet.libSymbols!.symbols, cache];
    sheet.symbols = [...sheet.symbols, ...flags];
  }
  return definition;
}
