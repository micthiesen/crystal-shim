# Mechanical artifacts

The [stencil fixtures](stencil-fixtures/README.md) provide printable PETG trays
for the three ordered PCBs, with STEP/STL/3MF exports, nominal shims, parametric
CadQuery source and digital fit checks. Physical fit remains untested.

The current [shared-enclosure plan and CAD screen](shared-enclosure/README.md)
uses Hammond 1590ZGRP243 for the stacked mains and controller boards. It retains
the manufacturer PDF and STEP archive, reproducible CadQuery script, actual
collision/distance results, negative controls and a reloaded STEP export.
See [mechanical requirements](../docs/mechanical.md) for mounting and cable limits.

`controller-fit/` and `mains-fit/` are historical nominal fit evidence for the
superseded 1554V2GY enclosure and earlier PCB sizes. Their machining, carrier,
portal and mating assumptions must not be applied to the current boards.

No enclosure production machining drawing is released.
The sensor uses thin adhesive film directly against the glass; no clip is required.
Its board and pigtail interface are specified in the mechanical requirements.
