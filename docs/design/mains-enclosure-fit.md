# Mains enclosure and J5 service fit

Historical fit evidence, superseded by the [shared enclosure](../../cad/shared-enclosure/README.md)
for the 110 × 110 mm controller and 180 × 110 mm mains board. The dimensions and
open requirements below describe the old enclosure only and are not current
placement constraints.

The nominal Hammond CAD screen supports the complete mains carrier at floor
origin **(9.5, 4) mm**, with PCB top **Z28 mm**. This moves the earlier allocation
1.5 mm east without changing the board, component or mounting-hole source
coordinates. It is a conditional mechanical allocation, not released machining
or complete enclosure/isolation acceptance.

The [drawing](../../cad/mains-fit/service-fit.svg),
[CAD results](../../cad/mains-fit/preferred-results.json) and
[validation receipt](../../cad/mains-fit/validation.json) retain the measured
screen. Coordinates use the same normalized floor system as the
[controller fit](controller-enclosure-fit.md): X east, Y south, Z upward.

## Carrier and partition allocation

The 135 x 75 mm board occupies X9.5..144.5, Y4..79, with nominal underside
Z26.4. Convert mains source coordinates using `X = 77 + pcbX` and
`Y = 41.5 - pcbY`. The original floor origin (8, 4) intersects the manufacturer's
base model by 6.016 mm³. Raising the board to tested top heights from 24 to 40 mm
did not resolve the interference. The eastward shift leaves **0.968 mm nominal
clearance and 0.715 mm at the tested allowance corner**.

Reserve a **14 x 10 mm finished clear portal** through partition X146..151,
at Y55..69 and Z27..37. The full connector/service reserve is X128..163,
Y55..69, Z27..37. The board edge remains 1.5 mm west of the partition.
These dimensions allocate space; guard material, attachment, sleeve/retention,
touch protection and machining datums remain work.

The screen uses project assembly-position allowances of ±0.20 mm independently
in XYZ, PCB dimensions ±0.10 mm overall, and mains thickness 1.6 ±0.10 mm.
PCB-top height varies independently of thickness. Portal centre error is
±0.20 mm in YZ and minimum aperture size is nominal minus 0.20 mm, giving
0.30 mm inward edge movement. These are proposed acceptance limits, not
manufacturer tolerance guarantees. The enclosure CAD is nominal: the retained
2016 STEP is 90 mm high, while the current drawing says 90.50 mm.

## J5 mating, withdrawal and wire room

J5 uses header 43650-0300, housing 43645-0300 and contact 43030-0007. The
[housing drawing](https://www.official.cz/static/_dokumenty/5/0/6/1/2/436451100_sd.pdf)
gives width 9.85 ±0.25 mm, or **10.10 mm maximum**. This moving housing determines
portal width. The fixed header's larger occupied width does not traverse the
wall; a previous 16 mm portal trial used that unnecessarily conservative payload.

The corrected pin-one floor position is (130.5, 59), pins two and three are at
Y62 and Y65, and the locator is at (134.82, 62). The
[header drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf)
dimensional stack gives wire exit X147.08 nominal, X148.01 conservatively.
A **project 14 mm straight withdrawal allowance**, based on housing length,
reaches X162.01. It is not a published release stroke.

The screened moving envelope is X128.84..162.01, Y56.95..67.05, Z28..36.
Its **8 mm maximum height is a project acceptance constraint**; the exact
[header catalogue](https://www.molex.com/en-us/products/part-detail/436500300)
lists 6.98 mm nominal mated height without a maximum. Received housing and latch
motion must satisfy the larger project bound. Latch access is from the open lid;
tool force, release travel and handling are not established by this box.
The moving envelope retains **1.45 mm lateral and 0.50 mm vertical portal
clearance** with the stated allowances.

| Item below the full service reserve | Nominal gap | Allowance gap |
| --- | ---: | ---: |
| Controller H1 hardware | 2.40 mm | 2.00 mm |
| Q1 maximum envelope | 4.15 mm | 3.75 mm |
| R11 maximum envelope | 4.85 mm | 4.45 mm |
| Controller PCB | 5.40 mm | 5.00 mm |
| Controller carrier | 7.00 mm | 6.60 mm |

H1 hardware must stay within radius 4 mm and **3 mm above the controller PCB**.
This is a new procurement/assembly constraint for hardware not yet selected.
Q1 and R11 use their source maximum heights of 1.25 and 0.55 mm.

The proposed internal three-wire harness uses 22 AWG
[Alpha 6713](https://www.alphawire.com/products/wire/ecogen/ecowire/6713).
Its maximum insulated diameter is 1.2954 mm; three wires at 3 mm pitch occupy
7.2954 mm. Use an individual bend radius of at least 10 mm. A curved fan retaining
3 mm spacing needs a 13 mm middle radius to leave the inner wire at 10 mm.
The sensor's 203.2 mm harness limit does not apply to this internal PSU harness.

## Height and isolation limits

The IRM body reaches Z50, with a separate +0.5 mm sensitivity reaching Z50.5.
The [MOV assembly reserve](mov-capture.md) reaches Z54.5. Sabre's 30.69 mm
maximum mated height reaches Z58.69; adding 15 mm of project wire headroom reaches
Z73.69 and leaves 9.31 mm to the lid above the fixed header columns.

For candidate [Alpha 6715](https://www.alphawire.com/products/wire/ecogen/ecowire/6715)
wire, maximum diameter 1.7526 mm and minimum bend radius 5D give 8.763 mm.
An individual centreline radius of 10 mm leaves 9.1237 mm inside radius.
A 3 mm straight plus quarter turn uses 13.8763 mm of height, within the 15 mm
allocation. Route parallel wires in separate planes. This does not establish
terminal-exit geometry, crimp loading, restraint or the separate J4 pigtail's
bend requirement.

The reviewed fixed primary header/unused-blade envelopes and primary
pad/tail/solder bounds retain **10.165 mm nominal / 9.765 mm allowance clearance**
to the possible isolated service volume, nearest J3. Portal-void clearance is
10.687 / 10.062 mm. The primary-to-partition gap of 3.30 mm is mechanical space
beside an insulator, not an 8 mm insulation result.

**The complete mated J3 assembly remains an isolation gate.** The known fixed
header ends at Y44.835. Keeping all relevant nominal primary occupancy at
Y≤46.5 is a sufficient north/south constraint for 8 mm to every portal allowance
corner, leaving 1.665 mm beyond the known edge. Actual housing, contacts, crimps
and wires must establish the final geometry. A hypothetical extra 5 mm of body
depth leaves only 5.165 mm to the service volume; this sensitivity is not an
established part failure. Diagonal clearance can be evaluated once exact geometry
exists. The carrier shift preserves internal PCB clearances.

The subsequent [J3 drawing study](mains-j3-occupancy.md) establishes a conditional
plastic south bound Y45.805 and 8.695 mm Y-only portal gap with allowances.
It uses the dimensioned northward mating offset. The header mounting datum and
installed contact/crimp/wire volumes remain unresolved, so the complete isolation
gate is unchanged.

## Evidence and remaining work

The model imports all 15 original Hammond solids and the existing controller
carrier. Independent generated STEP reload found 29 valid solids. Negative
controls detect the original board collision, service overlapping H1, an oversized
portal payload and wire headroom entering the lid. Root inspected the actual CAD
sections and overlaid envelopes. Input and retained-output hashes are recorded in
[provenance](../../cad/mains-fit/provenance.json).

An independent review transformed the candidate back into the original STEP
coordinate system and reproduced the board, portal and scoped isolation gaps,
including collision negative controls. Its
[measurements](../../cad/mains-fit/independent-review.json) found no actionable
issue within the stated scope. Angular assembly errors and manufacturer mould
tolerances remain outside this translation-envelope screen.

Source scripts and the full report are retained in
`/tmp/crystal-shim-mains-j5-service-model`; J5 primary-drawing calculations are in
`/tmp/crystal-shim-mains-j5-mated-fit`. The manufacturer input is
[Hammond's STEP assembly](https://www.hammfg.com/files/parts/stp/1554V2GY.zip?v=1697661989),
SHA-256 `f7baa2bc11586616cab7917a449a8d683e9d542ec7e0a5ad0aa8310acb3bac6e`.

Complete mated Sabre poses, latch/tool access, carrier retention, exact mounting
hardware, filter/full harness/gland volumes, below-board lead limits and the
partition's material/retention/access protection remain required. The candidate
does not release routing, fabrication or the complete enclosure assembly.
