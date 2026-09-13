import type { FootprintPad, KicadPcb, SxClass } from "kicadts";
import { At, Layer, PadLayers } from "kicadts";
import type { ThtPattern } from "../../controller/design/tht-footprint";
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
  snubberCapacitorPattern,
  snubberCapacitorPhysical,
  snubberResistorPattern,
  snubberResistorPhysical,
} from "./suppression-components";
import { movCapture } from "./mov-component";

type Land = ThtPattern["pads"][number] & { drillWidth?: number };
type Model = {
  part: string;
  value?: string;
  pattern: { id: string; pads: Land[] };
  margin: number;
};

const models: Readonly<Record<string, Model>> = {
  ...Object.fromEntries(
    Object.entries(mainsHeaderDefinitions).map(([ref, definition]) => [
      ref,
      {
        part: definition.mpn,
        pattern: mainsHeaderPattern(ref as keyof typeof mainsHeaderDefinitions),
        margin: mainsHeaderPhysical(ref as keyof typeof mainsHeaderDefinitions)
          .solderMask.expansion,
      },
    ]),
  ),
  F3: {
    part: "0215001.MXEP",
    pattern: branchFusePattern,
    margin: branchFusePhysical.solderMask.expansion,
  },
  U1: {
    part: "IRM-45-12",
    pattern: isolatedSupplyPattern,
    margin: isolatedSupplyPhysical.solderMask.expansion,
  },
  K1: {
    part: "G5RL-1A-TV8 DC5",
    pattern: pumpRelayPattern,
    margin: pumpRelayPhysical.solderMask.expansion,
  },
  RV1: {
    part: movCapture.mpn,
    pattern: {
      id: movCapture.footprint,
      pads: [
        {
          number: "1",
          x: movCapture.round.x,
          y: movCapture.round.y,
          drill: movCapture.round.drill,
          width: movCapture.round.copper,
          height: movCapture.round.copper,
          shape: "circle",
        },
        {
          number: "2",
          x: movCapture.slot.x,
          y: movCapture.slot.y,
          drill: movCapture.slot.drillWidth,
          drillWidth: movCapture.slot.drillHeight,
          width: movCapture.slot.width,
          height: movCapture.slot.height,
          shape: "oval",
        },
      ],
    },
    margin: movCapture.solderMaskExpansion,
  },
  D1: {
    part: "1N4007-E3/54",
    pattern: flybackPattern,
    margin: flybackPhysical.solderMask.expansion,
  },
  R1: {
    part: "PR02FS0201000KA100",
    value: "100Ω",
    pattern: snubberResistorPattern,
    margin: snubberResistorPhysical.solderMask.expansion,
  },
  C1: {
    part: "B32921C3473K000",
    value: "47nF",
    pattern: snubberCapacitorPattern,
    margin: snubberCapacitorPhysical.solderMask.expansion,
  },
};

const close = (actual: number | undefined, expected: number) =>
  actual !== undefined && Math.abs(actual - expected) <= 1e-7;
const pasteLayer = (layer: string) => layer.endsWith(".Paste");

function hasPaste(node: SxClass): boolean {
  const layers =
    node instanceof Layer ? node.names : node instanceof PadLayers ? node.layers : [];
  return layers.some(pasteLayer) || node.getChildren().some(hasPaste);
}

// Fresh, origin-normalized converter graphs only, before library renaming and
// the first stage-file write. Restore the dropped source PTH mask allowance.
// There is no native THT paste to repair. No centres, copper, drills, nets,
// outlines, layers or pad shapes are changed, including all three square pin 1s.
// J5's three masks and rounded pin 1 belong to the existing connector adapter.
// R1/C1 converter Values contain only resistance/capacitance. The initial PCB
// wrapper must bind their exact source-validated MPN properties before this call.
export function applyMainsPhysicalForInitialExport(board: KicadPcb) {
  for (const fp of board.footprints) {
    for (const pad of fp.fpPads) {
      if (
        ["thru_hole", "np_thru_hole"].includes(pad.padType) &&
        pad.layers?.layers.some(pasteLayer)
      )
        throw new Error("Unexpected PTH/NPTH paste; refuse mains initial export");
    }
  }
  const plans: { pad: FootprintPad; margin: number }[] = [];
  for (const [ref, model] of Object.entries(models)) {
    const fail = (reason: string): never => {
      throw new Error(`${ref}: ${reason}; refuse mains physical initial export`);
    };
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
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
      fp.libraryLink !== model.pattern.id ||
      values.length !== 1 ||
      values[0]!.value !== (model.value ?? model.part) ||
      (model.value !== undefined && mpns.length !== 1) ||
      mpns.length > 1 ||
      (mpns[0] && mpns[0].value !== model.part)
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
    if (model.margin !== 0.05) fail("source mask policy changed");
    if (hasPaste(fp)) fail("unexpected THT paste graphic or layer");
    if (fp.fpPads.length !== model.pattern.pads.length)
      fail("physical pad multiplicity changed");
    const remaining = new Set(fp.fpPads);
    const nets = new Map<string, string | undefined>();
    for (const land of model.pattern.pads) {
      const candidates = [...remaining].filter(
        (pad) =>
          pad.number === land.number &&
          close(pad.at?.x, land.x) &&
          close(pad.at?.y, land.y),
      );
      const pad = candidates[0];
      if (candidates.length !== 1 || !pad)
        return fail(`pad ${land.number} centre or multiplicity changed`);
      const shape = land.shape === "roundrect" ? "rect" : land.shape;
      const angle = shape === "circle" ? 0 : (position.angle ?? 0);
      if (
        pad.padType !== "thru_hole" ||
        pad.shape !== shape ||
        !close(pad.at?.angle ?? 0, angle) ||
        !close(pad.size?.width, land.width) ||
        !close(pad.size?.height, land.height) ||
        !close(pad.drill?.diameter, land.drill) ||
        (land.drillWidth === undefined
          ? pad.drill?.width !== undefined
          : !close(pad.drill?.width, land.drillWidth)) ||
        (pad.drill?.oval ?? false) !== (land.drillWidth !== undefined) ||
        pad.drill?.offset ||
        pad.layers?.layers.slice().sort().join(",") !== "*.Cu,*.Mask" ||
        pad.primitives ||
        pad.options ||
        pad.rectDelta ||
        pad.chamfer ||
        pad.chamferRatio !== undefined ||
        (pad.roundrectRatio ?? 0) !== 0 ||
        (land.cornerRadius ?? 0) !== 0 ||
        pad.removeUnusedLayer ||
        pad.keepEndLayers ||
        (pad.solderMaskMargin !== undefined && pad.solderMaskMargin !== model.margin)
      )
        fail(`pad ${land.number} PTH geometry/layers/mask changed`);
      const net = pad.net?.getString();
      if (nets.has(land.number) && nets.get(land.number) !== net)
        fail(`pad ${land.number} tails have different nets`);
      nets.set(land.number, net);
      remaining.delete(pad);
      plans.push({ pad, margin: model.margin });
    }
    if (remaining.size) fail("unexpected physical pads");
  }
  if (plans.length !== 48)
    throw new Error("Mains PTH batch changed; refuse mains initial export");
  // Validate the entire batch before changing even its first mask margin.
  for (const { pad, margin } of plans) pad.solderMaskMargin = margin;
}
