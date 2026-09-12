# Design and implementation review record

Date: 2026-09-12. This records bounded adversarial review, root triage and evidence.
It does not release a board or substitute for the commissioning matrix. All product
PCB capture, routing and physical acceptance checks remain outstanding.

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
transactions and Matter storage remain later integration work.

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
Runtime schedule/storage coordination and command persistence remain integration
work. The later boot-storage checkpoint below does not complete those adapters.

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
11 tests successfully. The current app cannot request a pump run and does not yet integrate
the provider or Matter network; current C6 heap/cadence evidence remains work.

## References used to triage

- [TI TIDRCS2 copper layout](https://www.ti.com/lit/pdf/tidrcs2), first page.
- [TI TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf), sections 4.3, 4.4 and 8.4.
- [TI TPS2553](https://www.ti.com/lit/ds/symlink/tps2553.pdf), Rev F pin table and current-limit Table 2.
