import type { PhysicalLandPattern } from "./land-pattern-physical";

// Millimetres, body-centred component top view in each existing copper model's
// axes. The source body outlines are retained, including models that use maximum
// rather than nominal body dimensions. Package Z includes seating clearance.
//
// AP63203 and FSUSB42 provide only a basic overall lead span. Their envelope
// entries are placement design dimensions with explicit limits below, not
// guaranteed maximum package rectangles. The shared project courtyard allowance
// applies outside these dimensions and the copper; it is not a package tolerance.
// Existing TCA9517A and TI DBV5/DBV6 declarations are intentionally not duplicated.
export const icPhysicalLandPatterns: Readonly<
  Partial<Record<string, PhysicalLandPattern>>
> = {
  "AP63203WU-7": {
    body: {
      width: 1.6,
      height: 2.9,
      thicknessMax: 1,
      basis:
        "Nominal E1/D molded body; limits 1.50..1.70 x 2.80..3.00 mm. A=1.00 mm maximum includes seating clearance. Drawing rotated into source left/right lead columns.",
    },
    envelope: {
      width: 2.8,
      height: 3,
      basis:
        "E=2.80 mm BSC lead span and D=3.00 mm maximum body length. The drawing supplies no lead-span tolerance or flash allowance, so this is a placement design envelope, not a guaranteed maximum outline.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; Diodes specifies copper but no mask expansion in the package drawing.",
    },
    nativeAssembly: {
      paste:
        "The p17 suggested pad layout specifies copper only. Exact paste apertures and stencil thickness remain KiCad augmentation and assembly-process decisions.",
      thermal:
        "TSOT26 has six leads and no exposed pad. Preserve the buck layout's short switching paths and ground copper; do not add an invented thermal ground pad or assume package thermal metrics prove final board temperature.",
    },
    source: {
      url: "https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf",
      sha256: "ef99daa3789d835bc025dfcb4c605c5c2e6d3e7223e86d40b33e6b497ea5a722",
      drawing:
        "DS41326 Rev 3-2, November 2024 p17, TSOT26 package outline and suggested pad layout.",
    },
  },
  AO3400A: {
    body: {
      width: 1.6,
      height: 2.9,
      thicknessMax: 1.25,
      basis:
        "Nominal E1/D molded body; limits 1.40..1.80 x 2.80..3.10 mm. A=1.25 mm maximum includes seating clearance. Drawing rotated into source left/right leads.",
    },
    envelope: {
      width: 3,
      height: 3.354,
      basis:
        "E=3.00 mm maximum lead span. D=3.10 mm maximum plus 2 x 0.127 mm (5 mil) non-lead-side mold flash allowance from note 1; flash is specified as less than 5 mil per side. No extra default tolerance is added to explicit min/max dimensions.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; AOS provides the copper land pattern but no mask expansion.",
    },
    nativeAssembly: {
      paste:
        "PO-00001 gives 0.80 mm square copper lands, without exact stencil/aperture requirements. Final paste and process remain KiCad augmentation.",
      thermal:
        "Three leads only; there is no exposed pad. Drain pin 3 copper and final board thermal conditions determine dissipation; do not create an additional thermal or ground pad.",
    },
    source: {
      url: "https://www.aosmd.com/sites/default/files/res/package/SOT23.pdf",
      sha256: "b6fac64d55f133ce74dd85ddddc618c3d5408e9531cb21e660f6a8ef3d8c5408",
      drawing: "PO-00001 Version N p1, SOT23 outline, land pattern and notes 1-2.",
    },
  },
  FSUSB42MUX_MSOP10: {
    body: {
      width: 3,
      height: 3,
      thicknessMax: 1.1,
      basis:
        "Nominal 3.00 +/-0.10 mm molded body in both axes; 1.10 mm maximum total height. Mechanical top view rotated 90 degrees clockwise into the source pin map.",
    },
    envelope: {
      width: 4.9,
      height: 3.1,
      basis:
        "4.90 mm basic lead span and 3.10 mm maximum body length. Note C excludes burrs, mold flash and tie-bar extrusions without quantifying their allowance. This is a placement design envelope, not a guaranteed maximum outline.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; onsemi specifies copper without mask expansion. The chosen 0.30 mm lands at 0.50 mm pitch retain a nominal 0.10 mm mask web.",
    },
    nativeAssembly: {
      paste:
        "Case 846AP provides minimum 1.40 mm land length and reference 0.30 mm width, not exact stencil apertures or thickness. Final paste/process remain KiCad augmentation.",
      thermal:
        "Leaded MSOP10 has ten pins and no exposed pad. Do not substitute a MicroPak, DFN or exposed-pad package; preserve the USB signal and ground layout requirements.",
    },
    source: {
      url: "https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf",
      sha256: "2a7d7d7e42d9d3a4d1a95fb0407012e73bf4145e374fba7fb04d7b29b861e5b7",
      drawing:
        "FSUSB42/D May 2022 Rev 3 p9, MSOP10 Case 846AP Issue O, 31 JAN 2017, drawing 98AON13758G.",
    },
  },
  STPS2L40U: {
    body: {
      width: 4.6,
      height: 3.95,
      thicknessMax: 2.65,
      basis:
        "Retain maximum E1/D molded-body outline. Overall vertical bound is A1 body height 2.45 plus A2 seating clearance 0.20 = 2.65 mm; A1 alone does not reach the seating plane.",
    },
    envelope: {
      width: 5.6,
      height: 3.95,
      basis:
        "Maximum E lead span and D body width from SMB Table 4; no additional flash allowance is stated.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; ST Figure 17 specifies copper without mask expansion.",
    },
    nativeAssembly: {
      paste:
        "Figure 17 gives the SMB copper lands, not stencil thickness or aperture geometry. Final paste/process remain KiCad augmentation; use SMB for suffix U, not SMBflat for suffix UF.",
      thermal:
        "Two terminals only; no separate exposed pad. Heat leaves through the connected anode/cathode copper. Final copper area and diode temperature require board-level verification.",
    },
    source: {
      url: "https://www.st.com/resource/en/datasheet/stps2l40.pdf",
      sha256: "1072d6381bcda6cea295901df6db4d7c766566860e90b085f31a042732b6e08a",
      drawing:
        "ST DS2146 Rev 6 September 2019 p7 Figure 16, p8 Table 4/Figure 17; p15 identifies STPS2L40U as SMB. Manufacturer-authored bytes retrieved from https://www.ic-components.pl/files/fe/STPS2L40AF.pdf.",
    },
  },
  "USBLC6-2SC6": {
    body: {
      width: 1.75,
      height: 3.05,
      thicknessMax: 1.45,
      basis:
        "Retain maximum E/D molded-body outline; A=1.45 mm maximum overall height includes A1 seating clearance.",
    },
    envelope: {
      width: 3,
      height: 3.05,
      basis:
        "Maximum H lead span and D body length from SOT23-6L Table 3; no additional flash allowance is stated.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; ST Figure 19 specifies copper without mask expansion.",
    },
    nativeAssembly: {
      paste:
        "Figure 19 gives copper lands, not exact stencil thickness or apertures. Final paste/process remain KiCad augmentation.",
      thermal:
        "Six leads only; no exposed pad. Ground pin 2 needs a short, low-inductance return. Preserve the paired signal pins and VBUS protection connection; do not invent an underside ground pad.",
    },
    source: {
      url: "https://www.st.com/resource/en/datasheet/usblc6-2.pdf",
      sha256: "1c61ac54a7cce343899a55ff9e19229444c0e22a3e7265c24fe979be476ca7de",
      drawing:
        "ST DS4260 Rev 7 December 2021 p12 Figure 18/Table 3, p13 Figure 19. Manufacturer-authored bytes retrieved from https://store.comet.bg/download-file.php?id=30778.",
    },
  },
  TPS259470ARPWR: {
    body: {
      width: 2,
      height: 2,
      thicknessMax: 1,
      basis:
        "Nominal RPW0010A body; limits 1.90..2.10 mm in both axes. 1.00 mm maximum total height includes the 0.00..0.05 mm seating clearance.",
    },
    envelope: {
      width: 2.1,
      height: 2.1,
      basis:
        "Maximum package outline in both axes; leadless terminals are inside that outline. No additional flash allowance is stated.",
    },
    solderMask: {
      expansion: 0.05,
      manufacturerMax: 0.05,
      basis:
        "TI preferred NSMD example permits 0.05 mm maximum all around; adopt 0.05 on every rectangle and L polygon. Nominal 0.20 mm copper gaps retain 0.10 mm mask webs before fabrication tolerance.",
    },
    nativeAssembly: {
      paste:
        "TI p74 specifies a 0.100 mm stencil example: L pads 1/4/7/10 have 93% coverage; long IN/OUT pads 5/6 have 82% with two 1.06 x 0.28 mm R0.05 windows each. Their reduced L apertures and split power windows must be captured in KiCad augmentation; full copper-shaped automatic paste is not the specified stencil.",
      thermal:
        "Ten functional lands, no exposed ground pad. TI section 8.4.1 uses IN pin 5 and OUT pin 6 copper on top/bottom with thermal vias, including under the device for current distribution. Exact via pattern/fill and quiet GND pin 8 layout remain board-level KiCad work; the eight-via thermal simulation fixture is not a mandated footprint or a ground-via array.",
    },
    source: {
      url: "https://www.ti.com/lit/ds/symlink/tps25947.pdf",
      sha256: "8f96de389903091650d4f462dcfad3210071c3ae7093623a7978f34baf8a65b4",
      drawing:
        "SLVSFC9C Rev C revised May 2026, RPW0010A 4225183/A 08/2019, PDF p72 outline, p73 NSMD mask, p74 stencil; section 8.4.1 and section 6.4 footnotes for thermal routing and fixture limits. Custom polygon footprint must consume this declaration separately from the rectangle-only LandPattern renderer.",
    },
  },
  "SMBJ8.0CA": {
    body: {
      width: 4.75,
      height: 3.94,
      thicknessMax: 2.61,
      basis:
        "Maximum B/C/D from Littelfuse; retain the existing copper model's maximum body outline. D is the overall package height.",
    },
    envelope: {
      width: 5.59,
      height: 3.94,
      basis:
        "Maximum G lead span and C body width; no additional flash allowance is stated. Same package dimensions as the SMBJ7.0A model, with no cathode identity on this bidirectional CA part.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; Littelfuse gives copper dimensions but no mask expansion.",
    },
    nativeAssembly: {
      paste:
        "Littelfuse p5 gives copper and reflow limits, not aperture geometry or stencil thickness. Final paste apertures/process remain KiCad augmentation.",
      thermal:
        "Two terminals only; no exposed pad. Surge-current copper and final temperature require layout verification. CA is bidirectional, so neither physical terminal is a cathode mark.",
    },
    source: {
      url: "https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e",
      sha256: "d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b",
      drawing:
        "SMBJ JC.07/04/25 v4 p5 DO-214AA outline, solder lands and reflow limits; p6 CA designation. Manufacturer-authored bytes retrieved from https://atta.szlcsc.com/upload/public/pdf/source/20250918/1F4D01A109F9E96436584D6D9E812816.pdf.",
    },
  },
};
