"""Check the resolved Matter API identity and the flash-owner mutex invariant."""

import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
identities = []

for workspace, target in (("firmware", None), ("firmware/app", "riscv32imac-unknown-none-elf")):
    command = ["cargo", "metadata", "--locked", "--format-version", "1"]
    if target:
        command.extend(["--filter-platform", target])
    metadata = json.loads(subprocess.check_output(command, cwd=ROOT / workspace))
    packages = [package for package in metadata["packages"] if package["name"] == "rs-matter"]
    if len(packages) != 1:
        raise SystemExit(f"{workspace}: expected exactly one resolved rs-matter package")
    package = packages[0]
    node = next(node for node in metadata["resolve"]["nodes"] if node["id"] == package["id"])
    if "sync-mutex" in node["features"]:
        raise SystemExit(
            f"{workspace}: rs-matter/sync-mutex would mask interrupts around gated flash access"
        )
    identities.append((package["version"], package["source"]))

if identities[0] != identities[1] or identities[0][0] != "0.2.0":
    raise SystemExit(f"Matter production/host API identities differ from the pinned stack: {identities}")

print("Matter production/host API identities match; sync-mutex is absent")
