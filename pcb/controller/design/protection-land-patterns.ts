import type { LandPattern } from "./ic-land-patterns";

// Manufacturer copper, millimetres, top view, body-centred +X right / +Y DOWN.
// LandPatternFootprint negates Y once. Body dimensions are maximum moulded-body
// envelopes: these ST drawings give limits, not a nominal body dimension.
// Copper and body data alone do not define release mask, paste or courtyard.
export const stps2l40u: LandPattern = {
  id: "STPS2L40U",
  body: { width: 4.6, height: 3.95 },
  // ST identifies K and A, not numeric pins. Adopt KiCad's 1=K, 2=A convention
  // with the banded cathode at the left; never substitute the SMB Flat drawing.
  pads: [
    { number: "1", x: -2.11, y: 0, width: 1.62, height: 2.18 },
    { number: "2", x: 2.11, y: 0, width: 1.62, height: 2.18 },
  ],
  source: {
    url: "https://www.ic-components.pl/files/fe/STPS2L40AF.pdf",
    sha256: "1072d6381bcda6cea295901df6db4d7c766566860e90b085f31a042732b6e08a",
    drawing:
      "ST DS2146 Rev 6, September 2019, manufacturer family PDF mirrored by IC-Components. P1 SMB banded cathode K; p7 Fig16 and p8 Table4 maximum body; p8 Fig17 SMB copper: 1.62 x 2.18 lands, 2.60 inner gap, 5.84 outer span. P15 Table8 identifies STPS2L40U as SMB (not UF/SMB Flat). Numeric 1=K/2=A is the adopted source convention. Canonical datasheet: https://www.st.com/resource/en/datasheet/stps2l40.pdf",
  },
};

export const usblc6_2sc6: LandPattern = {
  id: "USBLC6-2SC6",
  body: { width: 1.75, height: 3.05 },
  pads: [
    { number: "1", x: -1.15, y: -0.95, width: 1.2, height: 0.6 },
    { number: "2", x: -1.15, y: 0, width: 1.2, height: 0.6 },
    { number: "3", x: -1.15, y: 0.95, width: 1.2, height: 0.6 },
    { number: "4", x: 1.15, y: 0.95, width: 1.2, height: 0.6 },
    { number: "5", x: 1.15, y: 0, width: 1.2, height: 0.6 },
    { number: "6", x: 1.15, y: -0.95, width: 1.2, height: 0.6 },
  ],
  source: {
    url: "https://store.comet.bg/download-file.php?id=30778",
    sha256: "1c61ac54a7cce343899a55ff9e19229444c0e22a3e7265c24fe979be476ca7de",
    drawing:
      "ST DS4260 Rev 7, December 2021, manufacturer PDF mirrored by Comet. P1 electrical top view; p12 Fig18/Table3 maximum body; p13 Fig19 copper: 1.20 x 0.60 lands, 1.10 inner gap, 2.30 row centres, 3.50 outer span, 0.95 pitch. Rotated from horizontal rows to match the p1 left/right top view. Canonical datasheet: https://www.st.com/resource/en/datasheet/usblc6-2.pdf",
  },
};
