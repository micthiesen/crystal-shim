import { expect, test } from "bun:test";
import { ap63203, ao3400a, tca9517a } from "./ic-land-patterns";
import { icPhysicalLandPatterns } from "./ic-physical-models";
import { dbv5, dbv6, fsusb42 } from "./logic-land-patterns";
import { stps2l40u, usblc6_2sc6 } from "./protection-land-patterns";
import { smbj8_0ca, tps259470a } from "./service-protection-land-patterns";

const models = [
  ap63203,
  ao3400a,
  fsusb42,
  stps2l40u,
  usblc6_2sc6,
  tps259470a,
  smbj8_0ca,
] as const;

test("physical declarations cover exact remaining IDs without replacing existing copper or DBV/DGK models", () => {
  expect(Object.keys(icPhysicalLandPatterns).sort()).toEqual(
    models.map(({ id }) => id).sort(),
  );
  for (const model of models) {
    const physical = icPhysicalLandPatterns[model.id]!;
    expect({ width: physical.body.width, height: physical.body.height }).toEqual(
      model.body,
    );
    expect(physical.source.sha256).toBe(model.source.sha256);
    expect(physical.source.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(physical.source.url).toStartWith("https://");
    expect(physical.envelope.width).toBeGreaterThanOrEqual(model.body.width);
    expect(physical.envelope.height).toBeGreaterThanOrEqual(model.body.height);
    expect(physical.nativeAssembly.paste).toContain("KiCad");
  }
  for (const model of [tca9517a, dbv5, dbv6]) {
    expect(icPhysicalLandPatterns[model.id]).toBeUndefined();
  }
});

test("body-centred placement envelopes preserve the drawing axes and vertical limits", () => {
  // Independently transcribed source-top-view X/Y/Z drawing values. X includes
  // left/right leads; AO and ST Z/Y composite limits are exercised below.
  const expected = [
    ["AP63203WU-7", 2.8, 3, 1],
    ["AO3400A", 3, 3.354, 1.25],
    ["FSUSB42MUX_MSOP10", 4.9, 3.1, 1.1],
    ["STPS2L40U", 5.6, 3.95, 2.65],
    ["USBLC6-2SC6", 3, 3.05, 1.45],
    ["TPS259470ARPWR", 2.1, 2.1, 1],
    ["SMBJ8.0CA", 5.59, 3.94, 2.61],
  ] as const;
  for (const [id, width, height, thickness] of expected) {
    const physical = icPhysicalLandPatterns[id]!;
    expect(physical.envelope.width).toBe(width);
    expect(physical.envelope.height).toBe(height);
    expect(physical.body.thicknessMax).toBe(thickness);
  }
  expect(icPhysicalLandPatterns.AO3400A!.envelope.height).toBeCloseTo(
    3.1 + 2 * 0.005 * 25.4,
    10,
  );
  expect(icPhysicalLandPatterns.STPS2L40U!.body.thicknessMax).toBeCloseTo(
    2.45 + 0.2,
    10,
  );
  expect(icPhysicalLandPatterns["AP63203WU-7"]!.envelope.basis).toContain(
    "not a guaranteed maximum",
  );
  expect(icPhysicalLandPatterns.FSUSB42MUX_MSOP10!.envelope.basis).toContain(
    "not a guaranteed maximum",
  );
});

test("mask choice respects TI's limit and leaves webs between every distinct copper land", () => {
  for (const model of models) {
    const mask = icPhysicalLandPatterns[model.id]!.solderMask;
    expect(mask.expansion).toBe(0.05);
    if (mask.manufacturerMax !== undefined) {
      expect(mask.expansion).toBeLessThanOrEqual(mask.manufacturerMax);
    } else {
      expect(mask.basis).toContain("Project NSMD choice");
    }
    // For RPW's L pads, disjoint bounding boxes give a conservative lower bound
    // on true copper separation. This also catches swapping X/Y or overgrowing
    // masks on the fine-pitch MSOP and the two long RPW power lands.
    const bounds = model.pads.map((pad) => {
      if ("shape" in pad && pad.shape === "polygon") {
        return {
          minX: Math.min(...pad.points.map(({ x }) => x)),
          maxX: Math.max(...pad.points.map(({ x }) => x)),
          minY: Math.min(...pad.points.map(({ y }) => y)),
          maxY: Math.max(...pad.points.map(({ y }) => y)),
        };
      }
      return {
        minX: pad.x - pad.width / 2,
        maxX: pad.x + pad.width / 2,
        minY: pad.y - pad.height / 2,
        maxY: pad.y + pad.height / 2,
      };
    });
    for (const [index, a] of bounds.entries()) {
      for (const b of bounds.slice(index + 1)) {
        const dx = Math.max(a.minX - b.maxX, b.minX - a.maxX, 0);
        const dy = Math.max(a.minY - b.maxY, b.minY - a.maxY, 0);
        const minimumWeb = Math.hypot(
          Math.max(dx - 2 * mask.expansion, 0),
          Math.max(dy - 2 * mask.expansion, 0),
        );
        expect(minimumWeb).toBeGreaterThanOrEqual(0.1 - 1e-9);
      }
    }
  }
  expect(icPhysicalLandPatterns.TPS259470ARPWR!.solderMask.manufacturerMax).toBe(0.05);
});

test("RPW assembly declaration preserves split power apertures and functional thermal nets", () => {
  const physical = icPhysicalLandPatterns.TPS259470ARPWR!;
  expect(tps259470a.pads.map(({ number }) => number)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
  ]);
  expect(tps259470a.pads.filter(({ shape }) => shape === "polygon")).toHaveLength(4);
  expect(physical.nativeAssembly.paste).toContain("0.100 mm stencil");
  expect(physical.nativeAssembly.paste).toContain("93%");
  expect(physical.nativeAssembly.paste).toContain("82%");
  expect(physical.nativeAssembly.paste).toContain("two 1.06 x 0.28 mm R0.05");
  expect(physical.nativeAssembly.thermal).toContain("no exposed ground pad");
  expect(physical.nativeAssembly.thermal).toContain("IN pin 5 and OUT pin 6");
  expect(physical.nativeAssembly.thermal).toContain("quiet GND pin 8");
});
