#!/usr/bin/env python3
"""Check local documentation links, skill metadata and commissioning tables."""

import csv
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
errors = []
documents = [ROOT / "README.md", ROOT / "AGENTS.md"]
for directory in ("docs", "bom", "testing", "cad", ".agents/skills"):
    documents.extend((ROOT / directory).rglob("*.md"))
documents.extend(ROOT.glob("pcb/**/README.md"))
documents = [p for p in documents if "node_modules" not in p.parts]
documents.append(ROOT / "firmware/README.md")

for path in documents:
    content = path.read_text()
    for target in re.findall(r"\[[^\]]*\]\(([^\s)]+)\)", content):
        target = unquote(target.strip("<>"))
        if re.match(r"[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
            continue
        target = target.split("#", 1)[0]
        if target and not (path.parent / target).exists():
            errors.append(f"{path.relative_to(ROOT)}: broken link {target}")
    if path.name == "SKILL.md":
        frontmatter = re.match(r"\A---\n(.*?)\n---\n", content, re.S)
        if not frontmatter or not all(
            re.search(rf"^{key}:", frontmatter[1], re.M)
            for key in ("name", "description")
        ):
            errors.append(f"{path.relative_to(ROOT)}: missing skill metadata")

for filename in ("bom/bom.csv", "testing/test-matrix.csv"):
    with (ROOT / filename).open(newline="") as stream:
        reader = csv.DictReader(stream)
        seen = set()
        for number, row in enumerate(reader, start=2):
            if None in row or any(value is None for value in row.values()):
                errors.append(f"{filename}:{number}: inconsistent columns")
            identifier = row.get("ID", "")
            if not identifier or identifier in seen:
                errors.append(f"{filename}:{number}: missing or repeated ID")
            seen.add(identifier)
            if filename.startswith("testing/") and row.get("Result") == "Pass":
                if not all(row.get(key) for key in ("Evidence", "Owner", "Date")):
                    errors.append(f"{filename}:{number}: pass needs evidence, owner, date")

sync = json.loads((ROOT / ".agents/skills/sync/sync-map.json").read_text())
for resource in sync["resources"]:
    if not (ROOT / resource["path"]).exists():
        errors.append(f"sync map: missing local resource {resource['path']}")

for error in errors:
    print(error, file=sys.stderr)
if errors:
    sys.exit(1)
print(f"Documentation checks passed ({len(documents)} documents, 2 CSV tables, sync map)")
