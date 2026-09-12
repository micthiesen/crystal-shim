"""Offline regressions for the actual resolved-feature guard entry point."""
import contextlib
import io
import json
from pathlib import Path
import runpy
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("check_settings_features.py")
SOURCE = "registry+https://github.com/rust-lang/crates.io-index"


def metadata(features=("io",), version="0.8.0", source=SOURCE):
    return json.dumps({
        "packages": [{"id": "http", "name": "edge-http", "version": version, "source": source}],
        "resolve": {"nodes": [{"id": "http", "features": list(features)}]},
    }).encode()


class Features(unittest.TestCase):
    def run_guard(self, host, app):
        with patch("subprocess.check_output", side_effect=[host, app]), contextlib.redirect_stdout(io.StringIO()):
            runpy.run_path(str(SCRIPT), run_name="__main__")

    def test_published_io_only_parser_passes(self):
        self.run_guard(metadata(), metadata())

    def test_logging_or_defmt_rejects_either_graph(self):
        for feature in ("log", "defmt", "std"):
            for target in (0, 1):
                values = [metadata(), metadata()]
                values[target] = metadata(("io", feature))
                with self.subTest(feature=feature, target=target), self.assertRaises(SystemExit):
                    self.run_guard(*values)

    def test_missing_io_wrong_version_and_unreviewed_fork_reject(self):
        for invalid in (metadata(()), metadata(version="0.9.0"), metadata(source=None)):
            with self.subTest(metadata=invalid), self.assertRaises(SystemExit):
                self.run_guard(invalid, invalid)


if __name__ == "__main__":
    unittest.main()
