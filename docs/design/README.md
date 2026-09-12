# Detailed design basis

These documents turn the requirements into concrete engineering selections for
schematic and firmware implementation. They are candidates under review, not fabrication
release or commissioning evidence. Their explicit open items remain work to finish.

- [Sensor](sensor-design-basis.md): TI OoP topology, glass/rim geometry, references,
  local regulation, I2C and clip interface.
- [Controller](controller-design-basis.md): module pins, power and service inputs,
  USB attach gating, relay driver, power-good interlock and harnesses.
- [Mains and enclosure](mains-design-basis.md): PSU, relay, filter, fuse/MOV/RC,
  mains harness, PE, spacing and enclosure allocation.
- [Secondary power protection](power-protection-review.md): selected 2 A supply,
  reverse-blocking eFuse networks, static margins and remaining transient review.
- [Firmware integration](firmware-integration.md): schedule/retained state,
  executor ownership, Matter, HTTP, Pushover, storage, USB and resource gates.
- [Calibration](calibration.md): measured TI response normalization, integer arithmetic,
  raw envelopes, frame ordering and validity checks.
- [Configuration](configuration.md): validated settings and canonical bounded storage format.
- [Timezone](timezone.md): explicit POSIX rules, DST folds/gaps and calendar limits.
- [Flash storage](flash-storage.md): output-off ownership, bounded flash chunks and boot recovery.
- [Verified TLS](tls-provider.md): fixed Pushover trust policy, C6 build,
  live endpoint checks, measured linked size and remaining runtime evidence.
- [Footprint audit](footprint-audit.md): installed-library candidates, manufacturer
  comparisons and exact patterns still required before capture release.
- [Review record](review-log.md): findings, corrections, rejected claims and
  scopes that still require review.

The [active project goal](../goal.md) covers implementation, repeated adversarial
review, manufacturing output and final-unit commissioning support. No board is
released by a document's use of an exact part number or dimension.
