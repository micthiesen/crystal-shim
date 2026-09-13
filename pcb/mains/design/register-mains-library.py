#!/usr/bin/env python3
"""Register only the fresh mains's native library through verified Konnect.

No native file is serialized here. Konnect owns the fp-lib-table and sym-lib-table writes. The shared
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
import stat
import subprocess
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("handoff", HERE.parents[1] / "tools/tscircuit_handoff.py")
assert spec and spec.loader
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)

BOARD_ID = "mains.board.main"
LIBRARY = "CrystalShim_Mains"
EXPECTED_PINS = {
    **{f"C{i}": {"1", "2"} for i in range(1, 6)},
    **{f"R{i}": {"1", "2"} for i in range(1, 8)},
    "D1": {"1", "2"}, "D2": {"1", "2"}, "RV1": {"1", "2"},
    "J1": {"1", "2"}, "J2": {"1", "2", "3"},
    "J3": {"1", "2", "3", "4"}, "J4": {str(i) for i in range(1, 7)},
    "J5": {"1", "2", "3"}, "K1": {"1", "3", "4", "5"},
    "U1": {"1", "2", "3", "4"}, "U2": {str(i) for i in range(1, 11)},
    **{f"H{i}": set() for i in range(1, 5)},
}


def read_regular(path: Path) -> bytes:
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or path.resolve(strict=True) != path:
        raise ValueError(f"stage input must be a canonical regular file: {path.name}")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as stream:
        current = os.fstat(stream.fileno())
        if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != (before.st_dev, before.st_ino):
            raise ValueError("stage input changed while opening")
        return stream.read()


def guarded_stage() -> Path:
    value = os.environ.get("STILLAIR_HANDOFF_STAGE", "")
    stage = Path(value)
    if (not value or not stage.is_absolute() or value != str(stage.resolve(strict=True))
            or not stage.is_dir() or stage.is_symlink()
            or not stage.name.startswith("stillair-mains.board.main-handoff-")
            or stage.is_relative_to(HERE.parents[2])):
        raise ValueError("requires a canonical fresh mains handoff stage outside the repository")
    if os.environ.get("STILLAIR_HANDOFF_BOARD") != BOARD_ID:
        raise ValueError("requires the complete mains board handoff guard")
    for key, name in [
        ("STILLAIR_HANDOFF_MANIFEST", "source-manifest.normalized.json"),
        ("STILLAIR_HANDOFF_AUGMENTATION", "kicad-augmentation.normalized.json"),
    ]:
        if os.environ.get(key) != str(stage / name):
            raise ValueError(f"invalid {key} guard")
        read_regular(stage / name)
    if any((stage / name).exists() for name in ("handoff.lock.json", "handoff-receipt.json")):
        raise ValueError("initial helpers refuse a completed or adopted handoff")
    return stage


def validate_mains_manifest(manifest: dict) -> None:
    board = manifest["board"]
    if (board["stable_id"] != BOARD_ID or board["width_mm"] != 135 or board["height_mm"] != 75
            or board["layer_count"] != 2 or board.get("kicad_origin_mm") != [100, 100]):
        raise ValueError("requires the exact mains board manifest")
    components = manifest["components"]
    if len(components) != 27 or {c["ref"] for c in components} != set(EXPECTED_PINS):
        raise ValueError("requires 23 exact mains references and four mounting holes")
    for component in components:
        ref = component["ref"]
        if (component["stable_id"] != f"mains.component.{ref.lower()}"
                or component["footprint"]["kicad"] != f"{LIBRARY}:Mains_{ref}"
                or len(component["footprint"]["pad_numbers"]) != len(EXPECTED_PINS[ref])
                or set(component["footprint"]["pad_numbers"]) != EXPECTED_PINS[ref]):
            raise ValueError(f"{ref}: exact mains component or pin identity changed")
        if EXPECTED_PINS[ref] and component.get("symbol") != f"{LIBRARY}:Mains_{ref}":
            raise ValueError(f"{ref}: exact mains symbol identity changed")


def validate_native_pad_numbers(ref: str, numbers: list[str]) -> None:
    expected = [number for number in EXPECTED_PINS[ref]
                for _ in range(2 if ref in {"J1", "J2", "J3", "J4"} else 1)]
    if ref in {"H1", "H2", "H3", "H4", "J5"}:
        expected.append("")
    if sorted(numbers) != sorted(expected):
        raise ValueError(f"{ref}: exact physical pad/locator multiset changed")


def tree_hashes(stage: Path) -> dict[str, str]:
    result = {}
    for path in stage.rglob("*"):
        if path.is_symlink():
            raise ValueError("staging must not contain symlinks")
        if path.is_dir():
            continue
        result[str(path.relative_to(stage))] = hashlib.sha256(read_regular(path)).hexdigest()
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
    stage = guarded_stage()
    identity = stage.stat().st_dev, stage.stat().st_ino
    before = tree_hashes(stage)
    manifest = handoff.load_manifest(stage / "source-manifest.normalized.json")
    handoff.load_augmentation(stage / "kicad-augmentation.normalized.json", manifest)
    validate_mains_manifest(manifest)
    root = handoff.resolve_staged_footprint_root(stage, Path("footprints"))
    library = root / "CrystalShim_Mains.pretty"
    expected = {f"Mains_{item['ref']}.kicad_mod" for item in manifest["components"]}
    if len(expected) != 27 or {p.name for p in library.iterdir()} != expected:
        raise ValueError("source-exported library must contain exactly 27 mains footprints")
    if any(not (library / name).is_file() for name in expected):
        raise ValueError("source-exported footprint is not a regular file")
    if not (stage / "mains.kicad_pcb").is_file() or not (stage / "mains.kicad_sch").is_file():
        raise ValueError("initial mains board and schematic must exist")
    receipt = stage / "native-library-registration.json"
    table = stage / "fp-lib-table"
    if table.exists() or receipt.exists():
        raise ValueError("registration refuses an existing table or receipt")
    symbol_library = stage / "CrystalShim_Mains.kicad_sym"
    symbol_table = stage / "sym-lib-table"
    if not symbol_library.is_file() or symbol_table.exists():
        raise ValueError("registration requires a fresh project symbol library and no symbol table")
    symbol_names = {f"Mains_{item['ref']}" for item in manifest["components"] if item['footprint']['pad_numbers']} | {"PWR_FLAG"}
    if len(symbol_names) != 24:
        raise ValueError("expected 23 source symbols and one ERC-only flag definition")
    project = stage / "mains.kicad_pro"
    client = Konnect()
    try:
        client.request("initialize", {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "Crystal Shim initial library registration", "version": "1"}})
        client.send({"jsonrpc": "2.0", "method": "notifications/initialized"})
        client.call("load_toolset", {"name": "library"})
        symbol_inventory = client.call("list_symbols_in_library", {"library_path": str(symbol_library)})
        if symbol_inventory.get("library") != str(symbol_library) or symbol_inventory.get("count") != 24 or sorted(symbol_inventory.get("symbols", [])) != sorted(symbol_names):
            raise ValueError("source-exported symbol library differs from the mains declaration")
        if tree_hashes(stage) != before:
            raise ValueError("symbol inspection changed stage inputs")
        result = client.call("register_footprint_library", {
            "scope": "project", "project": str(project),
            "library_path": str(library), "nickname": "CrystalShim_Mains",
        })
        if result.get("success") is not True or result.get("scope") != "project" or result.get("table") != str(table):
            raise ValueError("Konnect did not confirm the exact project table")
        readback = client.call("list_footprint_libraries", {"scope": "project", "project": str(project)})
        result = client.call("register_symbol_library", {
            "scope": "project", "project": str(project),
            "library_path": str(symbol_library), "nickname": "CrystalShim_Mains",
        })
        if result.get("success") is not True or result.get("scope") != "project" or result.get("table") != str(symbol_table):
            raise ValueError("Konnect did not confirm the exact project symbol table")
        symbol_readback = client.call("list_symbol_libraries", {"scope": "project", "project": str(project)})
    finally:
        client.close()
    entries = readback.get("libraries", [])
    if readback.get("count") != 1 or len(entries) != 1 or any(
        entries[0].get(key) != value for key, value in {
            "nickname": "CrystalShim_Mains", "scope": "project",
            "type": "KiCad", "path": str(library), "uri": str(library),
        }.items()
    ):
        raise ValueError("Konnect project-library readback differs")
    symbol_entries = symbol_readback.get("libraries", [])
    if symbol_readback.get("count") != 1 or len(symbol_entries) != 1 or any(
        symbol_entries[0].get(key) != value for key, value in {
            "nickname": "CrystalShim_Mains", "scope": "project",
            "type": "KiCad", "path": str(symbol_library), "uri": str(symbol_library),
        }.items()
    ):
        raise ValueError("Konnect project-symbol-library readback differs")
    after = tree_hashes(stage)
    if guarded_stage() != stage or identity != (stage.stat().st_dev, stage.stat().st_ino):
        raise ValueError("stage directory changed during registration")
    if any(after.get(path) != digest for path, digest in before.items()) or set(after) - set(before) != {"fp-lib-table", "sym-lib-table"}:
        raise ValueError("registration changed files beyond the new project library table")
    evidence = {"schema_version": 2, "scope": "initial-project-library-registration-only",
                "tool": "Konnect 0.2.1 register_footprint_library + register_symbol_library", "table": "fp-lib-table",
                "tool_sha256": client.executable_sha256,
                "table_sha256": after["fp-lib-table"], "readback": readback,
                "symbol_table": "sym-lib-table", "symbol_table_sha256": after["sym-lib-table"],
                "symbol_readback": symbol_readback, "symbol_inventory": symbol_inventory,
                "symbol_library": {"path": symbol_library.name, "sha256": before[symbol_library.name]},
                "existing_files_unchanged": True,
                "board_id": BOARD_ID, "stage_inputs_sha256": before,
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
