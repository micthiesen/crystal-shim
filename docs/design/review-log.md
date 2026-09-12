# Design and implementation review record

Date: 2026-09-12. This records bounded adversarial review, root triage and evidence.
It does not release a board or substitute for the commissioning matrix. Complete
product PCB capture, routing and physical acceptance checks remain outstanding.
Test counts below describe their individual checkpoints; current integrated
evidence belongs in [STATE](../STATE.md).

## Controller component capture

Independent primary-source batches resolved exact copper lands and pin maps for
the WROOM module, buck, relay MOSFET, I2C buffer, sensor feed, supervisor, AND
gate, USB detector and USB switch. Most installed generic IC footprints differ
from the manufacturers' land recommendations, so the controller now has explicit
[tscircuit component models](../../pcb/controller/design/README.md). These are
partial source capture, with complete native footprints and board assembly still
pending. Source hashes and geometry comparisons are in the footprint audit and
source modules.

The first independent review checked WROOM/AP63203/AO3400A/TCA9517A against the
drawings and compiled models, including 90/180/270-degree placement and all nine
exposed-ground lands. It found no actionable mapping or geometry defect. Root's
initial test assumed a single physical port for pad 29; inspection showed that
the pinned compiler correctly creates nine internally connected ports. The test
now checks that actual grouping and each land's geometry.

A separate final reviewer checked the five additional logic/USB models, compiled
corner radius, exact small-part quantities and reset calculations. That pass also
found no actionable defect. The onsemi mechanical drawing has horizontal rows;
rotating its entire top view 90 degrees clockwise matches electrical Figure 3.
The initial suggestion of a pin-orientation discrepancy was refuted without
changing the correct map.

The small-parts review exposed the reset capacitor's direct contact-discharge
pulse. Root selected a 330 ohm series resistor. The calculation includes the
TPS3808 MR internal pullup and was independently recomputed: held enable below
0.132 V at 3.6 V, threshold crossing below 0.64 ms and peak resistor loss below
40 mW. Exact parts and quantities are now in the BOM. Physical reset and enclosure
environment checks remain unrun.

The four new compiled component tests and complete repository gate pass. Root
inspected the generated nine-part copper SVG. These reviews cover component
source and small parts, not the still-unfinished controller schematic, placement,
service-input protection, native handoff or manufacturing release. The full
delivery goal remains active.

## Controller sections, remaining component models and service power

The next bounded batch captured STPS2L40U, USBLC6-2SC6, three Micro-Fit headers,
Panasonic/TDK/Murata passives, Bourns inductor, LED and button source models. It
then connected the final controller's relay-permission and logic-power sections.
They reserve fixed references and expose named integration nets. They are not
separate boards, complete controller placement, or fabrication exports.

- Independent source review confirmed ST pin functions, copper and USB internal
  pairs 1-6 / 3-4. Direct ST downloads failed; manufacturer PDFs from identified
  mirrors supplied the hashed bytes and inspected drawings.
- Root's current-native comparison corrected two earlier audit transcriptions:
  43045-0200 drills are 1.02 mm, and 43045-0600 copper is 1.5 mm circular/roundrect,
  rather than the single-row header's 1.5 x 2.02 mm pattern. Compiled checks and
  independent reread preserve each header's native origin, numbering and NPTH locator.
- Review found Bourns source rectangles were labelled with a stock rounded-pad
  footprint ID. Source now uses `CrystalShim:SRP5030TA`; the final reviewer
  confirmed that this resolves the mismatch.
- Root located Murata's actual p27 reflow table after the first research pass
  found p6 test-substrate lands. The selected 1.1 x 2.05 mm lands at x=+/-1.65
  use GRM32 reflow midpoints. Independent delta review verified the source,
  registry, terminal overlap and compiled dimensions.
- Separate reviews checked LED polarity, button permanent pairs and the connected
  supervisor/gate/MOSFET and diode-OR/buck netlists against the design basis.
  Both section renders were inspected. Final scoped reviews found no further
  actionable source or electrical-connection defect.

The service design selects an intact GST18U05-P1J adapter, shortened Tensility
10-02248 pigtail and a second TPS259470 with exact passives and input TVS.
Research caught TI's reverse-input control-pin current restriction: direct sense
dividers do not qualify. Added 470 kohm series resistors keep the calculated
pin injection below 10 uA at -15 V; their leakage changes the trip bands, so the
service instance has its own threshold calculation. BOM-92 through BOM-106 count
these additions independently. Transient limits, aged contact loss, upstream raw
harness shorts and discharge/backfeed remain explicit final-design/physical checks.

Independent service review found one additional margin issue: the first adapter's
5.25 V minimum OVP overlapped its conservative normal-voltage envelope. No
manufacturer correlation excluded that corner. GST18U05-P1J replaces it with
5.5 V minimum OVP above the 5.3675 V normal ceiling. Its higher ripple allowance
is included in revised floors; the same pigtail is shortened to 100 mm with a
90 mV complete-loop budget. The service record distinguishes the 4.00515 V
modeled sensor input from a guaranteed floor, and records the replacement's
zener/output-short OVP behavior without promising recovery.
The final delta review found that the 34 mV startup margin extrapolated the
adapter's 10-100% load-regulation test to an initially unloaded input. The record
now limits the calculated envelope to its supported load range and requires a
manufacturer bound or measured cold-start/light-load evidence. PWR-06 includes
that check. The reviewer independently confirmed the revised source/hash,
OVP behavior, harness and rail arithmetic, reverse-current limits and thresholds;
no additional defect was reported in those reviewed calculations.

The complete local gate passes with 13 Bun tests / 555 assertions and the unchanged
firmware/TLS/partition checks. Physical rows, including new service row PWR-06,
remain Not run. Complete controller integration, mains/sensor capture, guarded
native handoff, routing and all release gates remain outstanding.

## FDC1004 acquisition

An independent driver reviewer checked register selection, differential OoP channel
assignment, single-shot ordering, signed decoding, timeout/error paths and frame
validity. No concrete defect survived that review. Root added cancellation and
deadline-boundary regressions; all nine driver tests and strict clippy pass.
The app now enforces 5 ms transfer acceptance and independently exposes that
deadline to Priority3. Pinned HAL cancellation can spend another 50 ms clearing
the bus; the cleanup is below control priority. Actual cadence remains unmeasured.

## Runtime and flash isolation audit

The independent source/ELF audit rejected the claim that Priority3 alone protects
control from flash. `BlockingAsync` calls the blocking NOR driver inline; the
pinned `esp-storage` RAM shims do not move Embassy's interrupt/task/supervisor
call graph into RAM. Stillair's disabled default flash critical-section feature
is not a safe pattern to copy. The Crystal boot-storage adapter now enables
that feature and implements the [relay-off acknowledgement gate](flash-storage.md)
with fresh control acknowledgements between bounded flash chunks. Matter must
integrate through that same owner. Physical commissioning row CTL-12 remains unrun.

Root also corrected the conflicting HomeKit Off acknowledgement wording: command
response means immediate revocation, while storage has a separate durable ack.
The boot policy already suppresses interrupted eligible windows before use.
Pre-fabrication memory/layout analysis is now distinguished from runtime high-water
and cadence measurements on the final boards, preserving the one-shot sequence.

## Configuration, timezone and boot storage

Independent configuration review found no defect after checking canonical decoding,
CRC-valid semantic mutations, fixed bounds, credential redaction and calibration /
schedule / supervisor invariants. Independent timezone review found no defect in the
explicitly supported POSIX subset, including folds/gaps, unusual DST shifts and
calendar boundaries. Its isolated two-million-timestamp round-trip sweep passed.

Storage review produced these corrections:

| Finding | Correction and evidence |
| --- | --- |
| Thread run level does not prove C6 interrupts are enabled | The gate checks both run level and `mstatus.MIE` before requesting or renewing ownership. The actual critical-section backend clears MIE without raising the threshold. Source re-review confirmed the fix. |
| Passing the entire 4,096-byte scratch to the partition parser always fails | Slice to `PARTITION_TABLE_MAX_LEN` (3,072 bytes) and enable MD5 validation. The shared production/host selection test uses the real larger scratch. |
| The typed upstream partition decoder panics on a legal custom type before NVS | Scan raw type/subtype tags. A checked-in regression using the same pinned parser passes; an isolated copy restoring the typed predicate fails at the upstream `unreachable!()`. |

The first reviewer's final source/ELF pass found no remaining defect in boot flash
ownership, chunk/ACK freshness, safe publication or secret handling. The five ROM
flash wrappers resolve in IRAM. A separate fresh flash review found no further
actionable defect, including the extracted production partition function and its
three host regressions.
The full local gate passes with 79 core tests, three partition regressions, nine
driver tests, one CLI test, 11 TLS cases and the PCB/document checks. The partition
suite checks MD5 corruption, custom tags, flags, alignment, capacity, overflow and
overlap using the actual production selection function. None of this is physical
flash timing, power-cut or relay-pin evidence. Runtime command/configuration
transactions were implemented in the later checkpoint below; Matter storage remains work.

## Calibration and local runtime

The new calibration stage received a separate independent review covering TI's
empty-level baseline, denominator polarity, endpoint normalization, exact domain
checks before rounding, arithmetic extrema and frame/slew histories. No finding
survived that pass; all 62 core tests passed, including twelve calibration cases.
Runtime review found a short TPS2553 fault assertion could escape polling. The
adapter now has a Priority3 fault monitor and sticky epoch, with a new full frame
and unchanged epoch required to clear it. Calibration history is committed only
under the same check. Final-unit pulse/cadence evidence remains outstanding.
The second runtime pass found no further supported defect after checking that
the underlying GPIO ISR, as well as its monitor task, runs at Priority3.

## Schedule and retained safety record

| Finding | Disposition and evidence |
| --- | --- |
| Searching only today/yesterday misses a 24-hour run spanning a short DST day | Fixed. Candidates derive from the UTC horizon and permitted offsets; a regression preserves the final 59 minutes after two local midnights. |
| Returning an older suppressed occurrence could overwrite the durable Off watermark | Fixed. `Suppressed` has no occurrence payload and requests no write. A rollback/return regression retains the newer suppressed record. |
| CRC-valid but impossible occurrence IDs could suppress all future schedules | Fixed. Encode/decode validate reserved bits, entry and second fields; malformed records enter maintenance recovery. |
| Maximum `LocalDay` overflows weekday arithmetic | Fixed with modulo-safe arithmetic and a maximum-day regression. |
| Public civil fields and resolver output could bypass time validation | Fixed during root integration. Every snapshot and resolved start is validated; inconsistent values fail closed. |
| A public retained-window struct could bypass blob validation | Fixed after the second pass. The scheduler shares encode/decode validation and rejects invalid IDs or zero end values before evaluation. |

The host workspace passes 50 core tests, nine driver tests and one CLI test.
The final independent pass found no further substantive defect in this scope.
Runtime schedule/storage coordination and command persistence were separate
integration work, now covered by the later runtime-transaction checkpoint below.

## Sensor basis

| Finding | Disposition and remaining work |
| --- | --- |
| Two SHLD2 reference face pads allegedly must become one full-height electrode | Rejected after comparing TI's actual TIDRCS2 first-page copper plot. TI uses two face pads joined by a thin trace; the equal-height rule is for the rear shield lanes. Preserve that source geometry. |
| Geometry table omitted explicit U1-to-copper route ownership | Added stable route IDs, endpoints, branch coverage and mandatory continuity/no-crossing checks. Exact bends, vias and implemented checks remain part of real-board capture. |
| A 50 mm electrode was presented as satisfying 50 mm valid water travel despite an 11 mm exclusion | Corrected the claim. The owner has not accepted the exclusion; normal-full water datum is pending. Geometry remains open. |
| Guard bands lacked mounting tolerance and a positive vertical datum | Added glass-edge seat, PCB stop and a +/-0.5 mm interface allocation. Guard bands remain unapproved pending actual datum and field analysis. |
| Requirement promised detection of every lost physical reference condition | Narrowed to observable raw/reference envelopes and stated indistinguishable film/gap/shift failures explicitly. No independent physical witness is fitted. |
| Sensor power had no defined controlled reset path | Selected TPS2553 current-limited feed, enable/fault GPIOs, discharge resistors, bounded retry and FDC reinitialization. A hard cable short remains a fault. |
| Unselected 100 mA protection was presented as a fact | Replaced with sourced TPS2553 50/75/100 mA limits and separate 30 mA normal budget. |
| Glass-side geometry lacked a front-view/export transform | Added explicit glass-to-front, centered tscircuit and KiCad translations. Both views must be checked during capture. |
| RL/RE lead asymmetry was understated | Removed the area-based reassurance. Whole lead/pad responses and denominator variation require field analysis and final calibration. |
| Invalid readings could be interpreted as eligible for fault debounce | Removed that ambiguity. Invalid input stops immediately; only valid level transitions and recovery are debounced. |
| Inverse-thickness scaling implied unproven signal/noise margin | Removed the scaling and transferred noise-margin claim. |

The sensor basis needs another review after the owner datum, field analysis and
actual source geometry exist. These revisions do not close sensing acceptance.

## Integrated mains/controller review

Root integration corrected the IRM/filter branch split, three-position Micro-Fit
mating family, stale USB power text, connector drawing views and exact output cord.
The first integrated pass then found these items:

| Finding | Disposition and remaining work |
| --- | --- |
| The proposed 2/6-position Mini-Fit header suffixes do not establish the intended single-row parts | Replaced the set with exact Sabre 43160/44441/43375 capture candidates. Removed the Sigma TPA entries. |
| Adjacent 4.2 mm Mini-Fit pins cannot meet the proposed 3.2 mm copper-spacing rule | Replaced with Sabre 7.493 mm pitch and proposed 3.5 mm pads, giving 3.993 mm nominal copper gap. Final DRC and exposed-metal/insulation checks remain required. |
| Distinct circuit counts were claimed to prove non-intermateability | Corrected. Check partial/cross-mating in CAD and the received parts; the catalog alone does not prove it. |
| IRM OVP threshold can exceed the coil's maximum voltage | Accepted. The selected TPS259470 now cuts off the common secondary; exact networks and static margins are documented. Hot pickup and transient voltage/time/energy closure remain before release. The earlier coil-only LDO was not adopted. |
| Nominal-only coil current and buck input omitted normal tolerance/ripple/temperature | Corrected to 110 mA coil and 635 mA buck allocations, 850 mA system budget. Lowered the supervisor divider to preserve startup margin. The documented assumptions still require final component and waveform validation. |
| Enabled TCA9517A can reflect the unpowered cable's floating/low state onto the ESP bus | Fixed in the design basis with independent GPIO0 bus enable and a pulldown. Disconnect before sensor power-off and through startup; discard aborted transfers and reinitialize. Verify in schematic and final waveforms. |
| Enclosure allocation had no fit margin or controller outline | Added 10 mm total end margin and a 70 x 110 mm controller outline/hole allocation. Actual connector overhang, fasteners and wire bends remain CAD work. |

The [footprint audit](footprint-audit.md) inventories stock patterns and exact
manufacturer imports still needed. Visual recheck refuted the claimed Bourns pad
mismatch: 6.5 mm is the outside span, not centre spacing, and the stock geometry
matches. A second recheck refuted the IRM output-swap claim: rotating the stock
pattern 180 degrees matches the native symbol and manufacturer functions. The
manufacturer labels no numeric pins; the project table now adopts the native
1 AC/N, 2 AC/L, 3 -Vo, 4 +Vo convention. No whole-design review convergence or
manufacturing readiness is claimed.

## Secondary and sensor power revision

The supply is now IRM-10-5, whose inspected drawing preserves the prior board
envelope and pin geometry. Its 2 A rating exceeds the complete selected eFuse
current-limit band while the normal system allocation remains 850 mA. The
[secondary circuit](power-protection-review.md) records threshold tolerances,
current/ramp networks, possible power-cycle recovery, stored-energy behavior and
explicit transient limits still needing layout review and final-unit measurement.

The independent secondary-power reviewer recomputed the static/current/ramp
margins and found missing BOM/capture entries for the eFuse's three capacitors
and rail bleeder. Root added explicit C2/C3/C4/R7 references and exact MPNs,
plus the full R2-R7/C2-C5 mains table. The 22 uF output capacitor has its own
mains quantity, separate from the five controller capacitors. The exact 0.1%
bleeder has 2.5 mA reserved for its normal draw. The input capacitor's bias curve
was inspected. A second review then found that TI's 443 uA leakage figure is
tested with VOUT greater than VIN and cannot bound a live overvoltage input with
a discharged output. Root removed the claimed off-state guarantee and retained
only a conditional estimate. PWR-05 now explicitly requires a source-supported
forward-leakage bound or measured total leakage/backfeed, V5_PSU below 1.0 V,
and observed PSU_GOOD/dropout timing before operating acceptance.
The final independent re-read checked the pin network, source limits, static
thresholds, current/ramp arithmetic, capacitance, BOM and protected-rail interface
and found no additional actionable issue within that scope.

A separate sensor-power reviewer found that the initial LT3042 budget had cited
5 mA GND current at the wrong load. Rev C specifies 7 mA maximum at 50 mA load.
Root corrected overhead to 7.3 mA, normal daughterboard allocation to below
11.92 mA, available output-load allocation to 22.7 mA and calculated dissipation
to below 0.130 W. The reviewer recomputed these values and the discharge timing,
then found no further actionable pinmap, headroom, capacitance, current, startup
or interface issue in this scope. Firmware now waits 200 ms after sensor power-on.
The full local gate passes. Physical startup, thermal and sensing results remain
unrun; neither this component review nor host tests approve a manufactured board.

## Verified TLS provider

The first independent pass found that trusted UTC could remain static indefinitely
and that policy tests existed only in scratch. Both are fixed: UTC advances from
a monotonic anchor, expires after one hour without a new observation, and becomes
invalid on observed timer rollback/saturation or calendar overflow. A checked-in
Linux harness compiles the actual provider source and passes 11 deterministic
tests, including the C clock hook and real X.509 chain rejection paths. CI and the
full local gate run it and check production/test crypto-profile parity.

The [provider report](tls-provider.md) distinguishes the initial live handshake
and construction-size evidence from the current build and offline tests. The second
independent pass found no surviving actionable defect in this scope and reran all
11 tests successfully. That checkpoint had no pump command ingress. The app now
has the runtime path below, but has not integrated the provider or Matter network;
current C6 heap/cadence evidence remains work.

## USB and service protection source/export

Source now captures USB4105-GF-A, TPS259470ARPWR and SMBJ8.0CA from the hashed
manufacturer drawings in the [footprint audit](footprint-audit.md). The gallery
contains 25 representative component models; connected sections remain relay
permission and logic power. This is not a complete controller board.

| Finding | Correction and evidence |
| --- | --- |
| The compiler accepts numeric USB source indices, while the native footprint needs A/B/SH numbers | Initial-converter adapters translate PCB pads plus library/instance schematic pins. Tests check the serialized result and reject mixed, duplicate or mismatched batches before mutation. |
| The USB compiler centre is 1.14 mm from the native body origin | Review found the mismatch. A cloned Circuit JSON normalization derives the body origin from the checked A1 land and validates all contact locations before conversion. Native replacement now preserves placement. |
| The converter leaves three shared shell pads without a net | Initial mapping propagates the single validated shell net to all four pads and restores their F.Paste layer. Conflicting populated shell nets reject export. |
| Routed source schematic leaves some USB GND contacts as separate islands | Each contact has an explicit connection; source net labels retain A1/A12/B1 on GND alongside B12/SH. The native XML netlist checks every power, data and CC pin. |
| The typed schematic library-pin setter removes its serialized number | The initial mapper updates the existing number node and tests actual serialized library/instance pin numbers. Native KiCad parses all 17 pins. |
| The eFuse converter places a circular custom-pad anchor in each L notch, adding copper | The initial adapter moves anchors into horizontal legs while translating primitives oppositely. Native effective-copper checks cover the full union, not just the intended polygon vertices. |

Independent final review found no additional actionable copper, pin/net, origin or
anchor defect. All 22 USB pads/holes match the installed exact GCT footprint at
0/90/180/270 degrees, including size, position, layers, corner ratio and drill.
Native schematic/board reads preserve both USB data pairs, CC, VBUS/GND contacts
and all four shell nets. All 16 eFuse corner pads across those rotations preserve
source copper within 1.5 nm native quantization, with unchanged nets, UUIDs and
other pads. Root inspected the 25-part source gallery and corrected native copper
render. The eight focused tests pass with 707 assertions.

These helpers operate only on initial converter graphs before staging
serialization. Complete-board export/manifest integration, repeated-pad native
parity, TI split paste/mask, body/courtyard and fabrication gates remain required.
The eFuse source polygon-port centres still lie in the notches, so source routing
stays disabled. No adopted product KiCad design was edited.

The shared handoff review separately found dictionary lookups collapsing repeated
physical pads to one net. Native augmentation left three USB shell tabs unconnected,
while general parity could hide those blank nets behind the one correct entry.
The later initial-stage alias check already caught this defect, so no bad stage
receipt was demonstrated. The generic assignment/parity functions now process
every physical pad. Two added regressions cover four/nine repeats, wrong/blank
nets and NC clearing; they produced five failures against the old code. Both
repositories' 30-test handoff suites pass, and native KiCad now preserves all four
USB shell nets through augmentation. The fix was applied to canonical Stillair
and synced exactly to Crystal Shim. Required physical pad counts still belong to
source/footprint geometry validation; the logical manifest schema is unchanged.

## Runtime configuration and command transactions

The [runtime coordinator](runtime-transactions.md) now applies ticketed settings
and retained writes, schedules and USB commands through the existing output-off
storage owner. It publishes settings only after maintenance-retained and
configuration records are durable, rejects old sensor revisions and preserves
the supervisor across configuration and storage operations.

Writer review found that persisting an arriving schedule could interrupt an
accepted manual request waiting for minimum off. Ordinary eligibility writes
now wait while a manual override is active or pending. Root review found that
Off's command acknowledgement waited for suppression persistence. Applied Off
now follows the actual GPIO write; storage completion is reported independently.
Regressions cover these races, Off followed by storage failure, both configuration
write boundaries, interrupted replacement, stale tickets, revision mismatch,
maintenance/button races, clock ageing and bounded partial/oversized USB input.
Independent review then reproduced two automatic-lease defects. A delayed
eligibility acknowledgement could replay an expired occurrence after clock
rollback; configuration save could leave an old automatic lease available to a
later window. Review of the same call paths extended cancellation to physical/USB
maintenance and calendar invalidation. Runtime now records observed suppression
before re-anchoring time, preserves it across late writes and revokes automatic
demand when its calendar context is invalid. Every runtime maintenance path
revokes both run modes through the existing Off path. Normal active-window
corrections and overlap still preserve the continuous run cap; manual overrides
remain independent of clock loss. Suppression-only persistence waits for a
manual lease without changing readiness; explicit stops bypass that deferral.

Review also examined reset before the first configuration record commits. No
intent record can make an uncommitted request durable. The contract and regression
now state that this boundary recovers the old saved pair, including normal boot
suppression of any old Eligible occurrence. Revision-mismatch maintenance recovery
begins after the first retained record commits. The reviewer accepted that
distinction; `ACCEPTED` remains a queue receipt and never promises durability.

The targeted host suite now passes 108 core tests, nine driver tests and one CLI
test. Twenty-nine new runtime/ingress regressions cover the implementation;
pre-fix copies fail the new replay/cancellation cases. The repeated complete
repository check passes, including 21 Bun tests/1,262 assertions, 30 handoff tests,
partition/TLS checks and the C6 release build. Final independent delta review
found no further actionable findings across Off, configuration/maintenance/storage
failure, clock expiry/loss/correction and ordinary overlap/manual independence.
The reviewer reran the targeted calendar regression. Actual flash, USB and control
timing remain final-board checks.

## Sensor cable protection proposal

Independent review identified a second unresolved TPS2553 boundary alongside the
already recorded positive overvoltage gap. SMBJ7.0A's forward-voltage rating permits
a -3.5 V cable event; TPS2553 IN/OUT have a -0.3 V absolute minimum. The switch's
3-7 ms reverse-voltage shutdown addresses output above input, not output below
ground. Keep these parts outside adopted source/BOM until a defined isolation,
filter or switch refinement addresses both polarities with documented residual
voltage/current calculations. The final assembly still needs its declared ESD
tests; no physical immunity result is inferred from the component ratings.

## Connected service section and native signal labels

The 16-part service input now captures both 470 kohm control-pin series resistors,
the specified divider/ILM values, input bypass, dVdt capacitor, output bulk/bleeder,
RAW TVS and correctly polarized output clamp. Combined source checks retain its
separate OR input and the independent PSU/coil path.

Root native readback found that some displayed signal names were plain
`schematic_text`, which the converter correctly preserved as drawing text rather
than electrical labels. This left pins disconnected despite clean source netlists
and legible SVGs. The same issue affected 15 relay-section and five buck-section
pin-to-named-net comparisons. Explicit source net labels, with inherited sheet
identity, correct those circuits. Current disposable native exports match all
29 relay, 24 buck and 37 service connected pins; the service PCB also matches all
40 numbered pads and its three intended unused eFuse pins. No adopted native
board was edited. Regressions remove the real labels while keeping source nets
unchanged and detect the lost connections. The reusable checker also separates
sheets and rejects wires on intended unused pins.

The 14-part module section fixes U1, SW1/SW2/SW3, D4, R50-R55 and C5/C6/C9.
Tests independently check module-pad/GPIO allocation, separate BOOT/maintenance,
the GPIO8 pullup, 330 ohm reset discharge path and 680 ohm LED path. Native
schematic readback matches all 46 connected pins; the source and schematic retain
nine unused module pins. Raw PCB conversion still omits nets from eight pad-29
copies and one copy of each button terminal. This is the known converter behavior
handled by shared native augmentation, not a new accepted handoff. Complete export
integration must validate all physical copies. UART test pads and final module,
antenna and button placement remain full-board work.

The 13-part USB section captures separate CC pulldowns, connector-side protection,
self-powered VBUS detection, fail-safe data gating, module-side series resistors
and bypass capacitors. A drawn-wire check caught an unintended data-wire overlap;
explicit route/label placement now preserves separate D+ and D- nets. Native
readback matches 51 connected pins, 59 numbered pads and five unused pins. Both
source and native previews were inspected using KiCad 10.0.5 in disposable stages.

Independent section review freshly compiled all five sections and compared them
with native XML: 64 components, 187 connected pins and 18 unused pins match. Native
PCB checks find no additional net discrepancy in the relay, power, service or USB
sections. Module retains exactly the 14 known repeated-pad omissions awaiting
shared augmentation. The reviewer ran 13 focused tests with 666 assertions and
found no actionable finding in the reviewed pin maps, networks, passive selections,
USB gating, service separation or reset/boot controls. Full-board placement, native
augmentation, ERC/DRC and manufacture remain outside that clean review scope.

Firmware CI separately exposed Rust 1.98's new `chunks_exact_to_as_chunks` Clippy
lint; local stable was 1.97.1. The parser now uses fixed-size `as_chunks` after
its existing even-length check. Host checks pass and
[firmware CI passed for 80c7ea5](https://github.com/micthiesen/crystal-shim/actions/runs/34692231377).

The relay section now also captures J1, the three-position `43650-0300` controller/
mains harness header: pin 1 `V5_PSU`, pin 2 isolated GND and pin 3 `COIL_DRAIN`.
Its source is separate from the service-power input and retains the mains-board
coil supply. Combined-source tests check all three circuits through the diode OR
and supervisor. The relay schematic was rearranged to keep connector and net
labels inside the sheet and readable. This brings the five sections to 65 parts
and 190 connected pins; the earlier independent 64-part result remains its stated
scope.

## Matter command and gated KV adapter

The actual rs-matter 0.2.0 trait adapter now shares one `Store` between application
transactions and SDK KV access. Host tests compile the production store with
deterministic NOR/permit adapters and exercise shared keys, removal, garbage
collection, chunk checkpoints and error release. A resolved dependency guard
rejects the SDK's interrupt-masking mutex feature in either workspace.

The generated async On/Off handler uses source-owned generation tokens, bounded
reply waiting and cancellation, and reports control's observed output. Independent
review found that On could return success before the same tick rejected its
request for a fault or maintenance. Output stayed off, but the acknowledgement
was misleading. Runtime now returns `Rejected` unless resolved On finishes with
an accepted override lease and deadline. This uses the actual supervisor outcome,
without duplicating freshness or safety checks. Valid LOW requests waiting for
minimum off still succeed; expiry cannot renew a run; Toggle resolved to Off still
acknowledges revocation. Two regressions failed against the old runtime, and a real
Matter-future-to-runtime test covers the resulting bridge behavior.

Independent delta review found no further actionable command, ownership or lease
finding. It also checked the sensor startup epoch correction: observe the epoch
after 200 ms settling, before checking FAULT and bus lines. Startup current limiting
can then clear during the invalid-input interval; persistent/later faults still
reject recovery, and only an initialized fresh frame clears the latch. Saturation
continues to fail closed.

The focused suites pass 115 core, nine driver, one CLI and nine Matter tests, with
host/app fmt and Clippy plus the locked C6 release build. The current ELF is text
621,272 / data 9,052 / BSS 16,980 bytes. These tests do not exercise encrypted
transport, actual flash/interrupt timing or HomeKit pairing. [D-22](../decisions.md)
keeps the private accessory's boot-off and bounded behavior authoritative and
records the complete plug-profile deviation. Radio/TCP assembly remains work.

## Sensor power refinement adopted for capture

The selected [sensor power design](sensor-power-refinement.md) adds 6.8 ohm
between the TPS2553's locally bypassed V5_SENSOR_SW and the connector V5_SENSOR,
10 uF local bulk alongside the existing 1 uF, and a separate daughterboard input
bleeder. Both connector TVS devices stay on the cable side. The complete input
capacitance budget is now 30 uF, with 20 uF retained on the regulated output.
The service-supply calculation gives a 3.7986 V input floor and 114.6 mV modeled
LDO headroom beyond the output/dropout allocation. The generic regulated-load
allowance is 19.61 mA. These supersede the earlier input budget and headroom.

Independent adversarial review examined finite capacitor backfeed into a collapsed
logic rail, source order, startup, discharge, ESR sensitivity and part pulse limits.
It accepted the finite-energy assessment without inventing a reverse-current peak
bound from typical switch resistance. Local parasitic overshoot still needs layout
review and final waveforms. No extra input resistor or larger limiter was selected.

The same review found an actual pin-limit violation: LT3042 PGFB was directly tied
to the input despite a -0.3 V limit, unlike IN/EN's reverse-input rating. The adopted
1N4148W-7-F places its anode on V5_SENSOR and cathode on the separate LDO_PGFB net,
as ADI specifies. The exact leaded part, polarity and lands are recorded. The
final bounded delta review found no further actionable finding in this refinement.

The repository [calculator](calculations/sensor-power.py) reproduces all 147
numerical results from the reviewed analysis within 1e-12 relative/absolute
tolerance. This is formula reproduction, not simulation or measured immunity.
The BOM now records both ESD arrays, both rail TVS devices, the controller RC
additions, sensor series resistors, both sensor bleeders, PGFB diode and exact FDC
bypass/pullup parts. PWR-07 preserves final-assembly waveform/source-order checks;
PWR-04 distinguishes charging-time FAULT from persistent/post-settling faults.
Every physical result remains Not run. Controller capture is proceeding; sensor
capture and complete-board native parity remain work.

## Complete controller schematic and real radio assembly

The controller's seventh section adds the exact 19-part sensor power/bus interface.
Independent source/native readback matches 53 connected pins, two unused pins and
all 55 physical pads, including the rotated 6.8 ohm part. Root inspected both
source and native schematic previews. The worker separately checked the adopted
BOM and circuit contracts against its capture; no electrical propagation defect
remained. Physical-outline review did correct a transposed DBV package body/lead
span in the cable-protection prose; copper and pin numbering were already correct.

Root joined all seven sections in `controller.circuit.tsx`: 95 components, 84
purchased parts and eleven test pads. The first full render silently packed and
rotated the section groups despite their explicit child coordinates. Setting
`pcbRelative` on the board preserves source placement; a regression checks that
behavior. Those preserved review placements currently overlap. The new integration
test is explicitly electrical; it does not waive placement errors or pass handoff.

A complete disposable native hierarchy, root plus seven child schematics, matches
all 254 connected pins and 20 intended unused pins across 51 nets. USB renumbering,
eFuse pad-anchor correction and test-pad paste exclusion were applied to initial
object graphs before writing the stage. Native PCB readback counts 291 numbered
physical pads and exactly the known 14 repeated-pad blank nets. Shared augmentation
must correct those before acceptance. Proof is in
`/tmp/crystal-shim-controller-full-initial/proof.json`; no adopted board was edited.

The firmware now links one real Wi-Fi/BLE owner, one Embassy IP stack with TCP,
SDK root/Descriptor/Identify/Groups plus the restricted OnOff handler, and the
actual `Matter::kv` access over the same gated Store. USB/LED/storage service runs
outside radio lifetime. Root reviewed source publication on normal/failed startup,
network completion/cancellation, metadata/handler agreement and control commands.
It found no additional ownership or relay-policy bypass in this scope.

Root added the missing successful complete-X.509 provisioning test, with identity
and DAC-key substitution rejection. SDK public attestation fixtures are confined
to `cfg(test)`; the known SDK private-key byte sequence is absent from the linked
release image. Missing private material still closes commissioning. The build
includes the runtime-selected radio branch; transport, pairing, heap peaks and
combined TLS session behavior remain unrun hardware evidence, as recorded in the
[Matter integration contract](matter-integration.md).

A separate read-only firmware reviewer found no actionable defect in the complete
radio assembly. It checked local service after network completion, every
recoverable pre-radio failure's storage publication, the sole Store/KV owner,
one Wi-Fi/BLE/IP stack, cancellation of claimed commands, LED-only Identify,
absent scene/timed/startup handlers and matching endpoint metadata. Public example
credentials remain test-only; production requires the validated private record.
Six focused service/profile/provisioning tests passed independently. This scope
does not include injected ESP radio failures, live flash/concurrency timing or
Apple Home pairing. Enclosing service cancellation intentionally cancels both
thread services; interrupt-owned protection remains separate.

## Controller physical metadata, ERC roles and private provisioning

The physical declaration unit now covers all 27 purchased controller model IDs.
Root checked package dimensions and passive tolerances; independent semiconductor
and connector work inspected exact manufacturer drawings. Independent physical
review rechecked selected primary pages, envelope arithmetic, origins, mask gaps
and four-angle output. It found two real native-export omissions: PTH mask margins
and rounded pin-one copper. The initial graph adapter now restores +0.05 mm
PTH mask growth and R0.25 mm Micro-Fit corners after validating the whole batch.
Five tests cover all four rotations and all 42 gallery pads/NPTHs, exact mutation
boundaries, idempotence and rejected drift. Source expectations were retained.
Root reviewed the adapter and inspected its native connector-gallery render.
The new courtyards exposed overlaps in the section review arrangements. Root
spaced thirteen components without changing schematic geometry, nets, rotations
or pin assignments, and retained the strict section overlap assertions. The
three-section service test now uses `pcbRelative`, matching the complete board
and avoiding the compiler's automatic group repacking. Full placement, stencil,
thermal-via, mating and enclosure work remain separate.

The pinned converter also hardcodes library pin types as passive, ignoring source
port metadata. The exact-MPN electrical contract and initial adapter cover every
source part before first native serialization. A separate primary-source reviewer
caught TPS259470 pin 3 AUXOFF misclassified as an input; TI SLVSFC9C Table 5-1
requires open-drain output, now adopted. The reviewer found no further actionable
pin-role defect and independently exercised 15 rejection cases with atomic graph
preservation. The committed full-board test proves only library pin types change;
instance syntax, UUIDs, geometry, wires and other metadata are preserved.

Actual KiCad 10.0.5 XML readback retains 254 connected pins, 20 intended unused pins
and 51 nets. Its diagnostic ERC now reports 16 unconnected-pin errors for intended
unused terminals and four undriven-power errors. Those require declared native
NC markers and source flags; they have not been waived or counted as a clean ERC.
Warnings also include the known grid/library/footprint cleanup and two wire
endpoints. The corrected disposable initial board has 336 body edges, 95 courtyards and
all 291 numbered-pad mask overrides, independently loaded through pcbnew.
It still has the known 14 repeated-pad net omissions before shared augmentation.

The host provisioning tool imports or freshly issues per-device credentials under
explicit local authority/CD inputs, then uses the same bounded production codec.
Root reviewed signature/identity checks, setup-code generation, private output
modes and publication order. It corrected FIFO pre-open rejection and disabled
OpenSSL's default CA path/store so trust remains the explicit input. An added FIFO
regression and offline issue/import/tamper/refusal tests pass. Public TEST issuer
fixtures are identified by source; they are not device private keys or production
defaults. The actual USB writer, activation and HomeKit pairing remain work.

## Manufacturer origins in initial conversion

The compiler's copper-bounds centre differs from the manufacturer datum on the
WROOM, Micro-Fit headers, LED and buttons. A derived-input adapter now validates
the full numbered-land/locator multiset and restores those centres before native
conversion. It changes no absolute source geometry. Four-angle tests exercise all
six models, repeated pins, reordered input and atomic rejection of geometry,
identity or placement drift. Actual pcbnew readback from a new initial stage at
`/tmp/crystal-shim-controller-native-origins-20260912` verifies all nine asymmetric
origins including USB; all absolute native pad geometry and electrical counts are
unchanged. No existing native design was edited. The complete initial graph builder
now composes all adapters and refreshes all eight schematic strings after typing.
An independent reader checked the origin/composition code, five focused tests
(1,351 assertions), six additional atomic rejection cases and all eight serialized
schematic files. No actionable finding survived that bounded review. This does
not review routing, enclosure fit or the still-missing handoff manifest.

## Complete controller placement and shared hole identity

The complete source now uses one 95-reference placement map, four 3.2 mm mounting
holes and four copper layers on 1.6 mm FR4. Independent placement analysis supplied
the initial proposal. Root corrected six test-pad positions to retain the existing
8 mm minimum probe spacing, then checked actual compiled courtyards and 4 mm
mounting reserves. The USB section's old review-fixture outline was expanded to
the complete board outline without weakening its geometry assertions.

A fresh disposable native stage at
`/tmp/crystal-shim-controller-placed-20260912` has 99 footprints, nine NPTHs,
95 courtyards, 336 body edges and 291 numbered-pad mask overrides. Actual KiCad
readback matches every source position and all 254 connected pins, 20 unused pins
and 51 nets. Exactly the known 14 repeated-pad net omissions remain for declared
native augmentation. Root inspected the source and native placement renders.
Full mating/access, support geometry, assembly details and clean ERC/DRC remain
open; no product board was adopted.

The shared manifest normalizer incorrectly required each NPTH to have a unique
component reference, rejecting USB's two locating holes. It now requires unique
hole IDs and unique reference/position pairs, allowing distinct holes within one
footprint. The new regression accepts two locators and rejects duplicate IDs or
locations. All 31 handoff tests pass in both projects. The exact shared files were
synced and pushed to Stillair in `e0f2359`; reciprocal maps remain current.

## Bounded USB writer and independent review

The actual app USB service now installs private provisioning through its existing
Store. Explicit CONFIG precedes an owned durable-maintenance/GPIO-low handshake;
bounded staging and production decoding precede exact verified readback. Only
absence permits a write; identical retries are verified without replacement.
Timeouts, owned malformed input and cancellation clear staging. Installation
does not activate radio or reboot; a separate request needs a fresh handshake.
The implementation preserves the existing reserved Off path and gated flash owner.

Root reviewed the protocol, app integration and actual-store failure tests, then
ran the complete repository gate. A separate reader passed 26 focused production
tests and two additional scratch tests: consumed Durable ACK while GPIO remained
high, cancelled/old-owner traffic versus a new generation, reserved Off, and
400 deterministic arbitrary-byte framing cases at exact/overflow boundaries.
No actionable defect remained in this bounded review. Evidence is at
`/tmp/crystal-shim-provision-writer-review/review.md` with reviewed source hashes.
Live USB HAL behavior, analogue torn flash writes, GPIO and reset remain untested.
The [provisioning contract](matter-provisioning.md) records those limits and the
remaining host sender; this does not claim whole-project review convergence.

## Controller nominal enclosure screen

Independent exact-part research and CAD screening established the
[mounting/access allocation](controller-enclosure-fit.md). Root inspected the
dimensioned drawing and checked its source positions and qualification. The
0.5 mm westward mounting shift preserves every PCB placement; the covered shared
opening resolves the demonstrated USB overmold collision and J2 cable-bend gap.
Support envelopes clear the nominal base and antenna. The 2016 STEP/2020 drawing
difference, tight corner/partition margins, absent mould tolerances, exact
cover/support/strain-relief parts and mechanical force checks remain explicit.
This is not a final assembly or splash/thermal acceptance result.

## Controller manifest and native library preservation

The source manifest now covers 99 PCB items, 274 logical pins, 51 nets and nine
distinct NPTHs. Root authored and checked exact instance metadata and H1..H4
identity adapters. Integration tests reject a late metadata mismatch without
partial changes, verify all 95 serialized schematic instances and prove that
other properties, libraries, wires, pin geometry and UUIDs remain unchanged.
The pinned converter's unset Datasheet `~` and D5/D7 symbol-name sanitization
were reconciled explicitly, without changing actual part values.

A separate native implementation/research pass established per-reference library
save/load through KiCad's API. Shared source model names contain variant geometry,
so collapsing them would lose physical intent. The production exporter compares
all 99 native files and 396 rotations, including copper, mask, paste, drills,
rounded corners, custom pads, bodies, courtyards and text. Fourteen additional
negative/snapshot checks reject unsupported or changed state.

The actual current-builder round trip at
`/tmp/crystal-shim-native-library-plan/production-stage-y05BL5` passes strict
PCB and schematic XML parity after shared native augmentation. Every repeated
physical pad has its expected net. Readback retains all intrinsic geometry;
C22 and R35 have only the existing `FromMM` -1 IU Y translation (one nanometre).
`final-production-parity.json` records the result. No board was adopted and no
ERC/DRC or fabrication release is claimed.

Native testing also reproduced a KiCad 10 SWIG lifetime failure after replacing
footprints with `board.Remove(old)`: a later same-process `LoadBoard` became an
unusable proxy. The shared initial-stage path now uses `board.Delete(old)` because
the old footprint is never reused. Actual augmentation plus same-process readback
then passes. The shared tool also accepts an export-created footprint directory
relative to the fresh stage, with no stock fallback. Its 35 tests pass in both
projects; exact copies remain synced.

Independent review then reproduced two gaps: changing R14 copper width while
keeping its model ID produced no manifest/ECO change, and a nested `.pretty`
symlink escaped the staged-library boundary. The manifest now binds both compiled
physical intent and the complete effective initial footprint after conversion
and adapters. The same read-only canonicalizer verifies the initial seed before
native library export. UUIDs, nets and placement are separate domains; physical
styles and attributes remain bound. Shared normalization retains both hashes and
requires high-risk footprint review when either changes, appears or disappears.
Staged-library roots now reject symlinks at every level. The added shared tests
fail against the previous helper and pass in both projects.

The next independent pass found 50 converter-emitted THT paste records without a
component owner. They now enter a board-level physical-intent digest alongside
other unowned geometry; unknown nonempty owners fail. The compiled board record,
including minimum rules, also has a board-level digest. Tests cover copper, mask,
paste, body strokes, orphan paste and board-rule changes. These identities detect
source changes even when the converter omits an element; they do not declare its
native implementation complete. Initial-stage parity was rerun successfully at
`/tmp/crystal-shim-native-library-plan/geometry-stage-s0gRm7` after the first geometry
binding fix. Final review and verification cover the subsequent board-level fix.

The final independent geometry review found no remaining actionable defect in
this scope. It checked all 99 serialization round trips, 14 physical mutations,
six excluded metadata/placement changes, a custom polygon vertex and unsupported
parser elements. A same-ID R14 copper edit was rejected before an output directory
existed. Fresh native export and independent receipt verification passed for
99 footprints, 291 numbered pads, nine NPTHs and 396 rotations. Evidence and
reviewed source hashes are in `/tmp/crystal-shim-geometry-identity-review`.
Root's final augmentation/parity run also passes at
`/tmp/crystal-shim-native-library-plan/geometry-stage-gtJYOj/final-production-parity.json`.
These checks establish geometry identity and preservation, not downstream
augmentation completeness, clean ERC/DRC or manufacturing readiness.

## Host provisioning sender and cross-platform review

The explicit host sender validates the exact bounded private record and its
authority/CD before opening the requested character device. It uses the device
writer's ownership token, ordered chunks, fixed deadlines, verified readback and
separate reboot handshake. Root reviewed protocol and file/serial handling.
A separate reviewer passed all 16 repository sender/CLI tests and three added
scratch regressions: partial chunk failure sends no later cancel/commit, partial
commit failure reports uncertainty without reboot, and storage completing after
the deadline remains uncertain without reboot. No actionable production defect
remained in that scope. Review/source hashes are in
`/tmp/crystal-shim-sender-review-ku_7vye8`.

Actual pseudo-terminal tests also passed on OrbStack Ubuntu noble with OpenSSL
3.0.13 and macOS with OpenSSL 3.6.3, including same-byte transmission after the
file is replaced and no port changes for invalid records. Linux exposed an
interrupted `poll` in the test emulator during concurrent OpenSSL child exits;
scratch instrumentation confirmed errno 4. The test now retries interruptions
against one fixed absolute deadline. Production transport already did so and was
unchanged. Both platforms pass 11 binary and five CLI tests and scoped Clippy.
Commands and reproduction are in `/tmp/crystal-shim-linux-sender-review/validation.md`.

The complete repository gate passes. The embedded lock gained only the host
dependency edge; linked release size is unchanged and the SDK public device
private-key byte sequence remains absent. Physical serial behavior, flash/reset
timing and HomeKit acceptance remain untested. This bounded review does not
establish whole-project adversarial convergence.

GitHub's Rust 1.98 Clippy then required `as_chunks::<2>()` for the two fixed-size
hex decoders. Their existing length checks and behavior are unchanged; all 16
sender/CLI cases pass with OpenSSL 3 after that adjustment. A shell started in the
firmware directory selected macOS LibreSSL and failed offline issuance, while
the project-root shell selected OpenSSL 3.6.3 and passed. The documented OpenSSL 3
PATH prerequisite applies to the shell running the tests too.

## Controller fabrication contract and guarded native operations

The next controller review selected the four-layer JLC04161H-7628 stack and
0.24/0.15/0.50 mm USB line/spacing geometry from an actual vendor calculation.
Independent review reproduced a 0.194403 mm USB locator clearance below the
0.20 mm fabrication minimum. R0.25 on only the four logical ground pads raises
it to 0.218788 mm while preserving all pad bounds, centres, nets and holes.
Fresh native before/after comparison covers 99 footprints and all 300 physical
pads: only those four radius/ratio pairs change, representing two physical areas.
The geometry regression fails against the previous source. Evidence is in
`/tmp/crystal-shim-usb-ground-radius`; the selected design and numeric evidence
are preserved in [the fabrication contract](controller-stackup.md).

The same independent review resolved the service eFuse's original 0.15 mm drill
proposal to 0.20/0.35 mm filled/capped vias. Actual source-polygon calculations
preserve its existing mask and split stencil geometry. The module's interstitial
ground vias require tenting without new apertures. These changes are declared,
not inserted into a routed board. Thermal measurements and manufacturing-process
acceptance remain open; no source fixture is a thermal result.

Verified Konnect 0.2.1 project-library registration created only the staged
fp-lib-table, leaving all existing source files and the global library table
unchanged. Actual KiCad 10.0.5 checks eliminated all 99 PCB and 95 schematic
footprint-library findings afterward. Native settings-manager serialization also
preserves the board while setting the supported 0.20 mm hole-to-copper rule in
the new project. SaveProject can additionally create local .kicad_prl settings;
the wrapper binds that exact optional output rather than discarding it. These
are initial-stage operations, not adoption or schematic-cleanup completion.

Independent guard/helper review found no actionable defect in the reviewed
wrapper, registration and native settings boundary. Its 14 tests and 133
assertions pass; a separately created native control project differs only in
`min_hole_clearance`, from 0.25 to 0.20 mm. Invalid declarations and repeated
operations reject without writes. Exact reviewed source hashes and limits are
in `/tmp/crystal-shim-controller-stage-review/review.md`. Root separately ran
the public `bun run handoff:controller` command through the full native pipeline.
Strict parity passes, with 655 declared initial ERC findings and 216 unrouted
items but zero other DRC violations. Root inspected the native PCB image and
power/USB schematic pages. A proposed USB clipping finding was rejected after
independent full-page inspection: R40/R41 and their wires are inside the A2 page.
Complete page framing/legibility review and clean ERC still precede acceptance
and routing. This bounded clean code review does not approve
the board or establish whole-project convergence.

## References used to triage

- [TI TIDRCS2 copper layout](https://www.ti.com/lit/pdf/tidrcs2), first page.
- [TI TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf), sections 4.3, 4.4 and 8.4.
- [TI TPS2553](https://www.ti.com/lit/ds/symlink/tps2553.pdf), Rev F pin table and current-limit Table 2.
