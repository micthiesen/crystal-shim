Current routing preparation: planes, fills, ground/thermal vias and enforced
routing rules are applied. Follow the [routing guide](../../../docs/design/routing-guardrails.md)
and run `sh scripts/check-routing.sh mains`. The current ECO receipt is
[evidence/routing-guardrails/eco-acceptance.json](evidence/routing-guardrails/eco-acceptance.json).
Earlier evidence/counts below describe the pre-fill placement milestone.

# Mains native project

`mains.kicad_sch` and `mains.kicad_pcb` are the adopted, unrouted shared-supply
project, accepted and ready for routing. Tscircuit under `../design` owns components, nets, specification and
placement; KiCad owns declared routing and insulation augmentations. Use the
project PCB/Konnect handoff for subsequent changes.

The initial lock and actual staging evidence are in `../design`. The PCB has
four primary/SELV isolation areas and four insulating mounting-hardware routing
reservations. It is not a routed or fabrication-ready board. See
[the native handoff record](../../../docs/design/mains-native-handoff.md).

Final strict ERC, ordinary DRC and schematic parity pass. The 39 remaining
connections are unrouted. Accepted evidence is `../design/evidence/final-eco-receipt.json`.
