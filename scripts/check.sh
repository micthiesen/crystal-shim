#!/bin/sh
# Run from anywhere; each workspace retains its own target and lockfile.
set -eu
cd "$(dirname "$0")/.."
python3 scripts/check_docs.py
(
  cd firmware
  cargo fmt --all -- --check
  cargo clippy --locked --all-targets -- -D warnings
  cargo test --locked
)
(
  cd firmware/app
  cargo fmt --all -- --check
  cargo clippy --locked --all-targets -- -D warnings
  cargo build --locked --release
)
(
  cd pcb
  bun run check
  bun run typecheck
  bun run check:smoke
  bun run test
  bun run test:handoff
)
