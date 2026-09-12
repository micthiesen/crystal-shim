import { At, PadPrimitiveGrPoly, Xy, type KicadPcb } from "kicadts";
import { tps259470a, type LandPoint } from "./service-protection-land-patterns";

const footprintId = "CrystalShim:TPS259470A_RPW0010A";
const tolerance = 1e-7;
const cornerAnchors: Record<string, LandPoint> = {
  "1": { x: -0.9, y: -0.7 },
  "4": { x: -0.9, y: 0.7 },
  "7": { x: 0.9, y: 0.7 },
  "10": { x: 0.9, y: -0.7 },
};

function close(actual: number | undefined, expected: number) {
  return actual !== undefined && Math.abs(actual - expected) <= tolerance;
}

// KiCad angles are counterclockwise on a native +Y-down coordinate plane.
function rotate(point: LandPoint, degrees: number): LandPoint {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) + point.y * Math.sin(angle),
    y: -point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

// Initial-converter object graph ONLY, before serialization into a handoff stage.
// Never apply to an adopted/native file: this is not an ECO or routing API.
// The pinned exporter adds a diameter-0.2 circular anchor to each polygon pad.
// Relocate that circle into the horizontal leg without changing its polygon.
// This does not alter tscircuit's bounding-box PCB ports; source routing stays
// disabled. Separate RPW paste/mask augmentation is still required.
export function anchorServiceEfuseForInitialExport(
  board: KicadPcb,
  refs: readonly string[],
) {
  if (new Set(refs).size !== refs.length) throw new Error("Duplicate eFuse reference");
  const plans = refs.flatMap((ref) => {
    const fail = (reason: string): never => {
      throw new Error(`${ref}: ${reason}; refuse eFuse initial export`);
    };
    const matches = board.footprints.filter((fp) =>
      fp.properties.some(
        (property) => property.key === "Reference" && property.value === ref,
      ),
    );
    const fp = matches[0];
    if (
      matches.length !== 1 ||
      fp?.libraryLink !== footprintId ||
      !fp.properties.some(
        (property) => property.key === "Value" && property.value === "TPS259470ARPWR",
      ) ||
      fp.layer?.names.join(",") !== "F.Cu"
    )
      fail("missing or mismatched footprint");
    if (!fp) return fail("missing footprint");
    const position = fp.position;
    if (!(position instanceof At)) return fail("missing footprint placement");
    const rotation = position.angle ?? 0;
    if (
      !Number.isFinite(rotation) ||
      !close(rotation / 90, Math.round(rotation / 90))
    ) {
      fail("only right-angle initial placements are supported");
    }
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      fail("invalid placement");
    const numbers = fp.fpPads.map((pad) => pad.number).sort();
    if (
      JSON.stringify(numbers) !==
      JSON.stringify(tps259470a.pads.map((pad) => pad.number).sort())
    ) {
      fail("physical pin multiset changed");
    }

    return tps259470a.pads.flatMap((land) => {
      const pad = fp.fpPads.find((candidate) => candidate.number === land.number)!;
      const at = pad.at;
      if (
        !at ||
        !close(at.angle ?? 0, 0) ||
        pad.padType !== "smd" ||
        pad.layers?.layers.join(",") !== "F.Cu,F.Paste,F.Mask"
      )
        return fail(`pad ${land.number} initial structure changed`);

      if (land.shape === "rect") {
        const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
        if (
          pad.shape !== "roundrect" ||
          pad.primitives ||
          !close(at.x, land.x) ||
          !close(at.y, land.y) ||
          !close(pad.size?.width, quarterTurn ? land.height : land.width) ||
          !close(pad.size?.height, quarterTurn ? land.width : land.height) ||
          !close(
            pad.roundrectRatio,
            land.cornerRadius! / Math.min(land.width, land.height),
          )
        )
          fail(`pad ${land.number} copper changed`);
        return [];
      }

      const graphics = pad.primitives?.graphics;
      const polygon = graphics?.[0];
      if (
        pad.shape !== "custom" ||
        pad.options?.anchor !== "circle" ||
        !close(pad.size?.width, 0.2) ||
        !close(pad.size?.height, 0.2) ||
        graphics?.length !== 1 ||
        !(polygon instanceof PadPrimitiveGrPoly) ||
        polygon.contours.length !== 1 ||
        polygon.filled !== true ||
        polygon.width !== 0
      )
        return fail(`pad ${land.number} polygon structure changed`);
      const points = polygon.contours[0]!.points;
      if (
        points.length !== land.points.length ||
        !points.every((point) => point instanceof Xy)
      ) {
        return fail(`pad ${land.number} polygon vertices changed`);
      }
      const mean = {
        x: land.points.reduce((sum, point) => sum + point.x, 0) / land.points.length,
        y: land.points.reduce((sum, point) => sum + point.y, 0) / land.points.length,
      };
      // Reject a second application, edited anchors, or a changed converter.
      if (!close(at.x, mean.x) || !close(at.y, mean.y))
        fail(`pad ${land.number} anchor changed`);
      const oldAnchorOffset = rotate(at, rotation);
      for (const [index, point] of points.entries()) {
        const expectedOffset = rotate(land.points[index]!, rotation);
        if (
          !close(oldAnchorOffset.x + point.x, expectedOffset.x) ||
          !close(oldAnchorOffset.y + point.y, expectedOffset.y)
        )
          fail(`pad ${land.number} polygon copper changed`);
      }
      const target = cornerAnchors[land.number]!;
      const delta = rotate({ x: target.x - at.x, y: target.y - at.y }, rotation);
      return [{ at, points, target, delta }];
    });
  });

  // Validate the complete batch before changing any target. Only anchor X/Y and
  // corresponding polygon X/Y change; UUIDs, nets, layers and other pads do not.
  for (const { at, points, target, delta } of plans) {
    at.x = target.x;
    at.y = target.y;
    for (const point of points) {
      point.x -= delta.x;
      point.y -= delta.y;
    }
  }
}
