"""Verify the exact reviewed wrapper patch and unchanged upstream package files."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / "vendor/mbedtls-rs"
# Canonical complete file manifest independently extracted from the published
# archive above. Updating only the mutable receipt cannot widen the patch scope.
UPSTREAM_MANIFEST_SHA256 = "818b366dc0aeef3b4dff8ed548e5e3718755e7ef7e8c91d481bf8f4c29149b6f"


def check_vendor():
    data = json.loads((ROOT / "vendor/mbedtls-rs.provenance.json").read_text())
    expected_archive = "7ffe70b1a677b6efabede0d8e762f6187e66bff5118814aee2dcbfefad187add"
    if data["mbedtls-rs-0.2.0.crate_sha256"] != expected_archive:
        raise SystemExit("TLS wrapper upstream archive identity changed")
    upstream = json.dumps(data["upstream_source"], sort_keys=True, separators=(",", ":")).encode()
    if (
        data.get("upstream_matches_archive") is not True
        or hashlib.sha256(upstream).hexdigest() != UPSTREAM_MANIFEST_SHA256
    ):
        raise SystemExit("TLS wrapper upstream manifest differs from the published archive")
    expected = data["patched_source"]
    if set(expected) != set(data["upstream_source"]) | {"src/restriction.rs"}:
        raise SystemExit("TLS wrapper upstream file set changed beyond the reviewed addition")
    files = {str(p.relative_to(FOLDER)): p for p in FOLDER.rglob("*") if p.is_file()}
    if set(files) != set(expected):
        raise SystemExit("TLS wrapper contains missing or unrecorded package files")
    for name, path in files.items():
        if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected[name]:
            raise SystemExit(f"TLS wrapper source receipt mismatch: {name}")
    changed = {name for name, digest in expected.items() if digest != data["upstream_source"].get(name)}
    allowed = {"src/lib.rs", "src/restriction.rs", "src/session.rs", "src/session/asynch.rs", "src/session/blocking.rs"}
    if changed != allowed or set(data["patch_files"]) != allowed:
        raise SystemExit("TLS wrapper changes exceed the reviewed five-file seam")
    patch = ROOT / "vendor/mbedtls-rs.patch"
    if hashlib.sha256(patch.read_bytes()).hexdigest() != data["patch_sha256"]:
        raise SystemExit("TLS wrapper patch receipt mismatch")


if __name__ == "__main__":
    check_vendor()
    print("TLS wrapper source and patch receipts match")
