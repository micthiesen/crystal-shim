import type { PhysicalLandPattern } from "./land-pattern-physical";

// Native component top view, +Y down, millimetres. A connector's body and
// occupied envelope can have different centres; neither moves the copper datum.
// Mating, underside projection and actuation constraints are separate below.
const sensorId =
  "Connector_Molex:Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal";
const serviceId =
  "Connector_Molex:Molex_Micro-Fit_3.0_43045-0200_2x01_P3.00mm_Horizontal";
const servicePowerId = "Connector_JST:JST_XH_S2B-XH-A_1x02_P2.50mm_Horizontal";
const psuId = "Connector_Molex:Molex_Micro-Fit_3.0_43650-0300_1x03_P3.00mm_Horizontal";
const usbId = "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal";
const ledId = "LED_THT:LED_D3.0mm";
const buttonId = "Button_Switch_THT:SW_PUSH_6mm_H4.3mm";

const thtMask = {
  expansion: 0.05,
  basis:
    "Project 0.05 mm opening expansion around plated copper on both sides; manufacturer hole drawing does not specify mask expansion. Locator holes remain nonplated, without copper or paste.",
};
const microFitAssembly = {
  paste:
    "No paste on signal PTHs or plastic locators. Hand-solder after the SMT process, supporting the housing and checking hole fill; any pin-in-paste process would need separate qualification in KiCad augmentation.",
  thermal:
    "No thermal pad. Choose connection relief and solder access for the actual current-carrying tails; preserve plastic retention and do not treat this assembly courtyard as mating clearance.",
};
const dualSource = {
  url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/430/43045/430450600_sd.pdf?inline=",
  sha256: "816251d97fd7eaaa7660c12b41d7963377bcb83ef56803b6bb6cdd12372ee5ad",
  drawing:
    "SD-43045-001 PSD001 H1, 2024-09-27, sheet 1 dimensions and exact 02/06 Finish A rows. Matching manufacturer-authored bytes from https://www.micros.com.pl/mediaserver/Rys.0430452201_0002.pdf; not an installed-footprint hash.",
};

export const connectorPhysicalModels: Readonly<
  Partial<Record<string, PhysicalLandPattern>>
> = {
  [servicePowerId]: {
    packageCenter: { x: 1.25, y: 3.45 },
    envelopeCenter: { x: 1.25, y: 3.45 },
    body: {
      width: 7.4,
      height: 11.5,
      thicknessMax: 6.1,
      basis:
        "JST XH p5 side-entry S2B-XH-A: B=7.4, body plus rear extension 7+4.5=11.5, C=9.2 from pin row to mating face. Native bounds X=-2.45..4.95, Y=-2.3..9.2. Height 6.1 is a reference dimension, not a guaranteed maximum.",
    },
    envelope: {
      width: 8.4,
      height: 12.5,
      basis:
        "Project conservative 0.5 mm allowance on each side of the nominal drawing bound; manufacturer does not specify a full tolerance stack here. Mated housing and wire bend are separate.",
    },
    solderMask: thtMask,
    nativeAssembly: {
      paste:
        "No paste on either PTH. Hand-solder after SMT; support the friction-lock housing and inspect hole fill.",
      thermal:
        "No thermal pad or plastic locator. Preserve solder access and avoid loading the housing during soldering.",
    },
    source: {
      url: "https://www.jst.com/wp-content/uploads/2025/06/eXH.pdf",
      sha256: "1128a1bdb747cf3da211ed85e11c542f2d310652d8188a69b2dc0e8c40115ef8",
      drawing:
        "JST XH manufacturer catalog, p2 side-entry PCB layout, p5 S2B-XH-A C=9.2 variant. Holes diameter0.9 +0.1, pitch2.5 +/-0.05; installed KiCad copper1.7x2.0 and drill1.0 are project land choices within this hole range.",
    },
  },
  [sensorId]: {
    packageCenter: { x: 3, y: -3.965 },
    envelopeCenter: { x: 3, y: -2.675 },
    body: {
      width: 13.15,
      height: 9.91,
      thicknessMax: 9.27,
      basis:
        "Nominal rectangular bound: A=12.65 plus two 0.25 side steps. Front is y=-(4.32+4.60)=-8.92; body rear y=0.99. Z includes 7.37 housing +1.40 latch, each with general +/-0.25 tolerance.",
    },
    envelope: {
      width: 14,
      height: 13.15,
      basis:
        "Conservative dimension stack: X includes A+0.25, two (0.25+0.25) steps, and B/2 registration +/-0.05. Y bounds -9.25..3.90 include locator-to-front +/-0.08/+/-0.25 and 12.24+/-0.25 overall tail span. Rectangular bound includes unoccupied corners.",
    },
    solderMask: thtMask,
    nativeAssembly: microFitAssembly,
    source: dualSource,
  },
  [serviceId]: {
    packageCenter: { x: 0, y: -3.965 },
    envelopeCenter: { x: 0, y: -2.675 },
    body: {
      width: 7.15,
      height: 9.91,
      thicknessMax: 9.27,
      basis:
        "Same H1 two-circuit body: A=6.65 plus two 0.25 side steps; front -8.92, rear 0.99. Z includes housing and latch with their general tolerances. Native pin 1 remains (0, 0).",
    },
    envelope: {
      width: 7.9,
      height: 13.15,
      basis:
        "A+0.25 plus two (0.25+0.25) side steps; no multi-column B registration term. Same -9.25..3.90 front/tail bound as the six-circuit part.",
    },
    solderMask: thtMask,
    nativeAssembly: microFitAssembly,
    source: dualSource,
  },
  [psuId]: {
    packageCenter: { x: 3, y: -3.97 },
    envelopeCenter: { x: 3, y: -3.845 },
    body: {
      width: 12.65,
      height: 9.9,
      thicknessMax: 6.07,
      basis:
        "Nominal A=12.65, depth 9.90; front -(4.32+4.6)=-8.92, rear 0.98. Z includes 4.37 housing +1.20 latch, each +/-0.25. Native origin remains pin 1.",
    },
    envelope: {
      width: 12.95,
      height: 11.01,
      basis:
        "A+0.25 and B/2 registration +/-0.025 bound X. Y=-9.35..1.66 includes 4.32+/-0.08 locator offset, 4.6+/-0.35 front offset and 9.90+/-0.25 depth. Leads remain within that plan bound.",
    },
    solderMask: thtMask,
    nativeAssembly: microFitAssembly,
    source: {
      url: "https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf",
      sha256: "4ff3b6c7b2258c6ae10f22efbefd596d13bbbc9f51124c99989f286b8af80922",
      drawing:
        "SD-43650-001 PSD000: D8 released 2024-11-05 primary web drawing confirms these dimensions. Hash identifies visually inspected D7 sheet 1 manufacturer mirror https://pdf.icgoo.net/productinfo/allpdf/8b7741e7-98dc-3e33-b071-8f6e91fd5ad6.pdf; D8 download bytes were unavailable. D7 and D8 have the same cited dimensions/tolerances and exact 43650-0300 row.",
    },
  },
  [usbId]: {
    packageCenter: { x: 0, y: 0 },
    envelopeCenter: { x: 0, y: -0.265 },
    body: {
      width: 8.94,
      height: 7.35,
      thicknessMax: 3.46,
      basis:
        "Nominal shell body 8.94 x 7.35; nominal height 3.31. Drawing general two-decimal tolerance +/-0.15 gives height 3.46 maximum, excluding solder lift.",
    },
    envelope: {
      width: 9.09,
      height: 8.03,
      basis:
        "Shell maximum 9.09 x 7.50; rear tails extend a further 0.38+0.15=0.53. Body-centred bounds y=-4.28..3.75 include tails; copper/slots are independently included by the courtyard calculator.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project 0.05 mm opening growth on SMT copper and plated shell slots. Distinct 0.30 mm signal lands on 0.50 pitch retain 0.10 mm nominal mask webs; physically shared A/B solder areas remain shared.",
    },
    nativeAssembly: {
      paste:
        "SMT contacts require paste; do not double-print the four shared A/B copper areas. The two ground areas A1/B12 and A12/B1 use project R0.25 corners: any 1:1 stencil apertures must follow those corners once per physical area, not the former stock R0.15 corners. Planned shell hand-soldering with no paste is pending KiCad board augmentation: the current initial adapter still restores F.Paste on shell slots to match the audited native model. Exact stencil apertures and any paste-in-hole alternative require process review. Plastic locator holes have no paste.",
      thermal:
        "Shell is GND; choose relief/return geometry with USB ESD and mechanical retention in mind. No exposed thermal pad. GF-A stakes are 0.95+/-0.15 long, so a 1.6 mm board does not give underside protrusion; inspect solder retention.",
    },
    source: {
      url: "https://gct.co/files/drawings/usb4105.pdf",
      sha256: "fb331fbabee8392ed2937ed757c1610cb0f174b84625147c0b580a18eea8c0e5",
      drawing:
        "USB4105 B4 2023-12-18 sheet 1, component-side layout and mating view; ordering grid GF-A uses default 0.95 mm shell stakes. General two-decimal +/-0.15; recommended PCB layout +/-0.05. GND copper uses a project R0.25 DFM adaptation, preserving every manufacturer pad bound/centre and locator; that radius is not specified by GCT.",
    },
  },
  [ledId]: {
    packageCenter: { x: 1.27, y: 0 },
    body: {
      width: 3.2,
      height: 3.2,
      thicknessMax: 4.9,
      basis:
        "Rectangular bounding outline of the nominal diameter 3.2 flange, not a square lens. Lens tip to flange base is 4.6+/-0.3. Height above PCB also requires the assembly's separate standoff; this value is lens height only.",
    },
    envelope: {
      width: 3.45,
      height: 3.45,
      basis:
        "Diameter 3.2 plus general 0.25 tolerance, bounded as a square. Native origin is cathode, so flange centre is x 1.27. This rectangle does not express the cathode flat or approve a panel cutout.",
    },
    solderMask: thtMask,
    nativeAssembly: {
      paste:
        "No paste. Through-hole LED is incompatible with reflow: hand-solder after reflow. Preserve pad 1 cathode marking; maximum 260 C for 3 s at 2 mm below package base, or 5 s at 5 mm, per Kingbright p 2.",
      thermal:
        "No thermal pad. Use controlled standoffs/spacers and avoid lens stress. The p 1 tip-to-formed-lead reference 5.4+/-0.5 is not a PCB standoff; keep any first lead bend at least 3 mm from the lens base.",
    },
    source: {
      url: "https://www.kingbrightusa.com/images/catalog/SPEC/WP710A10LGD.pdf",
      sha256: "7c9e6196c3ba4f86d0cecaf00bc77578ea27dd76d7ab4341ce104781d6a37ccc",
      drawing:
        "DSAL0509/1101029028 V9B 2020-04-18, p 1 package/holes, p 2 solder limits, p 4-5 standoff, lead-forming and no-reflow requirements.",
    },
  },
  [buttonId]: {
    packageCenter: { x: 3.25, y: 2.25 },
    body: {
      width: 6,
      height: 6,
      thicknessMax: 4.5,
      basis:
        "Nominal 6+/-0.2 square body and 4.3+/-0.2 total plunger height for B3F-1002-G. Native origin is the upper-left hole, so body centre is (3.25, 2.25).",
    },
    envelope: {
      width: 8.2,
      height: 6.2,
      basis:
        "Maximum 7.7+0.5 lead span in X and 6+0.2 body depth in Y. Pressing joins the two permanent terminal pairs; there is no fifth ground lead on this exact variant.",
    },
    solderMask: thtMask,
    nativeAssembly: {
      paste:
        "No paste on the four PTHs. Hand-solder after SMT; keep flux/cleaner out of this non-washable switch. Preserve all four lands despite their two repeated electrical numbers.",
      thermal:
        "No thermal pad. Retain iron access and avoid heating or loading the plunger during soldering. Enclosure actuation clearance is separate from the assembly courtyard; IP00 is not a splash barrier.",
    },
    source: {
      url: "https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3f.pdf",
      sha256: "be9cf69e5f43fb7689448a2097c19858e5643c0e2e49cd77d018881543e27a1f",
      drawing:
        "Omron B3F manufacturer datasheet p 2 exact gold-contact selection; p 4 standard flat plunger without ground terminal, PCB holes and terminal pairs. General unspecified dimensions +/-0.4.",
    },
  },
};

export type ConnectorMechanicalConstraint = {
  mating?: {
    direction: "+y" | "-y";
    boardEdgeY?: number;
    minimumBoardEdgeY?: number;
    basis: string;
  };
  underside: string;
  assembly: string;
  marking: string;
};

// These constraints do not enlarge or replace the assembly courtyard. Dimensions
// here are in the same native origin/axes and must rotate with each component.
export const connectorMechanicalConstraints: Readonly<
  Partial<Record<string, ConnectorMechanicalConstraint>>
> = {
  [servicePowerId]: {
    mating: {
      direction: "+y",
      basis:
        "Mating face is native y=9.2. Allow XHP-2 housing insertion, friction-lock release and service-wire bend separately from assembly courtyard.",
    },
    underside:
      "Reference tail projection is 3.4 mm below seating plane; allow solder fillets below the 1.6 mm board.",
    assembly:
      "Two 1.0 mm plated holes on 2.5 mm pitch; no locator. XHP-2 with SXH-001T-P0.6 contacts, 22 AWG service lead, 3 A connector rating. This housing cannot mate with the 12 V Micro-Fit ports.",
    marking: "Mark pin 1 +5V SERVICE and pin 2 GND; preserve pin-one indication.",
  },
  [sensorId]: {
    mating: {
      direction: "-y",
      minimumBoardEdgeY: -14.48,
      basis:
        "10.16 maximum is measured from the mating-side board edge to the locator centre y=-4.32, not pin 1. Leave board material around the 3.00+/-0.05 locator hole and allow 43025-0600 insertion, latch access and wire bend; their full sweep is not dimensioned here.",
    },
    underside:
      "3.18+/-0.25 tail projection below seating plane; inspect plastic snap-peg engagement on the drawing's 1.57 mm recommended board and the project's 1.6 mm nominal board.",
    assembly:
      "Locator at (3, -4.32), hole 3.00+/-0.05; signal holes 1.02+/-0.05. Source pads/drills remain unchanged. Mated enclosure envelope and harness bend remain board/enclosure checks.",
    marking: "Preserve pin 1 triangle and six-circuit row numbering.",
  },
  [serviceId]: {
    mating: {
      direction: "-y",
      minimumBoardEdgeY: -14.48,
      basis:
        "Same locator-centre edge datum as the six-circuit header. Allow 43025-0200 insertion, latch access and wire bend separately from the assembly courtyard.",
    },
    underside:
      "3.18+/-0.25 tail projection; verify plastic retention on 1.6 mm nominal PCB against the 1.57 mm recommended thickness.",
    assembly:
      "Locator at (0, -4.32), hole 3.00+/-0.05; signal holes 1.02+/-0.05. Preserve native pin 1 origin and keying.",
    marking:
      "Mark pin 1 positive supply and pin 2 return per port; pump outputs use switched drain, not GND. Retain pin 1 triangle.",
  },
  [psuId]: {
    mating: {
      direction: "-y",
      minimumBoardEdgeY: -14.48,
      basis:
        "Note 6 measures 10.16 maximum from PCB mating edge to locator centre y=-4.32. Mated 43645 family depth 17.56 nominal is a separate example, not a full cable/latch sweep or an assembly courtyard.",
    },
    underside:
      "Tail 3.18+/-0.25 and snap peg 3.3+/-0.35 below seating plane; allow their projection and solder fillets below PCB.",
    assembly:
      "Locator at (3, -4.32), hole 3.00+/-0.05; signal holes 1.02+/-0.05. Verify retention against recommended 1.57 mm and project 1.6 mm nominal PCB.",
    marking: "Preserve pin 1 triangle and 1 V5_PSU / 2 GND / 3 COIL_DRAIN labels.",
  },
  [usbId]: {
    mating: {
      direction: "+y",
      boardEdgeY: 3.675,
      basis:
        "Nominal recommended board edge is the front shell plane. Follow GCT's mating view: 1.85 mm minimum axial space to plug shoulder and 6.5 mm maximum illustrated plug height. Panel cutout, wall thickness and plug access remain separate enclosure dimensions.",
    },
    underside:
      "GF-A shell stakes 0.95+/-0.15 below seating plane. Their 0.80..1.10 range is shorter than a 1.6 mm PCB; no underside stake protrusion is assumed.",
    assembly:
      "Plastic locators diameter 0.50 with general +/-0.15 fit recommended 0.65 holes with layout +/-0.05. Do not claim guaranteed clearance at opposing tolerance extremes; verify fit/retention and board thickness. No copper/paste at these holes.",
    marking:
      "Keep shell/edge datum and connector reference readable; no polarity flat.",
  },
  [ledId]: {
    underside:
      "Untrimmed leads are 27 mm minimum, not an assembled underside height. Trim after soldering with a specified residual length and protect against offcuts/shorts.",
    assembly:
      "Final lens-base standoff/spacer is not selected. Add it to 4.9 mm maximum lens height for enclosure clearance; 5.9 mm tip-to-formed-lead maximum is only a package reference. No lead forming after insertion; first bend at least 3 mm from lens base.",
    marking:
      "Pad 1 at native (0, 0) is cathode, pad 2 (2.54, 0) anode. Add cathode flat/K marking; the rectangular flange outline alone is insufficient.",
  },
  [buttonId]: {
    underside:
      "3.5 mm nominal terminal projection has general +/-0.4 tolerance. Allow 3.9 mm below the seating plane before board thickness and solder fillet/trim allowance.",
    assembly:
      "PCB reference holes 1.0+/-0.1 on 6.5+/-0.1 x 4.5+/-0.1 pitch for 1.6 mm PCB. Source 1.1 mm drills are the upper recommended hole limit. Final actuator travel, access and force path require enclosure review.",
    marking:
      "Keep three button references/functions distinct. Repeated pad 1 is Omron 3/4, repeated pad 2 is 1/2; no numbers are moulded on the switch.",
  },
};
