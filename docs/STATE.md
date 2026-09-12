# Current state

Last updated: 2026-09-12

## Now

The [full project goal](goal.md) is active: complete all three final-use boards,
actual ESP firmware, repeated adversarial reviews and manufacturing delivery,
then support measured commissioning of the one final assembly. No separate
prototype or planned respin. No fabrication or operating gate has passed.

The owner-confirmed requirements remain freshwater, 5 mm glass, a 50 mm physical
sensing span below the rim, the owner's separate snug clip, and at most 203.2 mm
sensor harness to an enclosure on the surface behind the tank. Adjustable timed
schedules, automatic low stop/recovery, bounded HomeKit overrides, local settings
and Pushover transition alerts remain the [control contract](controls.md).

- Sourced design documents now cover [sensor geometry](design/sensor-design-basis.md),
  [controller](design/controller-design-basis.md), [mains/enclosure](design/mains-design-basis.md)
  and [firmware integration](design/firmware-integration.md). They are capture
  candidates under review, not approved schematics or layouts.
- The core has schedule evaluation and a versioned retained safety record in
  addition to its supervisor and water-state logic. A separate async
  [FDC1004 driver](../firmware/drivers/README.md) acquires complete sequential OoP
  frames. The integer calibration stage validates measured coefficients and
  raw/time/slew limits. ESP capture pin bindings, separate control/sensor executors,
  sensor recovery, fault latching, watchdog and bounded USB diagnostics are implemented.
  Boot now validates saved configuration/calibration and repairs retained state
  through an exclusive relay-off flash gate. The core has a bounded configuration
  codec and POSIX timezone resolver. Runtime settings/storage coordination,
  schedule/command ingress, provisioning and networking remain work. The current
  image still has no input that can request a pump run.
- The [verified TLS provider](design/tls-provider.md) is implemented and C6-built,
  with automatic clock ageing and a checked-in offline certificate test harness.
  The initial provider also passed a live public-endpoint handshake.
  Its actual Matter network integration and runtime heap/cadence evidence remain
  work. It has not sent a Pushover notification.
- USB is a self-powered data port with hardware VBUS gating and a separate
  isolated 5 V service input. The sensor has a controlled current-limited feed
  and independently enabled bus buffer for power recovery. The protected PSU
  rail powers the relay coil; service power only feeds logic. LT3042 sensor
  regulation now has exact capacitors and a 200 ms firmware startup allowance.
- The locked mains branch split is preserved: fuse/MOV then separate IRM and
  pump-filter branches. PE bypasses board connectors. Exact parts and provisional
  mechanical allocations are in the mains basis; physical results remain unrun.
- The [BOM](../bom/bom.csv) now distinguishes sourced capture candidates from open
  items. It is still incomplete for ordering. PCB directories contain requirements
  and tooling only; there are no product schematics, routes or fabrication outputs.

## In progress

1. Host schedule/retained review converged after DST, rollback, malformed-record
   and public-input fixes. Driver review found no concrete defect. Sensor findings
   are triaged in the [review record](design/review-log.md); geometry remains open.
2. Mains connectors are now exact Molex Sabre candidates with wider pitch;
   partial/cross-mating, exposed metal and final layout still require checks.
   The normal PSU envelope now includes ripple, temperature and wiring, with an
   850 mA system allocation and revised supervisor divider. The
   [secondary protection circuit](design/power-protection-review.md) now selects
   same-footprint IRM-10-5 and TPS259470 ahead of coil and controller, with
   calculated UV/OV/current/ramp networks. STPS2L40U OR diodes preserve the
   low-input budget. The eFuse's exact passive ordering codes, references and
   quantities are now in the BOM and mains capture table. Lands and transient/thermal
   closure remain before schematic release. The static cutoff is not a guaranteed
   transient clamp. Forward off-state leakage is not bounded by TI's reverse-polarity
   leakage test; PWR-05 must verify discharge/backfeed and shutdown timing.
   No physical overvoltage or dropout result is claimed.
3. The [footprint audit](design/footprint-audit.md) identifies missing/exact-import
   candidates. Visual source rechecks refuted the Bourns and IRM mismatch claims;
   stock geometry matches when the native IRM pin functions and rotation are
   respected. No product KiCad files have been generated or changed.
4. TLS review found and fixed stale-clock acceptance and missing reproducible
   tests. The second independent pass is clean within this scope. Exact small passives, cable,
   enclosure fit, actual PCB source and ESP adapters remain implementation work.
5. A source/ELF audit found that priority cannot isolate control from flash access.
   The [implemented boot flash adapter](design/flash-storage.md) enables critical
   sections, waits for a matching relay-off acknowledgement and keeps the output
   inhibited across bounded read/program/erase chunks. Only control feeds the
   revised 1,500 ms watchdog. Matter still needs to use this same storage owner.
   Root corrected partition-buffer sizing and enabled MD5 validation. Review fixed
   an interrupt-enable guard and custom-partition panic; host regressions cover
   the actual selection code. Configuration/timezone reviews and a fresh final
   flash pass found no remaining actionable defect in this scope. The IRM-10-5
   choice resolves the earlier 1 A supply/current-limit tolerance conflict without
   increasing the board envelope or normal load allocation. Independent power
   and sensor reviews fixed a GND-current budget error, missing passive inventory
   and an unsupported leakage guarantee. Final rereads found no further actionable
   issues in these component scopes; source capture and physical gates remain open.

## Owner input pending

The TI dry-reference geometry needs the **normal-full water surface distance
below the top edge of the glass**. An asynchronous question is pending. The current
38 x 86 mm sensor proposal places a 10 mm dry band below the rim and permits a
valid surface 11-50 mm down. Do not freeze that geometry until it fits the owner's
normal water level. Firmware, mains/controller design, parts and tooling remain
independent work. This is a newly exposed geometry input, not a request for a
prototype or final-unit calibration before fabrication.

## Verification

`sh scripts/check.sh` passes after the power-circuit and 200 ms sensor-startup
changes: 79 core tests,
nine driver tests, one CLI test, three production-code partition regressions,
11 deterministic TLS tests on Linux through OrbStack with crypto-profile parity,
host and embedded fmt/clippy, C6 release build, PCB source fixture, two Bun tests
and 28 handoff tests. Two existing tscircuit fixture reference-text warnings
remain documented tooling output. Documentation checks pass for the new design
records. The TLS provider report separates its historical app build from the linked
provider probe and the live host checks; no C6 runtime result is implied.
GitHub documentation and firmware CI passed for configuration/storage checkpoint
`3abf894`, including the three partition regressions, Linux TLS harness and ESP target
build. The [firmware run](https://github.com/micthiesen/crystal-shim/actions/runs/34667891185)
records those hosted checks. The local release ELF reports text 611,742 / data 6,628 / bss 8,524
bytes; this is not the complete SRAM/stack budget or physical runtime evidence.

Every [physical commissioning result](../testing/test-matrix.csv) remains Not run.
No parts were bought, hardware flashed, mains energized or live alerts sent.

## Next after current reviews

Complete exact footprint/land validation, remaining controller small parts and
the layout-dependent power calculations, then capture controller and mains source
while implementing ESP adapters. The secondary topology and passive ordering
codes are now selected; transient and off-state behavior remain explicit gates. Controller
capture is the preferred next board step because its pin/power interfaces unblock
complete firmware integration and the mains LV boundary. The next firmware unit
is runtime configuration/retained transactions and schedule/command ingress,
followed by the shared Matter network and settings/notification adapters. Sensor capture awaits the rim datum;
fabrication export awaits all three complete designs. Remaining review must cover
actual artifacts, not only these design documents. The overall goal stays active
through those implementation and delivery steps.
