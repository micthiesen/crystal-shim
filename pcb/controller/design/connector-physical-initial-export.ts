import { servicePowerHeaderPattern } from "./service-power-header";
import type { FootprintPad, KicadPcb } from "kicadts";
import { At } from "kicadts";
import {
  sensorHeaderPattern,
  serviceHeaderPattern,
  psuHeaderPattern,
} from "./micro-fit-components";
import { statusLedPattern, buttonPattern } from "./assembly-components";
import { usbConnectorPattern, usbConnectorPinMap } from "./usb-connector";
import { connectorPhysicalModels } from "./connector-physical-models";
import type { ThtPattern } from "./tht-footprint";

const thtModels: Record<string, { part: string; pattern: ThtPattern }> = {
  [servicePowerHeaderPattern.id]: {
    part: "S2B-XH-A",
    pattern: servicePowerHeaderPattern,
  },
  [sensorHeaderPattern.id]: { part: "43045-0600", pattern: sensorHeaderPattern },
  [serviceHeaderPattern.id]: { part: "43045-0200", pattern: serviceHeaderPattern },
  [psuHeaderPattern.id]: { part: "43650-0300", pattern: psuHeaderPattern },
  [statusLedPattern.id]: { part: "WP710A10LGD", pattern: statusLedPattern },
  [buttonPattern.id]: { part: "B3F-1002-G", pattern: buttonPattern },
};
const close = (actual: number | undefined, expected: number) =>
  actual !== undefined && Math.abs(actual - expected) <= 1e-7;

// Fresh initial-converter graphs only, after USB alphanumeric pad mapping.
// The pinned converter drops PTH mask margins and rounded rectangular corners.
// This restores those source declarations before the first stage-file write.
// It never reads native files, moves pads, or changes drills/layers/nets/paste.
export function applyConnectorPhysicalForInitialExport(
  board: KicadPcb,
  refs: readonly string[],
) {
  if (new Set(refs).size !== refs.length)
    throw new Error("Duplicate connector reference");
  const plans = refs.flatMap((ref) => {
    const fail = (reason: string): never => {
      throw new Error(`${ref}: ${reason}; refuse connector initial export`);
    };
    const matches = board.footprints.filter((fp) =>
      fp.properties.some((p) => p.key === "Reference" && p.value === ref),
    );
    const fp = matches[0];
    if (matches.length !== 1 || !fp || fp.layer?.names.join(",") !== "F.Cu")
      return fail("missing or ambiguous top footprint");
    const id = fp.libraryLink;
    if (!id) return fail("missing exact footprint model");
    const usb = id === usbConnectorPattern.id;
    const model = thtModels[id];
    const declaration = connectorPhysicalModels[id];
    if (
      (!usb && !model) ||
      !declaration ||
      !fp.properties.some(
        (p) => p.key === "Value" && p.value === (usb ? "USB4105-GF-A" : model!.part),
      )
    )
      return fail("unknown or mismatched model/part");
    const position = fp.position;
    if (
      !(position instanceof At) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.angle ?? 0) ||
      !close((position.angle ?? 0) / 90, Math.round((position.angle ?? 0) / 90))
    )
      return fail("unsupported placement");
    const expected = usb
      ? [...usbConnectorPinMap.map((p) => p.number), "SH", "SH", "SH", "SH", "", ""]
      : [
          ...model!.pattern.pads.map((p) => p.number),
          ...(model!.pattern.holes ?? []).map(() => ""),
        ];
    if (
      JSON.stringify(fp.fpPads.map((p) => p.number).sort()) !==
      JSON.stringify(expected.sort())
    )
      return fail("physical pad multiset changed");
    const margin = declaration.solderMask.expansion;
    if (margin !== 0.05) return fail("mask policy changed");
    const edits: { pad: FootprintPad; margin: number; radiusRatio?: number }[] = [];
    for (const pad of fp.fpPads) {
      if (!pad.number) {
        if (
          pad.padType !== "np_thru_hole" ||
          pad.net ||
          (pad.solderMaskMargin !== undefined && pad.solderMaskMargin !== 0) ||
          pad.layers?.layers.includes("F.Paste")
        )
          return fail("locator structure/mask changed");
        continue;
      }
      if (usb && pad.number !== "SH") {
        if (pad.padType !== "smd" || pad.solderMaskMargin !== margin)
          return fail("SMT contact type/mask changed");
        continue;
      }
      if (
        pad.padType !== "thru_hole" ||
        !pad.drill ||
        !pad.at ||
        !pad.size ||
        pad.primitives ||
        (pad.solderMaskMargin !== undefined && pad.solderMaskMargin !== margin)
      )
        return fail("PTH structure/mask changed");
      const land = model?.pattern.pads.find((p) => p.number === pad.number);
      let radiusRatio: number | undefined;
      if (land?.shape === "roundrect" && (land.cornerRadius ?? 0) > 0) {
        const short = Math.min(land.width, land.height);
        const long = Math.max(land.width, land.height);
        // Installed exact Micro-Fit models use rratio 0.166667 on a 1.5 mm
        // short side, i.e. R0.25 mm (rounding error <0.000001 mm), not ratio .25.
        radiusRatio = land.cornerRadius! / short;
        if (
          !close(Math.min(pad.size.width, pad.size.height), short) ||
          !close(Math.max(pad.size.width, pad.size.height), long) ||
          !close(pad.drill.diameter, land.drill) ||
          (pad.drill.width !== undefined && !close(pad.drill.width, land.drill)) ||
          pad.drill.offset ||
          !(
            (pad.shape === "rect" && (pad.roundrectRatio ?? 0) === 0) ||
            (pad.shape === "roundrect" && close(pad.roundrectRatio, radiusRatio))
          )
        )
          return fail("rounded pin-one geometry changed");
      }
      edits.push({ pad, margin, radiusRatio });
    }
    return edits;
  });
  // Validate the whole requested batch before changing even its first pad.
  for (const { pad, margin, radiusRatio } of plans) {
    pad.solderMaskMargin = margin;
    if (radiusRatio !== undefined) {
      pad.shape = "roundrect";
      pad.roundrectRatio = radiusRatio;
    }
  }
}
