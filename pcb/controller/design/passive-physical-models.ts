import type { PhysicalLandPattern } from "./land-pattern-physical";
import { murata22uf, tdk1uf } from "./passive-land-patterns";

const nsmd = {
  expansion: 0.05,
  basis: "Project NSMD choice; manufacturer land drawings do not set mask growth.",
};
const resistorAssembly = {
  paste:
    "KiCad augmentation: two apertures following the adopted reflow copper. Board stencil thickness/process remain to be reviewed; no exposed-pad aperture or thermal vias.",
  thermal:
    "Two end terminals. Preserve exact load, temperature and pulse limits; package dimensions do not establish a board thermal resistance.",
};
const capacitorAssembly = {
  paste:
    "KiCad augmentation: two balanced apertures following the adopted reflow copper. Stencil thickness/process remain a board-level decision; inspect solder volume against manufacturer MLCC stress guidance.",
  thermal:
    "No exposed pad or thermal vias. Keep ceramics away from board-flex concentrations and respect preheat, reflow, rework and cooling limits.",
};
const eraSource = {
  url: "https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/AOA0000C307.pdf",
  sha256: "2ffb715174964a986d8cd22f38607a14465c938bb5ff9817e0948124ebb69a5b",
  drawing: "24-Apr-2024 p3, ERA3A and ERA6A dimension rows.",
};

// Exact selected families, not dimensions inferred from package-size names.
// Shared copper uses an envelope covering every selected variant.
export const passivePhysicalModels: Readonly<Record<string, PhysicalLandPattern>> = {
  "CrystalShim:Panasonic_0603": {
    body: {
      width: 1.6,
      height: 0.8,
      thicknessMax: 0.55,
      basis:
        "ERA3A: L=1.60 +/-0.20, W=0.80 +/-0.20, T=0.45 +/-0.10 mm. ERJ3E has the same nominal body and maximum thickness.",
    },
    envelope: {
      width: 1.8,
      height: 1.0,
      basis:
        "ERA3A maxima cover ERJ3E's smaller 1.75 x 0.95 mm maxima, including end terminations. ERJ3E was checked separately; source identity is in the footprint audit.",
    },
    solderMask: nsmd,
    nativeAssembly: resistorAssembly,
    source: eraSource,
  },
  "CrystalShim:Panasonic_0805": {
    body: {
      width: 2,
      height: 1.25,
      thicknessMax: 0.6,
      basis: "ERA6A: L=2.00 +/-0.20, W=1.25 +/-0.10, T=0.50 +/-0.10 mm.",
    },
    envelope: {
      width: 2.2,
      height: 1.35,
      basis: "ERA6A maximum outside dimensions including end terminations.",
    },
    solderMask: nsmd,
    nativeAssembly: resistorAssembly,
    source: eraSource,
  },
  "CrystalShim:TDK_C1608": {
    body: {
      width: 1.6,
      height: 0.8,
      thicknessMax: 0.9,
      basis:
        "C1608X7R1H104K080AA and C1608C0G1H472J080AA each specify L/W/T=1.60/0.80/0.80 +/-0.10 mm.",
    },
    envelope: {
      width: 1.7,
      height: 0.9,
      basis:
        "Both selected parts have these maximum outside dimensions including terminations.",
    },
    solderMask: nsmd,
    nativeAssembly: capacitorAssembly,
    source: {
      url: "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608x7r1h104k080aa.pdf",
      sha256: "1a0db3109885361f08674eb5b2a35332e85631a3e0c0d80590197a18e3b7fe67",
      drawing:
        "3-Jan-2016 p1. The inspected 21-May-2019 C0G sheet has the same dimensions; both source identities are in the footprint audit.",
    },
  },
  "CrystalShim:TDK_C2012": {
    body: {
      width: 2,
      height: 1.25,
      thicknessMax: 1.45,
      basis: "Exact C2012X7R1E105K125AB: L/W/T=2.00/1.25/1.25 +/-0.20 mm.",
    },
    envelope: {
      width: 2.2,
      height: 1.45,
      basis: "Exact part maximum outside dimensions including end terminations.",
    },
    solderMask: nsmd,
    nativeAssembly: capacitorAssembly,
    source: {
      ...tdk1uf.source,
      drawing: "Exact C2012X7R1E105K125AB characterization p1, dimensions table.",
    },
  },
  "CrystalShim:Murata_GRM32_Reflow": {
    body: {
      width: 3.2,
      height: 2.5,
      thicknessMax: 2.7,
      basis: "Exact GRM32ER71E226ME15L: L=3.2 +/-0.3, W/T=2.5 +/-0.2 mm.",
    },
    envelope: {
      width: 3.5,
      height: 2.7,
      basis: "Exact part maximum outside dimensions including end terminations.",
    },
    solderMask: nsmd,
    nativeAssembly: {
      ...capacitorAssembly,
      paste:
        "KiCad augmentation: two balanced apertures following the adopted p27 reflow copper. Review board stencil thickness/process against the optimum-solder guidance; excessive fillets increase MLCC cracking risk.",
    },
    source: {
      ...murata22uf.source,
      drawing: "GRM32ER71E226ME15-04CA, 26-Jun-2026 p2, type and dimension table.",
    },
  },
  "CrystalShim:SRP5030TA": {
    body: {
      width: 5.3,
      height: 5.2,
      thicknessMax: 3,
      basis:
        "Molded body is 5.3 +/-0.2 by 5.2 +/-0.2 mm; 5.7 +/-0.3 mm includes the lead frame. Total height is 2.8 +/-0.2 mm.",
    },
    envelope: {
      width: 6,
      height: 5.4,
      basis: "Maximum occupied envelope includes the protruding lead frame.",
    },
    solderMask: nsmd,
    nativeAssembly: {
      paste:
        "KiCad augmentation: two rectangular apertures following the manufacturer's 2.0 x 1.8 mm reflow lands; finalize stencil thickness/process with the whole board.",
      thermal:
        "No exposed pad or invented thermal vias. Use rated-current/temperature-rise limits with final copper and airflow; manufacturer test fixtures are not an enclosure thermal model.",
    },
    source: {
      url: "https://www.bourns.com/docs/product-datasheets/srp5030ta.pdf",
      sha256: "4a4ce681e20e29b4b888dc3a783f7e30eb7a75541f16591b2c1da921b26c7e32",
      drawing:
        "SRP5030TA p1, lead-frame terminal product dimensions and recommended layout.",
    },
  },
};
