# One-shot build and commissioning sequence

The target is one complete, final-use set of sensor, controller and mains boards,
designed and reviewed together before a single fabrication and assembly cycle.
There is no separate sensor prototype, evaluation-board phase or planned respin.
Physical calibration and acceptance use the final boards after assembly.

1. **Complete the design basis and interfaces.** Adapt TI's sensor geometry to
   freshwater, 5 mm glass and a 50 mm physical sensing span. Define the
   18 × 64 mm below-rim PCB's thin adhesive and left-pigtail interface. Select exact
   components, footprints, mating connectors, harness pinouts, rails and GPIOs
   across all three boards. Calculate power, sensing and protection margins;
   document assumptions and checks owed on the assembled unit. No sensor hardware
   measurement is required to proceed with controller or mains design.
   Close the [refill attachment reservation](design/refill-expansion.md) before
   controller routing: three default-off pump drivers, a second buffered sensor bus
   and two accessible input pads. Capture the IRM-45-12 and 5 V buck on the power
   board, with a fused 12 V motor feed. Future accessories must fit the fixed
   12 V / 2 A aggregate allocation. Only accessories and a reservoir sensor PCB
   are added later; future feature implementation remains outside this cycle.
2. **Capture and review the complete design.** Author all three boards in
   tscircuit using `$pcb`, including explicit placement, geometry and augmentation
   manifests. Check schematic and PCB renders, datasheet pin/pad mappings, the
   sensor channel/shield geometry, enclosure fit and every board-to-board interface.
   Review mains separation and protection before routing. Select the fuse, MOV,
   RC network and filter from documented ratings and calculations before release;
   actual-load verification follows assembly.
3. **Route the accepted native boards and prepare fabrication files.** The
   compact controller, sensor and mains ECOs are accepted for routing;
   use each board's final
   native acceptance in [STATE](STATE.md), not an old initial-export receipt.
   Sensor acquisition, calibration storage, local control, retained maintenance,
   Matter/HomeKit, schedules, settings and Pushover firmware are implemented;
   physical operation still needs commissioning. Route all board connections,
   preserve the prepared planes, vias, mask/paste and isolation, and finish the
   routing-dependent return-path and USB stitching requirements. Run final ERC/DRC and fabrication review using
   `$kicad-manufacture`. Release coherent BOMs, assembly and harness drawings,
   enclosure/PCB interfaces and manufacturing outputs. G-02/G-03/G-04 govern
   fabrication release, separately from permission to start routing.
4. **Fabricate and assemble the final board set.** Use the reviewed release to
   order and assemble the three boards, enclosure and harnesses as one complete
   build, including the sensor's thin adhesive mounting. There is no
   intermediate sensor-board order or measurement-driven second fabrication phase.
5. **Calibrate and commission the final low-voltage hardware.** With mains
   disconnected and a reviewed isolated low-voltage power arrangement, verify
   supplies, supported USB/service arrangements, default-off drive, sensor faults,
   retained state and watchdog behavior. Create and deliver the private
   [first configuration](design/first-configuration.md), then install the
   [Matter identity](design/matter-provisioning.md) and commission networking.
   Initial configuration leaves calibration absent, schedules empty and maintenance
   active. Fit the final sensor to the aquarium; measure rising and
   falling water, receding wet glass, adhesive gaps and mounting replacement. Record raw
   capacitances and set stop/restart margins and freshness limits through firmware.
   Verify Matter/HomeKit, window suppression, override expiry, settings persistence
   and control independence during clock/configuration/network changes. Provision
   credentials separately and verify water-transition notifications.
6. **Commission the final mains assembly and load.** After installation and
   protection review, verify actual pump starts, suppression, thermal behavior,
   leakage and loss-of-control-power response. Record measurements and actual
   fitted parts; record and resolve any failed acceptance check.
7. **Accept the installed unit.** Repeat switching with the actual aquarium, PC
   and cable routing. Establish the observation interval for receding films and
   deposits. G-01/G-05/G-06 and the G-07 observation evidence govern unattended use.

`sh scripts/check.sh` is the development gate. PCB dependencies must be installed;
the Rust toolchain installs the C6 target. [Firmware](../firmware/README.md) and
[PCB](../pcb/README.md) document individual commands. No credentials are required
for the offline checks. Matter/Wi-Fi commissioning and Pushover application/recipient
keys are supplied privately during final-unit provisioning. Do not commit them or send setup test messages.

The BOM records selected source parts and quantities for one complete unit,
separately from purchase status. Exact harness cut lengths and ordinary mounting
hardware are assembly details. No order or physical commissioning is performed
by completing a native routing handoff.
