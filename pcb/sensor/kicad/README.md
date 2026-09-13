# Sensor routing handoff

Open [sensor.kicad_pro](sensor.kicad_pro). The compact sensor is **18 × 64 mm,
four layers**, with 16 footprints and 21 remaining unrouted connections. Mount
its mask-covered glass face with thin adhesive film, top 2 mm below the rim.
J1 is six outward-face solder pads; the pigtail exits left when looking at the
electronics. No component lead or mount sits between electrode copper and glass.

The glass-facing B.Cu electrodes and In2.Cu driven shields are fixed geometry.
F.Cu holds electronics and ordinary routing; In1.Cu provides ground and permitted
routing. F.Cu/In1.Cu ground pours, six tented vias and 15 CIN/shield connection
segments are already prepared. Preserve them while routing local power,
decoupling, I2C and the pigtail. Through vias default to 0.45/0.20 mm.

Strict ERC and schematic parity are clean. Six exact, UUID-bound padstack
warnings are excluded because the intentional driven-shield pads exist only on
In2.Cu. Their complete geometry/net contract is checked separately; unrelated
padstack warnings remain enabled. See the
[routing guide](../../../docs/design/routing-guardrails.md),
[design basis](../../../docs/design/sensor-design-basis.md) and
[handoff lock](../design/handoff.lock.json) for current acceptance and evidence.
[Final preparation](../design/evidence/final-preparation/) records the outward
pad-number/RIM labels and native mask/paste/via verification. The subsequent
[stencil receipt](../design/evidence/stencil-process/acceptance.json) selects the
100 µm process without changing native geometry.
Older two-layer and above-rim instructions are superseded.

Keep this project, its custom rules and local libraries together. Route, refill
with **B**, save and run `sh scripts/check-routing.sh sensor --final` before
fabrication checks/export. Unconnected items are allowed without `--final`.
Physical capacitance and adhesive response remain commissioning measurements.
