import type { LandPattern } from "./ic-land-patterns";

// Body-centred manufacturer copper, native top-view +Y DOWN.
export const dbv6: LandPattern = {
  id: "TI_DBV0006A",
  body: { width: 1.6, height: 2.9 },
  pads: [
    { number: "1", x: -1.3, y: -0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "2", x: -1.3, y: 0, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "3", x: -1.3, y: 0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "4", x: 1.3, y: 0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "5", x: 1.3, y: 0, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "6", x: 1.3, y: -0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
  ],
  source: {
    url: "https://www.ti.com/lit/ds/symlink/tps3808.pdf",
    sha256: "74d889c0f68af88032f1633c26381817cc03e10d9fd3b4c177a044ad3ed86eed",
    drawing:
      "SBVS050N August 2026, DBV0006A outline p36 / lands p37. Independently matches TPS2553 SLVS841F p41-42. NSMD preferred; 0.07 mm maximum mask expansion per side.",
  },
};

export const dbv5: LandPattern = {
  id: "TI_DBV0005A",
  body: { width: 1.6, height: 2.9 },
  pads: [
    { number: "1", x: -1.3, y: -0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "2", x: -1.3, y: 0, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "3", x: -1.3, y: 0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "4", x: 1.3, y: 0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
    { number: "5", x: 1.3, y: -0.95, width: 1.1, height: 0.6, cornerRadius: 0.05 },
  ],
  source: {
    url: "https://www.ti.com/lit/ds/symlink/sn74lvc1g08.pdf",
    sha256: "30b963cc44233cf3ca35c891ff987c8323a2244ecc765e23296ec96ca4b42666",
    drawing:
      "SCES217AA August 2026, DBV0005A outline p27 / lands p28, 4214839/K 08/2024. Independently matches SN74LVC1G14 SCES218AA p39-40. NSMD preferred; 0.07 mm maximum mask expansion per side.",
  },
};

export const fsusb42: LandPattern = {
  id: "FSUSB42MUX_MSOP10",
  body: { width: 3, height: 3 },
  pads: [
    ...Array.from({ length: 5 }, (_, i) => ({
      number: String(i + 1),
      x: -2.2,
      y: -1 + i * 0.5,
      width: 1.4,
      height: 0.3,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      number: String(i + 6),
      x: 2.2,
      y: 1 - i * 0.5,
      width: 1.4,
      height: 0.3,
    })),
  ],
  source: {
    url: "https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf",
    sha256: "2a7d7d7e42d9d3a4d1a95fb0407012e73bf4145e374fba7fb04d7b29b861e5b7",
    drawing:
      "May 2022 Rev3, electrical Fig3 p2; Case846AP IssueO 31JAN2017, 98AON13758G p9. Rotate the entire mechanical top view 90 degrees clockwise to obtain left/right columns and pin1 upper-left. Lands 1.4 minimum length x 0.3 reference width, 4.4 centre span.",
  },
};
