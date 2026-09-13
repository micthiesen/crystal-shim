# PCB workflow retrospective

Date: 2026-09-13. Scope: the visual design, compact three-board ECO, native
routing preparation and the tooling work that followed it. This records process
lessons, not a new electrical design or fabrication approval.

## The main correction

We should have agreed on the physical product before spending substantial effort
on placement. The first sensor layout did not express the intended tall, slim
strip. A visual target made the mounting, orientation and wire exit clear much
faster than discussing a populated PCB in isolation.

The useful sequence is now: visual agreement, dimensional contract, source and
native change plan, checked application, complete preparation audit, visual and
electrical review, then one final acceptance. The instructions and
[workflow commands](../../pcb/tools/README.md) encode that sequence. They do not
turn an attractive render into evidence that a circuit will work.

## What worked

- **Visual agreement resolved real requirements.** The sensor became an
  18 × 64 mm adhesive strip entirely below the rim, with its pigtail exiting
  left. The controller and mains became a common 150 × 110 mm stack with aligned
  M3 mounting holes. These decisions are now in canonical mechanical and board
  specifications, with the reference images retained.
- **The source/native ownership split protected routing work.** Tscircuit owns
  circuit intent, parts, board specification and placement. Native KiCad owns
  routes and declared augmentations. Explicit ECO plans and before/after checks
  made it possible to change placement without treating a fresh export as a
  substitute for the adopted board.
- **Actual native checks found problems that source checks could not.** Plane
  fills, USB pair settings, narrow pad escapes, paste openings, internal sensor
  pads, manufacturing metadata and native exclusions all needed saved-project
  inspection. A source test pass was useful evidence, but insufficient by itself.
- **Bounded adversarial reviews were useful.** Reviewing concrete geometry,
  interfaces and verification logic caught omissions without reopening the
  agreed architecture or adding components. A narrow review with a specific
  failure question was more useful than another broad design discussion.
- **Explicit distinctions prevented false completion claims.** Placement
  acceptance, preparation for routing, routed-board fabrication checks and
  physical commissioning remain separate. Unconnected counts are expected at
  this handoff; physical calibration, EMI and thermal performance are unmeasured.

## What cost unnecessary effort

| Friction | What happened | Why it was inefficient | What changes now |
| --- | --- | --- | --- |
| Physical design started late | Board shape and component placement preceded a clear visual agreement | Rework crossed specifications, source, native placement and evidence | Establish the image and exact dimensional contract first |
| GUI used to discover capabilities | Stack settings, custom-rule installation and schematic properties needed UI work | Repeated navigation, focus, clipboard and save operations gave weak machine-readable feedback | Run capability discovery first; use verified helpers where supported |
| Tool success did not mean the requested field changed | Konnect single-component field edits could return success without processing fields | Repeated attempts and manual inspection were needed to find silent failure | Guarded batch replacement, exact semantic comparison and native netlist verification |
| Annotation was mistaken for replacement | Adding an MPN annotation could create another property with the same name | The file then needed cleanup and another authoritative save | Reject duplicate properties and replace existing fields only |
| Native operations lacked a shared lifecycle | Project attachment, fills, saves, UUID selection and readback appeared in task scripts | Each script rediscovered API behavior and could miss a preservation check | A shared project loader and declarative transaction engine |
| Preparation checks came late | Paste, stencil/process details, labels and routing settings were completed in several passes | Each late change could invalidate earlier evidence and require another ECO acceptance | Put the full preparation profile beside the change plan and audit it before acceptance |
| Too many documents carried the same decision | Temporary targets, canonical specs and downstream evidence overlapped | It became harder to tell which statement governed implementation | Images remain references; exact requirements live in canonical documents |
| Evidence was copied repeatedly | Full snapshots and command output appeared in successive evidence directories | Large diffs obscured which inputs were actually validated | Content-addressed evidence objects with a small run index and explicit hashes |
| Tool warnings had ambiguous significance | Source geometry heuristics and native DRC did not model every object the same way | A nonzero status could mean a real placement problem or an inapplicable body model | Preserve the raw finding, bind narrow exceptions exactly and require an independent relevant check |

## Confirmed tool defects and limits

The field-edit behavior was reproduced on a temporary copy of the real sensor
schematic using installed Konnect 0.2.1 and KiCad 10.0.5. Its single-component
editor advertises `fields` but does not process them. Annotation appends instead
of replacing. The batch editor replaces existing fields, but can partially apply
a request and mishandle quote characters. See the pinned source links in the
[Konnect skill](../../.agents/skills/konnect/SKILL.md).

`kicad_schematic.py` now runs that batch tool on a temporary copy, verifies the
entire semantic tree and native net connectivity, rechecks the original hash,
then publishes the verified bytes. Missing fields, duplicate properties,
unsupported characters, partial success and unrelated changes fail before
publication. It requires the actual leaf sheet containing the component.
Reference changes, new fields and symbol exclusion flags are outside this
wrapper's supported subset.

Physical stack serialization and custom-rule installation still have no verified
native writer in this installed toolchain. KiCad's SWIG stack descriptor is
opaque; enabling copper layers is a different operation from setting dielectric
materials and thickness. The inspected Konnect rule-writing operations target
legacy or invalid locations. The CLI can validate the installed adjacent rule
file. For these remaining writes, the documented KiCad GUI procedure remains the
fallback, followed by saved-state verification. This is a known capability gap,
not a reason to try arbitrary protected-file edits.

Testing the new helpers found another source of false confidence: the native
board API's connected-track-width setting is an in-memory value, while the GUI
stores its session choice separately in `.kicad_prl`. Loading and saving the
board did not prove that preference persisted. The engine therefore does not
advertise a router-preference writer. Preparation checks verify the configured
netclasses and rule sizes, and report available GUI preference facts separately.

The sensor's source placement checker also treats the multilayer, copper-only E1
footprint as a top-side connector body. It reports 15 apparent body intrusions,
while its placement DRC reports zero errors and warnings. The workflow records
the original nonzero result and accepts only its exact command/output identity
as a documented checker limitation. Native copper DRC and the preparation audit
must still pass. A changed output requires investigation, rather than silently
inheriting a broad E1 exemption.

## Reusable implementation

| Tool | Responsibility | Deliberate boundary |
| --- | --- | --- |
| `pcb_workflow.py` | Begin, plan, draft simple placement transactions, apply, validate, record review and accept; bind evidence to current inputs | Existing-board ECOs; initial export still uses the established handoff tools |
| `kicad_native.py` | Load the adjacent project, apply explicit UUID-bound operations on a copy, refill, save, reopen and verify before publishing | Supported native operations only; native application is not electrical acceptance |
| `kicad_schematic.py` | Verified replacement of existing leaf-sheet properties through Konnect | No schematic regeneration, net rewiring or new-symbol authoring |
| `pcb_readiness.py` | Audit actual geometry, stack, planes, vias, rules, routing settings, paste, labels and exact exclusions | Preparation for routing, not final connectivity or physical commissioning |
| `tscircuit_handoff.py` | Existing source/native parity, preservation and accepted-lock advancement | Retained compatibility; used by the new lifecycle rather than duplicated |

The native transaction engine handles explicit footprint moves and associated
copper, pad paste settings, supported fields, tracks, through vias, simple zones,
rectangular outlines, board text and supported routing settings. It does not infer
which copper belongs to a moved footprint. The transaction must name those
objects. More complex electrode or footprint replacement still needs a
source-aware identity mapping and review.

Publication across board and project files is not a single atomic filesystem
operation. The engine uses editor checks, input hashes, a transaction lock and
guarded rollback. Known concurrent changes cause failure; an external writer can
still race the last check, so mutation requires the project to be closed.
Read-only auditing can inspect saved bytes while the GUI remains open, but cannot
see unsaved editor changes.

The old `apply_routing_guardrails.py` one-off writer is retired. Its fixed
historical evidence paths and direct publication were not a suitable reusable
entry point for the current compact boards.

## How the next board change should run

1. Agree on the visible form and record exact size, holes, glass/rim reference,
   connector exits, stack access and mounting in the canonical specification.
2. Read the capability report and complete the preparation profile before
   deciding how to apply the change. Identify actual unsupported operations early.
3. Capture the accepted baseline, update source and declarations, then generate
   the full ECO plan. Resolve identity and attached-copper questions before writes.
4. Apply supported changes through checked native transactions and guarded
   schematic batches. Use the verified GUI fallback only for remaining gaps.
5. Run source checks, strict ERC and schematic parity, native DRC, the complete
   preparation audit and separate copper/mask/paste/silk/fabrication-layer renders.
6. Review the actual renders and reports against the agreed contract. Record
   concrete findings, resolve them and advance the accepted lock once.
7. Route using the existing routing guide, then run the final connectivity and
   manufacturing checks. Revalidate whenever the relevant saved inputs change.

This removes repeated setup scripts and silent-success guesses. It does not
eliminate the need for engineering judgment, native visual inspection or the
final physical commissioning tests. Shared helpers and procedures are synced to
Stillair; each project retains its own board profiles and acceptance evidence.

The [tooling validation receipt](evidence/pcb-workflow/validation.json) records
the full project check, focused test results, all three saved-board audits,
actual mutation/rejection tests on board copies and the temporary-copy acceptance
rehearsal. The accepted product native files and comparison locks were preserved.
