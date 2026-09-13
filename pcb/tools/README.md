# PCB tools

The three compact production boards are adopted native KiCad projects. These tools
coordinate source changes, native preparation and review without replacing owner
routing with a fresh export. Current project receipts are in [STATE](../../docs/STATE.md).

## One checked change lifecycle

Agree on the visual direction before detailed placement, then record dimensions,
mounting, connector directions, layer roles and assembly limits in canonical specs.
Keep images as references; they do not select circuitry or exact component geometry.
Define every required preparation check before assigning implementation so paste,
service labels and export requirements do not reopen an otherwise finished handoff.

| Stage | Result |
| --- | --- |
| `doctor` | Installed capabilities and project configuration are checked before choosing an automation path. Unsupported operations stay explicit. |
| `begin` | Retains the adopted lock, native file hashes and before snapshot. Begin before editing the native project. |
| `plan` | Rebuilds source, compares the accepted baseline and records the complete target/ECO with its input hashes. |
| `draft-transaction` | Drafts same-side placement changes only and rejects every other plan change. Review associated track/via/zone UUIDs explicitly. A draft is not application or acceptance. |
| `apply` | Runs the supported native transaction against the bound before state, saves and reopens the candidate, then verifies saved readback. |
| `validate` | Runs source checks, strict ERC, source/native parity, fresh native DRC, the complete preparation profile and fresh renders. It does not modify production native files. |
| `review` | Records actual inspection of the current validation/renders across visual contract, schematics, placement/copper and assembly/process. |
| `accept` | Rechecks current inputs, complete checks and resolved review, then advances the existing handoff lock once. |
| `status` | Reports the retained stage; a prior success does not excuse changed inputs. |

The coordinator is `pcb_workflow.py`; run `python3 pcb/tools/pcb_workflow.py --help`
for its current flags. `begin` through `accept` coordinates an ECO to an adopted
source/native handoff. First adoption still uses the staged `tscircuit_handoff.py`
export and acceptance path. A standalone `validate` can audit an existing configured
board but cannot invent the baseline and plan needed for acceptance.

Review can be performed by the agent or owner within existing authorization. The
review record names the reviewer, binds the exact validation object and records
concrete findings/evidence in all four scopes. The tool cannot inspect a picture
or resolve an electrical question on the reviewer's behalf. Apply corrections,
validate again and review the new evidence before final acceptance. Tool failures
and unsupported capabilities do not create new permission gates.

The review JSON has this shape. Replace each placeholder with actual inspection
findings and the current `validation` value from `run.json`:

```json
{
  "validation": "<current validation object SHA-256>",
  "reviewer": "<reviewer name>",
  "scopes": {
    "visual_contract": "<visual and dimensional findings>",
    "schematics": "<schematic and electrical findings>",
    "placement_and_copper": "<placement and layer render findings>",
    "assembly_and_process": "<paste, labels, stack and order findings>"
  },
  "unresolved_findings": []
}
```

## Evidence and configuration

A run has a small `run.json` index and `objects/<sha256>.json` evidence objects.
Identical retained JSON content shares an object within that run. Keep the index,
referenced objects and reviewed renders together. Do not copy repeated full
snapshots into successive closure reports or substitute a bare `passed: true`.
The coordinator binds source, native project files, canonical contracts, reference
images, profiles and checker code. A changed input or modified evidence invalidates
stale validation/review. Canonical docs describe the current target; STATE points to
the current acceptance and remaining routing/commissioning work.

`pcb/workflow.json` and `pcb/tools/readiness-profiles.json` are project-owned.
They select board paths, source commands, specification/image inputs and exact
preparation requirements. They are not shared copies. A missing or unsupported
profile is an explicit configuration failure, never a skipped audit or inherited
permission to use another board's limits.

A reviewed source-checker limitation, when a project needs one, binds the exact
command, nonzero exit code, stdout digest and stderr digest. Its raw failure and
reason remain in the evidence, with required native counterchecks. Any changed
output fails closed. This is an accounted-for checker limitation, not a clean source
check or permission to ignore further findings. Never inherit another project's
limitation record.

`pcb_readiness.py` performs read-only checks of geometry, physical stack, planes,
vias, native rules, routing policy, paste, labels and declared exclusions. It uses
native geometry plus saved settings where SWIG lacks a readable API. Profiles
must declare all supported check categories. Project callbacks retain specialized
checks without embedding product rules in the generic engine. This is preparation
validation, not zero-unconnected routed acceptance or physical commissioning.
Inspect the declared assembly/export contract during final review as well.

## Verified write helpers and limits

Prefer a supported helper over GUI repetition or a new board-specific script.
Discover capabilities first and test uncertainty on explicit scratch copies.
Never infer support from the name of a tool or from a success flag alone.

| Operation | Supported path and limit |
| --- | --- |
| Footprint moves and associated copper; rectangular outlines | `kicad_native.py`, with UUID-bound from/to geometry and explicitly associated items. |
| Pad paste, existing footprint fields, labels | Verified native transaction operations with saved readback. |
| Straight tracks, through vias, simple zones | Verified native operations; complex zone holes, blind/buried/microvias and arbitrary geometry are not implied. |
| Existing netclass sizes | Verified native settings operation; netclass assignment changes are not currently supported. |
| Interactive router preferences | No verified native writer. The in-memory board settings do not prove the GUI session preference was saved in `.kicad_prl`. |
| Existing schematic Value, MPN, Description, Datasheet and Footprint | `kicad_schematic.py`, one explicit leaf sheet and existing string properties only. |
| Schematic Reference rename, new properties, BOM/position/DNP flags | Not supported by the schematic bridge. Use an independently verified operation or the GUI and recheck parity. |
| Physical stack materials/thickness | No verified automated writer in these helpers. KiCad 10 SWIG exposes an opaque stack descriptor; enabling layers does not set the physical stack. |
| Custom-rule file installation | No verified native installer in the helper. Use the supported GUI path; native CLI DRC verifies the installed adjacent rules. |
| Footprint replacement | Not implemented by the generic native transaction. Requires source-aware footprint/pad identity mapping and a verified application path. |

Read exact operations with:

```sh
sh pcb/tools/kicad_python.sh pcb/tools/kicad_native.py capabilities
python3 pcb/tools/kicad_schematic.py --help
```

Use `sh pcb/tools/kicad_python.sh pcb/tools/kicad_native.py inspect --board PATH`
to obtain UUIDs, exact current states and input hashes without writing a discovery
script. The returned saved state supplies transaction `from` values.

Native transactions bind every project input in `before_files`, preflight the whole
batch, load the actual project settings, fill, save and reopen a scratch candidate,
and compare each requested result and saved readback before publication. Native publication replaces files
individually; it is not atomic across a project. Transaction/editor locks and stale
hash checks protect known concurrent changes. Keep the project closed during an
apply. A publication failure attempts guarded rollback and retains recovery files
when it cannot restore safely. Read the reported state instead of retrying blindly.
A native-application receipt alone does not prove electrical correctness, DRC or
acceptance; the external validator and workflow gates establish those separately.
A supplied validator must return an object with `passed: true` and no unresolved
`errors` or `findings`, or raise on failure; an isolated false result cannot authorize
publication.

Schematic batches use Konnect's local stdio MCP binary, not an external account.
The wrapper runs the batch on a scratch leaf, verifies every requested property
and the entire semantic tree, compares fresh native net connectivity, and atomically
publishes only verified Konnect-produced bytes. It refuses ambiguous/duplicate
properties, missing fields, partial results, stale inputs and unexpected changes.
Quotes, backslashes and control characters in edited old/new values are deliberately
unsupported while the installed upstream string handling remains unsafe.

Example request for an existing leaf property:

```json
{
  "schema_version": 1,
  "before_sha256": "<SHA-256 of the current leaf schematic>",
  "edits": [{"reference": "J1", "fields": {"MPN": "NEW-PART-NUMBER"}}]
}
```

Pass this JSON to `kicad_schematic.py leaf.kicad_sch request.json --receipt receipt.json`.
Use `--konnect-command` and `--kicad-cli-command` with JSON argv arrays to select the
installed executables. A root schematic containing hierarchical sheets is not the
leaf containing a component. All wrappers use argv arrays rather than shell code.

The [shared Konnect skill](../../.agents/skills/konnect/SKILL.md#choose-the-write-path-before-implementation)
links the inspected 0.2.1 implementation: single-component `fields` are ignored,
annotation appends duplicate keys, batch edits can partially succeed or corrupt
quoting, and design/layer-rule setters write the wrong KiCad 10 locations. These
are measured limits, not reasons to repeat the same failing calls.

## Crystal Shim configuration and checks

`pcb/workflow.json` configures `controller`, `mains` and `sensor`, with their own
readiness profiles and canonical contracts. Keep capability evidence separate from
the new empty run directory required by `begin`:

```sh
python3 pcb/tools/pcb_workflow.py doctor controller --run /tmp/crystal-shim-controller-capabilities
python3 pcb/tools/pcb_workflow.py begin controller --run /tmp/crystal-shim-controller-eco
```

For a standalone read-only current-board audit:

```sh
python3 pcb/tools/pcb_workflow.py validate controller --run /tmp/crystal-shim-controller-audit
```

Choose a new run directory for a separate task. The command shape is
`pcb_workflow.py COMMAND BOARD --run PATH`; `draft-transaction` and `apply` take
`--transaction JSON`, and `review` takes `--review JSON`. For an ECO, begin before
native changes, update source/specs, plan, apply, validate and review the same run,
then accept. `plan --allow-routed-eco --allow-routed-placement` records the guarded
changes already authorized for that task; these flags do not create authorization.
Do not claim a GUI-only operation was applied by an unsupported helper.

The sensor has one exact recorded tscircuit placement limitation: copper-only E1
is treated as a top-side component body, producing 15 body-intrusion findings
across its whole multilayer bounding box. The workflow preserves that raw nonzero
result and requires the exact command/output hashes plus native copper DRC and
the layer-aware readiness audit. Sensor source placement is not reported clean.
A new or changed diagnostic stops validation for review.
The routing-preparation workflow allows expected unrouted connections. Owner routing
still uses `sh scripts/check-routing.sh [board]`; `--final` requires none remaining.
Final manufacturing review and the board output profile remain separate gates.

The generic tools and tests are exact shared copies with Stillair. Existing
`STILLAIR_HANDOFF_*` environment names and synthetic `pcb-03` test identities are
compatibility names, not Crystal Shim board definitions. Runtime/project profiles
and TypeScript fixture selection remain local.

Run `sh scripts/check.sh` for the project gate. The focused stdlib suites are:

```sh
python3 -m unittest discover -s pcb/tools -p 'test_kicad_*.py'
python3 -m unittest discover -s pcb/tools -p 'test_pcb_*.py'
```

Native integration tests need the installed KiCad runtime and exercise scratch
projects. A skipped native test is not native validation; retain actual runtime
results when claiming an operation is verified.

## Lower-level handoff tools

`tscircuit_handoff.py` owns manifest normalization, initial staging, parity,
ECO planning, preservation and lock acceptance. `export_kicad_schematic.ts` exports
every generated sheet while rejecting directory components in filenames.
`kicad_python.sh` selects the macOS KiCad Python/pcbnew runtime.

For real authoring, first create the exact component/board source manifest and
`design/kicad-augment.json` according to the
[authoring reference](../../.agents/skills/pcb/references/tscircuit-authoring.md).
The tool's `normalize`, `stage`, `accept`, `plan`, `snapshot-kicad`, `verify-preservation`
and `verify-schematic-cleanup` subcommands have their own `--help`. Add board build
and export package scripts only when an actual board exists. Export commands
receive `STILLAIR_HANDOFF_STAGE` and must emit generated KiCad files there.

For a source-derived native footprint library created by the export command, use
`stage --staged-footprint-root footprints`. It resolves that relative directory
inside the new stage only after export, rejects missing paths and all symlinks
in or below that root, and
never substitutes installed stock libraries. It is mutually exclusive with
`--footprint-root`. The controller uses per-reference native entries to preserve
all source geometry; see its [export contract](../controller/design/README.md).
Optional footprint `source_geometry_sha256` and `initial_geometry_sha256` fields
bind compiled intent and effective initial geometry. Either digest changing,
appearing or disappearing is a high-risk footprint ECO, like changing its library
identity. Older manifests without them retain their existing behavior.

Native staging and acceptance are currently macOS-only and use `kicad-cli`,
KiCad's footprint libraries and the bundled `pcbnew` Python runtime. Source CI
and mocked Python tests cannot replace that local gate.

After adopting a reviewed initial seed and applying declared schematic cleanup,
run this template from `pcb/`, replacing `<board>` and the actual project paths:

```bash
python3 tools/tscircuit_handoff.py verify-schematic-cleanup \
  dist/<board>/design/design-manifest.normalized.json \
  --augmentation <board>/design/kicad-augment.json \
  --schematic /path/to/current/root.kicad_sch \
  --output /path/to/schematic-cleanup-report.json
```

It derives fresh XML netlist and JSON ERC reports and requires exact references,
values, symbols, footprints, MPNs, datasheets, pins and nets. This before-routing
gate enables reporting of errors, warnings and excluded findings, requires proof
of all three severities in the report, and rejects every ignored check even when
initial staging declared it. No excluded finding may remain. The accepted lock is
byte-bound to every staged `.kicad_*` file in the handoff receipt. Never re-export
over a routed project; use a reviewed ECO and verify preserved KiCad state.

No Stillair motor migration, legacy placement planner or `jlc_fab.py` profile is
included. Add board-specific fabrication tooling only after the routed-board
review and order contract exist.

### Accept an applied native ECO

`accept-eco` advances an existing handoff lock after a native ECO. It does not
export a replacement board or manufacture an initial-stage receipt. First retain
the before snapshot and generate an explicit unblocked `plan` against the existing
lock. Apply the ECO through the native workflow, then generate its after snapshot
with the target manifest and augmentation.

Run `verify-schematic-cleanup` again after the final native save. Its current
receipt binds the target manifest/augmentation, complete native file hashes,
strict schematic semantics and the ERC report. Older cleanup receipts without
these fields cannot authorize ECO acceptance. Saved `.kicad_pro` ERC settings
must have no ignored checks or exclusions. The board, root schematic and project
must share one basename and directory.

```sh
pcb/tools/kicad_python.sh pcb/tools/tscircuit_handoff.py accept-eco target.json \
  --augmentation kicad-augment.json --lock handoff.lock.json \
  --plan eco-plan.json --before-snapshot before.json --after-snapshot after.json \
  --board project/controller.kicad_pcb --schematic project/controller.kicad_sch \
  --cleanup-receipt cleanup.json --receipt eco-receipt.json \
  --render project/review.svg --render project/review.pdf --render project/board.png
```

The command revalidates all old lock checksums, reconstructs the plan, reads the
actual saved board through `pcbnew`, checks strict source/schematic parity and
reuses `verify-preservation` logic. Routed changes require the same explicit
`--allow-routed-eco` / `--allow-routed-placement` flags used for planning.
Additional snapshot rule files use repeatable `--rules`; the matching project
and optional `.kicad_dru` are included automatically. Use the same rule-file
selection as the after snapshot.

`--render` is repeatable and optional; supplied nonempty render files must reside
under the native project directory and their actual hashes are recorded. Their
presence records review artifacts, not a claim of human visual acceptance. Native
DRC, rendering and physical review remain the separate project handoff gates.
The receipt includes the previous lock digest, plan, before/after digests,
cleanup receipt digest, native file hashes and preservation result. The updated
lock retains `initial_handoff_receipt_sha256` and adds `eco_receipt_sha256`.
No native file is written. Failed validation leaves the comparison lock unchanged.

## Routing guardrails

`sh scripts/check-routing.sh [controller|mains|sensor]` runs fresh copper DRC,
schematic parity and complete narrow-segment checks. Add `--final` to require
zero remaining connections. See [the routing guide](../../docs/design/routing-guardrails.md).

Run `sh pcb/tools/kicad_python.sh pcb/tools/test_native_routing_rules.py` for the
scratch-project negative DRC tests, and `sh pcb/tools/kicad_python.sh -m unittest
discover -s pcb/tools -p test_check_routing.py` for geometric/native audit tests.
The historical `apply_routing_guardrails.py` writer is retired and exits without
changing files. Use the explicit native transaction lifecycle above for a new ECO.

## Tool verification

The repository check runs the host failure tests. Native behavior is verified
separately with scratch-only tests:

```sh
sh pcb/tools/kicad_python.sh pcb/tools/test_kicad_native_integration.py
sh pcb/tools/kicad_python.sh -m unittest discover -s pcb/tools -p test_pcb_readiness.py
```

The integration suite creates its fixture using native KiCad APIs and tests
actual saves, reopen/readback, requested changes, failed validation and
preservation. Host-only runs cannot establish those claims. The retrospective
and remaining capability gaps are recorded in
[PCB workflow retrospective](../../docs/design/pcb-workflow-retrospective.md).
