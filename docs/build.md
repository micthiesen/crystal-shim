# Build and commissioning sequence

1. **Establish sensor geometry.** Use the owner's 5 mm glass and 50 mm span down
   from the rim; allow board padding without a rim clip. Stop/restart and timed
   override behavior are confirmed. Adapt TI's geometry and define calibration data.
   Prototype at isolated low voltage before making mains hardware.
2. **Prove the sensor.** Measure rising/falling levels and receding wet glass with
   hands, deposits and expected installation conditions. Record raw capacitances;
   set a threshold margin and freshness policy from evidence.
3. **Capture electrical design.** Select complete connector sets, parts/footprints,
   power budget, GPIO map and protection components. Review mains separation and
   enclosure before routing. Resolve the output snubber with actual pump tests.
4. **Author and review boards.** Follow `$pcb`: source checks, schematic/PCB renders,
   explicit placement and augmentation manifests, staged KiCad handoff and parity.
   Route and check in KiCad; use `$kicad-manufacture` for release artifacts.
5. **Commission low voltage.** Verify supplies, USB power combinations, default-off
   driver, sensor faults, retained maintenance and watchdog on real hardware.
   Add Matter/HomeKit switch reporting, configurable local schedules, Off suppression
   and timed overrides; prove every run cap through clock/config/network changes.
   Provision Pushover credentials separately, then verify water-transition alerts
   and control independence during network/API failures.
6. **Commission mains and load.** After reviewed protection/enclosure setup, validate
   actual pump starts, suppression, thermal and off behavior. Record exact variants
   and measurements in the BOM and matrix.
7. **Validate installation.** Repeated switching with the actual aquarium and PC,
   cable routing, GFCI and water behavior. Establish the observation interval needed
   to substantiate no routine cleaning before unattended use.

`sh scripts/check.sh` is the development gate. PCB dependencies must be installed;
the Rust toolchain installs the C6 target. [Firmware](../firmware/README.md) and
[PCB](../pcb/README.md) document individual commands. No credentials are required
for the offline scaffold. Matter/Wi-Fi commissioning and Pushover application/recipient
keys are future integration inputs. Do not commit them or send setup test messages.

Parts remain candidates until exact datasheets, footprint and mating-system checks
pass. The BOM carries design status separately from purchase status. No purchasing
or hardware flashing is included in setup. Selection for a prototype is not
selection for unattended operation.
