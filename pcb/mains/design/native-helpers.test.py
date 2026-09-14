"""Host-only admission tests. Never import KiCad or invoke a native write helper."""
from __future__ import annotations

import argparse
from copy import deepcopy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent


def load(name: str):
    spec = importlib.util.spec_from_file_location(name, HERE / f"{name}.py")
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


registration = load("register-mains-library")
exporter = load("export-native-footprints")
rules = load("apply-mains-initial-rules")
MANIFEST = registration.handoff.normalize_manifest(json.load(sys.stdin))


class ManifestAdmission(unittest.TestCase):
    def test_actual_manifest_is_immutable_and_exact(self):
        before = deepcopy(MANIFEST)
        registration.validate_mains_manifest(MANIFEST)
        self.assertEqual(MANIFEST, before)
        self.assertEqual(len(MANIFEST["components"]), 26)
        self.assertEqual(sum(len(c["footprint"]["pad_numbers"]) for c in MANIFEST["components"]), 53)

    def test_rejects_foreign_geometry_identity_and_pad_set(self):
        mutations = [
            lambda m: m["board"].update(stable_id="controller.board.main"),
            lambda m: m["board"].update(width_mm=134.9),
            lambda m: m["board"].update(height_mm=76),
            lambda m: m["board"].update(layer_count=4),
            lambda m: m["board"].update(kicad_origin_mm=[100, 99]),
            lambda m: m["components"].pop(),
            lambda m: m["components"].append(deepcopy(m["components"][0])),
            lambda m: m["components"][0].update(ref="U99"),
            lambda m: m["components"][0].update(stable_id="controller.component.c1"),
            lambda m: m["components"][0]["footprint"].update(kicad="CrystalShim_Controller:Controller_C1"),
            lambda m: m["components"][0].update(symbol="Device:C"),
            lambda m: m["components"][0]["footprint"].update(pad_numbers=["1", "1"]),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = deepcopy(MANIFEST)
                mutate(data)
                before = deepcopy(data)
                with self.assertRaises(ValueError):
                    registration.validate_mains_manifest(data)
                self.assertEqual(data, before)

    def test_exact_terminal_and_locator_multisets(self):
        physical = {}
        for component in MANIFEST["components"]:
            ref = component["ref"]
            numbers = list(component["footprint"]["pad_numbers"])
            if ref in {"J5", "J6", "H1", "H2", "H3", "H4"}:
                numbers.append("")
            physical[ref] = numbers
            registration.validate_native_pad_numbers(ref, list(reversed(numbers)))
            for drift in [numbers[:-1], numbers + [numbers[0]], numbers + ["99"]]:
                with self.subTest(ref=ref, drift=drift), self.assertRaises(ValueError):
                    registration.validate_native_pad_numbers(ref, drift)
        self.assertEqual(sum(bool(number) for numbers in physical.values() for number in numbers), 53)
        self.assertEqual(sum(number == "" for numbers in physical.values() for number in numbers), 6)
        for ref in ("J1", "J2", "J3", "J4"):
            drift = list(physical[ref])
            drift[0] = drift[1]
            with self.assertRaises(ValueError):
                registration.validate_native_pad_numbers(ref, drift)

    def test_only_reviewed_clearance_operation_is_selected(self):
        operation = {"id": "mains.augment.npth-clearance", "kind": "custom_rule",
                     "params": {"minimum_hole_to_copper_mm": 0.2}}
        data = {"operations": [deepcopy(operation)]}
        self.assertEqual(rules.clearance_operation(data), operation)
        self.assertEqual(data, {"operations": [operation]})
        invalid = [
            [], [operation, operation],
            [{**operation, "id": "controller.augment.npth-clearance"}],
            [{**operation, "kind": "zone"}],
            [{**operation, "params": {}}],
        ] + [
            [{**operation, "params": {"minimum_hole_to_copper_mm": value}}]
            for value in (0.19, 0.21, "0.2", None, True)
        ]
        for operations in invalid:
            with self.subTest(operations=operations), self.assertRaises(ValueError):
                rules.clearance_operation({"operations": operations})


class StageAdmission(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="stillair-mains.board.main-handoff-host-test-")
        self.stage = Path(self.temporary.name).resolve(strict=True)
        self.manifest = self.stage / "source-manifest.normalized.json"
        self.augmentation = self.stage / "kicad-augmentation.normalized.json"
        self.manifest.write_text(json.dumps(MANIFEST))
        self.augmentation.write_text("{}\n")
        self.environment = {
            "STILLAIR_HANDOFF_STAGE": str(self.stage),
            "STILLAIR_HANDOFF_BOARD": "mains.board.main",
            "STILLAIR_HANDOFF_MANIFEST": str(self.manifest),
            "STILLAIR_HANDOFF_AUGMENTATION": str(self.augmentation),
        }
        self.env_patch = patch.dict(os.environ, self.environment, clear=True)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.addCleanup(self.temporary.cleanup)

    def test_canonical_stage_hashes_exact_bytes(self):
        self.assertEqual(registration.guarded_stage(), self.stage)
        expected = {
            path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (self.manifest, self.augmentation)
        }
        self.assertEqual(registration.tree_hashes(self.stage), expected)
        self.assertEqual(registration.tree_hashes(self.stage), expected)

    def test_environment_requires_all_four_exact_values(self):
        before = registration.tree_hashes(self.stage)
        for key in self.environment:
            with self.subTest(missing=key), patch.dict(os.environ, clear=True):
                os.environ.update({k: v for k, v in self.environment.items() if k != key})
                with self.assertRaises((ValueError, OSError)):
                    registration.guarded_stage()
        for key, value in [
            ("STILLAIR_HANDOFF_STAGE", str(self.stage) + "/."),
            ("STILLAIR_HANDOFF_STAGE", self.stage.name),
            ("STILLAIR_HANDOFF_BOARD", "controller.board.main"),
            ("STILLAIR_HANDOFF_MANIFEST", str(self.augmentation)),
            ("STILLAIR_HANDOFF_AUGMENTATION", str(self.manifest)),
        ]:
            with self.subTest(key=key, value=value), patch.dict(os.environ, {key: value}):
                with self.assertRaises((ValueError, OSError)):
                    registration.guarded_stage()
        self.assertEqual(registration.tree_hashes(self.stage), before)

    def test_rejects_noncanonical_stage_and_adopted_stage(self):
        with tempfile.TemporaryDirectory(prefix="mains-wrong-stage-") as wrong:
            with patch.dict(os.environ, {"STILLAIR_HANDOFF_STAGE": str(Path(wrong).resolve())}):
                with self.assertRaises(ValueError):
                    registration.guarded_stage()
            alias = Path(wrong) / "stillair-mains.board.main-handoff-alias"
            alias.symlink_to(self.stage, target_is_directory=True)
            with patch.dict(os.environ, {"STILLAIR_HANDOFF_STAGE": str(alias)}):
                with self.assertRaises(ValueError):
                    registration.guarded_stage()
        for name in ("handoff.lock.json", "handoff-receipt.json"):
            receipt = self.stage / name
            receipt.write_text("{}")
            with self.assertRaises(ValueError):
                registration.guarded_stage()
            receipt.unlink()

    def test_rejects_symlink_fifo_and_nonregular_inputs_without_waiting(self):
        original = self.augmentation.read_bytes()
        self.augmentation.unlink()
        for kind in ("symlink", "fifo", "directory"):
            with self.subTest(kind=kind):
                if kind == "symlink":
                    self.augmentation.symlink_to(self.manifest)
                elif kind == "fifo":
                    os.mkfifo(self.augmentation)
                else:
                    self.augmentation.mkdir()
                with self.assertRaises(ValueError):
                    registration.guarded_stage()
                if kind != "directory":
                    with self.assertRaises(ValueError):
                        registration.tree_hashes(self.stage)
                    self.augmentation.unlink()
                else:
                    self.augmentation.rmdir()
        self.augmentation.write_bytes(original)
        unowned = self.stage / "unowned-link"
        unowned.symlink_to(self.manifest)
        with self.assertRaises(ValueError):
            registration.tree_hashes(self.stage)

    def test_export_paths_are_exact_and_partial_output_is_not_reused(self):
        # Mock only the absent native seed read. This exercises argument admission
        # without creating, loading, or exporting any .kicad_* file.
        board = self.stage / "mains.kicad_pcb"
        output = self.stage / "footprints"
        args = argparse.Namespace(stage=self.stage, board=board, manifest=self.manifest, output_root=output)
        original_read = exporter.registration.read_regular

        def read_non_native(path):
            return b"mock native read" if path == board else original_read(path)

        with patch.object(exporter.registration, "read_regular", side_effect=read_non_native):
            self.assertEqual(exporter.guarded_paths(args), (self.stage, board, self.manifest, output))
            for key, value in [
                ("stage", self.stage.parent), ("board", self.stage / "controller.kicad_pcb"),
                ("manifest", self.augmentation), ("output_root", self.stage.parent / "footprints"),
                ("output_root", self.stage / "different"),
            ]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    exporter.guarded_paths(argparse.Namespace(**{**vars(args), key: value}))
            output.mkdir()
            with self.assertRaises(ValueError):
                exporter.guarded_paths(args)
        self.assertFalse(board.exists())

    def test_invalid_environment_cannot_reach_native_entrypoints(self):
        before = registration.tree_hashes(self.stage)
        with patch.dict(os.environ, clear=True), patch.object(registration, "Konnect") as native:
            with self.assertRaises(ValueError):
                registration.register()
            native.assert_not_called()
            with self.assertRaises(ValueError):
                rules.apply()
            with self.assertRaises(ValueError):
                exporter.export(argparse.Namespace())
        self.assertNotIn("pcbnew", sys.modules)
        self.assertNotIn("wx", sys.modules)
        self.assertEqual(registration.tree_hashes(self.stage), before)


if __name__ == "__main__":
    unittest.main()
