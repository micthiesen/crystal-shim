import { passivePhysicalModels } from "./passive-physical-models";
import { icPhysicalLandPatterns } from "./ic-physical-models";
import { connectorPhysicalModels } from "./connector-physical-models";

// Millimetres in the same component-top-view axes as the copper model.
// Thickness is the Z envelope for enclosure review, not a generated 3D model.
export type PhysicalLandPattern = {
  // Native +Y down. Omit for a body-centred footprint; never move the copper
  // origin to center an asymmetric package such as the WROOM module.
  packageCenter?: { x: number; y: number };
  // Optional separate center for asymmetric protrusions such as bent leads.
  // Defaults to packageCenter; independent of the electrical footprint origin.
  envelopeCenter?: { x: number; y: number };
  // Body-outline dimensions for F.Fab; these do not include the leads.
  body: { width: number; height: number; thicknessMax: number; basis: string };
  // Occupied package rectangle. The basis states maximum vs basic dimensions
  // and any manufacturer exclusions; it must not invent a tolerance.
  envelope: { width: number; height: number; basis: string };
  solderMask: { expansion: number; manufacturerMax?: number; basis: string };
  nativeAssembly: { paste: string; thermal: string };
  source: { url: string; sha256: string; drawing: string };
};

// Project assembly allowance, not a manufacturer or IPC requirement. Reserve
// 0.50 mm beyond both maximum package extent and copper for hand assembly, then
// round each courtyard edge outward to 0.05 mm. Mask growth is inside this space.
export const physicalCourtyardPolicy = { clearance: 0.5, grid: 0.05 } as const;

const dbvPackage = {
  body: {
    width: 1.6,
    height: 2.9,
    thicknessMax: 1.45,
    basis: "Nominal molded body; drawing limits 1.45..1.75 x 2.75..3.05 mm.",
  },
  envelope: {
    width: 3,
    height: 3.55,
    basis:
      "3.00 mm maximum lead span; 3.05 mm body length plus permitted 0.25 mm mold flash per side. Body-width flash reaches 2.25 mm, inside the lead span.",
  },
  solderMask: {
    expansion: 0.05,
    manufacturerMax: 0.07,
    basis: "Adopt 0.05 mm NSMD expansion per side within TI's 0.07 mm maximum.",
  },
  nativeAssembly: {
    paste:
      "TI example has one 1.10 x 0.60 mm R0.05 aperture per land, nominal 0.125 mm stencil. Final stencil thickness and aperture process belong to KiCad augmentation; automatic source paste is not that approval.",
    thermal:
      "No exposed thermal pad and no thermal vias are specified. Preserve all numbered signal/ground lands; thermal performance depends on final board copper.",
  },
} satisfies Omit<PhysicalLandPattern, "source">;

const dbv5: PhysicalLandPattern = {
  ...dbvPackage,
  source: {
    url: "https://www.ti.com/lit/ds/symlink/esds312.pdf",
    sha256: "e84b2b818dd54038bfc371bd72760349a3878c918ad31d8db3079107c2bc70fb",
    drawing:
      "SLVSEG9C Rev C PDF p17-19, DBV0005A 4214839/K 08/2024. Same package drawing as the existing SN74LVC1G08 and SN74LVC1G14 DBV5 source models.",
  },
};

// Opt-in by exact existing land-model ID. Every caller of a shared package gets
// the same physical declaration; other copper models retain their prior output.
export const physicalLandPatterns: Readonly<
  Partial<Record<string, PhysicalLandPattern>>
> = {
  ...passivePhysicalModels,
  ...icPhysicalLandPatterns,
  ...connectorPhysicalModels,
  "Espressif:ESP32-C6-WROOM-1": {
    packageCenter: { x: 0, y: -3 },
    body: {
      width: 18,
      height: 25.5,
      thicknessMax: 3.25,
      basis:
        "Module nominal 18.0 +/-0.2 by 25.5 +/-0.2, maximum height 3.1 +0.15 mm. Native origin is 3 mm below the body center.",
    },
    envelope: {
      width: 18.2,
      height: 25.7,
      basis:
        "Maximum module outline, including the PCB antenna. Antenna RF clearance is a separate board/enclosure constraint, not the assembly courtyard.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD margin on all 28 perimeter and nine separate exposed-ground lands; no aperture merged across pad 29.",
    },
    nativeAssembly: {
      paste:
        "KiCad augmentation: preserve nine separate 0.8 mm ground-land apertures. Review board stencil thickness and peripheral apertures with Espressif's reflow profile; do not form one full ground-pad paste square.",
      thermal:
        "Keep the ground pad connected by reviewed plane/via geometry. Any vias/paste exclusion and antenna keepout must be declared in board augmentation; height excludes solder standoff.",
    },
    source: {
      url: "https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf",
      sha256: "163020762fa6d499e0c611c5a13e78ad9d4720b421c6bc5e14e16fc748862b73",
      drawing:
        "v1.4 p41 Figure 10-1 physical outline; p44 Figure 11-1 copper; the pinned Espressif library fixes the asymmetric native origin.",
    },
  },
  TCA9517ADGKR: {
    body: {
      width: 3,
      height: 3,
      thicknessMax: 1.1,
      basis: "Nominal molded body; drawing limits 2.9..3.1 mm in both axes.",
    },
    envelope: {
      width: 5.05,
      height: 3.4,
      basis:
        "Maximum lead span 5.05 mm. Body length 3.1 plus 0.15 mm mold flash per side; interlead flash is at most 0.25 mm per side and stays inside the lead span.",
    },
    solderMask: {
      expansion: 0.05,
      manufacturerMax: 0.05,
      basis: "TI preferred NSMD example; adopt its maximum 0.05 mm per side.",
    },
    nativeAssembly: {
      paste:
        "TI p24 example has eight 1.40 x 0.45 mm R0.05 apertures; no stencil thickness is given on that drawing. Final stencil/process belongs to KiCad augmentation; no separate thermal aperture.",
      thermal:
        "DGK0008A has eight leads and no exposed pad. Do not add a thermal ground pad or vias under the body by analogy with PowerPAD packages.",
    },
    source: {
      url: "https://www.ti.com/lit/ds/symlink/tca9517a.pdf",
      sha256: "ad2d7dc5994583006aa21b67ee9f18507a2698ad9366285dff56816f065790c6",
      drawing:
        "SCPS245E, DGK0008A 4214862/A 04/2023, p22 package; p23 NSMD; p24 stencil.",
    },
  },
  TI_DBV0006A: {
    ...dbvPackage,
    source: {
      url: "https://www.ti.com/lit/ds/symlink/tps2553.pdf",
      sha256: "88e453700cea2b263cdb5b44fce1e883e0f6d3b975457f879ac1423eeea42071",
      drawing:
        "SLVS841F, DBV0006A 4214840/G 08/2024, PDF p41 package; p42 NSMD; p43 stencil. Same package drawing as the shared TPS3808 DBV6 source model.",
    },
  },
  TI_DBV0005A: dbv5,
  "CrystalShim:ESDS312_DBV5": dbv5,
  "CrystalShim:SMBJ7_0A": {
    body: {
      width: 4.75,
      height: 3.94,
      thicknessMax: 2.61,
      basis:
        "Maximum B/C/D from Littelfuse; retain the copper model's maximum body outline.",
    },
    envelope: {
      width: 5.59,
      height: 3.94,
      basis:
        "Maximum G lead span and C body width; no additional flash allowance is stated.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; Littelfuse gives copper dimensions but no mask expansion.",
    },
    nativeAssembly: {
      paste:
        "Littelfuse p5 gives copper and reflow limits, not aperture geometry or stencil thickness. Keep final paste apertures/process explicitly pending KiCad augmentation.",
      thermal:
        "Two terminals only; no exposed pad. Surge-return copper and current path need final layout verification. Do not substitute a thermal-resistance fixture for the assembled board.",
    },
    source: {
      url: "https://www.littelfuse.com/assetdocs/tvs-diodes-smbj-series-datasheet?assetguid=ba555e99-a12d-4f72-a0b6-86b06c67171e",
      sha256: "d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b",
      drawing:
        "SMBJ JC.07/04/25 v4 p5, manufacturer-authored mirror bytes recorded in cable protection evidence.",
    },
  },
  "CrystalShim:Vishay_CRCW2512_HP": {
    body: {
      width: 6.3,
      height: 3.15,
      thicknessMax: 0.7,
      basis: "Nominal L/W; L=6.3 +/-0.2, W=3.15 +/-0.15, H=0.6 +/-0.1 mm.",
    },
    envelope: {
      width: 6.5,
      height: 3.3,
      basis: "Maximum outside resistor dimensions including end terminations.",
    },
    solderMask: {
      expansion: 0.05,
      basis:
        "Project NSMD choice; Vishay reflow land table gives copper, not mask expansion.",
    },
    nativeAssembly: {
      paste:
        "The p9 reflow copper row is adopted. No exact stencil thickness or paste reduction is specified there; final apertures/process remain KiCad augmentation.",
      thermal:
        "No exposed pad or thermal vias. P70 and pulse ratings retain manufacturer mounting, repetition and temperature conditions; final copper/temperature verification remains required.",
    },
    source: {
      url: "https://www.vishay.com/docs/20043/crcwhpe3.pdf",
      sha256: "882d8353d2ae19d246e9d24a74d56c3ba890c6b287dc1b66fdaa6a508b798320",
      drawing:
        "Document 20043, 17-Mar-2026 p9, CRCW2512-HP package and reflow land row.",
    },
  },
  "CrystalShim:TDK_C3216": {
    body: {
      width: 3.2,
      height: 1.6,
      thicknessMax: 1.8,
      basis: "Exact C3216X7R1E106K160AB: L/W/T = 3.20/1.60/1.60 +/-0.20 mm.",
    },
    envelope: {
      width: 3.4,
      height: 1.8,
      basis:
        "Maximum outside dimensions including end terminations for this exact part.",
    },
    solderMask: {
      expansion: 0.05,
      basis: "Project NSMD choice; TDK land ranges do not specify mask expansion.",
    },
    nativeAssembly: {
      paste:
        "TDK GC11010030 reflow ranges establish copper only. Stencil/aperture design and process must limit excess solder and board stress; final settings remain KiCad augmentation.",
      thermal:
        "No exposed pad or thermal vias. Preserve MLCC mechanical-stress and solder-process guidance; no invented package thermal model is supplied.",
    },
    source: {
      url: "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf",
      sha256: "b2cca941451d5867e9bffe084773e891be09e55add8dd8d7f5a6944007c7c8e8",
      drawing:
        "Exact part characterization p1, January 22 2020. Separate September 2026 land-range evidence remains on the copper model.",
    },
  },
};

export function landPatternPhysicalGeometry(pattern: {
  id: string;
  pads: readonly (
    | { x: number; y: number; width: number; height: number }
    | { points: readonly { x: number; y: number }[] }
  )[];
  holes?: readonly { x: number; y: number; diameter: number }[];
}) {
  const declaration = physicalLandPatterns[pattern.id];
  if (!declaration) return undefined;
  const { clearance, grid } = physicalCourtyardPolicy;
  const center = declaration.packageCenter ?? { x: 0, y: 0 };
  const rectangles = [
    { ...(declaration.envelopeCenter ?? center), ...declaration.envelope },
    ...pattern.pads.map((pad) => {
      if (!("points" in pad)) return pad;
      const left = Math.min(...pad.points.map((point) => point.x));
      const right = Math.max(...pad.points.map((point) => point.x));
      const top = Math.min(...pad.points.map((point) => point.y));
      const bottom = Math.max(...pad.points.map((point) => point.y));
      return {
        x: (left + right) / 2,
        y: (top + bottom) / 2,
        width: right - left,
        height: bottom - top,
      };
    }),
    ...(pattern.holes ?? []).map((hole) => ({
      x: hole.x,
      y: hole.y,
      width: hole.diameter,
      height: hole.diameter,
    })),
  ];
  const floor = (v: number) => Math.floor(v / grid + 1e-9) * grid;
  const ceil = (v: number) => Math.ceil(v / grid - 1e-9) * grid;
  const left = floor(Math.min(...rectangles.map((r) => r.x - r.width / 2)) - clearance);
  const right = ceil(Math.max(...rectangles.map((r) => r.x + r.width / 2)) + clearance);
  const top = floor(Math.min(...rectangles.map((r) => r.y - r.height / 2)) - clearance);
  const bottom = ceil(
    Math.max(...rectangles.map((r) => r.y + r.height / 2)) + clearance,
  );
  return {
    declaration,
    bodyCenter: center,
    courtyard: {
      width: right - left,
      height: bottom - top,
      center: { x: (left + right) / 2, y: (top + bottom) / 2 },
    },
  };
}
