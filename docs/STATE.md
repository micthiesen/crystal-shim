# Current state

Last updated: 2026-09-12

## Now

- New scope: [future refill attachment reservation](design/refill-expansion.md),
  referencing the external Executor artifact without importing its full spec.
  GPIO1/2/3, a separate bus, hardware inhibit and protected 50 mA electronics target
  are reserved as requirements. No source/native circuit has changed; controller
  capture/ECO, power closure and connector fit are required before routing/order.
  Later pump drivers and their separate isolated supply remain extension work.
  Independent interface review completed; `sh scripts/check.sh` passed after this
  documentation change. Physical expansion capture and hardware tests remain open.

- The [original full delivery goal](goal.md) remains active. This is one fabrication
  cycle for three final-use boards, actual ESP firmware and final-unit commissioning.
  No fabrication or operating gate has passed; all 34 commissioning rows remain
  Not run and the [BOM](../bom/bom.csv) is not ready to order.
- [Matter](design/matter-integration.md), sensor/control bindings, gated storage,
  private first configuration, [settings](design/settings.md) and the bounded
  [Pushover worker](design/pushover.md) are implemented. Physical calibration and
  runtime memory/timing evidence remain open. [Signed-time agreement](design/unattended-time.md)
  is implemented and independently reviewed offline; acquisition, clock bounds,
  execution policy, generation coupling and app adoption remain work.
- The [controller](../pcb/controller/kicad/README.md) is adopted with 95 electrical
  parts, 99 footprints, strict eight-sheet ERC/parity and partial native rules/stack
  readback. It remains unrouted, with zero ordinary DRC findings and 216 unconnected
  items in the last native report. Remaining augmentation, mated fit and fabrication
  are open. No adopted controller file changed in this session.
- [Mains source](../pcb/mains/design/README.md) captures all 23 parts, 66 logical
  pins, 14 nets, 81 numbered lands, five NPTHs and the 135 x 75 mm placement.
  In-memory initial PCB/schematic preparation is implemented and reviewed.
  [Guarded staging and native helpers](design/mains-native-handoff.md) are now
  implemented and host-tested, but the real native helper chain has not run.
  The [thermal/stencil proposal](design/mains-thermal-stencil.md) and integrated
  augmentation draft are saved. Final independent reviews were interrupted and
  remain pending; no mains stage, adoption, routing or fabrication is accepted.
- The [enclosure](design/mains-enclosure-fit.md), [J3 housing study](design/mains-j3-occupancy.md)
  and [sensor harness study](design/sensor-harness.md) provide conditional nominal
  allocations. Full mated J3 metal/crimp/wire occupancy, guard/retention, carrier,
  cable restraint and qualified assembly processes remain open.
- Freshwater, 5 mm glass, a 50 mm physical sensing span, the owner's separate snug
  clip and 203.2 mm complete harness limit remain fixed. The already-pending owner
  question is the normal-full water distance below the glass top edge. The
  38 x 86 mm proposal with 11-50 mm travel is not accepted sensor geometry;
  do not repeat the question or make other work depend on it.

## Next

Close the [refill attachment interface](design/refill-expansion.md#closure-before-the-present-board-order)
in controller source and a guarded ECO before controller routing. This narrowly
adds physical expansion provisions; do not implement the refill feature. The
existing mains staging task below can continue independently because pump power
will not use the present mains board.

Finish independent review of the saved mains thermal/stencil proposal, integrated
augmentation and staging wrapper/native helpers. Reconcile initial ignored-check
categories with the installed KiCad defaults and actual mains evidence, then add
the package commands and run the guarded product stage with source/native parity,
ERC/DRC and full-page visual review. Only actual adoption creates a handoff lock.

This continues the previous G-02/G-03/G-04 step: source capture and host staging
are ready, while native validation and mated fit remain. Start from
[the native handoff sequence](design/mains-native-handoff.md) and
[thermal contract](design/mains-thermal-stencil.md); neither depends on fabricated
hardware or the pending sensor rim measurement. Complete mated J3 occupancy and
controller augmentation remain useful independent work.

## Candidates Not Chosen

- **Freeze sensor geometry:** still needs the existing rim datum; sensor interface
  and harness work can continue independently.
- **Enable unattended time acquisition:** the offline agreement is ready, but clock
  bounds, generation coupling and control availability during crypto precede adoption.
- **Route or release boards now:** complete native constraints and mated fit still
  precede routing/release. Host tests and partial native rules do not close those gates.

## Learned Recently

- [Mains thermal/stencil](design/mains-thermal-stencil.md): exact two-layer via,
  copper and twelve-aperture proposal; normal loss is small, startup/fault heating
  remains conditional and requires transient evidence.
- [Isolation basis](design/mains-design-basis.md#pcb-partition-spacing-and-physical-basis):
  all eight isolated nets and unused primary metal now explicitly receive the barrier.
- [Native preparation](design/mains-native-handoff.md#guarded-staging-implementation):
  source-bound exclusive staging, native receipt expectations and the omitted shared
  origin fingerprint correction; product native execution is still pending.
- [Review log](design/review-log.md) and [session receipt](design/evidence/mains-native/staging-preparation.json):
  completed checks, initial findings and unfinished follow-up review scopes.
- [Controller stack](design/controller-stackup.md): saved header/stack total is
  1.6062 mm, with unqualified mask/loss defaults; source 1.6 mm is nominal ordering data.
