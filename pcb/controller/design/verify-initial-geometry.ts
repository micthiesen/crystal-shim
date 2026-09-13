import { parseKicadPcb } from "kicadts";
import { controllerGeometryIdentities } from "./footprint-geometry-identity";

// Semantic read of the serialized initial seed only; never writes native files.
const [boardPath, manifestPath] = process.argv.slice(2);
if (!boardPath || !manifestPath || process.argv.length !== 4)
  throw new Error(
    "usage: verify-initial-geometry.ts <initial.kicad_pcb> <manifest.json>",
  );
const manifest = await Bun.file(manifestPath).json();
const actual = controllerGeometryIdentities(
  parseKicadPcb(await Bun.file(boardPath).text()),
);
if (
  manifest.board?.stable_id !== "controller.board.main" ||
  manifest.components?.length !== 117 ||
  actual.size !== 117
)
  throw new Error("Initial geometry verification requires the complete controller");
const seen = new Set<string>();
for (const component of manifest.components) {
  const hash = component.footprint?.initial_geometry_sha256;
  if (
    seen.has(component.ref) ||
    typeof hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(hash) ||
    actual.get(component.ref) !== hash
  )
    throw new Error(
      `${component.ref}: initial footprint geometry differs from source manifest`,
    );
  seen.add(component.ref);
}
console.log("All 117 initial footprint geometry identities match the source manifest");
