# Sensor owner routing review, 2026-09-13

Scope: adopt the authorized C3 source placement and review the two changed
B.Cu breakouts. No production native file was modified by the review tools.
This is a working-tree review, not a fabrication acceptance or a new handoff lock.

## C3

Source placement changes from x=6.5 to x=6.75 mm; y=8 mm and rotation 90 degrees
are unchanged. Native placement is x=106.75, y=92 mm. Rebuilt source manifest and
native snapshot pass all source-owned parity comparisons. The 10 sensor source
tests pass; the source placement render was inspected.

## Glass-side connections

Compared with the accepted baseline in commit 3c0c8e6:

- CIN_LEVEL: the old 0.15 mm stub from (100.6,95) to (101.7,95) now continues
  through (103.15,95) to (104.675,96.525). Its extension is contained within the
  existing same-net bar (x=101.5..107.85, y=94.25..98.8 mm); it does not enlarge
  that electrode's copper union.
- SHLD2: the old 0.15 mm stub from (99,97) to (98.3,97) now travels through
  (98.525,96.525) to (95.325,96.525). The long tail overlaps the existing same-net
  bar (x=92.15..98.5, y=94.25..98.8 mm). The diagonal reshapes the short local
  breakout, retaining the same net and via without adding an electrode bar.

Independent electrical review recommends retaining both connections; no electrical
rework is needed based on this geometry and the fresh native clearance checks.
The added tracks remain mask-covered and the relevant vias retain back-side
tenting. A 1 µm grid estimate gives SHLD2 a net local copper-area change of about
+0.0296 mm²; this is numerical screening, not an exact native polygon boolean.
The original stubs already contacted their same-net copper, so these additions
were not necessary to complete missing electrical connections.

## Remaining gate

Fresh `sh scripts/check-routing.sh sensor --final` reports zero native DRC/parity
findings and zero unconnected items, but exits 1 for two changed/missing prepared
breakouts and one undeclared glass-face track category. These are exact-baseline
preservation failures. The old routing-policy geometry and accepted lock remain
unchanged; explicit contract reconciliation and final fabrication review are still
required. The review does not waive these checks or establish measured sensing
performance.

The full development gate `sh scripts/check.sh` passed. Board/source hashes and
review details are recorded in [review.json](review.json).
