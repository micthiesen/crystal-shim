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
- The ESP now acquires calibrated FDC1004 frames, controls the relay on a separate
  interrupt executor and owns a bounded [runtime coordinator](design/runtime-transactions.md)
  for schedules, configuration/retained transactions and physical USB commands.
  Configuration saves revoke the active lease, commit maintenance-retained before
  configuration and require a durable explicit exit. Sensor revisions, storage
  tickets and monotonic deadlines prevent stale inputs from enabling output.
  The [verified TLS provider](design/tls-provider.md) exists; Matter, authenticated
  settings, automatic time acquisition, shared clock publication and Pushover
  delivery remain implementation work.
- [Controller source](../pcb/controller/design/README.md) has 25 representative
  component models and connected relay-permission/logic-power sections. USB4105,
  TPS259470 and SMBJ8.0CA now have checked copper/pin maps and initial-export
  corrections for USB origin/native pins and eFuse custom-pad copper. Independent
  native checks preserve every USB pad/hole and all eFuse corner polygons through
  cardinal rotations. Complete controller source, native footprint assembly details,
  placement and board export integration remain work.
- The [mains](design/mains-design-basis.md), [controller](design/controller-design-basis.md),
  [sensor](design/sensor-design-basis.md), [secondary protection](design/power-protection-review.md)
  and [service input](design/service-input.md) bases retain exact selections and
  explicit limitations. IRM-10-5 feeds the protected secondary; GST18U05-P1J service
  power cannot energize the coil. Service unloaded startup, transients, thermal
  behavior, enclosure fit and installed interference still need their declared
  design or physical evidence. The BOM is incomplete for ordering.
- Shared KiCad handoff tooling now assigns and checks every physical pad sharing
  a logical number. The fix is synced with canonical Stillair
  [6384e81](https://github.com/micthiesen/stillair/commit/6384e81), whose
  [CI passed](https://github.com/micthiesen/stillair/actions/runs/34690680510).
  Shared exact resources are aligned; project-specific skills and commands retain
  their declared differences. No adopted product KiCad board was edited.

## Owner input pending

The normal-full water surface distance below the glass top edge is still needed
before freezing the TI dry-reference geometry. An asynchronous question is already
pending. The current 38 x 86 mm proposal puts a 10 mm dry band below the rim and
permits a valid surface 11-50 mm down. Do not treat that proposal as accepted geometry.
Controller, mains and firmware work remain independent of this input.

## Verification

The complete `sh scripts/check.sh` gate passes: 108 core tests, nine driver tests,
one CLI test, three production partition tests, 11 offline TLS cases on Linux,
host/embedded fmt and clippy, C6 release build, PCB checks, 21 Bun tests with
1,262 assertions and 30 handoff tests. Documentation checks cover 52 documents and
two CSV tables. Root inspected the 25-part copper gallery, both connected-section
schematics and corrected native eFuse copper. Independent component/export and
final runtime delta reviews found no further actionable findings within their scopes.

The release ELF is text 620,144 / data 9,020 / bss 16,940 bytes. This is not the
complete SRAM/stack budget or physical timing evidence. The current native checks
use disposable initial review stages and cannot release a product board.
Every [physical commissioning row](../testing/test-matrix.csv) remains Not run.
No parts were bought, hardware flashed, mains energized or live notifications sent.

## Next

Capture the remaining service passives and connected service/USB sections before integrating the full
controller schematic and placement. This advances G-02 and the shared hardware
interfaces toward G-03/G-04 without waiting for physical hardware or the rim datum.
Continue the Matter network and gated KV adapter independently, followed by settings,
joint schedule/TLS clock publication and notification delivery. The remaining
passive land mappings are resolved in the footprint audit. The
[sensor-cable protection proposal](design/sensor-cable-protection.md) defines exact
parts and a 200 pF initial bus target; power-switch residual-pulse protection still
needs circuit/layout refinement before adoption. Review identified both the
positive 7 V ceiling and negative -0.3 V switch limit as unresolved. The proposed
TVS and millisecond reverse-voltage shutdown do not guarantee either boundary.

## Candidates not chosen

- **Freeze the complete sensor geometry:** blocked only by the normal-full rim
  datum; its regulation/interface work can proceed. Physical calibration happens
  on the final boards after fabrication.
- **Begin native routing or fabrication export:** complete schematics, placement,
  source manifests and declared native augmentation are prerequisites. Do not
  promote component review stages to product boards.
- **Repeat clean component-only reviews:** new feedback should target remaining
  circuits, actual integration, export parity and network behavior. Reopen a
  reviewed model only when changes or new evidence justify it.

## Learned recently

- [Review record](design/review-log.md): USB origin/net/pin corrections, eFuse anchor
  copper, repeated-pad handoff defect and runtime replay/persistence findings.
- [Runtime transactions](design/runtime-transactions.md): immediate versus durable
  acknowledgements, configuration-save behavior, pre-first-write reset boundary,
  expiry suppression and manual-run independence.
- [Footprint audit](design/footprint-audit.md): primary drawing hashes, checked
  source geometry and native/paste/assembly work still owed.
- [Flash storage](design/flash-storage.md): single owner, output-off acknowledgement,
  bounded chunks and actual-device timing still owed. Priority alone is insufficient.
