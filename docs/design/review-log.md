# Design and implementation review record

Date: 2026-09-11. This records bounded adversarial review, root triage and evidence.
It does not release a board or substitute for the commissioning matrix. All product
PCB capture, routing and physical acceptance checks remain outstanding.

## FDC1004 acquisition

An independent driver reviewer checked register selection, differential OoP channel
assignment, single-shot ordering, signed decoding, timeout/error paths and frame
validity. No concrete defect survived that review. Root added cancellation and
deadline-boundary regressions; all nine driver tests and strict clippy pass.
The app must still enforce the independent 5 ms transaction timeout and keep
control running during sensor recovery.

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
The ESP scheduler/storage adapters are
not implemented, so storage acknowledgement and task integration remain review work.

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
| IRM OVP threshold can exceed the coil's maximum voltage | Accepted and open. It is a fault threshold, not normal load voltage. A dedicated adjustable coil LDO is researched; hot pickup, dropout and reverse-current requirements must be resolved before adoption. |
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
11 tests successfully. The app main remains inert and does not yet integrate
the provider or Matter network; current C6 heap/cadence evidence remains work.

## References used to triage

- [TI TIDRCS2 copper layout](https://www.ti.com/lit/pdf/tidrcs2), first page.
- [TI TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf), sections 4.3, 4.4 and 8.4.
- [TI TPS2553](https://www.ti.com/lit/ds/symlink/tps2553.pdf), Rev F pin table and current-limit Table 2.
