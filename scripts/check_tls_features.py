"""Keep the host TLS policy checks on the production crypto configuration."""

from pathlib import Path
import tomllib

ROOT = Path(__file__).resolve().parents[1]
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

print("TLS production/host dependency profiles match")
