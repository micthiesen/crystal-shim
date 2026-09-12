import type { LandPattern } from "./ic-land-patterns";
import { dbv5 } from "./logic-land-patterns";
import { smbj8_0ca } from "./service-protection-land-patterns";

// Component top view, body-centered millimetres, +X right and +Y DOWN. The
// shared renderer flips Y once. These are copper models, not released footprints.
export const esds312: LandPattern = {
  ...dbv5,
  id: "CrystalShim:ESDS312_DBV5",
  source: {
    url: "https://www.ti.com/lit/ds/symlink/esds312.pdf",
    sha256: "e84b2b818dd54038bfc371bd72760349a3878c918ad31d8db3079107c2bc70fb",
    drawing:
      "SLVSEG9C Rev C, Feb 2024, p2-3 ESDS312 pin map; PDF p17-19 DBV0005A, 4214839/K 08/2024. P18 copper independently matches existing DBV5: five 1.10 x 0.60 mm lands, R0.05, row centres x=+/-1.30, 0.95 mm pitch. NSMD preferred, maximum 0.07 mm mask clearance. NC pins 1/3 are not pass-through connections.",
  },
};

export const smbj7_0a: LandPattern = {
  ...smbj8_0ca,
  id: "CrystalShim:SMBJ7_0A",
  source: {
    ...smbj8_0ca.source,
    drawing:
      "SMBJ series JC.07/04/25 v4, p2 exact SMBJ7.0A row, p5 DO-214AA lands and cathode-band marking, p6 A unidirectional ordering. P5 adopts J=L=2.16 min, I=2.26 min, K=2.74 max: 2.16 x 2.26 pads at x=+/-2.45. Adopt pin 1=banded cathode (left), pin 2=anode. Same copper as captured SMBJ8.0CA, but this A part is polarized. Hash identifies the documented Littelfuse-authored mirror bytes.",
  },
};
