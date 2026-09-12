#!/bin/sh
# Run from anywhere; each workspace retains its own target and lockfile.
set -eu
cd "$(dirname "$0")/.."
python3 scripts/check_docs.py
sh scripts/check-tls.sh
(
  cd firmware/partition-tests
  cargo fmt --all -- --check
  cargo clippy --locked --all-targets -- -D warnings
  cargo test --locked
)
(
  cd firmware
  cargo fmt --all -- --check
  cargo clippy --locked --all-targets -- -D warnings
  cargo test --locked
)
(
  cd firmware/app
  cargo fmt --all -- --check
  sh ../../scripts/with-esp-toolchain.sh cargo clippy --locked --all-targets -- -D warnings
  sh ../../scripts/with-esp-toolchain.sh cargo build --locked --release
)
python3 scripts/check_matter_features.py
(
  cd pcb
  bun run check
  bun run typecheck
  bun run check:smoke
  bun run test
  bun run test:handoff
)
