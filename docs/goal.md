# Active project goal

Complete Crystal Shim as a one-shot final-use three-board controller, carrying the
owner's requirements through implementation, independent adversarial review,
verification, manufacturing delivery and final-unit commissioning support.
The goal is active. A research dossier, scaffold or passing host tests alone do
not complete it.

1. Resolve parts, footprints, sensor geometry, all board/harness interfaces,
   power/protection calculations, isolation and mechanical fit from primary
   references. Preserve freshwater, 5 mm glass, the 50 mm physical sensing span,
   the owner's separate clip and the 203.2 mm harness limit.
2. Implement all three tscircuit designs and placements. Complete the guarded
   KiCad handoff, routing, source parity, ERC/DRC and visual review. Deliver
   fabrication files, assembly BOMs, harness drawings and mechanical interfaces
   for one fabrication cycle. No separate prototype or planned respin.
3. Implement the actual ESP32-C6 application, including calibrated sensor input,
   relay and maintenance control, watchdog, persistent state, diagnostics,
   adjustable scheduling, bounded HomeKit overrides, the local settings webpage
   and verified-HTTPS Pushover transition delivery. Network/storage cannot delay
   protection or renew a run indefinitely.
4. Review in bounded independent adversarial batches covering sensing, electrical
   and mains design, timing and failure behavior, security/network integration,
   mechanics and manufacture. Reproduce and triage findings, fix actionable
   defects and repeat fresh review until no actionable findings remain and another
   pass yields no useful new feedback. Record scope and evidence rather than
   claiming the whole project reviewed after one clean component review.
5. Run the project checks and applicable release gates, inspect actual outputs,
   update the decision register/BOM/commissioning matrix/state, and commit and
   push completed work directly to main.
6. Supply concrete procurement, assembly, clip-interface, provisioning, pairing,
   calibration and commissioning instructions. Physical measurements remain
   outstanding until the final hardware exists and the owner performs them with
   appropriate equipment and authorization. Source checks cannot substitute for
   sensor, mains, temperature, interference or installed-operation evidence.

Purchasing, flashing, energizing mains and sending live notifications are not
incidental design actions. Continue all independent work before requesting an
essential owner input or physical action. The operating acceptance gates remain
open until actual evidence satisfies [the release criteria](decisions.md).
