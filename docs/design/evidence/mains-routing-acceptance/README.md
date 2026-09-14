# Accepted mains routing

Owner-approved mains routing is retained with zero DRC/parity findings and zero
unconnected items. Strict ERC, source/native parity and preparation pass.
[run.json](run.json) binds current native inputs, source checks, layer/schematic
renders, independent buck review and guarded handoff acceptance.

The V12_RAW input pour is declared by exact UUID, boundary and settings.
MAINS_FB_SENSE permits 0.8 mm only inside its F.Cu feedback corridor. The reviewed
U2.1 branch is 9.9914 mm long and joins the 2 mm output trunk, away from SW/BST
with continuous B.Cu ground beneath it. Other load-rail widths remain enforced.

The native/GUI change was tested on a separate saved/reopened copy. Every existing
native object and project setting was preserved; only the bounded rule area and
custom rule were added. The owner completed routing before baseline capture.

Native regression suites pass: 35 readiness tests and 20 routing tests.
The full `sh scripts/check.sh` gate also completed successfully on 2026-09-13,
including firmware, TLS, PCB source/tooling and document checks. Native-only
tests skip under its default Python; readiness and routing were exercised
separately with KiCad Python as recorded above.
Shared readiness changes are synced to Stillair in 05eda50. The controller is
next. Final combined pre-fabrication review and physical commissioning remain
pending; this receipt does not release manufacturing outputs.
