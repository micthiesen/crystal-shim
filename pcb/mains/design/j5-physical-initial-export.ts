import { At, Layer, PadLayers, type KicadPcb, type SxClass } from "kicadts";
import { psuHeaderPattern } from "../../controller/design/micro-fit-components";
import { connectorPhysicalModels } from "../../controller/design/connector-physical-models";

const close = (actual: number | undefined, expected: number) =>
  actual !== undefined &&
  Number.isFinite(actual) &&
  Math.abs(actual - expected) <= 1e-7;

function hasPaste(node: SxClass): boolean {
  const layers =
    node instanceof Layer ? node.names : node instanceof PadLayers ? node.layers : [];
  return (
    layers.some((layer) => layer.endsWith(".Paste")) ||
    node.getChildren().some(hasPaste)
  );
}

// Read-only admission for the fresh, origin-normalized converter graph. Run
// before applyConnectorPhysicalForInitialExport(board, ["J5"]), which restores
// the source +0.05 mm mask allowance and pin-1 R0.25 corners. This check accepts
// only the converter's raw rect pin 1 and absent mask overrides, not an already
// adapted or adopted footprint. Numbered-pin net membership is checked separately.
export function assertMainsJ5PhysicalForInitialExport(board: KicadPcb): void {
  const fail = (reason: string): never => {
    throw new Error(`J5: ${reason}; refuse mains J5 physical initial export`);
  };
  const matches = board.footprints.filter((fp) =>
    fp.properties.some((p) => p.key === "Reference" && p.value === "J5"),
  );
  const fp = matches[0];
  if (
    matches.length !== 1 ||
    !fp ||
    fp.properties.filter((p) => p.key === "Reference").length !== 1 ||
    fp.layer?.names.join(",") !== "F.Cu"
  )
    return fail("missing or ambiguous top footprint");
  const values = fp.properties.filter((p) => p.key === "Value");
  const mpns = fp.properties.filter((p) => p.key === "MPN");
  if (
    fp.libraryLink !== psuHeaderPattern.id ||
    values.length !== 1 ||
    values[0]!.value !== "43650-0300" ||
    mpns.length > 1 ||
    (mpns[0] && mpns[0].value !== "43650-0300")
  )
    fail("mismatched exact footprint/part");
  const position = fp.position;
  if (
    !(position instanceof At) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !close((position.angle ?? 0) / 90, Math.round((position.angle ?? 0) / 90))
  )
    return fail("unsupported placement");
  if (
    connectorPhysicalModels[psuHeaderPattern.id]?.solderMask.expansion !== 0.05 ||
    fp.solderMaskMargin !== undefined ||
    fp.solderPasteMargin !== undefined ||
    fp.solderPasteMarginRatio !== undefined ||
    fp.solderPasteRatio !== undefined ||
    hasPaste(fp)
  )
    fail("unexpected mask/paste override or paste graphic");
  const expected = [
    ...psuHeaderPattern.pads.map((p) => p.number),
    ...(psuHeaderPattern.holes ?? []).map(() => ""),
  ].sort();
  if (
    JSON.stringify(fp.fpPads.map((p) => p.number).sort()) !== JSON.stringify(expected)
  )
    fail("physical pad/locator multiset changed");
  for (const pad of fp.fpPads) {
    if (
      !pad.at ||
      !pad.size ||
      !pad.drill ||
      pad.drill.offset ||
      pad.layers?.layers.slice().sort().join(",") !== "*.Cu,*.Mask" ||
      pad.primitives ||
      pad.options ||
      pad.rectDelta ||
      pad.chamfer ||
      pad.chamferRatio !== undefined ||
      pad.roundrectRatio !== undefined ||
      pad.removeUnusedLayer ||
      pad.keepEndLayers ||
      pad.width ||
      pad.stroke ||
      pad.properties.length ||
      pad.solderMaskMargin !== undefined ||
      pad.solderPasteMargin !== undefined ||
      pad.solderPasteMarginRatio !== undefined
    )
      fail(`pad ${pad.number || "locator"} raw structure/layers/mask changed`);
    if (!pad.number) {
      const hole = psuHeaderPattern.holes?.[0];
      if (
        !hole ||
        psuHeaderPattern.holes?.length !== 1 ||
        pad.padType !== "np_thru_hole" ||
        pad.shape !== "circle" ||
        pad.net !== undefined ||
        !close(pad.at?.x, hole.x) ||
        !close(pad.at?.y, hole.y) ||
        !close(pad.at?.angle ?? 0, 0) ||
        !close(pad.size?.width, hole.diameter) ||
        !close(pad.size?.height, hole.diameter) ||
        !close(pad.drill?.diameter, hole.diameter) ||
        pad.drill?.width !== undefined ||
        pad.drill?.oval
      )
        fail("NPTH locator geometry changed");
      continue;
    }
    const land = psuHeaderPattern.pads.find((p) => p.number === pad.number)!;
    // ThtFootprint emits the oval-copper pins as a pill with equal hole axes.
    // The pinned converter retains that round hole as (drill oval 1.02 1.02).
    const oval = land.shape === "oval";
    if (
      pad.padType !== "thru_hole" ||
      pad.shape !== (land.shape === "roundrect" ? "rect" : land.shape) ||
      !close(pad.at?.x, land.x) ||
      !close(pad.at?.y, land.y) ||
      !close(pad.at?.angle ?? 0, position.angle ?? 0) ||
      !close(pad.size?.width, land.width) ||
      !close(pad.size?.height, land.height) ||
      !close(pad.drill?.diameter, land.drill) ||
      (oval ? !close(pad.drill?.width, land.drill) : pad.drill?.width !== undefined) ||
      (pad.drill?.oval ?? false) !== oval
    )
      fail(`pad ${pad.number} PTH geometry/drill/axis changed`);
  }
}
