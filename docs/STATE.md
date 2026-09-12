# Current state

Last updated: 2026-09-12

## Now

- The [full delivery goal](goal.md) is active: three final-use boards, actual ESP
  firmware, adversarial review, manufacturing delivery and final-unit commissioning
  support. No separate prototype or planned respin. No fabrication or operating
  release gate has passed.
- Requirements remain freshwater, 5 mm glass, a 50 mm physical span below the rim,
  the owner's separate snug clip and a sensor harness no longer than 203.2 mm.
  Schedules, automatic low stop/recovery, bounded HomeKit overrides, local settings
  and Pushover transitions remain the [control contract](controls.md).
- The ESP acquires calibrated FDC1004 frames and runs relay control on a separate
  interrupt executor. Its [runtime coordinator](design/runtime-transactions.md)
  handles schedules, durable configuration/retained transactions and bounded USB
  commands. The actual [Matter command and KV adapters](design/matter-integration.md)
  now share source-owned command tokens and one gated flash owner. Rejected On
  requests return an error from the actual control result; valid LOW requests
  waiting for minimum off remain accepted. Final delta review found no further
  actionable issue. Radio and commissioning are not implemented, so HomeKit cannot
  connect yet. D-22 preserves bounded behavior with explicit private-profile deviations. Authenticated
  settings, shared UTC acquisition and Pushover delivery also remain work.
- [Controller source](../pcb/controller/design/README.md) now has six connected
  sections: relay/harness, logic power, service protection, USB, module/local
  controls and eleven test pads, totaling 76 source components. Independent review
  matched the preceding 64-part/187-pin set and all 18 unused pins; separate native
  checks cover the added J1 and test pads, for 201 connected pins. Explicit labels
  fix disconnected native nets concealed by readable SVGs. Full-board integration,
  sensor interface, placement, native footprint assembly and export remain work. The known 14 repeated-pad net omissions in the raw module seed must
  be corrected and checked by shared native augmentation before adoption.
- The [mains](design/mains-design-basis.md), [controller](design/controller-design-basis.md),
  [sensor](design/sensor-design-basis.md), [secondary protection](design/power-protection-review.md)
  and [service input](design/service-input.md) bases retain exact selections and
  explicit limits. The sensor cable resistor/capacitance refinement and actual
  finite-energy backfeed calculation have passed bounded review. Review also found
  and corrected the sensor LDO's unsafe direct PGFB tie; the selected protection
  diode and updated power budgets still need coordinated BOM/source adoption.
  Source startup, transients, thermal behavior, enclosure fit and installed
  interference still need their declared design or physical evidence. The BOM is
  incomplete for ordering.
- Shared KiCad tooling assigns and checks every physical pad sharing a logical
  number. The fix is synced with canonical Stillair; exact resources remain aligned.
  Project-specific skills retain their declared differences. No adopted product
  KiCad board has been edited.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete `sh scripts/check.sh` gate passes: 115 core tests, nine driver tests,
one CLI test, nine Matter adapter tests, three production partition tests,
11 offline TLS cases on Linux, host/embedded fmt and clippy, C6 release build,
resolved Matter feature checks, PCB checks, 32 Bun tests with 2,202 assertions
and 30 handoff tests. Documentation checks cover 54 documents and two CSV tables.

Root inspected all six connected-section schematics and test-pad copper. Independent PCB section
review found no additional actionable finding in its source/native connectivity,
pin maps, service separation, passive selections, USB gating or reset/boot scope.
Disposable stages use KiCad 10.0.5; they are not accepted product boards.

The release ELF is text 621,272 / data 9,052 / bss 16,980 bytes.
This is not a combined radio/TLS SRAM or stack budget, and unused transport paths
can be removed by the linker. Every [physical commissioning row](../testing/test-matrix.csv)
remains Not run. No parts were bought, hardware flashed, mains energized or live
notifications sent.

## Next

Adopt the reviewed sensor cable power/ESD refinement across the BOM and circuit
contracts, then capture the controller sensor interface and integrate all sections
into the full schematic and placement. This advances G-02 and the shared interfaces
toward G-03/G-04 without physical hardware or the rim datum. In parallel, assemble
actual Matter radio/TCP and commissioning around the existing command and KV owner,
using the private accessory profile under D-22. Both are substantial implementation units: the
hardware risk is transient protection/export parity, and the firmware risk is
profile semantics, fallible network startup and combined SRAM use.

## Candidates not chosen

- **Freeze complete sensor geometry:** blocked only by the normal-full rim datum;
  local regulation/interface capture can proceed. Physical calibration uses final
  boards after fabrication.
- **Start native routing or fabrication:** complete schematics, placement, source
  manifests and declared native augmentations must precede G-04. Review seeds are
  not product boards.
- **Build the settings webpage first:** useful and independent, but shared radio,
  clock and command/storage ownership establish its integration boundary. Keep
  the agreed local-page contract; resume it after that network unit.

## Learned recently

- [Review record](design/review-log.md): real schematic label loss, connected USB/
  service/module evidence, repeated-pad handoff correction and runtime review.
- [Matter integration](design/matter-integration.md): command ownership/cancellation,
  applied reporting, single SDK KV owner and the unresolved device profile.
- [Runtime transactions](design/runtime-transactions.md): durable settings,
  suppression, configuration-save behavior and immediate versus durable replies.
- [Footprint audit](design/footprint-audit.md): primary drawing hashes, checked
  copper and native/paste/assembly work still owed.
- [Flash storage](design/flash-storage.md): interruptible thread-mode owner,
  resolved mutex-feature guard and actual-device timing still owed.
