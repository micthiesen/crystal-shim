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
- [Mains capture](../pcb/mains/design/README.md) has 22 parts plus a conditional
  MOV region in a 23-part, 135 x 75 mm [placement proposal](design/mains-placement.md).
  MOV occupied pose, mated connector/partition/enclosure access, complete schematic
  and native handoff remain work. The [BOM](../bom/bom.csv) is not ready to order;
  all 34 commissioning rows remain Not run.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing TI dry-reference geometry. An asynchronous question is already
pending. The 38 x 86 mm proposal puts a 10 mm dry band below the rim and permits
11-50 mm surface travel; it is not accepted geometry. Other work is independent.

## Verification and recent learning

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
31 Roughtime tests, the existing TLS/actual-worker suite, 116 PCB tests with 23,670
assertions and 38 shared handoff tests. The same 38 handoff tests pass in Stillair.
Log: `/tmp/crystal-shim-adoption-agreement-full-check.log`. Native cleanup, stack/
rule readback, preservation, DRC and current top-render inspection also pass within
the partial scope above. No physical hardware, live notifications or mains actions
were used; firmware runtime memory/timing and all commissioning criteria remain open.

## Next

Resolve RV1's actual occupied pose and source footprint, then integrate the complete
mains schematic and its reviewed placement. This advances G-02/G-03/G-04 and removes
the conditional component from the remaining full board capture. It is substantial
and needs primary drawing/assembly evidence, not fabricated hardware or the pending
sensor rim measurement. Start from [the mains placement](design/mains-placement.md)
and [component source](../pcb/mains/design/README.md); preserve the independent
mains/isolated-low-voltage barrier and off-board fuse/filter/PE scheme.

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
