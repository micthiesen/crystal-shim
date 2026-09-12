# Current state

Last updated: 2026-09-12

## Now

- The [original full delivery goal](goal.md) remains active: three final-use boards,
  actual ESP firmware, adversarial review, manufacturing delivery and final-unit
  commissioning support. Freshwater, 5 mm glass, the 50 mm physical span, the
  owner's separate snug clip and 203.2 mm harness limit remain fixed. No prototype
  or planned respin is introduced; no fabrication or operating gate has passed.
- [Matter](design/matter-integration.md), private USB identity/first configuration,
  sensor/control bindings, gated storage and the [settings service](design/settings.md)
  are implemented. Settings cover schedules, thresholds, duration, response and
  freshness timings and credentials. Physical calibration workflow remains work.
- [Pushover delivery](design/pushover.md) now captures fresh water edges after
  GPIO output and uses the shared ESP network. Eight RAM events expire after 15
  minutes, with at most three attempts. Each attempt uses a borrowed
  [TLS interval lease](design/tls-restriction.md) with one original 20-second
  certificate horizon and immediate authority/configuration cancellation.
- [UTC intervals](design/utc-intervals.md) and conservative scheduling are reviewed.
  CASE/USB retain their point-clock contract. The offline signed-time verifier
  still needs provider agreement, drift policy and unattended app acquisition.
  Interval TLS support does not establish a new time authority.
- The [controller](../pcb/controller/design/README.md) has 95 electrical parts,
  99 footprints and checked 70 x 110 mm placement. The complete native-save
  connectivity proof and strict schematic cleanup gate pass in the saved copy.
  Native augmentation, enclosure/mated fit and routing remain work. No production
  board or handoff lock is adopted.
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

The [review log](design/review-log.md) records scope and corrections. Clock
withdrawal now revokes TLS before control consumes the mailbox update; either
checked mailbox counter's exhaustion also closes network authority. Normal reads
and transport failures retain their source epoch. Independent core and app review
found no additional actionable authority/lifetime issue after the fixes.

Accepted settings replacement now cancels old delivery work before durability,
while keeping the old committed configuration authoritative for storage recovery.
A failed save keeps delivery paused until a later revision commits. API rejection
suspension survives unrelated settings edits. Independent re-review is clean;
actual Runtime/Queue tests cover delay, failure, recovery and stale completion.

The actual app worker is compiled in the existing Linux TLS harness with the
pinned network interfaces, mock timer and in-memory DNS/TCP/socket fakes. Tests
cover cancellation during DNS/TCP/TLS, socket drop before queue/lease cleanup,
clock revocation before further I/O and accepted-config pause without retry. They
use the unchanged production connector and open no network port. HTTP buffer
wiping and partial-write behavior are covered separately in the pure crate.
The 193 preexisting TLS-lock package identities/checksums remain unchanged; host
network interfaces add 148 packages without changing the embedded dependency graph.

The final full project gate passes, including 157 core, 20 Pushover and 29 TLS/
lease/actual-worker tests, the existing full-handshake matrix, the embedded image,
116 PCB tests / 23,670 assertions and 36 shared handoff tests. Other host/UI checks
also pass. Counts and scope are in [the review log](design/review-log.md); the log
is `/tmp/crystal-shim-notifications-final-full-check.log`.

Current linked size and evidence are in [Pushover delivery](design/pushover.md).
The sender's handshake path is now linked, but static totals do not establish
runtime heap peaks, stack high-water or control cadence under RF load. No live API
request, real serial device, hardware flash or mains action was used.

The [native source/save proof](design/controller-grid.md) still rewrites all eight
sheets while preserving components, library definitions, 71 nets and 274 complete
pin memberships. The saved copy reports no ignored categories or ERC findings at
error, warning and exclusion severities. Its stage has 427 wires, seven added
branch dots and 216 unrouted items. That is not a routing/fabrication release.

## Next

Implement the pure signed-time agreement coordinator in
[the unattended-time design](design/unattended-time.md), then review its trust and
timing boundaries before app acquisition. The verifier and interval/TLS consumers
now exist; owning both requests inside one bounded round prevents fabricated or
cross-round samples from entering agreement. Require two distinct pinned providers,
project to one original receive capture, require overlap, retain the hull and cap
its width at 20 seconds. Caller-supplied rate/quantization and round deadline remain
explicit; this slice must not silently select a production drift bound or enable
unattended requests. It is substantial, has no hardware prerequisite, and unblocks
unattended G-05 behavior.

Continue native controller augmentation/mated fit and complete mains schematic
integration as independent G-02/G-03/G-04 work. Final calibration and commissioning
remain required under the same full delivery goal.

## Candidates not chosen

- **Freeze sensor geometry:** substantial G-02 work awaiting the existing rim datum;
  sensor regulation/interface capture remains independent.
- **Controller augmentation and mains mated fit:** substantial, startable design
  work. Native augmentation and occupied/mated poses need evidence; neither
  header-only boxes nor a conditional MOV reserve prove fit. This remains a
  parallel hardware priority, not a hardware-measurement dependency.
- **Enable unattended UDP acquisition directly:** source agreement and explicit
  drift/deadline/execution-context policy must precede app adoption. The pure
  request-owning round is the next bounded dependency.
- **Route or release fabrication now:** native augmentation, complete design review
  and mated fit remain prerequisites; strict schematic ERC cannot replace them.
