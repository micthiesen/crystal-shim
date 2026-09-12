"""Keep the host TLS policy checks on the production crypto configuration."""

from pathlib import Path
import json
import subprocess
import tomllib
from check_tls_vendor import check_vendor
from check_tls_registry import PACKAGES, check_registry_identity

ROOT = Path(__file__).resolve().parents[1]
check_vendor()
app = tomllib.loads((ROOT / "firmware/app/Cargo.toml").read_text())
host = tomllib.loads((ROOT / "firmware/tls-tests/Cargo.toml").read_text())

for name in ("edge-nal", "edge-nal-tls", "mbedtls-rs"):
    production = app["dependencies"][name].copy()
    harness = host["dependencies"][name].copy()
    production_features = set(production.pop("features", []))
    harness_features = set(harness.pop("features", []))
    if name == "mbedtls-rs":
        harness_features.discard("std")
    if production != harness or production_features != harness_features:
        raise SystemExit(f"TLS test dependency configuration differs from app: {name}")

locks = [
    tomllib.loads((ROOT / f"firmware/{workspace}/Cargo.lock").read_text())
    for workspace in ("app", "tls-tests")
]
for name in ("edge-nal", "edge-nal-tls", "mbedtls-rs", "mbedtls-rs-sys"):
    entries = [
        [entry for entry in lock["package"] if entry["name"] == name]
        for lock in locks
    ]
    identities = [
        [(entry["version"], entry.get("source"), entry.get("checksum")) for entry in group]
        for group in entries
    ]
    if len(identities[0]) != 1 or identities[0] != identities[1]:
        raise SystemExit(f"TLS test lock differs from app: {name}")
    if name in PACKAGES:
        for group in entries:
            check_registry_identity(group[0], locked=True)

expected_vendor = (ROOT / "vendor/mbedtls-rs/Cargo.toml").resolve()
resolved = {}
for workspace, manifest in (("app", app), ("tls-tests", host)):
    directory = ROOT / "firmware" / workspace
    patch = manifest.get("patch", {}).get("crates-io", {}).get("mbedtls-rs", {})
    if set(patch) != {"path"} or (directory / patch["path"] / "Cargo.toml").resolve() != expected_vendor:
        raise SystemExit(f"TLS wrapper patch points outside the reviewed vendor: {workspace}")
    command = ["cargo", "metadata", "--locked", "--format-version=1"]
    if workspace == "app":
        command += ["--filter-platform", "riscv32imac-unknown-none-elf"]
    metadata = json.loads(subprocess.check_output(command, cwd=directory, text=True))
    packages = metadata["packages"]
    nodes = {node["id"]: node for node in metadata["resolve"]["nodes"]}
    resolved[workspace] = {}
    for name in ("mbedtls-rs", "mbedtls-rs-sys", "edge-nal-tls", "edge-nal"):
        candidates = [package for package in packages if package["name"] == name]
        if len(candidates) != 1:
            raise SystemExit(f"TLS dependency has multiple resolved copies: {workspace}/{name}")
        package = candidates[0]
        if name == "mbedtls-rs" and Path(package["manifest_path"]).resolve() != expected_vendor:
            raise SystemExit(f"TLS resolves an unreviewed wrapper path: {workspace}")
        if name in PACKAGES:
            check_registry_identity(package, locked=False)
        features = set(nodes[package["id"]]["features"])
        if any("psk" in feature or "ticket" in feature or "early-data" in feature for feature in features):
            raise SystemExit(f"TLS has an unreviewed resumption/PSK feature: {workspace}/{name}")
        if workspace == "tls-tests":
            features.discard("std")
            if name == "mbedtls-rs-sys":
                features.discard("time")
        resolved[workspace][name] = features
if resolved["app"] != resolved["tls-tests"]:
    raise SystemExit("Resolved TLS algorithm/record features differ between production and harness")

print("TLS production/host profiles, resolved vendor path and source receipts match")
