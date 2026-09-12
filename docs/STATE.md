# Current state

Last updated: 2026-09-12

## Now

- The [original full delivery goal](goal.md) remains active: three final-use boards,
  actual ESP firmware, adversarial review, manufacturing delivery and final-unit
  commissioning support. Preserve freshwater, 5 mm glass, the 50 mm physical span,
  the owner's separate snug clip and the 203.2 mm harness limit. No prototype,
  planned respin, fabrication release or operating acceptance is introduced.
- [Matter](design/matter-integration.md), private USB provisioning, sensor/control
  bindings and gated storage are implemented. The [settings service](design/settings.md)
  is linked, including schedule/threshold/duration edits, credential actions,
  durable maintenance, USB token read/rotation and accurate command replies.
  Calibration/timing form controls and first-configuration encoding remain work.
- [UTC intervals](design/utc-intervals.md) and conservative scheduling are implemented
  and independently reviewed. CASE/USB retain point observations. The offline
  signed-time verifier still needs source agreement, drift policy and unattended
  acquisition integration; it is not yet an application UTC authority.
- The [borrowed TLS restriction](design/tls-restriction.md) is verified in blocking
  and async Linux handshakes, with independently anchored source/registry guards.
  The app still sets the extra policy to None and refuses uncertain scalar time.
  Interval operation leases and the live Pushover transition worker remain work.
- The [controller](../pcb/controller/design/README.md) has 95 electrical parts,
  99 physical footprints and checked 70 x 110 mm four-layer placement. Its
  [initial grid/junction correction](design/controller-grid.md) preserves every
  native connection through actual KiCad Save. No board or lock is adopted.
  USB label cleanup, strict native policy, augmentation, fit and routing remain.
- [Mains capture](../pcb/mains/design/README.md) has 22 parts plus a conditional
  MOV region in a 23-part, 135 x 75 mm [placement proposal](design/mains-placement.md).
  Exact MOV body datum, mated connector/partition/enclosure access, full schematic
  integration and native handoff remain work. The [BOM](../bom/bom.csv) is not
  ready for ordering. All 34 commissioning rows remain Not run.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down; it is not accepted geometry. Controller,
mains and firmware work remain independent of this input.

## Verification and review

The complete project gate passes with 141 core, nine driver, one CLI, 59 combined
Matter/provisioning, 18 signed-time and 27 settings tests; three partition tests;
23 Node UI and three settings feature-guard tests. Linux TLS passes 13 provider
tests, eight accepted and 50 rejected full handshakes, two pre-I/O resumption
rejections, one canceled Pending handshake, the E0515 borrow regression and four
provenance/registry regressions. PCB checks pass 113 Bun tests / 23,670 assertions
and 36 shared handoff tests. Shared-tooling status has no mechanical drift; the
same handoff correction is pushed to Stillair as 67e6953.

Independent re-review is clean within the settings, Off ordering, UTC interval,
TLS seam/provenance and controller topology/native-serialization scopes. Review
caught serial HTTP Off promises, empty preflight error responses, a stale queued
clock restarting a schedule after Off, and provenance/test gaps. Each supported
finding was fixed with regressions. See [the review record](design/review-log.md)
for scope, reproduction and remaining limits. No review releases the whole unit.

The guarded controller stage retains 274 logical pins, 51 named nets and nine
NPTHs. Enabled ERC is zero; DRC has 216 unrouted items. All eight schematics retain
exact components and every net/ref/pin/type after actual KiCad Save. Strict checks
in that disposable copy report seven single-global-label findings and no
footprint-filter, four-way-junction or simulation-model findings. Source still
carries four initial ignored checks; none has been silently promoted.

The final combined C6 ELF is SHA-256
`53856cfdddf95e41b63954d550cfe481a70458575b2e60bdb23915577d02ad99`:
text 2,080,608 / data 25,164 / BSS 253,824 bytes. RAM execution is 80,392 bytes,
static SRAM excluding stack 359,380 bytes, and linker stack region 92,728 bytes.
The 9,544-byte static increase spans settings/UTC/TLS, not settings alone. All
three exact UI assets are linked. A real browser exercised the page against
synthetic local data; subsequent Off changes have actual-DOM regression coverage.
These are not peak-memory, browser-to-ESP, HomeKit, physical USB or timing evidence.
No parts were purchased, hardware flashed, mains energized or notifications sent.

## Next

Implement the [USB labeled-island layout](design/controller-grid.md#next-source-layout),
then complete strict native ERC, full render inspection and actual Save/readback
parity before adopting stricter declarations. This is a moderate source/layout
slice that advances G-02/G-04 without hardware or the pending rim datum. The main
risk is the pinned router/exporter's wire topology, so retain negative label-removal
checks and every manifest/native endpoint. A source-only CC1 discriminator already
preserves the manifest/native netlist and reduces strict single-label findings
from seven to six; the GND trial removes the visible J4 overlap. The remaining
layouts and complete native gate are not yet implemented.

Continue interval authority/operation leases and Pushover integration, plus the
complete mains schematic/mated fit, as independent parts of the same delivery goal.
The timing/calibration page and first-configuration workflow also remain required.

## Candidates not chosen

- **Freeze sensor geometry:** a substantial G-02 slice with unresolved rim/reference
  margin; needs the pending datum. Sensor regulation/interface capture can proceed.
- **Interval TLS and unattended Pushover:** a substantial firmware slice with
  authority-generation, drift and memory risks. It can proceed independently of
  the chosen controller handoff work; current wrapper tests are its foundation.
- **Route or release fabrication now:** blocked by complete readable schematics,
  native augmentation and mated fit. Source checks cannot bypass these design gates.
