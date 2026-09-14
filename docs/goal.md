# Project delivery and current milestone

Complete Crystal Shim as a one-shot final-use three-board controller, carrying the
owner's requirements through implementation, independent adversarial review,
verification, manufacturing delivery and final-unit commissioning support.
The design, routing, fabrication-delivery and purchasing milestone is complete.
All components/materials are ordered or in stock, and the owner placed JLCPCB
order W2026091502305469 for five of each final board. The project is waiting for
hardware delivery at the owner's request. Assembly and physical commissioning
remain future work; purchase confirmation does not establish operating acceptance.
See [STATE](STATE.md) for the order records and current handoff.

1. Resolve parts, footprints, sensor geometry, all board/harness interfaces,
   power/protection calculations, isolation and mechanical fit from primary
   references. Preserve freshwater, 5 mm glass, the 50 mm physical sensing span,
   thin adhesive mounting below the rim and the 203.2 mm harness limit.
2. Implement all three tscircuit designs and placements. Complete the guarded
   KiCad handoff, routing, source parity, ERC/DRC and visual review. Deliver
   fabrication files, assembly BOMs, harness drawings and mechanical interfaces
   for one fabrication cycle. No separate prototype or planned respin.
3. Implement the actual ESP32-C6 application, including calibrated sensor input,
   relay and maintenance control, watchdog, persistent state, diagnostics,
   adjustable scheduling, bounded HomeKit overrides, the local settings webpage
   and verified-HTTPS Pushover transition delivery. Network/storage cannot delay
   protection or renew a run indefinitely.
4. Use a few focused reviewers at meaningful stages, with adversarial root triage.
   Fix demonstrated correctness defects and verify their consequences. Preserve
   the agreed simple hardware and firmware contract; do not add redundant fault
   protection or extraordinary qualification without a concrete requirement.
   Record each review scope and evidence, and stop when its actionable findings
   are resolved.
5. Run the project checks and applicable release gates, inspect actual outputs,
   update the decision register/BOM/commissioning matrix/state, and commit and
   push completed work directly to main.
6. Supply concrete procurement, assembly, adhesive-interface, provisioning, pairing,
   calibration and commissioning instructions. Physical measurements remain
   outstanding until the final hardware exists and the owner performs them with
   appropriate equipment and authorization. Source checks cannot substitute for
   sensor, mains, temperature, interference or installed-operation evidence.

Purchasing, flashing, energizing mains and sending live notifications are not
incidental design actions. Continue all independent work before requesting an
essential owner input or physical action. The operating acceptance gates remain
open until actual evidence satisfies [the release criteria](decisions.md).
