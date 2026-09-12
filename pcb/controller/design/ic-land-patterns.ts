// Manufacturer land geometry, in millimetres. Top view, body-centre origin,
// +X right and +Y DOWN, matching KiCad. A tscircuit renderer must negate Y once.
// These data describe nominal bodies and copper lands, not completed footprints.
export type LandPattern = {
  id: string;
  body: { width: number; height: number };
  pads: {
    number: string;
    x: number;
    y: number;
    width: number;
    height: number;
    cornerRadius?: number;
  }[];
  source: { url: string; sha256: string; drawing: string };
};

export const ap63203: LandPattern = {
  id: "AP63203WU-7",
  body: { width: 1.6, height: 2.9 },
  pads: [
    { number: "1", x: -1.1, y: -0.95, width: 1, height: 0.7 },
    { number: "2", x: -1.1, y: 0, width: 1, height: 0.7 },
    { number: "3", x: -1.1, y: 0.95, width: 1, height: 0.7 },
    { number: "4", x: 1.1, y: 0.95, width: 1, height: 0.7 },
    { number: "5", x: 1.1, y: 0, width: 1, height: 0.7 },
    { number: "6", x: 1.1, y: -0.95, width: 1, height: 0.7 },
  ],
  source: {
    url: "https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf",
    sha256: "ef99daa3789d835bc025dfcb4c605c5c2e6d3e7223e86d40b33e6b497ea5a722",
    drawing:
      "DS41326 Rev 3-2, November 2024, p17 TSOT26 outline/suggested pads; p1 top-view pin assignments. Y1=3.2 is the outer land span, giving 2.2 centre separation.",
  },
};

export const ao3400a: LandPattern = {
  id: "AO3400A",
  body: { width: 1.6, height: 2.9 },
  pads: [
    { number: "1", x: -1.2, y: -0.95, width: 0.8, height: 0.8 },
    { number: "2", x: -1.2, y: 0.95, width: 0.8, height: 0.8 },
    { number: "3", x: 1.2, y: 0, width: 0.8, height: 0.8 },
  ],
  source: {
    url: "https://www.aosmd.com/sites/default/files/res/package/SOT23.pdf",
    sha256: "b6fac64d55f133ce74dd85ddddc618c3d5408e9531cb21e660f6a8ef3d8c5408",
    drawing:
      "PO-00001 Version N, p1 SOT23 outline/recommended lands: 0.8 square pads, 2.4 centre-row separation. AO3400A Rev 3.1 p1 identifies the pin-1 gate side, source and opposite drain.",
  },
};

export const tca9517a: LandPattern = {
  id: "TCA9517ADGKR",
  body: { width: 3, height: 3 },
  pads: [
    { number: "1", x: -2.2, y: -0.975, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "2", x: -2.2, y: -0.325, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "3", x: -2.2, y: 0.325, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "4", x: -2.2, y: 0.975, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "5", x: 2.2, y: 0.975, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "6", x: 2.2, y: 0.325, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "7", x: 2.2, y: -0.325, width: 1.4, height: 0.45, cornerRadius: 0.05 },
    { number: "8", x: 2.2, y: -0.975, width: 1.4, height: 0.45, cornerRadius: 0.05 },
  ],
  source: {
    url: "https://www.ti.com/lit/ds/symlink/tca9517a.pdf",
    sha256: "ad2d7dc5994583006aa21b67ee9f18507a2698ad9366285dff56816f065790c6",
    drawing:
      "SCPS245E Rev E, October 2025, p4 pin assignments; DGK0008A drawing 4214862/A 04/2023, p22 outline, p23 lands, p24 identical paste apertures. NSMD preferred; 0.05 maximum mask opening expansion per side.",
  },
};
