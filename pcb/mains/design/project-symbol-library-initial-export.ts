import { randomUUID } from "node:crypto";
import type { CircuitJson } from "circuit-json";
import {
  At,
  KicadSym,
  SchematicSymbol,
  SymbolLibId,
  SymbolPin,
  SymbolProperty,
  parseKicadSym,
  SymbolInstances,
  SymbolInstancesProject,
  SymbolInstancePath,
  type KicadSch,
  TextEffects,
  TextEffectsFont,
  Xy,
} from "kicadts";
import {
  mainsProjectSymbol,
  mainsNativeFootprint,
  mainsComponentId,
  type createMainsManifest,
} from "./design-manifest";
import { controllerPowerFlagDefinition } from "../../controller/design/project-symbol-library-initial-export";
import { mainsChipElectricalContracts } from "./pin-electrical-contract";
import { schematicNativeUnits } from "../../scripts/lib/schematic-grid-initial-export";

type Manifest = ReturnType<typeof createMainsManifest>;
export const mainsSymbolLibraryFilename = "CrystalShim_Mains.kicad_sym";
export const mainsPowerFlagId = "CrystalShim_Mains:PWR_FLAG";
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
  return copy.getString();
};

// Only the complete four-sheet fresh converter graph, after reviewed pin
// typing, before first serialization. All validation and cloning precedes mutation.
// Per-reference entries preserve differently oriented symbols and default values.
export function applyMainsProjectSymbolsForInitialExport(
  json: CircuitJson,
  sheets: readonly KicadSch[],
  manifest: Manifest,
): SchematicSymbol[] {
  const source = json.filter((e) => e.type === "source_component");
  const expected = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  if (sheets.length !== 4 || source.length !== 23 || expected.length !== 23)
    throw new Error("Project library requires the complete 23-part initial hierarchy");
  const byRef = new Map(source.map((s) => [s.name, s]));
  const byManifest = new Map(expected.map((c) => [c.ref, c]));
  if (
    byRef.size !== 23 ||
    byManifest.size !== 23 ||
    new Set(source.map((s) => s.source_component_id)).size !== 23
  )
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
      const fields = component.fields;
      if (
        !["simple_chip", "simple_resistor", "simple_capacitor"].includes(s.ftype) ||
        component.stable_id !== mainsComponentId(ref) ||
        component.footprint.kicad !== mainsNativeFootprint(ref) ||
        !("manufacturer_part_number" in fields) ||
        !fields.manufacturer_part_number ||
        fields.manufacturer_part_number !== s.manufacturer_part_number ||
        !("datasheet_url" in fields) ||
        !fields.datasheet_url ||
        instance.properties.filter((p) => p.key === "Value").length !== 1 ||
        !instance.properties.some(
          (p) => p.key === "Value" && p.value === component.value,
        )
      )
        throw new Error(`${ref}: changed project source identity or value`);
      const sc = json
        .filter((e) => e.type === "schematic_component")
        .filter((e) => e.source_component_id === s.source_component_id);
      if (sc.length !== 1) throw new Error(`${ref}: missing source symbol`);
      const oldId =
        s.ftype === "simple_chip"
          ? `Device:U_${s
              .manufacturer_part_number!.replace(/[^A-Za-z0-9_-]+/g, "_")
              .replace(/_+/g, "_")
              .replace(/^_|_$/g, "")}`
          : `Device:${sc[0]!.symbol_name}`;
      const id = mainsProjectSymbol(ref);
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
          ? mainsChipElectricalContracts[s.manufacturer_part_number!]
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
      const excludeSim = false;
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
      return { instance, id: new SymbolLibId(id), lib };
    });
    return { sheet, entries };
  });
  if (seen.size !== 23)
    throw new Error("Project library did not cover every source reference");
  for (const { sheet, entries } of plans) {
    for (const { instance, id } of entries) instance.libraryId = id;
    if (sheet.libSymbols) sheet.libSymbols.symbols = entries.map((e) => e.lib);
  }
  return library;
}

// The existing revision-1 geometry has no controller identity. Keep one shared
// geometric definition; only the mains library ID and declarations differ.
export function mainsPowerFlagDefinition(): SchematicSymbol {
  return controllerPowerFlagDefinition();
}

export const mainsPowerFlags = [
  {
    ref: "#FLG0201",
    net: "AC_N",
    witness: "U1",
    pin: "1",
    basis: "External mains neutral enters the isolated supply through J1",
    rotation: 90,
  },
  {
    ref: "#FLG0202",
    net: "AC_L_FUSED",
    witness: "U1",
    pin: "2",
    basis: "Externally fused mains line enters the isolated supply through J1",
    rotation: 90,
  },
] as const;

type Point = { x: number; y: number };
const nativePoint = (p: Point): Point => ({
  x: schematicNativeUnits(p.x),
  y: schematicNativeUnits(p.y),
});
const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
function onStraight(p: Point, a: Point, b: Point) {
  return (
    (a.x === b.x ? p.x === a.x : p.y === a.y) &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}
// The audited source uses a direct line label and a single-wire neutral label.
// Admit only those motifs. No page-wide net inference or wire traversal can
// silently turn a changed native witness into a powered input.
function assertPowerWitnessLabel(sheet: KicadSch, at: Point, net: string) {
  const p = nativePoint(at);
  const fail = () => {
    throw new Error(`${net}: changed direct or single-wire power witness`);
  };
  const wires = sheet.wires.map((wire) => {
    const points = wire.points?.points;
    if (points?.length !== 2 || points.some((q) => !(q instanceof Xy))) return fail();
    const a = nativePoint(points[0] as Xy),
      b = nativePoint(points[1] as Xy);
    if ((a.x !== b.x && a.y !== b.y) || samePoint(a, b)) return fail();
    return { a, b };
  });
  const incident = wires.filter((w) => onStraight(p, w.a, w.b));
  let end = p;
  if (incident.length) {
    if (incident.length !== 1) return fail();
    const w = incident[0]!;
    if (!samePoint(p, w.a) && !samePoint(p, w.b)) return fail();
    end = samePoint(p, w.a) ? w.b : w.a;
    // Other wires may continue from the label. Their whole-net membership is
    // checked by parity; only this unique first segment proves the witness.
  }
  const along = (a: { at?: Point }) => !!a.at && onStraight(nativePoint(a.at), p, end);
  const globals = sheet.globalLabels.filter(along);
  if (
    globals.length !== 1 ||
    globals[0]!.value !== net ||
    !samePoint(nativePoint(globals[0]!.at!), end) ||
    sheet.labels.some(along)
  )
    return fail();
}

export function addMainsPowerFlagsForInitialExport(
  sheets: readonly KicadSch[],
  manifest: Manifest,
) {
  const instances = sheets.flatMap((sheet) =>
    sheet.symbols.map((instance) => ({ sheet, instance })),
  );
  if (
    sheets.length !== 4 ||
    instances.length !== 23 ||
    instances.some((e) => reference(e.instance)?.startsWith("#"))
  )
    throw new Error("Power flags require the unannotated 23-part initial hierarchy");
  const expected = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  if (expected.length !== 23 || new Set(expected.map((c) => c.ref)).size !== 23)
    throw new Error("Power flags require all mains manifest identities");
  for (const component of expected) {
    const matches = instances.filter((e) => reference(e.instance) === component.ref);
    if (
      component.stable_id !== mainsComponentId(component.ref) ||
      component.symbol !== mainsProjectSymbol(component.ref) ||
      matches.length !== 1 ||
      matches[0]!.instance.libraryId !== component.symbol ||
      matches[0]!.instance.properties.filter((p) => p.key === "Reference").length !== 1
    )
      throw new Error(`${component.ref}: power annotation project identity changed`);
  }
  const definition = mainsPowerFlagDefinition();
  const plans = mainsPowerFlags.map((declaration) => {
    const nets = manifest.nets.filter((n) => n.name === declaration.net);
    const net = nets[0];
    const donor = instances.filter(
      (e) => reference(e.instance) === declaration.witness,
    );
    if (
      nets.length !== 1 ||
      !net ||
      donor.length !== 1 ||
      !net.endpoints.some(
        (e) =>
          e.pad === declaration.pin &&
          e.component === `mains.component.${declaration.witness.toLowerCase()}`,
      )
    )
      throw new Error(`${declaration.net}: declared power witness changed`);
    // Supply annotation is unnecessary or potentially masks a design change if
    // a real power_out is newly connected to this exact manifest net.
    for (const endpoint of net.endpoints) {
      const c = expected.find((c) => c.stable_id === endpoint.component);
      if (!c) throw new Error(`${declaration.net}: unknown power endpoint`);
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
        pin[0]!.pinElectricalType === "power_out" ||
        (c.ref === declaration.witness &&
          endpoint.pad === declaration.pin &&
          pin[0]!.pinElectricalType !== "power_in")
      )
        throw new Error(
          `${declaration.net}: unexpected source or conflicting power output`,
        );
    }
    const { sheet, instance: witness } = donor[0]!;
    const library = sheet.libSymbols?.symbols.find(
      (s) => s.libraryId === witness.libraryId,
    );
    const anchor =
      library && pins(library).find((p) => p.numberString === declaration.pin);
    if (
      !anchor?.at ||
      !Number.isFinite(anchor.at.x) ||
      !Number.isFinite(anchor.at.y) ||
      !witness.at ||
      !Number.isFinite(witness.at.x) ||
      !Number.isFinite(witness.at.y) ||
      (witness.at.angle ?? 0) !== 0 ||
      witness.mirror ||
      !witness.instances?.projects.length ||
      !sheet.libSymbols ||
      sheet.libSymbols?.symbols.some((s) => s.libraryId === mainsPowerFlagId)
    )
      throw new Error(
        `${declaration.net}: missing fresh electrical anchor or hierarchy path`,
      );
    // Attach at the exact declared input pin, independent of global-label order.
    // Verify its actual direct/single-wire label so a changed converter net
    // cannot acquire a misleading flag.
    const x =
        (schematicNativeUnits(witness.at.x) + schematicNativeUnits(anchor.at.x)) /
        10000,
      y =
        (schematicNativeUnits(witness.at.y) - schematicNativeUnits(anchor.at.y)) /
        10000;
    assertPowerWitnessLabel(sheet, { x, y }, declaration.net);
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
    flag.libraryId = new SymbolLibId(mainsPowerFlagId);
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
    if (paths.projects.some((p) => p.paths.length !== 1 || !p.paths[0]?.value))
      throw new Error("Ambiguous power annotation instance path");
    flag.instances = paths;
    return { sheet, flag: clone(flag) };
  });
  const additions = sheets.flatMap((sheet) => {
    const flags = plans.filter((p) => p.sheet === sheet).map((p) => p.flag);
    if (!flags.length) return [];
    const cache = clone(definition);
    cache.libraryId = mainsPowerFlagId;
    return [{ sheet, flags, cache }];
  });
  for (const { sheet, flags, cache } of additions) {
    sheet.libSymbols!.symbols = [...sheet.libSymbols!.symbols, cache];
    sheet.symbols = [...sheet.symbols, ...flags];
  }
  return definition;
}
