---
name: pcb
description: "Build Crystal Shim PCBs with tscircuit authoritative through schematic, board specification and placement, then KiCad for routing and fabrication. Use for PCB, schematic, component, footprint, placement, KiCad, Konnect, ERC/DRC, Gerber or fabrication work."
---

# PCB workflow

## Authority and current state

`docs/*.md` owns the product requirements. Read `docs/STATE.md` and each board's
`README.md` for current capture, placement and handoff evidence. Controller source
and component models live in `pcb/controller/design`; do not recreate them from
the arbitrary `pcb/fixtures` tooling smoke test. A source model or passing tooling
test does not establish handoff, manufacturing or operating readiness.

The owner selected a one-shot build. Develop the three final-use boards and their
interfaces for one fabrication cycle; do not insert a separate sensor prototype
or planned respin. Front-load reference research, calculations and complete design
review. Physical calibration and load tests occur on the final boards after
assembly, under the stage-specific [release gates](../../../docs/decisions.md).

For each new board, committed tscircuit source will own stable component IDs and
refs; values, pin maps, MPNs, supplier metadata and exact footprints; schematic
connectivity and named nets; outline, dimensions, holes, layers and specifications;
placement, rotation, side and constraints; base silkscreen and adopted viewer edits.
Generated Circuit JSON, previews and initial KiCad seed files are derived outputs.

KiCad owns downstream routes, vias, zones and fills; detailed stackup, impedance,
net classes and custom DRC; special mask/paste/via processes; final silkscreen;
ERC/DRC evidence and production outputs. Declare every KiCad-owned addition in the
board's `design/kicad-augment.json`. Undocumented differences are drift.

## New-board procedure

1. Read the requirements and safety invariants. Resolve any input that affects
   this board before committing a pin map or geometry. Never guess a footprint.
2. Create `pcb/<board>/design/` using the [authoring reference](references/tscircuit-authoring.md).
   Keep exact versions pinned in `pcb/package.json` and `bun.lock`.
3. Record exact parts, pin maps, immutable stable IDs, fixed refs, KiCad footprint
   mappings and expected pad-number sets from authoritative part documentation.
4. Author the schematic and run source, pin, netlist and schematic-placement
   checks before physical placement. Place every part explicitly and commit
   `manual-edits.json` if viewer placement is adopted.
5. Run source validation and inspect schematic and PCB renders. Complete the
   downstream augmentation declaration.
6. Read [handoff](references/kicad-handoff.md), stage the first KiCad seed, validate
   it and adopt it once. Only then create the accepted handoff lock.
7. Load the local [Konnect skill](../konnect/SKILL.md) for downstream work. Apply
   declared cleanup and require strict schematic parity plus clean ERC before
   routing. Use KiCad for production routes, then DRC and fabrication checks.

Read [review](references/review.md) before declaring a design or handoff complete.

## Post-handoff updates

Rebuild and normalize source, then compare the accepted lock to generate an ECO.
Review additions/removals, fields, nets, footprints, moves, rotations, holes,
outline and specifications. Moves/rotations after routing need guarded review;
footprint, layer, hole or outline changes need destructive-change review. Apply
authorized changes through KiCad GUI, verified Konnect or KiCad's native API.
Existing user authorization governs reversible repository changes.

Snapshot routes, vias, zones, graphics, rules and UUID-bound waivers before and
after the ECO. Prove unrelated state is preserved, compare all source-owned
domains against the manifest, run ERC/DRC and inspect renders. Update the lock last.
Import direct KiCad placement adjustments as explicit source proposals; do not
silently accept drift or overwrite a routed board with a new export.

## Protected KiCad files and completion

Do not write `*.kicad_sch`, `*.kicad_pcb`, `*.kicad_pro`, `*.kicad_sym`,
`*.kicad_mod`, `sym-lib-table` or `fp-lib-table` by text manipulation. The approved
exporter may create an initial seed only in staging. Subsequent writes go through
KiCad, verified Konnect or KiCad's native API and must be verified afterward.

Handoff readiness requires source checks, inspected renders, exact footprint/pad
mappings, requirements parity and complete augmentation declarations. Fabrication
readiness requires the routed KiCad review and local
[manufacture skill](../kicad-manufacture/SKILL.md). Passing tooling tests alone
satisfies neither boundary.
