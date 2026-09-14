# Controller routing review and USB decision

Reviewed 2026-09-14. The owner accepts USB full-speed (12 Mbps) F.Cu/B.Cu routing,
including the connector crossover and paired through-via transitions. No paid
impedance control or 81-99 ohm fabrication acceptance is required. The prior
F.Cu-only/no-via, exact gap, 0.5 mm mismatch and mandatory side-ground/stitch-pitch
criteria are superseded for these reviewed paths. USB90 remains a routing-default
name, not a claim of measured or guaranteed impedance. Actual USB operation remains
a final-board commissioning check.

Independent power and ground reviews found no functional routing blocker. Buck
loops and ESP decoupling are compact; 3V3 uses In2 distribution; motor drivers
have nearby ground-via groups. In1 and B.Cu each have one continuous ground fill;
all nine F.Cu regions connect, including J4's contact regions through its plated
shield pads. No concrete USB functional issue or long open stub was identified.

The two requested fixes were verified from fresh saved native geometry:

- V5_SERVICE now has parallel 0.6/0.3 mm vias at (78,112) and (77,111), connected
  on F.Cu and B.Cu. This service feed excludes motor and relay-coil current.
- The unused V3V3 via at (52,77.5) is removed.

The release reconciles the native rules and routing checker with this decision,
declares the exact added V5_LOGIC pour and replaces the legacy fabrication note.
Fresh final routing checks report **zero findings and zero unconnected items**.
The former 21 USB and two service-via policy findings are removed through the
reviewed rule changes, without changing traces, vias or clearances.

The [combined pre-fabrication review](evidence/pre-fab-2026-09-14/) records current
validation, copper preservation, labels, procurement and CAM evidence. USB operation
still requires final-board commissioning; no signal-integrity certification or
impedance guarantee is claimed.
