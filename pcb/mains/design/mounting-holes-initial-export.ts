import { At, FootprintAttr, Property, type KicadPcb } from "kicadts";
import { mainsMountingHoles } from "./placements";

export const mainsMountingFootprint = "CrystalShim_Mains:MountingHole_3.2mm_NPTH";
export const mainsMountingValue = "3.2mm NPTH";

const close = (actual: number | undefined, expected: number) =>
  actual !== undefined && Math.abs(actual - expected) < 1e-6;

// Initial typed graph only. The pinned converter emits board holes as anonymous
// footprints. Give the four exact source-owned holes stable refs without moving
// or changing their pads. This is not an API for editing an existing native file.
export function identifyMainsMountsForInitialExport(board: KicadPcb) {
  const anonymous = board.footprints.filter((fp) => fp.properties.length === 0);
  if (anonymous.length !== mainsMountingHoles.length)
    throw new Error("Expected exactly four anonymous mains mounting holes");
  if (
    board.footprints.some((fp) =>
      fp.properties.some(
        (p) =>
          p.key === "Reference" &&
          mainsMountingHoles.some((hole) => hole.ref === p.value),
      ),
    )
  )
    throw new Error("Mains mounting references already exist");
  const plans = mainsMountingHoles.map((hole) => {
    const matches = anonymous.filter((fp) => {
      const at = fp.position;
      return at instanceof At && close(at.x, 100 + hole.x) && close(at.y, 100 - hole.y);
    });
    const fp = matches[0];
    const pad = fp?.fpPads[0];
    const at = fp?.position;
    if (
      matches.length !== 1 ||
      !fp ||
      fp.libraryLink !== "tscircuit:hole_circle_holeDiameter3.2mm" ||
      fp.layer?.names.join(",") !== "F.Cu" ||
      !(at instanceof At) ||
      !close(at.angle ?? 0, 0) ||
      fp.fpPads.length !== 1 ||
      !pad ||
      pad.number !== "" ||
      pad.padType !== "np_thru_hole" ||
      pad.shape !== "circle" ||
      !close(pad.at?.x, 0) ||
      !close(pad.at?.y, 0) ||
      !close(pad.at?.angle ?? 0, 0) ||
      !close(pad.size?.width, 3.2) ||
      !close(pad.size?.height, 3.2) ||
      !close(pad.drill?.diameter, 3.2) ||
      pad.drill?.oval ||
      pad.drill?.width !== undefined ||
      pad.drill?.offset !== undefined ||
      pad.layers?.layers.join(",") !== "*.Cu,*.Mask" ||
      pad.net !== undefined ||
      pad.primitives !== undefined ||
      pad.options !== undefined ||
      pad.rectDelta !== undefined ||
      pad.chamfer !== undefined ||
      pad.chamferRatio !== undefined ||
      (pad.roundrectRatio ?? 0) !== 0 ||
      pad.solderMaskMargin !== undefined ||
      pad.removeUnusedLayer ||
      pad.keepEndLayers
    )
      throw new Error(`${hole.ref}: initial mounting-hole geometry changed`);
    return { fp, ref: hole.ref };
  });
  // Complete validation precedes mutation, including a late hole's geometry.
  for (const { fp, ref } of plans) {
    fp.libraryLink = mainsMountingFootprint;
    fp.properties = [
      new Property({
        key: "Reference",
        value: ref,
        position: { x: 0, y: 0 },
        layer: "F.Fab",
        hidden: true,
      }),
      new Property({
        key: "Value",
        value: mainsMountingValue,
        position: { x: 0, y: 0 },
        layer: "F.Fab",
        hidden: true,
      }),
    ];
    const attributes = new FootprintAttr();
    attributes.boardOnly = true;
    attributes.excludeFromBom = true;
    attributes.excludeFromPosFiles = true;
    fp.attr = attributes;
  }
}
