# Electrical design brief

This brief owns the requirements. Sourced capture candidates, pin maps and
calculations now live in the [controller](design/controller-design-basis.md) and
[mains](design/mains-design-basis.md) design basis. Those documents refine the
initial choices below; no layout or fabrication gate has passed.

The [future refill attachment](design/refill-expansion.md) places three fixed-12 V
pump drivers and a separate reservoir sensor bus on the present controller.
One isolated supply powers all electronics and future pumps. Refill/conditioning
behavior and the reservoir sensor PCB are future work.

## Power and controller

| Function | Selected source contract |
| --- | --- |
| MCU | ESP32-C6-WROOM-1-N8, existing native USB and UART retained |
| Isolated PSU | PCB-mounted Mean Well IRM-45-12, 12 V / 3.8 A |
| Rails | AP63205 fixed 5 V on mains board; AP63203 fixed 3.3 V on controller |
| Future pumps | Three AO3400A low-side outputs with flyback; 1 A each, 2 A combined continuous |
| Base allocation | 5 V / 850 mA; future loads separately allocated 12 V / 2 A |
| Programming | Self-powered native USB data; [known-adapter service input](design/service-input.md), mains disconnected |
| Local controls | Existing status LED, maintenance/off, boot and reset buttons |

The common supply has a 45.6 W nameplate. Base plus a brief 3 A future motor
startup target is allocated 42.9325 W using conservative buck efficiency and rail
limits. Select future pumps within that envelope. Source protection and a motor
branch fuse replace the former secondary eFuse; an exceptional fault may cause a
reset and explicit recovery. Detailed limits and exact parts belong to the
[mains basis](design/mains-design-basis.md). Preserve the primary/secondary barrier
and relay contact/coil isolation; component approvals do not certify the assembly.

The three-wire low-voltage harness retains isolated 5 V, ground and COIL_DRAIN.
A separate two-wire 12 V harness carries motor current to the controller output
bank. Keep its return out of sensor and logic supply harnesses. Grounds remain
common on the isolated side.

## Switching and interference control

The relay is **G5RL-1A-TV8 DC5**, normally open, with the sourced pin map and
motor-load basis in the [mains design](design/mains-design-basis.md). The TV8
marking alone is not the motor rating. Verify the actual CrystalSkim starts and
coil release during final commissioning.
[Manufacturer G5RL family](https://components.omron.com/us-en/products/relays/G5RL).

Switch hot after the pump-branch filter. Neutral passes through the filter to the
load; it is not switched alone. PE is continuous and never switched. The relay
must release when control power disappears. A mechanical relay is the baseline;
no solid-state or more elaborate switching scheme is selected.

| Measure | Selected design and position |
| --- | --- |
| Series RC snubber | 47 nF B32921C3473K000 and 100 ohm PR02FS0201000KA100 across switched hot/output neutral |
| Manufactured two-stage EMI filter | FN2090A-1-06 / 802490-SF on the pump branch before the relay |
| Protected MOV | TMOV14RP175EL2T7 at the protected mains input |
| Fuses | 2 A inlet cartridge; 1 A axial filter branch; 3 A SMT isolated 12 V motor branch |

Do not install the RC network across open relay contacts by default: that creates
a bypass current path through the nominally off pump. This project chooses a
network across the load. Select its values and ratings before fabrication using
the load information, manufacturer guidance and documented calculations. Confirm
effectiveness and component stress with the actual pump on the final assembly;
manufacturer guidance calls for experimental confirmation. This is a commissioning
check, not a separate prototype phase.
[Relay precautions](https://components.omron.com/us-en/system/files/2026-05/ds_related_pdf/K337-E1.pdf).

The selected FN2090A-1-06 is a low-current two-stage filter. Its exact variant
and wiring are captured in the mains basis. Leakage must be considered with the installation's
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
| Internal mains input/output | Molex Sabre 7.50 mm: `43160-1102/-1103/-1104/-1106` right-angle headers, `44441-2002/-2003/-2004/-2006` housings and `43375-2001` contacts; L1/N2 |
| Sensor cable | Six solder lands on sensor J1 with left-exiting 24 AWG pigtail; six-position locking/polarized Micro-Fit at controller, housing `43025-0600` |

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

Exact components, GPIOs, outlines and enclosure allocation are selected in source.
Native routing and fabrication acceptance remain separate. Mains review must
verify the captured insulation/spacing, protection, PE bonding and enclosure
requirements for this installation. This brief contains
no authorization or procedure to energize an unfinished assembly.
