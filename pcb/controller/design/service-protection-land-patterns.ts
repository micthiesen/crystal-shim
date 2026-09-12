import type { LandPattern } from "./ic-land-patterns";

// Manufacturer copper in mm: top view, body-centred, +X right, +Y DOWN.
// The renderer converts Y exactly once. These are copper models, not release
// footprints: RPW requires its separately reviewed mask and stencil apertures.
export type LandPoint = { x: number; y: number };
export type PolygonLand = {
  number: string;
  shape: "polygon";
  points: LandPoint[];
};
export type ServiceLandPattern = Omit<LandPattern, "pads"> & {
  pads: ((LandPattern["pads"][number] & { shape: "rect" }) | PolygonLand)[];
};

// RPW0010A drawing 4225183/A: pin 1 is an L with five convex R0.05
// corners and one sharp re-entrant corner. Each arc uses 16 chords: maximum
// radial error <0.000061 mm, including the 9-decimal coordinate rounding.
// One polygon represents one physical land and therefore one electrical port.
function cornerArc(x: number, y: number, startDegrees: number): LandPoint[] {
  return Array.from({ length: 17 }, (_, index) => {
    const angle = ((startDegrees + (90 * index) / 16) * Math.PI) / 180;
    return {
      x: Number((x + 0.05 * Math.cos(angle)).toFixed(9)),
      y: Number((y + 0.05 * Math.sin(angle)).toFixed(9)),
    };
  });
}

const pin1Outline = [
  ...cornerArc(-0.8, -1.15, 180),
  ...cornerArc(-0.65, -1.15, 270),
  ...cornerArc(-0.65, -0.6, 0),
  ...cornerArc(-1.15, -0.6, 90),
  ...cornerArc(-1.15, -0.8, 180),
  { x: -0.85, y: -0.85 },
];

function cornerLand(
  number: string,
  xDirection: number,
  yDirection: number,
): PolygonLand {
  return {
    number,
    shape: "polygon",
    points: pin1Outline.map(({ x, y }) => ({ x: x * xDirection, y: y * yDirection })),
  };
}

export const tps259470a: ServiceLandPattern = {
  id: "TPS259470ARPWR",
  body: { width: 2, height: 2 },
  pads: [
    cornerLand("1", 1, 1),
    {
      number: "2",
      shape: "rect",
      x: -0.9,
      y: -0.225,
      width: 0.6,
      height: 0.25,
      cornerRadius: 0.05,
    },
    {
      number: "3",
      shape: "rect",
      x: -0.9,
      y: 0.225,
      width: 0.6,
      height: 0.25,
      cornerRadius: 0.05,
    },
    cornerLand("4", 1, -1),
    {
      number: "5",
      shape: "rect",
      x: -0.25,
      y: 0,
      width: 0.3,
      height: 2.4,
      cornerRadius: 0.05,
    },
    {
      number: "6",
      shape: "rect",
      x: 0.25,
      y: 0,
      width: 0.3,
      height: 2.4,
      cornerRadius: 0.05,
    },
    cornerLand("7", -1, -1),
    {
      number: "8",
      shape: "rect",
      x: 0.9,
      y: 0.225,
      width: 0.6,
      height: 0.25,
      cornerRadius: 0.05,
    },
    {
      number: "9",
      shape: "rect",
      x: 0.9,
      y: -0.225,
      width: 0.6,
      height: 0.25,
      cornerRadius: 0.05,
    },
    cornerLand("10", -1, 1),
  ],
  source: {
    url: "https://www.ti.com/lit/ds/symlink/tps25947.pdf",
    sha256: "8f96de389903091650d4f462dcfad3210071c3ae7093623a7978f34baf8a65b4",
    drawing:
      "SLVSFC9C Rev C, revised May 2026, p5-6 TPS259470x pin map; RPW0010A 4225183/A 08/2019 appendix, PDF p72 outline, p73 copper, p74 stencil. Body 2.0 mm nominal. Ten functional lands; no exposed ground pad. Corner lands are single L polygons with R0.05 convex corners approximated to <0.000061 mm; separate stencil apertures remain required.",
  },
};

export const smbj8_0ca: LandPattern = {
  id: "SMBJ8.0CA",
  // Maximum molded body dimensions B and C; G includes the leads.
  body: { width: 4.75, height: 3.94 },
  // Adopt I=2.260 min, J=L=2.160 min, K=2.740 max from the drawing.
  // CA is bidirectional: left/right numbers are an adopted physical mapping,
  // not cathode/anode identities, and either electrical orientation is valid.
  pads: [
    { number: "1", x: -2.45, y: 0, width: 2.16, height: 2.26 },
    { number: "2", x: 2.45, y: 0, width: 2.16, height: 2.26 },
  ],
  source: {
    url: "https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e",
    sha256: "d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b",
    drawing:
      "SMBJ series, revised JC.07/04/25 v4, p2 exact SMBJ8.0CA row, p5 DO-214AA dimensions and solder pads, p6 CA bidirectional designation. Copper adopts the specified minimum pad sizes and maximum inner gap. Hash is of the matching Littelfuse-authored PDF retrieved from https://atta.szlcsc.com/upload/public/pdf/source/20250918/1F4D01A109F9E96436584D6D9E812816.pdf because the canonical endpoint returned HTTP 403.",
  },
};
