# Current state

Last updated: 2026-09-12

## Now

- The [original full delivery goal](goal.md) remains active: three final-use boards,
  actual ESP firmware, adversarial review, manufacturing delivery and final-unit
  commissioning support. Freshwater, 5 mm glass, the 50 mm physical span, the
  owner's separate snug clip and 203.2 mm harness limit remain fixed. No prototype
  or planned respin is introduced; no fabrication or operating gate has passed.
- [Matter](design/matter-integration.md), private first configuration, sensor/control
  bindings, gated storage, [settings](design/settings.md) and the actual bounded
  [Pushover worker](design/pushover.md) are implemented. Settings cover schedules,
  thresholds, duration, response/freshness timings and credentials. Physical
  calibration workflow remains work.
- [Two-provider signed-time agreement](design/unattended-time.md) is implemented
  and independently reviewed. One bounded round owns both requests, preserves
  original captures, requires interval overlap and retains a hull at most 20 seconds
  wide. It remains offline: hardware clock policy, UDP acquisition, generation
  coupling and app adoption remain work. Existing CASE/USB authority and revocable
  [interval TLS leases](design/tls-restriction.md) remain the operating paths.
- The controller is now **adopted** at [pcb/controller/kicad](../pcb/controller/kicad/README.md),
  with its initial handoff lock, repository-local libraries and strict eight-sheet
  schematic cleanup. Its 95 electrical parts, 99 footprints and 70 x 110 mm source
  placement are preserved. Basic rules, USB90 preferences and known stack layers
  are applied with native readback and preservation evidence. It remains unrouted;
  remaining augmentation, mated/enclosure fit and fabrication are open.
- The [sensor harness study](design/sensor-harness.md) provides a 197.95 mm sideways
  route candidate using Alpha 78073 and a LAPP reduced-insert gland. Exact end
  allocations, support height, clip/cable restraint, gland fit and an available
  qualified crimp process remain open. No BOM or sensor placement was changed.
- [Mains capture](../pcb/mains/design/README.md) now integrates all 23 parts and
  the 135 x 75 mm [placement proposal](design/mains-placement.md). Three sheets
  preserve 66 logical pins, 14 nets, 81 lands and ten unused pins. The MOV has
  a [project assembly envelope](design/mov-capture.md), not a manufacturer fit
  guarantee. Initial [native preparation](design/mains-native-handoff.md) now
  corrects origins, PTH mask margins, J5 shape and U2 anchors in memory, with
  stable H1-H4 and a complete source manifest. Product net admission and strict
  J5 physical checks reject incorrect input before correction. The complete
  in-memory schematic path now supplies exact pin types/fields, per-ref symbols,
  ten NC markers, two AC flags and gridded sheets/library. Native registration,
  strict ERC/parity, augmentation, mated fit and handoff remain work.
  The [enclosure candidate](design/mains-enclosure-fit.md) clears the case after
  a 1.5 mm whole-carrier shift, with a reviewed J5 service/portal allocation.
  The [J3 drawing study](design/mains-j3-occupancy.md) gives a conditional
  housing-plastic bound; complete mounted metal/crimp/wire occupancy and
  guard/retention remain open.
  The [BOM](../bom/bom.csv) is not ready to order;
  all 34 commissioning rows remain Not run.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing TI dry-reference geometry. An asynchronous question is already
pending. The 38 x 86 mm proposal puts a 10 mm dry band below the rim and permits
11-50 mm surface travel; it is not accepted geometry. Other work is independent.

## Verification and recent learning

The mains manifest passes shared normalization and binds all 27 initial
footprints, including identified/excluded mounting holes. New admission checks
compare the complete electrical contract with source, drawing and every native
pad/net ID, then validate every J5 land/locator before physical correction.
Independent follow-up closes both original findings, with no actionable residual
within the production path. Fresh manifest/render review also found none. The shared origin matcher
extraction leaves the complete controller manifest byte-identical; no adopted
controller native file changed. The subsequent schematic adapters preserve the
seven generated source artifacts byte-for-byte. In-memory pin, field, NC/grid
and symbol-library preparation is now implemented; native registration,
augmentation and staging/adoption remain work.

Adversarial schematic review corrected native-coordinate rounding in NC/flag
anchors and required exact U1 power-witness placement with the expected label
directly at the pin or through its single wire. A global label elsewhere on the
sheet is insufficient.
Independent topology reconstruction preserves all 66 pins, 14 named nets,
56 connected endpoints and exactly ten unused pins. These are initial graph
checks, not native ERC, adopted-board or fabrication acceptance.

Independent enclosure review reproduced the 1.5 mm carrier-position correction,
0.715 mm board-to-case allowance gap and 14 x 10 mm J5 portal. The moving housing
has 1.45 mm lateral / 0.50 mm vertical allowance clearance. Fixed J3 primary
occupancy retains 9.765 mm to the isolated service volume; full mated geometry
is explicitly unresolved. These are nominal CAD results and proposed assembly
constraints, not physical fit or whole-enclosure isolation acceptance.

J3's dimensioned mating offset gives a maximum 0.970 mm housing south overhang,
conditional on the still-inferred header datum. Its resulting Y45.805 plastic
bound leaves 8.695 mm to the portal with the stated allowances. No centred
housing or installed contact/wire pose is assumed; this does not close mated
primary occupancy.

The complete mains circuit passes independent electrical integration review and
31 scoped tests with 2,662 assertions. Tests exercise a drawn isolation short,
missing load-neutral labels, unused contacts, exact pad datums and four MOV slot/
courtyard rotations. Review corrected the initial MOV courtyard from 28 to 29 mm.
All three actual schematic sheets and the PCB source rendering were inspected.
A temporary four-file KiCad schematic parses and preserves every named-net member
and unused pin; [the receipt](design/evidence/mains-integration/initial-schematic-parity.json)
records hashes. No mains native project has been adopted or routed.

The pinned mains source/netlist/placement commands report zero errors, with 29
pin-metadata warnings and three connector-orientation warnings. The build also
warns about chip reference prefixes and passive reference labels; those labels
are present in the inspected output. Native electrical metadata and mated access
still require review. These warnings are not a clean-ERC or placement-release claim.

The [review log](design/review-log.md) records scope and corrections. The agreement
crate passes 31 tests, plus an independent scratch review with three additional
adversarial tests, 24 physical-clock model combinations and a production public-API
integration test. All 204 existing host package identities remain unchanged.
No unattended source, live time request or app crypto execution context was enabled.

The controller's 113 initial native files were copied and hash-checked before
acceptance. KiCad then saved all eight sheets and relocated both project libraries
to `${KIPRJMOD}`. Strict ERC and exact schematic parity pass. The subsequent
[augmentation plan and evidence](../pcb/controller/kicad/evidence/basic-augmentation/readback.json)
preserve all source-owned and schematic semantics and every unrelated KiCad
category. DRC reports zero ordinary violations and 216 unconnected items.
This is an unrouted board, not a released design.

Independent review caught a shared snapshot bug that omitted thickness on KiCad
10. The checker now reads the design-settings API and fails closed if unavailable;
the regression tests fail on the old implementation. The fix is synced to Stillair.
The native stack and header consistently total 1.6062 mm, including unverified
0.010 mm mask placeholders. Source 1.6 mm remains nominal ordering data. Mask/loss
defaults and fabrication notes remain explicitly open in [the stack contract](design/controller-stackup.md).
The initial lock remains historical provenance; the recorded later augmentation
does not rewrite the initial receipt or claim all operations complete.

`sh scripts/check.sh` passes, including the embedded release build, 157 core tests,
31 Roughtime tests, the existing TLS/actual-worker suite, 225 PCB tests with 31,484
assertions and 38 shared handoff tests. The same 38 handoff tests pass in Stillair.
Current log: `/tmp/crystal-shim-mains-schematic-final-full-check.log`. The controller's
prior native cleanup, stack/
rule readback, preservation, DRC and current top-render inspection also pass within
the partial scope above. No physical hardware, live notifications or mains actions
were used; firmware runtime memory/timing and all commissioning criteria remain open.

## Next

Complete the mains paste/thermal plan and augmentation declaration, then the
guarded stage wrapper and native project-library registration, alongside
complete mated J3 and guard/carrier fit. Source manifest, initial PCB and
schematic graph preparation and the nominal service allocation are now
implemented. This substantial G-02/G-03/G-04 work turns the
verified source into a reviewable KiCad handoff without depending on the pending
sensor rim measurement or fabricated hardware. Start from
[the mains placement](design/mains-placement.md) and
[component source](../pcb/mains/design/README.md); preserve the independent
mains/isolated-low-voltage barrier and off-board fuse/filter/PE scheme. J3's
remaining evidence is the actual header/housing registration and complete
installed metal/crimp/wire envelope; board/enclosure poses remain provisional.

In parallel, establish the explicit clock/error/execution policy for unattended
acquisition and continue controller mated fit/native augmentation. Final calibration
and commissioning remain required under the same full delivery goal.

## Candidates not chosen

- **Freeze sensor geometry:** substantial G-02 work awaiting the existing rim datum;
  sensor regulation/interface capture and the harness study remain independent.
- **Enable unattended acquisition immediately:** substantial G-05 work; offline
  agreement is ready, but justified clock bounds, generation coupling and control
  availability during crypto must precede app adoption. The source audit is recorded
  in the unattended-time design; it found no module-wide ppm/aging guarantee.
- **Route or release controller fabrication now:** remaining native constraints,
  special processes and complete mated fit still precede routing/release. Strict ERC
  and applied basic preferences do not close those dependencies.
