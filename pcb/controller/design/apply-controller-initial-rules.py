#!/usr/bin/env python3
"""Create fresh project rules through KiCad's native settings manager only."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("registration", HERE / "register-controller-library.py")
assert spec and spec.loader
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)
handoff = registration.handoff


def apply() -> Path:
    stage_value = os.environ.get("STILLAIR_HANDOFF_STAGE", "")
    stage = Path(stage_value)
    if not stage_value or not stage.is_absolute() or stage != stage.resolve() or not stage.is_dir():
        raise ValueError("native initial rules require a canonical shared handoff stage")
    if os.environ.get("STILLAIR_HANDOFF_BOARD") != "controller.board.main":
        raise ValueError("native initial rules require the controller guard")
    for key, name in [
        ("STILLAIR_HANDOFF_MANIFEST", "source-manifest.normalized.json"),
        ("STILLAIR_HANDOFF_AUGMENTATION", "kicad-augmentation.normalized.json"),
    ]:
        if os.environ.get(key) != str(stage / name):
            raise ValueError(f"invalid {key} guard")
    before = registration.tree_hashes(stage)
    manifest = handoff.load_manifest(stage / "source-manifest.normalized.json")
    augment = handoff.load_augmentation(stage / "kicad-augmentation.normalized.json", manifest)
    if manifest["board"]["stable_id"] != "controller.board.main":
        raise ValueError("manifest board differs")
    rule = [op for op in augment["operations"] if op["id"] == "controller.augment.npth-clearance"]
    if len(rule) != 1 or rule[0]["kind"] != "custom_rule" or rule[0]["params"].get("minimum_hole_to_copper_mm") != 0.2:
        raise ValueError("reviewed 0.20 mm controller NPTH clearance declaration is required")
    board_path = stage / "controller.kicad_pcb"
    project_path = stage / "controller.kicad_pro"
    local_path = stage / "controller.kicad_prl"
    receipt = stage / "native-initial-rules.json"
    if not board_path.is_file() or project_path.exists() or local_path.exists() or receipt.exists():
        raise ValueError("native initial rules require the seed and a new project/receipt")

    import pcbnew
    import wx
    app = wx.App(False)
    log = wx.LogNull()
    manager = pcbnew.GetSettingsManager()
    # LoadProject returns false for a new path while creating the in-memory
    # project. SaveProject performs its first native serialization.
    manager.LoadProject(str(project_path), False)
    project = manager.GetProject(str(project_path))
    board = pcbnew.LoadBoard(str(board_path))
    if project is None or board is None:
        raise ValueError("KiCad could not load the fresh project and seed")
    board.SetProject(project)
    board.GetDesignSettings().m_HoleClearance = pcbnew.FromMM(0.2)
    if not manager.SaveProject(str(project_path), project):
        raise ValueError("KiCad did not save the initial project rules")
    after = registration.tree_hashes(stage)
    created = set(after) - set(before)
    if any(after.get(path) != digest for path, digest in before.items()) or created not in [
        {"controller.kicad_pro"}, {"controller.kicad_pro", "controller.kicad_prl"},
    ]:
        raise ValueError("native rule setup changed files beyond the new project/local settings")
    # Read JSON is a readback only. Never write or repair KiCad JSON here.
    saved = json.loads(project_path.read_text())
    if saved.get("board", {}).get("design_settings", {}).get("rules", {}).get("min_hole_clearance") != 0.2:
        raise ValueError("native project rule readback differs")
    evidence = {"schema_version": 1, "scope": "initial-project-npth-clearance-only",
                "applied_operation": rule[0]["id"], "minimum_hole_to_copper_mm": 0.2,
                "project": project_path.name, "project_sha256": after[project_path.name],
                "native_files": {name: after[name] for name in sorted(created)},
                "kicad_version": pcbnew.GetBuildVersion(), "existing_files_unchanged": True,
                "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    with receipt.open("x") as output:
        json.dump(evidence, output, indent=2)
        output.write("\n")
    # Keep the native wx lifetime through all native work and readback.
    assert app and log is not None
    return receipt


if __name__ == "__main__":
    try:
        print(apply())
    except (ValueError, OSError, KeyError, handoff.HandoffError) as error:
        raise SystemExit(f"ERROR: {error}") from None
