# Electrical design brief

This brief owns the requirements. Sourced capture candidates, pin maps and
calculations now live in the [controller](design/controller-design-basis.md) and
[mains](design/mains-design-basis.md) design basis. Those documents refine the
initial choices below; no layout or fabrication gate has passed.

## Power and controller

| Function | Proposed choice | Remaining work |
| --- | --- | --- |
| MCU | ESP32-C6-WROOM-1 module | Exact flash option, footprint, pin map, antenna keepout |
| Isolated PSU | Mean Well IRM-10-5, PCB mount | Thermal/current budget, input protection, approved isolation layout |
| Rails | 5 V relay + daughterboard; regulated 3.3 V ESP | Regulator selection, transient margin, decoupling |
| Relay driver | Logic-level MOSFET, gate pulldown, coil suppression | Part/value selection, dropout behavior, reset tests |
| Programming | Self-powered native USB data and isolated 5 V service input | Capture hardware VBUS gate and [GST18U05-P1J service protection](design/service-input.md); verify source combinations and transients |
| Local UI | Status LED and maintenance/off button | Pin assignments, debounce, indications and explicit exit action |

IRM-10-5 is a 5 V, 2 A isolated encapsulated module, selected to provide margin
above the secondary current limit. Use the module rather than
designing a discrete mains converter; component approvals do not certify this
controller. Keep its primary on the mains board and its secondary clearly
separated. Account for ESP radio peaks, relay pickup/hold current, sensor, regulator
losses, and enclosure temperature in the power budget.
[Mean Well specification](https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf).

The WROOM-1 module avoids custom RF matching. Follow its actual antenna placement,
power and strapping constraints; Stillair's C6 MINI module footprint/pin map is not
interchangeable. [Espressif module datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf).

The low-voltage board contains the MOSFET driver; the mains board contains the
relay and PSU. A low-voltage harness carries isolated 5 V, return and the coil
drive connection with a documented suppression-current path. The
[secondary protection circuit](design/power-protection-review.md) puts a
TPS259470 between the raw module output and both coil/controller branches.
Exact source capture and transient review remain work. Mains/low-voltage
separation applies to every
track, pad, mounting point and harness, including the relay coil region.

## Switching and interference control

The relay candidate is **G5RL-1A-TV8 with a 5 V coil**, normally open. Confirm the
exact ordering code, motor-load rating at the actual voltage, minimum-load
behavior, coil consumption, isolation and footprint before selection. Its TV8
designation alone is not a motor rating. The family includes explicit motor
ratings; match the correct variant and load class, then test pump starting.
[Manufacturer G5RL family](https://components.omron.com/us-en/products/relays/G5RL).

Switch hot after the pump-branch filter. Neutral passes through the filter to the
load; it is not switched alone. PE is continuous and never switched. The relay
must release when control power disappears. A mechanical relay is the baseline;
no solid-state or more elaborate switching scheme is selected.

| Measure | Position and purpose | Not yet fixed |
| --- | --- | --- |
| Series RC snubber | Across switched hot and output neutral, near pump connection; suppress switching ringing | Mains-rated capacitor, resistor pulse/thermal ratings and values |
| Manufactured two-stage EMI filter | Pump branch, before relay; reduce conducted interference | Exact variant, measured attenuation, leakage, terminations, dimensions |
| Protected MOV | Input surge suppression coordinated with protection | MCOV, energy, failure/thermal protection, location and fuse coordination |
| Fuse | Protected mains input and any required branch protection | Type, rating, interrupt capacity, inrush coordination and holder |

Do not install the RC network across open relay contacts by default: that creates
a bypass current path through the nominally off pump. This project chooses a
network across the load. Select its values and ratings before fabrication using
the load information, manufacturer guidance and documented calculations. Confirm
effectiveness and component stress with the actual pump on the final assembly;
manufacturer guidance calls for experimental confirmation. This is a commissioning
check, not a separate prototype phase.
[Relay precautions](https://components.omron.com/us-en/system/files/2026-05/ds_related_pdf/K337-E1.pdf).

Start filter selection with the low-current Schaffner/TE FN2090 family. It is a
two-stage filter; choose by attenuation, earth leakage, size and termination,
not the largest amperage. Leakage must be considered with the installation's
GFCI and other equipment. [TE FN2090 family](https://www.te.com/en/product-CAT-P97-F2090.html).

The reported PC waking is consistent with interference but does not establish
conducted versus radiated coupling. Keep pump wiring, filter input/output wiring,
ESP antenna and sensor harness apart. The actual aquarium/PC installation must
survive repeated switching; a cleaner bench waveform alone does not pass `EMI-*`.

## Connectors

| Connection | Proposed interface |
| --- | --- |
| Enclosure input | IEC C14 inlet, appropriate enclosed/guarded termination |
| Skimmer output | Rated mains receptacle or strain-relieved female pigtail, original pump cord intact |
| Internal mains input/output | Molex Sabre 7.50 mm: `43160-0102/-0103/-0104/-0106` headers, `44441-2002/-2003/-2004/-2006` housings and `43375-2001` contacts; L1/N2 |
| Sensor cable | Micro-Fit 3.0, six positions, locking/polarized; housing candidate `43025-0600` |

The Sabre product specification reports 600 V AC RMS under CSA and 16 A fully
loaded for the 43160 header series, subject to the exact part, wire, cavity
count and applicable derating. Different circuit counts do not prove
non-intermateability: require a CAD partial/cross-mate check, receipt inspection
of keying and pin numbering, and final DRC before release. These ratings do not
establish waterproofness or allow exposed live unplugging. All mains connectors
remain enclosed. Do not use a DC barrel connector for mains.
[Molex Sabre product specification](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/productspecificationpdf/444/44441/PS-44441-9999-001.pdf).

The six-position Micro-Fit candidate is a dual-row, 3.0 mm, locking and polarized
receptacle. Select mating header and terminals together for wire gauge and plating;
specify orientation and pin numbering in the harness drawing before ordering.
[Molex 43025-0600](https://www.molex.com/en-us/products/part-detail/430250600).

Stillair's committed BOM records Micro-Fit 3.0 parts as received: `43045-0200`
header / `43025-0200` housing, `43650-0300` header / `43645-0300` housing, and
`43030-0038` female contacts for 18 AWG. The family is therefore known. This is
not evidence of a six-position set in stock or suitability of those terminals
for the eventual sensor wire. See [source provenance](sources.md).

## Design review boundary

No fuse, MOV, snubber or regulator values; final mains connector set; GPIO map;
PCB outline; creepage/clearance; or enclosure layout is released. A qualified
mains design review must establish applicable insulation/spacing, protection,
PE bonding and enclosure requirements for this installation. This brief contains
no authorization or procedure to energize an unfinished assembly.
