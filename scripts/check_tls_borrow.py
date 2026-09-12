"""Require the real vendored API to reject a verifier escaping its borrow."""

import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT / "firmware/tls-tests"
result = subprocess.run(
    ["cargo", "check", "--locked", "--features", "compile-fail-tests", "--example",
     "restriction-borrow-escape", "--message-format=json"],
    cwd=WORKSPACE, text=True, capture_output=True,
)
errors = []
for line in result.stdout.splitlines():
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        continue
    if event.get("reason") == "compiler-message":
        message = event["message"]
        if message["level"] == "error":
            errors.append(message)
if result.returncode == 0 or len(errors) != 1 or errors[0].get("code", {}).get("code") != "E0515":
    raise SystemExit("TLS borrowed verifier compile-fail test did not produce exactly E0515:\n" + result.stderr + result.stdout)
if not any(span.get("is_primary") and span["file_name"].endswith("restriction-borrow-escape.rs") for span in errors[0]["spans"]):
    raise SystemExit("TLS lifetime diagnostic did not point to the intended regression")
print("TLS verifier cannot escape its borrow (expected E0515)")
