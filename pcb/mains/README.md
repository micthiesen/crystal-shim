# Mains board

The 22-part shared-power source and 150 × 110 mm placement allocation live in
[design](design/README.md). The IRM-45-12 supplies a separately fused 12 V motor
feed and AP63205-regulated 5 V controller/relay rail. The original skimmer filter
and relay behavior remain. F3 is the board-mounted T1A filter branch fuse; F2 is
the 3 A motor-feed fuse. F1 inlet fuse, manufactured filter and continuous PE
wiring remain offboard.

See the [design basis](../../docs/design/mains-design-basis.md),
[placement](../../docs/design/mains-placement.md), and
[native handoff](../../docs/design/mains-native-handoff.md). The [native project](kicad/README.md) has the accepted stacked placement,
right-angle connectors, filled isolated pours and installed routing rules.
It is ready for routing with 31 unconnected items and clean strict ERC/parity/DRC.
