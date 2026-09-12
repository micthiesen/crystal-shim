#!/usr/bin/env python3
"""Register only the fresh controller's native library through verified Konnect.

No native file is serialized here. Konnect owns the fp-lib-table write. The shared
handoff later runs KiCad ERC/DRC and binds this file in its complete stage receipt.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import shutil
import subprocess
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("handoff", HERE.parents[1] / "tools/tscircuit_handoff.py")
assert spec and spec.loader
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


def tree_hashes(stage: Path) -> dict[str, str]:
    result = {}
    for path in stage.rglob("*"):
        if path.is_symlink():
            raise ValueError("staging must not contain symlinks")
        if path.is_file():
            result[str(path.relative_to(stage))] = hashlib.sha256(path.read_bytes()).hexdigest()
    return result


class Konnect:
    """Bounded, local MCP calls to the installed native-library operation."""

    def __init__(self) -> None:
        env = dict(os.environ)
        if not shutil.which("konnect"):
            installed = Path.home() / "Documents/KiCad/10.0/3rdparty/plugins/com_github_mixelpixx_konnect/bin"
            env["PATH"] = str(installed) + os.pathsep + env.get("PATH", "")
        if not shutil.which("konnect", path=env["PATH"]):
            raise ValueError("installed Konnect is unavailable")
        version = subprocess.run(["konnect", "--version"], env=env, capture_output=True,
                                 text=True, timeout=5, check=True).stdout.strip()
        if version != "konnect 0.2.1":
            raise ValueError("project-library registration requires verified Konnect 0.2.1")
        self.executable_sha256 = hashlib.sha256(
            Path(shutil.which("konnect", path=env["PATH"])).read_bytes()
        ).hexdigest()
        self.process = subprocess.Popen(
            ["konnect"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, env=env,
        )
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ)
        self.buffer = bytearray()
        self.next_id = 0
        self.deadline = time.monotonic() + 30

    def send(self, value: dict) -> None:
        self.process.stdin.write((json.dumps(value) + "\n").encode())
        self.process.stdin.flush()

    def request(self, method: str, params: dict) -> dict:
        self.next_id += 1
        self.send({"jsonrpc": "2.0", "id": self.next_id, "method": method, "params": params})
        while True:
            if time.monotonic() >= self.deadline:
                raise ValueError("Konnect registration deadline expired")
            if b"\n" in self.buffer:
                line, _, rest = self.buffer.partition(b"\n")
                self.buffer = bytearray(rest)
                value = json.loads(line)
                if value.get("id") != self.next_id:
                    continue
                if "error" in value or "result" not in value:
                    raise ValueError("Konnect request failed")
                return value["result"]
            if not self.selector.select(max(0, self.deadline - time.monotonic())):
                raise ValueError("Konnect registration deadline expired")
            chunk = os.read(self.process.stdout.fileno(), 65536)
            if not chunk:
                raise ValueError("Konnect closed before registration completed")
            self.buffer.extend(chunk)
            if len(self.buffer) > 1024 * 1024:
                raise ValueError("Konnect response exceeds the registration bound")

    def call(self, name: str, arguments: dict) -> dict:
        result = self.request("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError"):
            raise ValueError(f"Konnect {name} failed")
        content = result.get("content", [])
        if len(content) != 1 or content[0].get("type") != "text":
            raise ValueError("unexpected Konnect response")
        return json.loads(content[0]["text"])

    def close(self) -> None:
        self.selector.close()
        self.process.terminate()
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait(timeout=5)


def register() -> Path:
    stage_value = os.environ.get("STILLAIR_HANDOFF_STAGE", "")
    stage = Path(stage_value)
    if not stage_value or not stage.is_absolute() or stage != stage.resolve() or not stage.is_dir():
        raise ValueError("registration requires a canonical shared handoff stage")
    if os.environ.get("STILLAIR_HANDOFF_BOARD") != "controller.board.main":
        raise ValueError("registration requires the controller board guard")
    for key, name in [
        ("STILLAIR_HANDOFF_MANIFEST", "source-manifest.normalized.json"),
        ("STILLAIR_HANDOFF_AUGMENTATION", "kicad-augmentation.normalized.json"),
    ]:
        if os.environ.get(key) != str(stage / name):
            raise ValueError(f"invalid {key} guard")
    before = tree_hashes(stage)
    manifest = handoff.load_manifest(stage / "source-manifest.normalized.json")
    handoff.load_augmentation(stage / "kicad-augmentation.normalized.json", manifest)
    if manifest["board"]["stable_id"] != "controller.board.main":
        raise ValueError("staged manifest is not the controller")
    root = handoff.resolve_staged_footprint_root(stage, Path("footprints"))
    library = root / "CrystalShim_Controller.pretty"
    expected = {f"Controller_{item['ref']}.kicad_mod" for item in manifest["components"]}
    if len(expected) != 99 or {p.name for p in library.iterdir()} != expected:
        raise ValueError("source-exported library must contain exactly 99 controller footprints")
    if any(not (library / name).is_file() for name in expected):
        raise ValueError("source-exported footprint is not a regular file")
    if not (stage / "controller.kicad_pcb").is_file() or not (stage / "controller.kicad_sch").is_file():
        raise ValueError("initial controller board and schematic must exist")
    receipt = stage / "native-library-registration.json"
    table = stage / "fp-lib-table"
    if table.exists() or receipt.exists():
        raise ValueError("registration refuses an existing table or receipt")
    project = stage / "controller.kicad_pro"
    client = Konnect()
    try:
        client.request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "Crystal Shim initial library registration", "version": "1"}})
        client.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        client.call("load_toolset", {"name": "library"})
        result = client.call("register_footprint_library", {
            "scope": "project", "project": str(project),
            "library_path": str(library), "nickname": "CrystalShim_Controller",
        })
        if result.get("success") is not True or result.get("scope") != "project" or result.get("table") != str(table):
            raise ValueError("Konnect did not confirm the exact project table")
        readback = client.call("list_footprint_libraries", {"scope": "project", "project": str(project)})
    finally:
        client.close()
    entries = readback.get("libraries", [])
    if readback.get("count") != 1 or len(entries) != 1 or any(
        entries[0].get(key) != value for key, value in {
            "nickname": "CrystalShim_Controller", "scope": "project",
            "type": "KiCad", "path": str(library), "uri": str(library),
        }.items()
    ):
        raise ValueError("Konnect project-library readback differs")
    after = tree_hashes(stage)
    if any(after.get(path) != digest for path, digest in before.items()) or set(after) - set(before) != {"fp-lib-table"}:
        raise ValueError("registration changed files beyond the new project library table")
    evidence = {"schema_version": 1, "scope": "initial-project-library-registration-only",
                "tool": "Konnect 0.2.1 register_footprint_library", "table": "fp-lib-table",
                "tool_sha256": client.executable_sha256,
                "table_sha256": after["fp-lib-table"], "readback": readback,
                "existing_files_unchanged": True,
                "script_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    with receipt.open("x") as output:
        json.dump(evidence, output, indent=2)
        output.write("\n")
    return receipt


if __name__ == "__main__":
    try:
        print(register())
    except (ValueError, OSError, KeyError, subprocess.SubprocessError, handoff.HandoffError) as error:
        raise SystemExit(f"ERROR: {error}") from None
