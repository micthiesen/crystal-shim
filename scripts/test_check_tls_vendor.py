"""Provenance regressions: synchronized receipt/lock edits must still fail."""
import copy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

import check_tls_vendor as vendor
from check_tls_registry import PACKAGES, REGISTRY, check_registry_identity


class ProvenanceTests(unittest.TestCase):
    def test_real_tree_matches(self):
        vendor.check_vendor()

    def test_unlisted_source_change_cannot_reauthenticate_its_receipt(self):
        with tempfile.TemporaryDirectory(prefix="crystal-tls-provenance-") as directory:
            root = Path(directory)
            shutil.copytree(vendor.ROOT / "vendor", root / "vendor")
            folder = root / "vendor/mbedtls-rs"
            target = folder / "src/cert.rs"
            target.write_bytes(target.read_bytes() + b"\n// unreviewed change\n")
            receipt = root / "vendor/mbedtls-rs.provenance.json"
            data = json.loads(receipt.read_text())
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            data["upstream_source"]["src/cert.rs"] = digest
            data["patched_source"]["src/cert.rs"] = digest
            receipt.write_text(json.dumps(data))
            with patch.object(vendor, "ROOT", root), patch.object(vendor, "FOLDER", folder):
                with self.assertRaisesRegex(SystemExit, "upstream manifest"):
                    vendor.check_vendor()

    def test_upstream_file_cannot_be_deleted_with_its_patched_receipt_entry(self):
        for name in ("README.md", "LICENSE-APACHE", "src/cert.rs"):
            with self.subTest(name=name), tempfile.TemporaryDirectory(prefix="crystal-tls-missing-") as directory:
                root = Path(directory)
                shutil.copytree(vendor.ROOT / "vendor", root / "vendor")
                folder = root / "vendor/mbedtls-rs"
                (folder / name).unlink()
                receipt = root / "vendor/mbedtls-rs.provenance.json"
                data = json.loads(receipt.read_text())
                del data["patched_source"][name]
                receipt.write_text(json.dumps(data))
                with patch.object(vendor, "ROOT", root), patch.object(vendor, "FOLDER", folder):
                    with self.assertRaisesRegex(SystemExit, "upstream file set"):
                        vendor.check_vendor()

    def test_registry_guards_reject_shared_path_version_and_checksum_changes(self):
        for name, (version, checksum) in PACKAGES.items():
            original = {"name": name, "version": version, "source": REGISTRY, "checksum": checksum}
            check_registry_identity(original, locked=True)
            check_registry_identity(original, locked=False)
            for change in ({"source": None}, {"source": "git+https://example.invalid/replacement"}, {"version": "999.0.0"}):
                for locked in (True, False):
                    with self.subTest(name=name, change=change, locked=locked):
                        candidate = copy.deepcopy(original)
                        candidate.update(change)
                        with self.assertRaises(SystemExit):
                            check_registry_identity(candidate, locked=locked)
            with self.assertRaisesRegex(SystemExit, "checksum"):
                check_registry_identity({**original, "checksum": "0" * 64}, locked=True)


if __name__ == "__main__":
    unittest.main()
