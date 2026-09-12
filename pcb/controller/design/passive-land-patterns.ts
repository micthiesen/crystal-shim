import type { LandPattern } from "./ic-land-patterns";

export const murata22uf: LandPattern = {
  id: "CrystalShim:Murata_GRM32_Reflow",
  body: { width: 3.2, height: 2.5 },
  pads: [
    { number: "1", x: -1.65, y: 0, width: 1.1, height: 2.05 },
    { number: "2", x: 1.65, y: 0, width: 1.1, height: 2.05 },
  ],
  source: {
    url: "https://pim.murata.com/asset/pim4/ceramicCapacitorSMD/GRM32ER71E226ME15-04CA-EN_PDF_CERAMICCAPACITORSMD?lastModifiedDatetime=20260730173647",
    sha256: "167a6933d9fb0b46ed47eff2bcb1b43822cb141c9a10abfb46ff7f204f17acdb",
    drawing:
      "GRM32ER71E226ME15-04CA, Jun 26 2026, p2 dimensions; p27 Table2 reflow GRM32: innergap a=2.0-2.4, each pad length b=1.0-1.2, width c=1.8-2.3 mm. Adopt 2.2/1.1/2.05 midpoints. P6 test lands are different and are not used. Body max 3.5 x 2.7 x 2.7 mm.",
  },
};

// Midpoints of the manufacturer's reflow examples, not generic IPC/package names.
// As for IC lands, coordinates are component top view with +Y down.
export const panasonic0603: LandPattern = {
  id: "CrystalShim:Panasonic_0603",
  body: { width: 1.6, height: 0.8 },
  pads: [
    { number: "1", x: -0.725, y: 0, width: 0.65, height: 0.9 },
    { number: "2", x: 0.725, y: 0, width: 0.65, height: 0.9 },
  ],
  source: {
    url: "https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf",
    sha256: "fc707b230cce91d464bc3aaf1ed614fa5b412f40cbe7df7cab1541d2c164a882",
    drawing:
      "2025-12-24 p1: ERA3A/ERJ3 inner gap 0.7-0.9, outer span 2.0-2.2, width 0.8-1.0. Adopt 0.8/2.1/0.9 mm midpoints.",
  },
};

export const panasonic0805: LandPattern = {
  id: "CrystalShim:Panasonic_0805",
  body: { width: 2, height: 1.25 },
  pads: [
    { number: "1", x: -1.175, y: 0, width: 1.15, height: 1.15 },
    { number: "2", x: 1.175, y: 0, width: 1.15, height: 1.15 },
  ],
  source: {
    url: "https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf",
    sha256: "fc707b230cce91d464bc3aaf1ed614fa5b412f40cbe7df7cab1541d2c164a882",
    drawing:
      "2025-12-24 p1: ERA6A, 2012 (0805), inner gap a=1.0-1.4, outer span b=3.2-3.8, width c=0.9-1.4 mm. Adopt 1.2/3.5/1.15 midpoints, giving 1.15 mm square pads at x=+/-1.175. Body nominal 2.00 x 1.25, thickness 0.50 +/-0.10 mm per AOA0000C307, 2024-04-24 p3.",
  },
};

export const tdkC1608: LandPattern = {
  id: "CrystalShim:TDK_C1608",
  body: { width: 1.6, height: 0.8 },
  pads: [
    { number: "1", x: -0.7, y: 0, width: 0.7, height: 0.7 },
    { number: "2", x: 0.7, y: 0, width: 0.7, height: 0.7 },
  ],
  source: {
    url: "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/specification/mlccspec_commercial_general_midvoltage_en.pdf",
    sha256: "4e6084e013d796f311636cc4c8e2e3e27d05beef7c876fbf5a3759c4cd32624e",
    drawing:
      "GC11010030, September 2026, printed p18 / PDF p19: C1608 reflow inner gap A, individual pad length B and width C are each 0.6-0.8 mm. Adopt 0.7 mm midpoints. Shared copper for the reviewed 100 nF X7R and 4.7 nF C0G parts; exact part datasheets belong to the component registry.",
  },
};

// Preserve the original export for callers; the copper is shared across values.
export const tdk100nf = tdkC1608;

export const tdk1uf: LandPattern = {
  id: "CrystalShim:TDK_C2012",
  body: { width: 2, height: 1.25 },
  pads: [
    { number: "1", x: -0.925, y: 0, width: 0.8, height: 1.05 },
    { number: "2", x: 0.925, y: 0, width: 0.8, height: 1.05 },
  ],
  source: {
    url: "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c2012x7r1e105k125ab.pdf",
    sha256: "5ca8971a17b99f12b5263703343c3a321d272cafa8281282bf39ae4140f85874",
    drawing:
      "PDF verifies exact part/body. Product-page reflow PA 0.9-1.2, PB 0.7-0.9, PC 0.9-1.2 mm; adopt 1.05/0.8/1.05 mm. See docs/design/controller-small-parts.md.",
  },
};
