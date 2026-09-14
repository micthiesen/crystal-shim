# DigiKey Canada review cart

[Open the prepared cart](https://www.digikey.ca/short/zt741mwt).
No order has been placed. The link creates a copy with the same parts, quantities
and customer references; later changes to one copy do not update other copies.

Verified on 2026-09-14 in the live Canadian cart: **74 lines, CAD $586.25** before
tax and shipping. Every final line showed **Immediate** availability. Stock is
not reserved. No backorders, duplicate alternatives, full reels or assembly
services are included.

| Scope | Lines | CAD subtotal |
| --- | ---: | ---: |
| PCB components | 44 | $164.10 |
| Enclosure, harness accessories and mounting hardware | 30 | $422.15 |
| Total | 74 | $586.25 |

The quantities cover one controller, one sensor and one mains board for every
included component. Cheap passives, contacts and fasteners include practical
spares and price breaks. Expensive modules and the enclosure use single units.
The enclosure alone is $255.61. The 467MP adhesive is one 25.4 mm-wide roll, cut
into intact 18 × 64 mm sensor patches.

## Parts still needed

This cart is not a complete set of everything needed to assemble the project.
Six PCB part types could not be supplied from the checked DigiKey offers:

| Required part | Quantity | Reason |
| --- | ---: | --- |
| AP63203WU-7 | 1 | Exact and automotive Q versions backordered |
| AP63205WU-7 | 1 | Exact and automotive Q versions backordered |
| G5RL-1A-TV8 DC5 | 1 | Exact relay minimum 100; six-pin E variants do not fit |
| TMOV14RP175EL2T7 | 1 | Exact lead form unavailable at the needed quantity; no unverified lead reshaping accepted |
| TPS2553DBVR | 1 | Original, DBVT and Q1 variants backordered |
| USBLC6-2SC6 | 1 | Original ST device backordered |

The [remaining procurement list](not-in-cart.csv) also identifies the outlet
pigtail, cut wire, FR-4 sheets, sealing/support materials, PE metal hardware and
other assembly supplies. Some are available elsewhere in much more sensible
quantities. The GST18U05-P1J service adapter was omitted because the source BOM
identifies it as potentially already owned; verify inventory before buying one.
No private inventory was otherwise credited toward the component quantities.

## Reviewed substitutions

These are procurement alternatives for the existing footprints and circuits;
the accepted native PCB files and fabrication outputs were not changed.

| Original | Selected in cart | Compatibility |
| --- | --- | --- |
| C3216X7R1E106K160AB | CL31B106KLHNNNE | 10 µF X7R 1206, 35 V instead of 25 V; sensor bias screening checked |
| ERJ3EKF3300V | CRCW0603330RFKEA | 330 Ω, 1%, 0603; 0.125 W instead of 0.1 W; same temperature coefficient |
| GRM32ER71E226ME15L | CGA6P3X7R1E226M250AB | 22 µF, 25 V, X7R, 1210; better typical bias retention, maximum height +0.1 mm |
| PR02FS0201000KA100 | PR02FS0201000KR500 | Same fusible resistor; supply packaging only |
| WP710A10LGD | HLMP-1790 | Low-current green 3 mm LED, nominal 2.54 mm pitch; observe cathode marking |
| SXH-001T-P0.6 | BXH-001T-P0.6 | Same JST contact in loose form |
| 6009.1315 | 11-00017 | NEMA 5-15P to C13, 18 AWG SJT, 10 A 125 VAC, UL/cUL; 2.0 m instead of 2.5 m |

Manufacturer characterization supports the capacitor selections; it does not
replace commissioning measurements. The 10 µF substitution's combined design
screen yields 4.8195 µF at the sensor's maximum supply, above the 4.7 µF target.
Use the specified effective support dimensions when assembling stock fasteners;
account for actual washer thickness and match countersinks to the screw heads.

## Files and evidence

- [Cart lines](cart-lines.csv): selected parts, quantities, live CAD prices and board references.
- [Bulk Add CSV](digikey-bulk-add.csv): no header; quantity, DigiKey SKU, customer reference. Use only in an empty cart to avoid duplicates.
- [Receipt](cart-receipt.json): complete reconciliation against all 103 source purchase lines, source BOM hash and verification record.
- [Passive review](passive-research.json), [active review](active-research.json), [offboard research](offboard-research.json), [hardware research](hardware-research.json), and [cord substitution](cord-substitution.json): source links and compatibility evidence.

Research files retain preliminary stock observations and candidate quantities.
They are not the order list. The final receipt and cart override them: several
cached stock pages disagreed with the live cart, including the inlet cover,
fuse and terminal blocks. The final cart includes the exact RC320-01 cover
(Schurter 3-125-661), which the live cart confirmed available.
