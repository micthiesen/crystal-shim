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
- The [BOM](../bom/bom.csv) now includes exact controller LED, three buttons and
  enumerated small passives. It is still incomplete for ordering.
  [Controller source](../pcb/controller/design/README.md) now includes 22 representative
  component models and connected relay-permission/logic-power sections. Copper,
  holes, pin maps and section netlists are tested. The exact isolated service adapter,
  harness and service-specific eFuse circuit are in the [service design](design/service-input.md).
  Complete product schematics, placements, routes and fabrication outputs remain outstanding.

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
3. The [footprint audit](design/footprint-audit.md) now resolves source copper for
   WROOM, AP63203, AO3400A, TCA9517A, TPS3808, TPS2553, LVC1G08, LVC1G14 and
   FSUSB42. Their source pin maps and compiled lands are checked, including
   rotation and the WROOM's nine ground lands. The generic stock IC patterns
   differ from manufacturer recommendations; exact source patterns replace those
   candidates. ST Schottky/USB ESD, Panasonic/TDK/Murata passives, Bourns, LED,
   buttons and three Micro-Fit models are now captured. Review corrected inductor
   corner identity and two connector-audit transcription errors; Murata uses its
   actual reflow table, not test-substrate lands. Native adoption, assembly details
   and full board capture remain work. No product KiCad files have been generated or changed.
4. TLS review found and fixed stale-clock acceptance and missing reproducible
   tests. The second independent pass is clean within this scope. Controller
   [small parts](design/controller-small-parts.md) are now selected. A 330 ohm
   reset-button resistor bounds capacitor discharge while retaining a valid reset
   low, including the supervisor's MR pullup. The service design selects GST18U05-P1J,
   a shortened Tensility pigtail, input TVS and a second TPS259470. Added 470 kohm
   sense-pin resistors limit reverse-input current; service thresholds are distinct
   from the mains instance. Review also exposed an unloaded-startup extrapolation;
   cold-start/light-load voltage remains an explicit final-unit check. USB pad mapping, service eFuse/TVS/passive capture,
   sensor-cable ESD, enclosure fit, complete PCB source and ESP adapters remain work.
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

`sh scripts/check.sh` passes after the controller sections, component models and
service BOM changes: 79 core tests, nine driver tests, one CLI test, three
production-code partition regressions, 11 deterministic TLS tests on Linux through
OrbStack, host/embedded fmt/clippy, C6 release build, PCB source fixture, 13 Bun
tests (555 assertions) and 28 handoff tests. Root inspected the 22-part copper SVG
and both connected-section schematics. Independent source review found and fixed
the inductor footprint-identity mismatch; final scoped reviews of passives,
connectors, assembly parts and both netlists found no remaining actionable issue.
Two existing tscircuit fixture reference-text warnings remain documented output. Documentation checks pass for the new design
records. The TLS provider report separates its historical app build from the linked
provider probe and the live host checks; no C6 runtime result is implied.
GitHub documentation and PCB CI passed for component checkpoint `551b106`:
[PCB run](https://github.com/micthiesen/crystal-shim/actions/runs/34687114502),
[documentation run](https://github.com/micthiesen/crystal-shim/actions/runs/34687114478).
The unchanged firmware previously passed [hosted firmware checks](https://github.com/micthiesen/crystal-shim/actions/runs/34685901002)
at `28079e4`, including production partition regressions, Linux TLS and ESP build. The local release ELF reports text 611,742 / data 6,628 / bss 8,524
bytes; this is not the complete SRAM/stack budget or physical runtime evidence.

Every [physical commissioning result](../testing/test-matrix.csv) remains Not run.
No parts were bought, hardware flashed, mains energized or live alerts sent.

## Next after current reviews

Capture the service eFuse/input TVS and remaining protection passives, preserve
USB connector alphanumeric pads through export, and select sensor-cable ESD.
Then integrate the remaining controller sections with the connected relay and
logic-power sections into one complete schematic and placement. Continue layout-dependent power calculations
and mains source while implementing ESP adapters. The secondary topology and passive ordering
codes are now selected; transient and off-state behavior remain explicit gates. Controller
capture is the preferred next board step because its pin/power interfaces unblock
complete firmware integration and the mains LV boundary. The next firmware unit
is runtime configuration/retained transactions and schedule/command ingress,
followed by the shared Matter network and settings/notification adapters. Sensor capture awaits the rim datum;
fabrication export awaits all three complete designs. Remaining review must cover
actual artifacts, not only these design documents. The overall goal stays active
through those implementation and delivery steps.
