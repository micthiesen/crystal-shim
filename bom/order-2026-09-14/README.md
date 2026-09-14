# Purchase list for one Crystal Shim

One controller, one mains board and one tank sensor require **135 physical PCB
components in 50 exact MPN groups**: controller 99, mains 22, sensor 14. All 159
native footprint references and MPN fields match the accepted handoff manifests;
24 footprints are board features with no purchased component. Every PCB part
quantity matches the active rows of `bom/bom.csv`.

This order uses bare PCBs and owner assembly. All current controller components,
including the three future pump drivers and reservoir interface, are populated.
Future pumps, reservoir sensor board and accessory harnesses are not included.
Bare-board quantities, Gerbers and stencils belong to the fabrication release.
There is no JLCPCB assembly BOM/CPL upload or paid impedance-control requirement
in this purchasing list.

## Files

- [order-bom.json](order-bom.json): typed machine-readable purchasing data with
  explicit board allocations, status, quantities, sources and supplier searches.

- [consolidated-purchase.csv](consolidated-purchase.csv): shopping list with exact
  duplicate MPNs combined across boards and offboard uses. Required quantities,
  optional spares and suggested purchases are separate columns. Generic mounting
  stock appears alongside the fixed components; consult its detail below.
- [pcb-parts.csv](pcb-parts.csv): 50 grouped PCB MPNs, with board-specific references.
- [pcb-reference-list.csv](pcb-reference-list.csv): one row per physical component.
- [offboard-parts.csv](offboard-parts.csv): harness, enclosure, service kit and
  mounting stock, including explicit selection/fit limitations.
- [excluded-pcb-features.csv](excluded-pcb-features.csv): controller H1–H4/TP1–TP14,
  mains H1–H4 and sensor E1/J1. Do not order these identifiers as components.
- [reconciliation.json](reconciliation.json): counts and input SHA-256 receipts.

Quantities are for **one complete set**, independent of a fabricator's minimum
bare-board batch. Optional PCB spares are generally three or 20% for resistor and
capacitor groups, one small semiconductor/connector, and zero for the large PSU,
relay, MOV and mains terminals. These are handling/rework allowances, not a second
complete build. Adjust distributor pack quantities at checkout. No price, stock
availability, tax or shipping claim is made. Supplier lookup URLs are exact-MPN
searches, not confirmed inventory listings.

Purchase status is copied from the canonical BOM. No Stillair stock is allocated.
The GST18U05-P1J adapter is described as already known in the source notes but has
no purchase receipt: verify it is owned before buying. The list reserves one and
suggests zero purchases until that check; buy one if it is unavailable.

## Offboard selections and allowances

The ordinary stock choices below close purchasing ambiguity without claiming
measured assembly performance:

- **Sensor cable:** Alpha Wire 5493C, slate, three twisted 24 AWG pairs. Buy a
  1 m cut length; the **complete installed harness remains at most 203.2 mm**.
  Manufacturer values give about 16.27 pF pair capacitance and 29.33 pF ground
  capacitance at that limit. The catalog bend radius is ten cable diameters, so
  confirm reach and entry geometry without forcing a tight bend. Keep the foil
  and drain insulated at both ends; neither connects to the driven shields.
  [Alpha construction and electrical data](https://www.alphawire.com/products/cable/xtra-guard-performance-cable/xtra-guard-1/5493c).
- **Sensor adhesive:** genuine 3M 467MP transfer film, with no foam. Buy enough
  small sheet/strip stock for three 18 × 64 mm patches. Manufacturer pages give
  0.05 mm and the current technical sheet gives 0.06 mm; record the received film
  and installed gap during calibration. Glass/soldermask retention and wet-area
  durability remain unmeasured.
  [3M technical sheet](https://multimedia.3m.com/mws/media/2522781O/3m-adhesive-transfer-tape-467mp.pdf?fn=3M-Adhesive-Transfer-Tape-467MP.pdf).
- **Wire:** provision 2 m each of 18 AWG 6715 black/white for mains, 2 m of 18 AWG
  3075 green/yellow for PE, 1 m each of 22 AWG 6713 red/black/blue for the 5 V/coil
  and service harnesses, and 1 m each of 20 AWG 6714 red/black for the internal
  12 V link. These are cutting-stock allowances, not approved final harness
  lengths. Buy cut lengths where possible instead of industrial spools.
  Current wire-family sources are in the CSV rows.
- **Contacts:** 16 Micro-Fit 43030-0007 fitted contacts, plus eight suggested
  spares. This includes six tank-sensor, six 5 V/coil, and four 12 V terminations.
  The service connector is separate JST XH: XHP-2 and two SXH-001T-P0.6 contacts.
  Canonical BOM-93 now identifies the service cable's JST XH termination. [Molex wire range](https://www.molex.com/en-us/products/part-detail/430300007).
- **Inlet/filter tabs:** eight 2-520184-2 receptacles, plus two spares: three
  inlet L/N/PE tabs and five filter LINE/LOAD/PE tabs. The exact TE 802490-SF
  model confirms a PE FASTON blade on this 1 A filter, not an earth stud. The
  three central junction rings remain separate.
  [Schurter inlet](https://www.schurter.com/en/datasheet/typ_6200.pdf),
  [exact TE filter model and datasheet](https://www.te.com/en/product-802490-SF.html).
- **Output gland:** retain M3231 and add black nylon locknut 8463. The gland has
  an integral sealing ring, so no additional O-ring is specified. Check thread
  engagement against the actual enclosure wall and cord jacket before machining.
  [Heyco catalog](https://www.heyco.com/Brochures/Solar_broch.pdf).

## Mechanical stock package

The purchase list now follows the [mechanical closure](../../docs/design/evidence/pre-fab-2026-09-14/mechanical-closure.md).
It replaces the original generic 45 mm standoff kit with an independent frame
that preserves the hole-free separator and accepted board elevations:

- One 250 × 250 × 3 mm unclad FR-4 sheet for the carrier, two H-rails and PE bracket.
- One 200 × 200 × 2 mm unclad FR-4 sheet for the separator and eight corner tabs.
- Four continuous M4 nylon rods at least 80 mm long, frame nuts/washers, six
  base-hole seals in total, four effective 3.2 mm carrier feet and four 10 mm
  external enclosure feet.
- Four plain 7 mm lower and four plain 3 mm upper M3 PCB spacers. Single
  through-bolts avoid opposing screws inside short spacers. Four M3 × 16 mm
  pan-head and twelve M3 × 12 mm countersunk bolts cover PCB and corner-stop joints.
- A separately clamped M4 metal PE junction and insulating cover, with two M4 ×
  30 mm nylon bracket bolts and two effective 8.2 mm bracket feet. The metal
  electrical pressure stack contains no creeping polymer layer.
- Two external glass-side cable-tie bases, nylon ties and 3M VHB 5952 for those
  bases only. Thin 467MP remains the sensor-to-glass adhesive.

Required stock quantities and spares are separate in the CSV/JSON. Purchase FR-4
with a supplier flame-rating receipt at the actual 2 mm/3 mm thickness; generic
unrated G10 is not the same specification. The mechanical document governs final
cutting, hole locations, effective spacer heights and assembly. Generic material
rows intentionally name purchasable dimensions/materials instead of inventing
manufacturer part numbers.

The PCB order is reconciled and the ordinary stock-material construction is
specified. These files do not claim measured tape adhesion, crimp pull strength,
received-material tolerances, enclosure sealing, sensor calibration, temperatures
or electrical commissioning. No parts have been bought and no stock is allocated.
