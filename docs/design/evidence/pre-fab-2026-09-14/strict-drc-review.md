# Audit of historically ignored PCB DRC categories

2026-09-14, after publication of the three silkscreens. No production file was
changed. Fresh copies of each complete native project were made under
`/tmp/crystal-prefab-strict-drc/`. Fresh KiCad XML netlists and native PCB API
readbacks supplied the evidence below.

## Capability limitation

The installed KiCad Python binding exposes
`BOARD_DESIGN_SETTINGS.GetSeverity` and `m_DRCSeverities`, but the latter is an
opaque `swig_runtime_data5.SwigPyObject`. It has no wrapped mapping access or
severity setter. No usable wrapped severity enums/setter were found. The verified
SettingsManager save path cannot make an unavailable map mutation possible.
No protected `.kicad_pro` text was edited. Consequently this is an explicit
analytical audit of those categories, **not a claim that a native DRC run with
all five categories enabled passed**. The regular current DRC/parity receipts
remain separate evidence.

The five ignored settings are exactly `footprint_filters_mismatch`,
`footprint_type_mismatch`, `missing_courtyard`, `track_not_centered_on_via` and
`tuning_profile_track_geometries`, on all three boards. No additional ignored
category was introduced or assumed acceptable.

## Findings by category

| Category | Fresh evidence | Disposition for these bare boards and hand assembly |
| --- | --- | --- |
| `footprint_filters_mismatch` | Fresh schematic netlists supplied 113 controller, 16 sensor and 19 mains references with footprint filters. Every filter-bearing reference matches its assigned footprint, including sensor's unqualified item-name filters. | No mismatch found. References without a filter impose no filter constraint. Source/native footprint identity remains covered by the separate parity receipt. |
| `footprint_type_mismatch` | All 99 physical controller footprints, 14 physical sensor footprints and 22 physical mains footprints have native attributes 0. Their actual pads are separately typed SMT/PTH/NPTH. Controller test pads have attributes 14; mounting holes and sensor board features have attributes 28. | The importer left physical footprint type metadata unspecified. This is not a pad/drill fabrication mismatch. The hand-assembly procurement list must use exact refs/MPNs and actual pad geometry, not an SMT-only attribute filter. Do not use these attributes to generate a machine-assembly split. No bare-board redesign follows from this metadata omission. |
| `missing_courtyard` | Only controller H1-H4, mains H1-H4, and sensor E1/J1 have no courtyard-layer graphics. Every physical component has courtyard geometry present. | These exact missing items are mounting holes, fixed sensing copper and the solder-land pigtail. They are not omitted packaged component envelopes. Hole/hardware and cable-strain-relief clearances still belong to the mechanical review. Presence of a courtyard is not proof of its dimensional accuracy or all assembly fit. |
| `track_not_centered_on_via` | Native shape collision plus centerline-distance inspection found two controller F.Cu joins whose contacting tracks lack an exact centered path; detailed below. All other contacted via/layer groups have a centered path within 0.001 mm. No such exception on mains or sensor. | Both exceptions put the complete via copper disk inside a 1 mm trace with positive margin. They are broad copper joins, not tangential or disconnected necks. Exact coordinate coincidence is unnecessary for these two cases. |
| `tuning_profile_track_geometries` | The binding has no `GetGenerators` method. Exact read-only searches of the copied native PCB files found no generated/tuning objects; only the file-level `generator "pcbnew"` metadata. | There is no tuning-profile object whose track geometry could be stale. Actual USB routing geometry is evaluated by its separate routing policy and accepted USB review, not inferred from this inapplicable category. |

The two noncentered joins are:

- Controller V3V3 via **(104.75,82.75)** on a 1 mm F.Cu trace from
  (106.5,82.725) to (103,82.725): axis offset **0.025 mm**. With the 0.6 mm
  via diameter, the full disk has **0.175 mm** minimum lateral enclosure.
- Controller V3V3 via **(118.75,137.25)** on a 1 mm F.Cu trace from
  (118.7,135.95) to (118.7,137.9): axis offset **0.050 mm**. Full-disk lateral
  enclosure is **0.150 mm**.

The audit initially collected all same-net track/via copper contacts, including
adjacent segments that merely overlap a via edge. It then grouped by via and
layer and checked whether any contacting segment passed through the center.
This prevents treating ordinary connected bends as unsupported tangential joins.
The check supplements, rather than replaces, native annular-ring, drill,
clearance, connectivity and copper-sliver checks.

## Reproducibility and exact scope

The scratch audit is `/tmp/crystal-prefab-strict-drc/audit.py`; raw results are
`audit.json` and each copied project's `netlist.xml`. It enumerates all native
footprint attributes/pad types/courtyard graphics and every track/via contact.
These are the inspected PCB hashes:

| Board | SHA-256 |
| --- | --- |
| controller | `8b899306da71ce1b17afd0ab18bb4e7d96edef3adc1743543a294608163e9853` |
| sensor | `fe6298667105e543f876fc5038c5cc83eb03fb228bc9c9813e843e2a0afc7c8e` |
| mains | `2f7dde485c391e9a32bbc67e7dff616bb25a9b33989e7ad31ee7235522f2a335` |

No additional physical fabrication blocker was found in these five categories.
That conclusion is limited to the exact cases above, not a blanket release
waiver for future edits. A native strict-severity report was not obtained because
of the stated binding limitation; this report must not be relabeled as one.
