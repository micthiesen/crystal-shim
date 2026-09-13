#!/usr/bin/env python3
"""Retired one-off guardrail writer; use the checked native transaction workflow.

The old script inferred geometry from a fixed historical evidence directory and
saved directly into a project. It cannot safely update the current compact boards.
Existing pours, vias and rules are already prepared and need no regeneration.
"""
import sys


def main():
    print(
        "This historical guardrail writer is retired. Use pcb/tools/pcb_workflow.py "
        "begin/plan, an explicit kicad_native.py transaction, then validate/review/accept. "
        "See pcb/tools/README.md. No project files were changed.",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
