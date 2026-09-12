import { createHash } from "node:crypto";
import { parseKicadMod, type Footprint, type KicadPcb } from "kicadts";

// Bind compiled physical intent too: a converter-ignored source paste or
// graphic edit must still trigger footprint review. Only generated link IDs are
// omitted; point coordinates use the part's manufacturer datum. Rotation can
// conservatively change this identity because some source geometry is baked.
export function controllerSourceGeometrySha256(
  elements: readonly unknown[],
  origin: { x: number; y: number },
) {
  const relative = (value: unknown, key = ""): unknown => {
    if (Array.isArray(value)) {
      const items = value.map((v) => relative(v));
      return ["layers", "port_hints"].includes(key)
        ? items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
        : items;
    }
    if (!value || typeof value !== "object") return canonical(value);
    const object = value as Record<string, unknown>;
    const point = typeof object.x === "number" && typeof object.y === "number";
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .flatMap((field) => {
          if (field.endsWith("_id") || object[field] === undefined) return [];
          const item =
            point && (field === "x" || field === "y")
              ? (object[field] as number) - origin[field]
              : object[field];
          return [[field, relative(item, field)]];
        }),
    );
  };
  const intent = elements
    .map((e) => relative(e))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256")
    .update(
      JSON.stringify({
        schema: "controller-compiled-physical-v1",
        elements: intent,
      }),
    )
    .digest("hex");
}

// Read-only projection of the complete pinned typed footprint, including future
// fields represented by that parser. No native file is rewritten. Parse both
// fresh graphs and saved initial seeds identically before hashing. The pinned
// parser's internal property shape is part of this versioned contract.
const metadataFields = new Set([
  "Reference",
  "Value",
  "MPN",
  "Datasheet",
  "Description",
  "Supplier Part Number",
]);
const volatileKeys = new Set(["isSxClass", "_sxUuid", "_sxTstamp", "_sxNet"]);
const placementKeys = new Set([
  "_sxAt",
  "_sxXy",
  "_sxPath",
  "_sxSheetname",
  "_sxSheetfile",
]);
const unorderedArrays = new Set([
  "_properties",
  "_fpTexts",
  "_fpTextBoxes",
  "_fpLines",
  "_fpRects",
  "_fpCircles",
  "_fpArcs",
  "_fpCurves",
  "_fpPolys",
  "_fpPads",
  "_models",
  "_zones",
  "_groups",
]);

function canonical(value: unknown, key = "", root = false): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite footprint geometry");
    // Suppress arithmetic noise well below KiCad's 1 nm internal grid.
    return Math.round(value * 1e9) / 1e9;
  }
  if (Array.isArray(value)) {
    const values = value.map((item) => canonical(item));
    return unorderedArrays.has(key)
      ? values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
      : values; // Polygon/curve vertex order remains meaningful.
  }
  if (typeof value !== "object")
    throw new Error("Unsupported footprint geometry value");
  const object = value as Record<string, unknown>;
  const metadata =
    object.token === "property" && metadataFields.has(String(object._key));
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .flatMap((field) => {
        if (
          volatileKeys.has(field) ||
          (root && placementKeys.has(field)) ||
          (metadata && field === "_value") ||
          object[field] === undefined
        )
          return [];
        return [[field, canonical(object[field], field)]];
      }),
  );
}

export function controllerFootprintGeometrySha256(footprint: Footprint): string {
  const parsed = parseKicadMod(footprint.getString());
  return createHash("sha256")
    .update(
      JSON.stringify({
        schema: "controller-initial-footprint-v1",
        footprint: canonical(parsed, "", true),
      }),
    )
    .digest("hex");
}

export function controllerGeometryIdentities(board: KicadPcb) {
  const identities = new Map<string, string>();
  for (const footprint of board.footprints) {
    const refs = footprint.properties.filter((p) => p.key === "Reference");
    const ref = refs[0]?.value;
    if (refs.length !== 1 || !ref || identities.has(ref))
      throw new Error("Geometry identities require unique nonempty references");
    identities.set(ref, controllerFootprintGeometrySha256(footprint));
  }
  return identities;
}
