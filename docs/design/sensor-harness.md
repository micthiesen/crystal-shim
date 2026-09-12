# Sensor harness design candidate

Status: researched proposal, not a released harness or BOM selection. Use
**Alpha Wire 78073** with a **LAPP 53111100 gland and 53119000 locknut** as the
working mechanical candidate. Prefer a sideways sensor-header exit from the
upper electronics region. This permits a route at the controller exit's height
within the **203.2 mm total crimp-to-crimp limit**, including the cable inside
the enclosure and both connector ends. Sensor/rim geometry, installed fit and
practical crimp manufacture remain open.

This study does not change the [sensor placement](sensor-design-basis.md),
[controller placement](controller-enclosure-fit.md), connector pinout or BOM.
The [source receipts](evidence/sensor-harness/primary-sources.json),
[calculations](evidence/sensor-harness/route-calculations.json) and
[route drawing](evidence/sensor-harness/sideways-reach.svg) record the
2026-09-12 research. Dimensions below distinguish manufacturer specifications
from project allocations. No prototype board, purchase, supplier quote or
physical acceptance result is implied.

## Cable and termination

| Candidate | Manufacturer data | Assessment |
| --- | --- | --- |
| [Alpha 78073](https://www.alphawire.com/disteAPI/SpecPDF/DownloadProductSpecPdf?productPartNumber=78073) | Three pairs, 24 AWG, 19/36 tinned copper; insulation OD 0.9906 mm nominal; jacket OD 4.3688 mm nominal, 4.6482 mm maximum; unshielded; bend radius 10 times OD | Preferred dimensional candidate; has no shield or drain requiring another termination |
| [Belden 9503](https://catalog.belden.com/techdata/EN/9503_techdata.pdf) | Three pairs, 24 AWG, 7/32 tinned copper; insulation OD 1.1 mm nominal; jacket OD 5.89 mm nominal; overall foil and separate drain; stationary/install bend radius 58 mm | Larger bend; maximum OD below the 6 mm reserve is not established; needs a different gland and defined shield termination |
| [Belden MRTA3P24U](https://www.belden.com/products/cable/electronic-wire-cable/multi-pair-cable/mrta3p24u) | Three pairs, 24 AWG tinned copper; ETFE insulation; 4.1 mm nominal jacket; dynamic flex results at 6D and 7.5D | Compact, but insulation OD, maximum jacket OD, static minimum bend and capacitance were not established from the primary page |

For 78073 allocate at least **50 mm centreline bend radius**. Its inside radius
at maximum OD is 47.6759 mm, exceeding the conservative 10D value of 46.482 mm.
The datasheet's nominal 18.9 pF/ft mutual capacitance and 24.5 ohm/1000 ft
conductor resistance imply 12.6 pF per pair and 0.01633 ohm per conductor at
203.2 mm. These do not replace assembled I²C rise-time and load verification.
The listed 100 ft and 1000 ft put-ups do not establish economical short-cut stock.

The existing [Molex 43030-0007 contact](https://www.molex.com/en-us/products/part-detail/43030-0007)
accepts 24 AWG and lists a 1.85 mm maximum insulation OD. Its tin reel-packaging
equivalent is **43030-0001**. Being below the contact's maximum OD alone does not
establish crimp-tool compatibility.

The current [63901-8900 FineAdjust specification](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/applicationtoolingspecificationpdf/639/63901/ATS-639018900-001.pdf),
revision H, 2026-02-11, explicitly covers 43030-0001 and 20–24 AWG. Its preferred
insulation range is **0.91–1.09 mm**, covering 78073's nominal insulation. For
24 AWG it gives a 0.79–0.84 mm conductor crimp height, 2.54–2.92 mm strip length
and 22.3 N minimum conductor pull, measured without insulation support. This
provides an exact process to specify to a harness supplier already equipped with
that applicator. It is not a recommendation to buy a production press.

Both actual hand-tool sheets were checked:
[63811-2800 revision D](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/applicationtoolingspecificationpdf/638/63811/ATS-638112800-001.pdf)
and [63819-0000 revision G](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/applicationtoolingspecificationpdf/638/63819/ATS-638190000-001.pdf).
Their 20–24 AWG rows specify **1.42–1.85 mm insulation**, so neither supplies an
in-range hand-crimp recipe for this cable. The 26–30 AWG pocket is not permission
to crimp 24 AWG there. No applicable manual alternative was substantiated.
Supplier availability, price and ordering were not established. Contact
compatibility is supported; practical manufacture remains a release check.
Actual wire OD and completed crimps must meet the chosen process.

Keep three separate returns with pins **1/4, 2/5 and 3/6** paired and all six
pin numbers straight through. A possible 78073 colour assignment is red/white
to 1/4, black/white to 2/5 and brown/white to 3/6. Identify the three white
returns before breaking out the pairs. Preserve twists near the terminations;
draw both mating faces and cable ends explicitly. Feed the unpopulated cable
through the gland before fitting the housings. Do not put a seventh drain or
another conductor in an existing return crimp.

## Gland and enclosure interface

The [LAPP 53111100 STR-M](https://products.lappgroup.com/fileadmin/documents/technische_doku/datenblaetter/skintop/DB53111000EN.pdf)
has an M12 × 1.5 thread, 16.6 mm body OD, 15 mm wrench size, 26.5–30 mm total
length and 8 mm thread length. The generic clamp range is 2–5 mm; its
[installation sheet](https://imager.lapp.com/e/lapp/a6G4nvkL02p-wg_DJCmXyg~~/BZ99990621DE_EN.pdf)
specifies 4–5 mm for EN 62444. Use that narrower received-cable acceptance range.
The recommended torque is 1.5 Nm, with adjustment for sheath material to prevent
damage. The standard 53111000 version starts at 4.5 mm in that EN range, making
the reduced-insert version a better match here.

The [53119000 locknut](https://products.lappgroup.com/fileadmin/documents/technische_doku/datenblaetter/skintop/DB53119000EN.pdf)
has an M12 × 1.5 thread, 18.7 mm OD, 17 mm wrench size and 5 mm thickness.
An approximately 3 mm wall leaves only nominal 5 mm engagement on the gland's
8 mm thread. Confirm the actual wall, seal and engagement before allocating
additional washers. The M12 table does not list an included O-ring; do not copy
the larger gland's O-ring detail. Component ingress ratings do not certify the
modified enclosure.

Retain the controller cable axis at **X175.5**, pointing north, with the gland
aligned to the actual mated cable-axis height **Zg**. The existing fit sections
put the nominal north outer wall near Y−6.4057 and the inner wall near Y−3.4057.
The exact wall section at the gland, hole diameter/tolerance, seal surface and Z
datum still need CAD confirmation. PCB top Z21.6 is not the cable-axis datum.

The reserved 6 mm cable cylinder reaches X178.5, leaving 4.1 mm to the antenna
reserve at X182.6. The gland/locknut can overlap that reserve in X only while
remaining north of its Y13.9 boundary. The nominal thread ends near Y1.5943.
Verify wrench and latch access and grip intact jacket, not loose conductors.

## Sideways route and reach

Propose rotating the sensor header 90 degrees **in the PCB plane** so that its
cable exits beside the electronics head, above the continuous sensing span. In
the west-turn example, J3 points north and the external cable bends west into
the sensor; the sensor header's cable exit points east, **+X**. This choice does
not require the PCB to cross the glass plane or fold over the rim.

| Path element | Length or allocation |
| --- | ---: |
| Controller crimp to nominal J3 wire-exit plane | 14 mm allocation |
| Nominal exit Y32 to outer wall Y−6.4057 | 38.4057 mm |
| Gland projection beyond wall, 30 minus 8 | 22 mm maximum |
| Straight beyond gland before bend | 5 mm allocation |
| Additional northward straight | 10 mm example |
| Quarter arc at R50 | 78.5398 mm |
| Straight sensor jacket support land | 10 mm allocation |
| Sensor intact-jacket breakout to crimp | 20 mm allocation |
| **Total** | **197.9455 mm** |

The **14 mm and 20 mm end allocations are not measured mated/crimp datums**.
The nominal female housing length motivated the first allowance; it is not proof
of contact location or engagement stroke. The second reserves space for the end
breakout. Replace both with actual mated geometry before harness release.

This example ends at **X95.5, Y−93.4057, Zg**, or **80 mm west and 87 mm toward
the tank from the wall exit**, at equal height. The glass plane is offset from
the crimp axis by the mated connector geometry; do not equate their Y coordinates.
For extra northward straight `a` and sensor jacket land `b`, in millimetres:

```text
L = 177.9455 + a + b
a >= 0; b >= 10; a + b <= 22.0545 for L <= 200
sensor crimp: X = 105.5 - b; Y = -83.4057 - a; Z = Zg
```

The possible westward and tankward offsets are coupled by this equation, not
independent limits. Target a 198 mm finished harness with the manufacturing
tolerance wholly below a proposed 200 mm maximum. The hard limit remains
203.2 mm, including internal routing, mated ends and any service allowance.

The mirrored **east-turn** example has the same length/radius and ends at
**X255.5, Y−93.4057, Zg**, with the sensor cable exit facing west, −X. Its bend
also stays clear of the antenna because it occurs north of the enclosure.
It needs space on the enclosure's east side. Use the west turn as the working
example; choose between them from actual tank, clip, mains-cable and service
clearances before placement. Neither is accepted installation geometry.

## Height, support and a low point

The required height relation is:

```text
support surface height = glass rim height + h - g
```

Here `h` is the final sensor-crimp height above the rim, and `g` is the installed
gland-axis height above its support surface, including enclosure base and feet.
Neither is fixed. Inside-floor Z0 is not automatically the supporting surface.
The route is possible when these axes can align; it does not prove the owner's
existing surface is already at the required height.

Rotating the nominal 9.85 mm-wide mate makes that width vertical. This is
compatible in principle with the proposed 18 mm component band, but does not
prove the complete header footprint, electronics, latch and tool sweep fit.
Preserve the header locator/board-edge rule and material around its hole. The
sensor's rim/reference geometry remains provisional independently of this route.

Reserve a separate **14 mm lateral withdrawal envelope**, the manufacturer
latch clearance and outward tool approach. The jacket support must carry cable
loads without changing the sensor-to-glass gap. Its mechanism is not designed;
the current printed-clip contract does not already provide a cable clamp. Record
any intentional clip-interface addition before the owner models it. Release
jacket restraints before service and allow the free enclosure/sensor to move
while preserving bend radius; no installed extra loop is assumed.

An optional **R55 horizontal bend with a 3 mm shallow low point** uses 3 mm extra
northward straight, the same 10 mm straight jacket land and 20 mm end allocation.
Over horizontal arclength `u = 0..S`, after the first 5 mm straight and ending
before the sensor land, set:

```text
S = 3 + pi * 55 / 2 = 89.3938 mm
z(u) = -3 * sin(pi * u / S)^2
```

The calculated total is **199.0474 mm**. A conservative curvature bound gives
at least **50.9322 mm centreline radius**, maintaining R50; its inside-radius
bound at maximum cable OD is 48.6081 mm. Both connector axes and the sensor's
straight support land remain at Zg. The endpoint is **X90.5, Y−91.4057, Zg**;
the east mirror is X260.5 at the same Y and Z. This establishes geometric room
for a low point without a full U-turn. It does **not** establish splash/drip
acceptance or an installed cable shape.

Before release, resolve the sensor/rim datum and full mated placement; actual
support height, route, strain relief and drip handling; gland hole/seal/thread
engagement; and an available crimp process. Verify the manufactured harness's
dimensions, contact retention and continuity, then the assembled bus and water
exposure criteria. These are interface/manufacturing and commissioning gates,
not a planned prototype or PCB respin.
