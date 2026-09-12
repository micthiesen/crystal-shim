# Current state

Last updated: 2026-09-11

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
  Boot supplies no saved calibration/configuration, so the relay stays off. Actual
  storage, schedule/command ingress, settings/provisioning and networking remain work.
- The [verified TLS provider](design/tls-provider.md) is implemented and C6-built,
  with automatic clock ageing and a checked-in offline certificate test harness.
  The initial provider also passed a live public-endpoint handshake.
  Its actual Matter network integration and runtime heap/cadence evidence remain
  work. It has not sent a Pushover notification.
- USB is a self-powered data port with hardware VBUS gating and a separate
  isolated 5 V service input. The sensor has a controlled current-limited feed
  and independently enabled bus buffer for power recovery. The raw PSU rail
  alone powers the relay coil. Exact candidate circuits are in the controller basis.
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
   850 mA system allocation and revised supervisor divider. **Coil overvoltage
   protection remains open**. The [secondary protection review](design/power-protection-review.md)
   now favors a reverse-blocking TPS259470 eFuse ahead of both coil and controller.
   Exact threshold/current/ramp networks and package assembly remain to close;
   the LDO and non-reverse-blocking cutoff options were not adopted.
3. The [footprint audit](design/footprint-audit.md) identifies missing/exact-import
   candidates. Visual source rechecks refuted the Bourns and IRM mismatch claims;
   stock geometry matches when the native IRM pin functions and rotation are
   respected. No product KiCad files have been generated or changed.
4. TLS review found and fixed stale-clock acceptance and missing reproducible
   tests. The second independent pass is clean within this scope. Exact small passives, cable,
   enclosure fit, actual PCB source and ESP adapters remain implementation work.
5. A source/ELF audit found that priority cannot isolate control from flash access.
   The pending storage adapter must enable flash critical sections and wait for
   a matching relay-off acknowledgement before every access, including Matter KV.
   The current runtime has no flash adapter. Runtime review also found a short
   power-fault polling race, now addressed by a Priority3 latched fault epoch.

## Owner input pending

The TI dry-reference geometry needs the **normal-full water surface distance
below the top edge of the glass**. An asynchronous question is pending. The current
38 x 86 mm sensor proposal places a 10 mm dry band below the rim and permits a
valid surface 11-50 mm down. Do not freeze that geometry until it fits the owner's
normal water level. Firmware, mains/controller design, parts and tooling remain
independent work. This is a newly exposed geometry input, not a request for a
prototype or final-unit calibration before fabrication.

## Verification

`sh scripts/check.sh` passes at the runtime integration checkpoint: 62 core tests,
nine driver tests, one CLI test,
11 deterministic TLS tests on Linux through OrbStack with crypto-profile parity,
host and embedded fmt/clippy, C6 release build, PCB source fixture, two Bun tests
and 28 handoff tests. Two existing tscircuit fixture reference-text warnings
remain documented tooling output. Documentation checks pass for the new design
records. The TLS provider report separates its historical app build from the linked
provider probe and the live host checks; no C6 runtime result is implied.
GitHub documentation and firmware CI passed for checkpoint `6ca0fa3`, including
the Linux TLS harness and ESP target build. The [firmware run](https://github.com/micthiesen/crystal-shim/actions/runs/34664738800)
records those hosted checks.

Every [physical commissioning result](../testing/test-matrix.csv) remains Not run.
No parts were bought, hardware flashed, mains energized or live alerts sent.

## Next after current reviews

Close the coil-protection and remaining exact-part calculations, then capture
the controller and mains source while implementing ESP adapters. Controller
capture is the preferred next board step because its pin/power interfaces unblock
complete firmware integration and the mains LV boundary. The next firmware unit
is validated persistent configuration with the flash/output gate, followed by
schedule/command ingress and networking. Sensor capture awaits the rim datum;
fabrication export awaits all three complete designs. Remaining review must cover
actual artifacts, not only these design documents. The overall goal stays active
through those implementation and delivery steps.
