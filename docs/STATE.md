# Current state

Last updated: 2026-09-12

## Now

- The [original full delivery goal](goal.md) remains active: three final-use boards,
  actual ESP firmware, adversarial review, manufacturing delivery and final-unit
  commissioning support. Freshwater, 5 mm glass, the 50 mm physical span, the
  owner's separate snug clip and 203.2 mm harness limit remain fixed. No prototype
  or planned respin is introduced; no fabrication or operating gate has passed.
- [Matter](design/matter-integration.md), private USB provisioning, sensor/control
  bindings and gated storage are implemented. The [settings service](design/settings.md)
  now edits schedules, thresholds, duration, all four response/freshness timings
  and credentials. It preserves measured calibration and durable maintenance.
  Physical calibration workflow and first-configuration encoding remain work.
- [UTC intervals](design/utc-intervals.md) and conservative scheduling are reviewed.
  CASE/USB retain point observations. The offline signed-time verifier still needs
  source agreement, drift policy and unattended acquisition integration.
  The [TLS restriction](design/tls-restriction.md) passes real Linux handshakes;
  the app still sets the extra policy to None. Interval operation leases and the
  live Pushover transition worker remain work.
- The [controller](../pcb/controller/design/README.md) has 95 electrical parts,
  99 footprints and checked 70 x 110 mm placement. The new USB schematic preserves
  all source/PCB/native identities through actual KiCad Save. USB and module page
  defects are fixed, and the stricter before-routing schematic gate passes in the
  saved copy. Native augmentation, enclosure fit and routing remain work.
- [Mains capture](../pcb/mains/design/README.md) has 22 parts plus a conditional
  MOV region in a 23-part, 135 x 75 mm [placement proposal](design/mains-placement.md).
  MOV body datum, mated connector/partition/enclosure access, complete schematic
  and native handoff remain work. Follow-up references establish larger Sabre
  housing depths and a qualified MOV X datum; occupied/mated poses remain unresolved.
  The [BOM](../bom/bom.csv) is not ready for ordering; all 34 commissioning rows
  remain Not run. No production board or handoff lock is adopted.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing TI dry-reference geometry. An asynchronous question is already
pending. The 38 x 86 mm proposal puts a 10 mm dry band below the rim and permits
11-50 mm surface travel; it is not accepted geometry. Other work is independent.

## Verification and recent learning

The integrated project gate passes with 141 core, nine driver, one CLI, 59
Matter/provisioning, 18 signed-time and 31 settings tests; three partition tests;
26 Node UI and three settings feature-guard tests. Linux TLS passes 13 provider
tests, eight accepted and 50 rejected full handshakes, two pre-I/O resumption
rejections, one canceled Pending handshake, E0515 borrow regression and four
provenance/registry regressions. PCB checks pass 116 Bun tests / 23,670 assertions
and 36 shared handoff tests. Evidence: `/tmp/crystal-shim-module-strict-full-check.log`.

Independent timing settings, USB/module topology and strict cleanup-gate delta
reviews found no remaining actionable findings. Previous Off-ordering, UTC interval
and TLS reviews remain recorded in
[the review log](design/review-log.md). The timing page passed real-browser
save/refetch and freshness-floor checks against synthetic data. These are scoped
reviews and host/browser evidence, not final-unit performance or project completion.

The [native source/save proof](design/controller-grid.md) rewrites all eight sheets
and preserves every component, library definition, 71 nets and 274 complete pin
memberships. The latest saved copy has no ignored categories or ERC findings at
error, warning and exclusion severities. The shared cleanup command now rejects
initial-only ignores, requires excluded findings to be reported and rejects them.
A regression fails against the prior permissive gate; both peer suites pass 36
tests. The current stage has 427 wires, seven added branch dots and 216 unrouted
items. The complete A3 module page was inspected with its former label/frame
crossings resolved. No board or lock is adopted.

The current C6 ELF SHA-256 is
`8ccf75f857532380a7881bb47f741cd655304bf05fc5d8253052035f7c895fe4`:
text 2,081,318 / data 25,164 / BSS 253,824 bytes. RAM execution is 80,392 bytes,
static SRAM excluding stack 359,380 bytes, and linker stack region 92,728 bytes.
This is linked-image evidence, not peak memory or simultaneous network-load margin.
No parts were purchased, hardware flashed, mains energized or notifications sent.

## Next

Implement first-configuration creation, offline validation and one-shot USB CONFIG
sending in the existing `matter-provision` host tool. This moderate firmware slice
unblocks the local settings workflow and G-05 commissioning without hardware.
The implementation has started with disjoint ownership. Reuse the production
codec/private-file/serial seams, revision 1 and generated settings token; leave
calibration, schedules and Pushover absent. Require matching durable completion,
preserve ambiguous outcomes and never retry or exit maintenance automatically.

Continue native controller augmentation/mated fit and complete mains schematic
integration as independent G-02/G-03/G-04 work. Interval authority/operation leases,
Pushover and physical calibration workflow remain required under the same goal.

## Candidates not chosen

- **Freeze sensor geometry:** substantial G-02 work awaiting the existing rim datum;
  sensor regulation/interface capture remains independent.
- **Controller augmentation and mains mated fit:** substantial hardware-design work,
  startable without final boards. Native process details and source dimensional
  gaps need closure; neither header-only boxes nor a conditional MOV reserve prove fit.
- **Interval TLS and unattended Pushover:** substantial firmware work with authority,
  drift and memory risks. First-configuration tooling closes an earlier owner-facing
  setup dependency; signed time and notification delivery remain independent work.
- **Route or release fabrication now:** native augmentation, complete design review
  and mated fit remain prerequisites; strict schematic ERC alone cannot replace them.
