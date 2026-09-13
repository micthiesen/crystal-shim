#!/bin/sh
# Read-only routing validation. Refill and save in KiCad before visual inspection.
set -eu
cd "$(dirname "$0")/.."
python3 pcb/tools/check_routing_projects.py "$@"
