"""Keep the HTTP parser version identical in tests/app and disable secret tracing."""

import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
identities = []
allowed = {"io", "embedded-io-async", "edge-nal", "embassy-sync", "embassy-futures"}

for workspace, target in (("firmware", None), ("firmware/app", "riscv32imac-unknown-none-elf")):
    command = ["cargo", "metadata", "--locked", "--format-version", "1"]
    if target:
        command.extend(["--filter-platform", target])
    metadata = json.loads(subprocess.check_output(command, cwd=ROOT / workspace))
    packages = [p for p in metadata["packages"] if p["name"] == "edge-http"]
    if len(packages) != 1:
        raise SystemExit(f"{workspace}: expected one edge-http parser")
    package = packages[0]
    node = next(n for n in metadata["resolve"]["nodes"] if n["id"] == package["id"])
    features = set(node["features"])
    if "io" not in features or not features <= allowed:
        raise SystemExit(f"{workspace}: unreviewed HTTP features {sorted(features)}; log/defmt disclose Authorization headers")
    identities.append((package["version"], package["source"]))

expected = ("0.8.0", "registry+https://github.com/rust-lang/crates.io-index")
if identities != [expected, expected]:
    raise SystemExit(f"HTTP production/host parser identities changed: {identities}")

print("Settings HTTP parser is edge-http 0.8.0 io-only in host/app; secret tracing is absent")
