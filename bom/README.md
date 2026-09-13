# Bill of materials

[bom.csv](bom.csv) tracks one current three-board assembly independently of
purchase status. Current source contains **113 controller components** (99 purchased
parts and 14 copper test pads), **22 mains parts**, and **16 sensor components**
(15 purchased parts plus the electrode copper structure). The grouped active PCB
rows therefore total **136 purchased placements**. Each active group lists its
board-qualified reference designators. Cable housings, contacts, enclosure parts
and the service kit are separate quantities.

Rows marked **Not populated** have quantity zero. Their stable IDs and old
selection notes remain for history; do not order them. Shared current MPNs are
consolidated into one active group, so former duplicate rows must not be added
again. Design selection does not establish native-board parity, fabrication
readiness, availability or a purchase. No parts have been ordered by this work.

The present assembly includes the IRM-45-12, mains-board 5 V buck, fused 12 V
feed, three controller pump drivers, second sensor port and two input pads.
Future pumps, bottle accessories and reservoir sensor board are deferred and
must fit the [fixed attachment contract](../docs/design/refill-expansion.md).
There is no separate future expansion controller PCB in this BOM.

The known GST18U05-P1J service adapter uses a 2 A 0215002.MXP cartridge in a
01500274Z inline holder. Splice its 16 AWG leads to the selected Micro-Fit contact
wire range with insulated joints. Service power is for mains-disconnected setup;
verify polarity and delivered voltage under the [service contract](../docs/design/service-input.md).
It does not power the coil or future motors.

Exact wire lengths, assembly consumables, enclosure mounting hardware and received
mating fits still belong to assembly documentation. The current enclosure is
Hammond 1590ZGRP243; the [mechanical receipt](../cad/shared-enclosure/README.md)
records what was checked. All physical commissioning results remain unmeasured.
