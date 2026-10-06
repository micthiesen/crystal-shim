# JLCPCB order W2026091502305469

**Boards and stencils received.** Michael confirmed receipt in the procurement
reconciliation request on **2026-09-30 America/Vancouver**. Five of each board, 15 total,
were ordered. Exact reported selections are in [order.json](order.json). Price and shipment tracking were not supplied; current delivery is owner-confirmed.
On **2026-10-05 America/Vancouver** Michael reported having the PCBs in hand.
The received board count and any bare-board inspection are not recorded.

| Board | Layers / dimensions | Mask / silk | Via option | Covering |
| --- | --- | --- | --- | --- |
| Controller | 4 / 150 × 110 mm | White / black | 0.2mm/(0.3/0.35mm) | Plugged |
| Mains | 2 / 150 × 110 mm | Blue / white | 0.3mm/(0.4/0.45mm) | Tented |
| Sensor | 4 / 18 × 64 mm | Black / white | 0.2mm/(0.3/0.35mm) | Plugged |

All are nominal 1.6 mm FR-4 TG135, 1 oz outer copper, ENIG 1 microinch,
flying-probe tested and without an order mark. Four-layer boards use 0.5 oz
inner copper and No requirement stackup. Sensor black was retained for tank
appearance. Owner reports the four-layer plugged option as a free tenting upgrade.
These actual colours/covering supersede the green/tented proposed order profile.

All other pasted selections remain unchanged: **Confirm Production file: No**
on all boards; **Deburring/Edge rounding: Yes** on sensor and No on the others.
The earlier recommendations to change these were not reported as adopted.
Supplier production CAM/layer order and colour-specific mask changes have not
been inspected. Standard black/white mask has less fine-feature margin than green;
no board redesign or additional colour-specific CAM check was performed.

The released mains archive is the MOV-bulk version in
`pcb/mains/fabrication/2026-09-14-mov-bulk/`. Uploaded name ends `_Y12`, but the
name alone cannot distinguish old/new archive bytes; upload identity was not
independently verified. Controller and sensor released files remain under
`fabrication/2026-09-14-rev1/`.

## Ordered stencils

The owner subsequently confirmed one **top stencil per board** and supplied the
product details below. The original PCB-only confirmation did not state stencil
inclusion. No separate stencil order number, price or shipment tracking was supplied;
current stencil receipt is owner-confirmed.

| Board / uploaded suffix | Custom size | Listed Dimension | Quantity | Listed weight |
| --- | --- | --- | --- | --- |
| Controller / `_Y11` | 170 × 130 mm | 380 × 280 mm | 1 | 0.26 kg |
| Mains / `_Y12` | 170 × 130 mm | 380 × 280 mm | 1 | 0.26 kg |
| Sensor / `_Y13` | 40 × 90 mm | 380 × 280 mm | 1 | 0.14 kg |

The custom size and standard Dimension listing are retained separately as pasted.
All three report 1–2 days build time, Framework No, Step Stencil No, Nano-Coating
No, Sanding, No Fiducial, Confirm Production file No, Engrave Text No,
Ultrasonic-resistant adhesive No, With JLCPCB logo box, and Solder paste stencil
process type. Exact filenames and selections are in [order.json](order.json).

**Thickness: Select by JLCPCB.** The design release and printed assembly guide
use a **0.10 mm design-review basis**; this is not a confirmed supplied thickness.
Check the received stencil specification before treating that basis as fulfilled.

The owner confirms receipt of the ordered boards and stencils. No new physical
tests, flashing, mains operation or measured stencil thickness are claimed.
