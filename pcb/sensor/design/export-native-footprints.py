#!/usr/bin/env python3
"""Read an initial sensor seed and native-save a fresh per-reference library.

Run through pcb/tools/kicad_python.sh. This exporter never mutates the seed or
registers a library table. An incomplete output directory has no valid receipt
and must not be reused. Native adoption resensor the shared handoff tool's job.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from typing import Any

HERE = Path(__file__).resolve().parent
registration_spec = importlib.util.spec_from_file_location("sensor_registration", HERE / "register-sensor-library.py")
assert registration_spec and registration_spec.loader
registration = importlib.util.module_from_spec(registration_spec)
registration_spec.loader.exec_module(registration)


class ExportError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ExportError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(registration.read_regular(path.resolve(strict=True))).hexdigest()


def fingerprint(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def sorted_items(items: Any) -> list[Any]:
    return sorted(items, key=lambda item: json.dumps(item, sort_keys=True))


def xy(vector: Any) -> list[int]:
    return [vector.x, vector.y]


def polygon_snapshot(poly: Any) -> list[dict[str, Any]]:
    def points(contour: Any) -> list[list[int]]:
        return [xy(contour.CPoint(i)) for i in range(contour.PointCount())]

    return [
        {
            "outline": points(poly.COutline(index)),
            "holes": [points(poly.CHole(index, hole)) for hole in range(poly.HoleCount(index))],
        }
        for index in range(poly.OutlineCount())
    ]


def pad_snapshot(pad: Any, pcbnew: Any) -> dict[str, Any]:
    require(pad.Padstack().Mode() == pcbnew.PADSTACK.MODE_NORMAL,
            "Unsupported per-layer padstack; extend native readback before exporting it")
    result = {
        "number": pad.GetNumber(), "position": xy(pad.GetPosition()),
        "angle": pad.GetOrientationDegrees(), "size": xy(pad.GetSize()),
        "drill": xy(pad.GetDrillSize()), "drill_shape": pad.GetDrillShape(),
        "shape": pad.GetShape(), "attribute": pad.GetAttribute(),
        "layers": pad.GetLayerSet().FmtHex(), "offset": xy(pad.GetOffset()),
        # Native save uses ten decimal places for this ratio. The physical
        # corner radius and pad size below must still agree to the exact IU.
        "roundrect_ratio_10dp": format(pad.GetRoundRectRadiusRatio(), ".10f"),
        "roundrect_radius": pad.GetRoundRectCornerRadius(pcbnew.F_Cu),
        "chamfer_ratio": pad.GetChamferRectRatio(),
        "chamfer_positions": pad.GetChamferPositions(),
        "mask": pad.GetLocalSolderMaskMargin(), "paste": pad.GetLocalSolderPasteMargin(),
        "paste_ratio": pad.GetLocalSolderPasteMarginRatio(),
        "clearance": pad.GetLocalClearance(),
        "unconnected_layer_mode": pad.GetUnconnectedLayerMode(),
    }
    if pad.GetShape() == pcbnew.PAD_SHAPE_CUSTOM:
        require(pad.GetAttribute() == pcbnew.PAD_ATTRIB_SMD and pad.GetLayer() == pcbnew.F_Cu,
                "Only front-side SMD custom copper is covered by native readback")
        # KiCad 10's SWIG GetPrimitives vector is not bound. This native merged
        # polygon includes the custom anchor; its wrapper explicitly uses F_Cu.
        result["custom_anchor"] = pad.GetAnchorPadShape(pcbnew.F_Cu)
        result["custom_polygon"] = polygon_snapshot(pad.GetCustomShapeAsPolygon(pcbnew.F_Cu))
    return result


def graphic_snapshot(item: Any, pcbnew: Any) -> dict[str, Any]:
    if item.GetClass() in ("PCB_TEXT", "PCB_FIELD"):
        return {
            "kind": "text", "text": item.GetText(), "position": xy(item.GetPosition()),
            "layer": item.GetLayer(), "angle": item.GetTextAngle().AsDegrees(),
            "size": xy(item.GetTextSize()), "thickness": item.GetTextThickness(),
            "visible": item.IsVisible(), "mirrored": item.IsMirrored(),
            "font": item.GetFontName(), "bold": item.IsBold(), "italic": item.IsItalic(),
            "horizontal_justify": item.GetHorizJustify(), "vertical_justify": item.GetVertJustify(),
            "knockout": item.IsKnockout(),
        }
    require(item.GetClass() == "PCB_SHAPE", f"Unsupported graphic {item.GetClass()}")
    require(item.GetShape() in (
        pcbnew.SHAPE_T_SEGMENT, pcbnew.SHAPE_T_RECT, pcbnew.SHAPE_T_CIRCLE,
        pcbnew.SHAPE_T_ARC, pcbnew.SHAPE_T_POLY,
    ), "Unsupported graphic shape; extend native readback before exporting it")
    result = {
        "layer": item.GetLayer(), "shape": item.GetShape(), "width": item.GetWidth(),
        "fill": item.GetFillMode(), "start": xy(item.GetStart()), "end": xy(item.GetEnd()),
    }
    if item.GetShape() == pcbnew.SHAPE_T_POLY:
        result["polygon"] = polygon_snapshot(item.GetPolyShape())
    if item.GetShape() == pcbnew.SHAPE_T_ARC:
        result["mid"] = xy(item.GetArcMid())
    return result


def footprint_snapshot(fp: Any, pcbnew: Any) -> dict[str, Any]:
    require(fp.GetLayer() == pcbnew.F_Cu, "Only front-side sensor footprints are covered")
    require(not list(fp.Models()) and not list(fp.Zones()),
            "Footprint models/zones need an explicit readback contract before export")
    return {
        "position": xy(fp.GetPosition()), "angle": fp.GetOrientationDegrees(),
        "layer": fp.GetLayer(), "attributes": fp.GetAttributes(),
        "fields": {
            "reference": graphic_snapshot(fp.Reference(), pcbnew),
            "value": graphic_snapshot(fp.Value(), pcbnew),
        },
        "mask": fp.GetLocalSolderMaskMargin(), "paste": fp.GetLocalSolderPasteMargin(),
        "paste_ratio": fp.GetLocalSolderPasteMarginRatio(), "clearance": fp.GetLocalClearance(),
        "pads": sorted_items(pad_snapshot(pad, pcbnew) for pad in fp.Pads()),
        "graphics": sorted_items(graphic_snapshot(item, pcbnew) for item in fp.GraphicalItems()),
    }


def guarded_paths(args: argparse.Namespace) -> tuple[Path, Path, Path, Path]:
    stage = registration.guarded_stage()
    require(args.stage == stage, "--stage must equal the canonical STILLAIR_HANDOFF_STAGE")
    board, manifest, output = stage / "sensor.kicad_pcb", stage / "source-manifest.normalized.json", stage / "footprints"
    require(args.board == board and args.manifest == manifest and args.output_root == output,
            "Native export requires the exact staged sensor seed, manifest and footprint root")
    registration.read_regular(board)
    require(not output.exists() and not args.output_root.is_symlink(),
            "Output root must not exist; partial exports are not reusable")
    return stage, board, manifest, output


def export(args: argparse.Namespace) -> Path:
    stage, board_path, manifest_path, output = guarded_paths(args)
    stage_identity = stage.stat().st_dev, stage.stat().st_ino
    before_files = registration.tree_hashes(stage)
    validator_path = Path(__file__).resolve().parents[2] / "tools" / "tscircuit_handoff.py"
    spec = importlib.util.spec_from_file_location("sensor_handoff_validation", validator_path)
    require(spec is not None and spec.loader is not None, "Cannot load manifest validator")
    validator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(validator)
    manifest = validator.load_manifest(manifest_path)
    registration.validate_sensor_manifest(manifest)
    validator.load_augmentation(stage / "kicad-augmentation.normalized.json", manifest)
    components = manifest["components"]
    require(len(components) == 16, "Expected 16 sensor components including copper-only E1")
    source_hashes = {"board": sha256(board_path), "manifest": sha256(manifest_path)}
    geometry_verifier = Path(__file__).with_name("verify-initial-geometry.ts")
    verification = subprocess.run(
        ["bun", str(geometry_verifier), str(board_path), str(manifest_path)],
        capture_output=True, text=True, timeout=60,
    )
    require(verification.returncode == 0,
            "Initial seed geometry does not match the source manifest: " + verification.stderr.strip())

    import pcbnew  # type: ignore[import-not-found]
    import wx  # type: ignore[import-not-found]

    quiet = wx.LogNull()
    app = wx.App(False)
    board = pcbnew.LoadBoard(str(board_path))
    require(board is not None, "KiCad could not load initial seed")
    require(not list(board.GetTracks()), "Expected an unrouted initial seed without tracks or vias")
    footprints = list(board.GetFootprints())
    references = [fp.GetReference() for fp in footprints]
    require(len(references) == 16 and len(set(references)) == 16 and all(references),
            "Seed must contain exactly 16 unique nonempty references")
    require(set(references) == {component["ref"] for component in components},
            "Seed and manifest references differ")
    by_ref = {fp.GetReference(): fp for fp in footprints}
    plans = []
    for component in components:
        ref = component["ref"]
        expected_id = f"CrystalShim_Sensor:Sensor_{ref}"
        require(component["footprint"]["kicad"] == expected_id,
                f"{ref}: expected exact per-reference library ID {expected_id}")
        fp = by_ref[ref]
        source_id = component["footprint"]["tscircuit"]
        require(source_id == f"tscircuit:{fp.GetFPID().GetUniStringLibId()}",
                f"{ref}: native seed model differs from source manifest")
        require(set(p.GetNumber() for p in fp.Pads() if p.GetNumber())
                == set(component["footprint"]["pad_numbers"]), f"{ref}: numbered pad set differs")
        registration.validate_native_pad_numbers(ref, [pad.GetNumber() for pad in fp.Pads()])
        footprint_snapshot(fp, pcbnew)  # reject unsupported geometry before creating output
        clone = pcbnew.FOOTPRINT(fp)
        clone.SetOrientationDegrees(0)
        clone.SetPosition(pcbnew.VECTOR2I(0, 0))
        name = f"Sensor_{ref}"
        library_id = pcbnew.LIB_ID()
        library_id.SetLibNickname(pcbnew.UTF8("CrystalShim_Sensor"))
        library_id.SetLibItemName(pcbnew.UTF8(name))
        clone.SetFPID(library_id)
        clone.SetReference("REF**")
        clone.SetValue(name)
        for pad in clone.Pads():
            pad.SetNetCode(0)
        plans.append((ref, name, source_id, clone, footprint_snapshot(clone, pcbnew)))
    total_pads = sum(bool(p.GetNumber()) for fp in footprints for p in fp.Pads())
    require(total_pads == 61, "Expected all 61 numbered physical lands, including repeated pads")
    require(sum(p.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH for fp in footprints for p in fp.Pads()) == 1,
            "Expected one connector NPTH")
    require(registration.tree_hashes(stage) == before_files and stage_identity == (stage.stat().st_dev, stage.stat().st_ino),
            "Stage changed while native footprint export was planned")

    output.mkdir(parents=True, exist_ok=False)
    library = output / "CrystalShim_Sensor.pretty"
    plugin = pcbnew.PCB_IO_KICAD_SEXPR()
    plugin.CreateLibrary(str(library))
    entries = []
    rotation_comparisons = 0
    for ref, name, source_id, clone, expected in plans:
        plugin.FootprintSave(str(library), clone)
        reloaded = plugin.FootprintLoad(str(library), name)
        require(reloaded is not None, f"{ref}: native library readback failed")
        require(reloaded.GetFPID().GetLibItemName() == name, f"{ref}: native entry name differs")
        require(footprint_snapshot(reloaded, pcbnew) == expected, f"{ref}: native geometry changed")
        require(Counter(p.GetNumber() for p in clone.Pads()) == Counter(p.GetNumber() for p in reloaded.Pads()),
                f"{ref}: physical pad multiset changed")
        require(all(p.GetNetCode() == 0 and not p.GetNetname() for p in reloaded.Pads()),
                f"{ref}: library contains instance net assignments")
        for angle in (0, 90, 180, 270):
            before, after = pcbnew.FOOTPRINT(clone), pcbnew.FOOTPRINT(reloaded)
            for fp in (before, after):
                fp.SetPosition(pcbnew.VECTOR2I(71000000, 82000000))
                fp.SetOrientationDegrees(angle)
            require(footprint_snapshot(before, pcbnew) == footprint_snapshot(after, pcbnew),
                    f"{ref}: geometry changed at rotation {angle}")
            rotation_comparisons += 1
        path = library / f"{name}.kicad_mod"
        source_contract = next(c["footprint"] for c in components if c["ref"] == ref)
        entries.append({"ref": ref, "source_model": source_id,
                        "source_geometry_sha256": source_contract["source_geometry_sha256"],
                        "initial_geometry_sha256": source_contract["initial_geometry_sha256"],
                        "library_id": f"CrystalShim_Sensor:{name}",
                        "path": str(path.relative_to(output)), "sha256": sha256(path),
                        "geometry_sha256": fingerprint(expected),
                        "physical_pad_numbers": sorted(p.GetNumber() for p in reloaded.Pads())})
    require({path.name for path in library.iterdir()} == {f"{name}.kicad_mod" for _, name, _, _, _ in plans},
            "Native library file set differs")
    require(source_hashes == {"board": sha256(board_path), "manifest": sha256(manifest_path)},
            "Source seed or manifest changed during export")
    after_files = registration.tree_hashes(stage)
    created = {f"footprints/{entry['path']}" for entry in entries}
    require(all(after_files.get(path) == digest for path, digest in before_files.items())
            and set(after_files) - set(before_files) == created,
            "Native footprint export changed files outside its new library")
    require(registration.guarded_stage() == stage and stage_identity == (stage.stat().st_dev, stage.stat().st_ino),
            "Stage directory changed during native footprint export")
    require(rotation_comparisons == 64, "Expected all 64 cardinal rotation comparisons")
    receipt = output / "native-footprints-receipt.json"
    with receipt.open("x") as handle:
        json.dump({"schema_version": 1, "status": "validated-native-library-only",
                   "kicad_version": pcbnew.GetBuildVersion(),
                   "source": {"board": str(board_path.relative_to(stage)),
                              "manifest": str(manifest_path.relative_to(stage)), "sha256": source_hashes},
                   "tool_sha256": sha256(Path(__file__)), "validator_sha256": sha256(validator_path),
                   "geometry_verifier_sha256": sha256(geometry_verifier),
                   "geometry_canonicalizer_sha256": sha256(Path(__file__).resolve().parents[2] / "controller/design/footprint-geometry-identity.ts"),
                   "source_versions": manifest.get("versions", {}),
                   "footprints": 16, "numbered_physical_pads": total_pads, "npth": 1,
                   "cardinal_rotation_comparisons": rotation_comparisons, "entries": entries,
                   "board_id": registration.BOARD_ID, "stage_inputs_sha256": before_files,
                   "existing_files_unchanged": True}, handle, indent=2)
        handle.write("\n")
    # Keep native runtime owners alive until all clones/readback work has finished.
    _ = quiet, app, board, plugin
    return receipt


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ("board", "manifest", "stage", "output-root"):
        parser.add_argument(f"--{option}", type=Path, required=True)
    args = parser.parse_args()
    try:
        receipt = export(args)
    except Exception as error:
        print(f"Native footprint export failed: {error}", file=sys.stderr)
        return 1
    print(f"Validated 16 source-derived native footprints: {receipt}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
