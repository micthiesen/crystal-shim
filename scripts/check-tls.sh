#!/bin/sh
# MbedTLS's supported host backend is Linux. OrbStack can run it from macOS.
set -eu
cd "$(dirname "$0")/.."

case "$(uname -s)" in
  Linux) ;;
  Darwin)
    if command -v orb >/dev/null 2>&1; then
      exec orb -w "$PWD" sh scripts/check-tls.sh
    fi
    echo 'TLS policy checks require Linux with Rust, Clang, libclang and CMake. Run this script there, or configure an OrbStack Linux machine on macOS.' >&2
    exit 1
    ;;
  *)
    echo 'TLS policy checks require the supported Linux MbedTLS backend.' >&2
    exit 1
    ;;
esac

python3 scripts/check_tls_features.py
cd firmware/tls-tests
cargo fmt --all -- --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
