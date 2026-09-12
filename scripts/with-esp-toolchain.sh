#!/bin/sh
# Mbed TLS uses Clang for the bare-metal RISC-V C objects. Apple Clang omits
# that backend; prefer the installed Homebrew LLVM only when needed.
set -eu

if ! clang --print-targets 2>/dev/null | grep -q riscv32; then
  if command -v brew >/dev/null 2>&1; then
    crystal_llvm_prefix=$(brew --prefix llvm 2>/dev/null || true)
    if [ -n "$crystal_llvm_prefix" ] && [ -x "$crystal_llvm_prefix/bin/clang" ]; then
      PATH="$crystal_llvm_prefix/bin:$PATH"
      export PATH
    fi
  fi
fi

if ! clang --print-targets 2>/dev/null | grep -q riscv32; then
  echo 'ESP TLS build requires Clang with the riscv32 backend. Install LLVM (brew install llvm on macOS) and put its bin directory on PATH.' >&2
  exit 1
fi

exec "$@"
