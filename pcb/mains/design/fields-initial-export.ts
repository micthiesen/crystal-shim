import { At, KicadSym, SymbolProperty, parseKicadSym, type KicadSch } from "kicadts";
import {
  mainsComponentId,
  mainsNativeFootprint,
  mainsProjectSymbol,
  type createMainsManifest,
} from "./design-manifest";

// Initial typed schematic graphs only. The pinned converter omits MPN/datasheet
// and most footprint properties; restore exact source fields before emission.
export function applyMainsFieldsForInitialExport(
  schematics: readonly KicadSch[],
  manifest: ReturnType<typeof createMainsManifest>,
) {
  const expected = manifest.components.filter((c) => c.footprint.pad_numbers.length);
  const instances = schematics.flatMap((s) => s.symbols);
  if (
    schematics.length !== 4 ||
    expected.length !== 22 ||
    new Set(expected.map((c) => c.ref)).size !== 22 ||
    instances.length !== expected.length
  )
    throw new Error("Mains field metadata requires all 22 schematic instances");
  const plans = expected.map((component) => {
    const matches = instances.filter((s) =>
      s.properties.some((p) => p.key === "Reference" && p.value === component.ref),
    );
    const instance = matches[0];
    if (
      matches.length !== 1 ||
      !instance ||
      !instance.at ||
      !Number.isFinite(instance.at.x) ||
      !Number.isFinite(instance.at.y) ||
      component.stable_id !== mainsComponentId(component.ref) ||
      component.symbol !== mainsProjectSymbol(component.ref) ||
      component.footprint.kicad !== mainsNativeFootprint(component.ref) ||
      instance.libraryId !== component.symbol ||
      instance.properties.filter((p) => p.key === "Reference").length !== 1 ||
      instance.properties.filter((p) => p.key === "Value").length !== 1 ||
      !instance.properties.some((p) => p.key === "Value" && p.value === component.value)
    )
      throw new Error(`${component.ref}: unexpected initial symbol identity/value`);
    const fields = component.fields;
    const values = {
      Footprint: component.footprint.kicad,
      MPN:
        "manufacturer_part_number" in fields
          ? (fields.manufacturer_part_number ?? "")
          : "",
      Datasheet: "datasheet_url" in fields ? (fields.datasheet_url ?? "") : "",
    };
    if (!values.MPN || !values.Datasheet)
      throw new Error(`${component.ref}: missing exact MPN/datasheet metadata`);
    for (const [key, value] of Object.entries(values)) {
      const old = instance.properties.filter((p) => p.key === key);
      const allowed = new Set(["", value]);
      // Pinned converter emits KiCad's unset Datasheet placeholder on every
      // instance. Accept that exact placeholder, never an unrelated URL.
      if (key === "Datasheet") allowed.add("~");
      if (key === "Footprint")
        allowed.add(component.footprint.tscircuit.replace(/^tscircuit:/, ""));
      if (old.length > 1 || (old[0] && !allowed.has(old[0].value)))
        throw new Error(`${component.ref}: conflicting initial ${key} metadata`);
    }
    const copy = parseKicadSym(new KicadSym({ symbols: [instance] }).getString())
      .symbols[0]!;
    for (const [key, value] of Object.entries(values)) {
      const existing = copy.properties.find((p) => p.key === key);
      if (existing) existing.value = value;
      else
        copy.properties.push(
          new SymbolProperty({
            key,
            value,
            at: new At([instance.at.x, instance.at.y, instance.at.angle ?? 0]),
            hidden: true,
          }),
        );
    }
    return { instance, properties: copy.properties };
  });
  for (const { instance, properties } of plans) instance.properties = properties;
}
