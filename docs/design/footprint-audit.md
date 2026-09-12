# Controller and mains footprint audit

Status: library and source-land validation for schematic capture, 2026-09-12.
Selected controller copper patterns now exist in tscircuit source; no complete
product footprint, board or handoff is approved. `available-exact` means a
part-specific or geometry-checked stock candidate agrees with the dimensions
checked here. `needs-validation` means a plausible package candidate remains
subject to the manufacturer land-pattern, assembly and polarity checks.
`custom-required` means no exact installed candidate was found, or the checked
candidate conflicts with the selected part drawing. Do not substitute a
generic footprint on a `custom-required` row.

The installed library is KiCad 10.0.5 at
`/Applications/KiCad/KiCad.app/Contents/SharedSupport/footprints`. Pad
coordinates and sizes below are millimetres read from the named `.kicad_mod`
files. All local reads were performed without changing KiCad files. The
design-basis documents remain the authority for the selected parts and nets.

## Controller

| BOM / part | Status | Installed candidate and checked geometry | Action before capture release |
| --- | --- | --- | --- |
| BOM-02 ESP32-C6-WROOM-1-N8 | source lands verified | Pinned Espressif geometry is reproduced in `esp32-c6-wroom.tsx`: 28 perimeter lands at x=+/-8.75, 1.27 mm pitch, 1.5 x 0.9, plus nine 0.8 x 0.8 ground lands for pad 29. | Datasheet v1.4 Figure 11-1 and all module pin functions were independently checked. Compiled tests retain the native asymmetric origin and internally connected pad-29 group. Antenna keepout, thermal vias, body graphics and final native footprint adoption remain board work. |
| BOM-15 AO3400A | source lands verified | AOS PO-00001 Version N requires three 0.8 x 0.8 lands: 1=(-1.2,-0.95), 2=(-1.2,0.95), 3=(1.2,0), with native +Y down. Stock SOT-23 instead uses 1.475 x 0.6 at x=+/-0.9375. | Use the source AOS pattern, with 1 gate, 2 source, 3 drain. Complete mask, stencil, body/courtyard and native adoption before board release. |
| BOM-16 AP63203WU-7 | source lands verified | Diodes DS41326 Rev 3-2 p17 requires six 1.0 x 0.7 lands at x=+/-1.1 and 0.95 mm pitch. The 3.2 mm Y1 dimension is the outer span, giving 2.2 mm centre separation. Stock TSOT-23-6 instead uses 1.325 x 0.6 at x=+/-1.1375. | Use the source Diodes pattern and 1 FB, 2 EN, 3 VIN, 4 GND, 5 SW, 6 BST. Complete mask/stencil and native adoption before release. |
| BOM-26 SRP5030TA-4R7M | source lands verified | Bourns recommends 2.0 x 1.8 rectangular pads at x=+/-2.25. Stock `Inductor_SMD:L_Bourns_SRP5030T` shares centres/sizes but has about 0.25 mm corner radii. | Source retains manufacturer rectangles under `CrystalShim:SRP5030TA`; the stock ID is not an exact copper match. Complete native footprint and assembly review. |
| BOM-27 STPS2L40U (x2) | source lands verified | ST DS2146 Rev 6 Figure 17: 1.62 x 2.18 lands at x=+/-2.11, inner gap 2.60 and outer span 5.84. Stock `Diode_SMD:D_SMB` uses larger 2.5 x 2.3 lands at x=+/-2.15. | `CrystalShim:STPS2L40U_SMB` uses exact source copper, with adopted KiCad convention 1 cathode / 2 anode. Compiled orientation and connectivity checked. Complete native assembly details. |
| BOM-28 TPS3808G01DBVR | source lands verified | TI DBV0006A: 1.1 x 0.6, R0.05 lands at x=+/-1.3, 0.95 mm pitch. Native SOT-23-6 has 1.325 x 0.6 lands at x=+/-1.1375. | Use source DBV6 and RESET/GND/MR/CT/SENSE/VDD pin order; CT remains intentionally open in this circuit. Complete native footprint and assembly settings. |
| BOM-29 SN74LVC1G08DBVR | source lands verified | TI DBV0005A: 1.1 x 0.6, R0.05 lands at x=+/-1.3; left 1/2/3 at -0.95/0/+0.95, right 5/4 at -0.95/+0.95. | Source DBV5 preserves A/B/GND/Y/VCC ordering. Native SOT-23-5 lands are longer and their column centres differ. Complete native footprint/assembly settings. |
| BOM-30 FSUSB42MUX | source lands verified | onsemi Case846AP: 1.4 minimum length x 0.3 reference width lands at x=+/-2.2, 0.5 mm pitch. Native MSOP10 uses 1.5 x 0.35 lands at x=+/-2.1. | The mechanical top-view horizontal rows rotate 90 degrees clockwise to the electrical Figure 3 orientation: pin 1 upper-left, 1-5 down left, 6-10 up right. The source preserves that mapping. Complete native footprint and stencil settings. |
| BOM-31 SN74LVC1G14DBVR | source lands verified | Same manufacturer DBV5 geometry as BOM-29, independently checked in SCES218AA p39-40. | Preserve 1 NC, 2 A, 3 GND, 4 Y, 5 VCC; source explicitly marks NC. Native SOT-23-5 is not the exact TI land example. |
| BOM-32 USBLC6-2SC6 | source lands verified | ST DS4260 Rev 7 Figure 19: 1.20 x 0.60 lands at x=+/-1.15 and 0.95 pitch. Stock SOT-23-6 lands differ. | Source explicitly joins only internal pairs 1-6 and 3-4. Pin 2 GND, 5 VBUS; compiled physical pin map and rotation checked. Complete ESD routing and native assembly details. |
| BOM-33 TCA9517ADGKR | source lands verified | TI DGK drawing 4214862/A 04/2023 has 1.4 x 0.45, R0.05 lands at x=+/-2.2 on 0.65 pitch. Stock VSSOP-8 instead has 1.625 x 0.5, R0.125 at x=+/-2.1125. | Use the source TI pattern; paste matches copper, NSMD preferred with at most 0.05 mm mask expansion per side. Pin order and rotated compiled coordinates were independently checked. Complete the native footprint/assembly settings. |
| BOM-18 GCT USB4105-GF-A | source lands and holes verified | `Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal`. Source reproduces all 16 A/B contact numbers, four `SH` slots and two 0.65 mm locators against GCT B4. Independent native comparison matches all 22 pads/holes at 0/90/180/270 degrees. | Initial adapters restore body origin, native symbol/PCB pin numbers, all shell nets and F.Paste. Native netlist confirms A6/B6 D+ and A7/B7 D-. Integrate the adapters and explicit GND wiring into full-board export. GF-A stakes are 0.95 +/-0.15 mm; review retention and paste/reflow for the 1.6 mm board. |
| BOM-06/07 43025-0600 / 43045-0600 | source lands and holes verified | Native `Connector_Molex:Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal`: pads 1-6 at (0,0),(3,0),(6,0),(0,3),(3,3),(6,3), 1.02 mm drills and 1.5 mm circular copper except 1.5 mm roundrect pin 1, plus a 3 mm NPTH locator at (3,-4.32). | Corrects earlier 1.5 x 2.02 copper claim for this dual-row header. Source/test preserves six-circuit numbering and native pin-1 origin. Final mating clearance, edge distance and enclosure fit remain open. |
| BOM-38/39/40 43045-0200 / 43025-0200 / 43030-0007 | source lands and holes verified | Native `Connector_Molex:Molex_Micro-Fit_3.0_43045-0200_2x01_P3.00mm_Horizontal`: pads (0,0) and (0,3), 1.02 mm drills, 1.5 mm copper and 3 mm NPTH locator at (0,-4.32). | Corrects the earlier 1.4 mm drill transcription. Source/test preserves native origin and pin 1 RAW service input / pin 2 GND. Final mating/retention checks remain. |
| BOM-35/36/37 43650-0300 / 43645-0300 / 43030-0007 | source lands and holes verified | Native `Connector_Molex:Molex_Micro-Fit_3.0_43650-0300_1x03_P3.00mm_Horizontal`: pads (0,0),(3,0),(6,0), 1.02 mm drills and 1.5 x 2.02 oval copper except roundrect pin 1, plus 3 mm NPTH locator at (3,-4.32). | Source and rotated compiled tests preserve 1 V5_PSU / 2 GND / 3 COIL_DRAIN. Keep pad-1 marking and the 10.16 mm edge limit visible; final mating/fit remains. |
| BOM-19 WP710A10LGD and BOM-20/79 B3F-1002-G | source lands and holes verified | `LED_THT:LED_D3.0mm`: native origin at cathode, anode (2.54,0), 0.9 mm holes, 1.8 mm copper. `Button_Switch_THT:SW_PUSH_6mm_H4.3mm`: native origin at upper-left hole, 6.5 x 4.5 rectangle, 1.1 mm holes and 2.0 mm circular copper; repeated native pad 1 maps to manufacturer 3/4, pad 2 to 1/2. | Compiled tests preserve native origins, LED polarity and both permanently joined button pairs. Capture three distinct buttons. Hand-solder LED after reflow; final actuation/fit remains. |
| BOM-62 TPS2553DBVR | source lands verified | Same manufacturer DBV6 geometry as BOM-28, independently checked in SLVS841F p41-42. | Preserve IN/GND/EN/FAULT/ILIM/OUT pin order and distinct power-enable/fault nets. Complete the native footprint/assembly settings. |
| BOM-63 GRM32ER71E226ME15L (x5) | source lands verified | Murata GRM32ER71E226ME15-04CA p27 Table 2 reflow: inner gap 2.0-2.4, pad length 1.0-1.2, width 1.8-2.3 mm. Source midpoints give 1.1 x 2.05 lands at x=+/-1.65. | `CrystalShim:Murata_GRM32_Reflow` uses reflow guidance, not p6 test-substrate lands. Stock IPC lands 1.15 x 2.7 at x=+/-1.475 differ. Complete stencil/courtyard and final solder inspection; body maximum 3.5 x 2.7 x 2.7 mm. |

The generic `SOT-23`, `SOT-23-5`, `SOT-23-6`, `TSOT-23-6`, `MSOP-10` and
`VSSOP-8` entries are usable review candidates only. Their names identify a
package family, not a checked manufacturer land pattern.

## Controller source geometry

The [component source](../../pcb/controller/design/README.md) records manufacturer
drawings/hashes and converts top-view +Y-down pad coordinates to tscircuit +Y up
once. These are copper models for product capture, not complete native footprints.
Tests compile the actual JSX and check pin identity, translated/rotated geometry,
and all nine exposed-ground lands. The WROOM keeps its vendor origin, 3 mm below
the body centre; body and antenna bounds are separately explicit.

Source now includes Panasonic 0603, TDK 100 nF/1 uF and Murata 22 uF reflow
lands, with exact ordering codes and compiled checks. Their dimensions differ
from stock IPC patterns. Native mask/paste/courtyard details remain open.
BOM-80 through BOM-91 count the base controller passives; the additional
[service circuit](service-input.md) and mains quantities are counted separately.
Service eFuse and input TVS copper models are now captured. The 0805 protection
resistors and C0G capacitor still need exact registry/land capture; sensor-cable
ESD selection and complete connected service/USB sections remain work.

USB source indices 1-17 are compiler identifiers, not native contact numbers.
The initial export adapters normalize its copper-bounding-box origin to the GCT
body origin before conversion, then restore alphanumeric pins in both the native
symbol and footprint. Tests reject partial/mixed mappings and verify serialized
symbol pins. The native review also verifies all four shell pads on GND and
explicit A1/A12/B1/B12 wiring. These component checks must become complete-board
manifest/net-parity checks before handoff.

## Mains

| BOM / part | Status | Installed candidate and checked geometry | Action before capture release |
| --- | --- | --- | --- |
| BOM-03 IRM-10-5 | available-exact candidate | `Converter_ACDC:Converter_ACDC_MeanWell_IRM-05-xx_THT` has body/fab extents 45.7 x 25.4, 1.5 mm drills, and pads 1=(0,0), 2=(0,10.75), 3=(38.5,10.75), 4=(38.5,2.75). | Native symbol functions are 1 AC/N, 2 AC/L, 3 -Vo, 4 +Vo. Rotate 180 degrees and translate by (42.1,14.2) to match the component-side manufacturer functions exactly. The IRM-10-5 drawing was visually checked against these same IRM-05 stock coordinates and body dimensions. The initial output-swap claim was incorrect. The manufacturer does not number the pins; adopt the native symbol numbering consistently. Validate drill/annulus against the final fabrication rules. |
| BOM-04 G5RL-1A-TV8 DC5 | custom-required | No G5RL footprint is installed. The selected drawing requires four 1.3 mm finished holes: pin 1=(20,0), pin 5=(20,7.5), pin 3=(0,0), pin 4=(0,7.5), with a 29.0 x 12.7 mm maximum body. | Author or import the exact Omron pattern. Keep coil and contact columns and the 8 mm isolation boundary explicit. |
| BOM-25 1N4007-E3/54 | available-exact candidate | `Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal` has pads 1 and 2 at (0,0) and (10.16,0), 1.1 mm drills and 2.2 mm lands. | Check the Vishay lead diameter, body clearance, polarity mark and final creepage around the coil. |
| BOM-13 TMOV14RP175E | custom-required | The nearest installed `Varistor:RV_Disc_D15.5mm_W8mm_P7.5mm` has pad 1=(0,0), pad 2=(7.5,4.4), 0.8 mm drills and 1.8 mm lands. | The selected TMOV has straight leads on 7.5 ± 1.0 mm spacing and the basis calls for 1.1 mm finished holes. The diagonal near match is not suitable; create an exact straight-lead pattern after checking the Littelfuse drawing and thermal keepout. |
| BOM-24 PR02FS0201000KA100 | custom-required | The nearest installed `Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P15.24mm_Horizontal` has 15.24 mm pad spacing, 0.8 mm drills and 1.6 mm lands, but a 6.3 x 2.5 mm body. | The selected PR02-FS body is 10.0 x 3.9 mm with 0.78 mm leads and the basis calls for 1.0 mm holes. Use a PR02-specific pattern or a validated larger-body axial footprint. |
| BOM-14 B32921C3473K000 | available-exact candidate | `Capacitor_THT:C_Rect_L13.0mm_W5.0mm_P10.00mm_FKS3_FKP3_MKS4` has pads 1 and 2 at (0,0) and (10,0), 1 mm drills and 2 x 2 lands; fab body is 13.0 x 5.0 mm. | The selected TDK part is specified as 13 x 5 x 11 mm maximum with 10 mm lead pitch. Verify lead-to-body clearance, X2 spacing and the assembled height in the final render. |
| BOM-09, BOM-43, BOM-46, BOM-49 43160-0102/-0103/-0104/-0106 | needs-validation | Read-only scan found installed `Connector_Molex:Molex_Sabre_43160-0102_1x02_P7.49mm_Vertical`, `...0103_1x03...`, `...0104_1x04...` and `...0106_1x06...` candidates. Each checked file has two plated-hole rows per circuit at y=-3.18 and 0, duplicate pad numbers, 1.78 mm drills and 7.49 mm pitch, with 3.78 x 3.43 mm copper. The two-tail arrangement must be compared to the exact drawing; it does not establish cross-mating behavior. | Compare the candidate's two-tail geometry, pad size and pin numbering to the exact 43160 drawing. A proposed 3.50 mm copper pad on 7.493 mm pitch gives 3.993 mm nominal copper gap (above the 3.2 mm project rule), but account for every unused header blade, solder fillet and shroud in CAD and final DRC. Drawing header envelopes are 21.08/28.58/36.07/51.05 mm for 2/3/4/6 circuits; actual board fit remains owed. |
| BOM-35 43650-0300 | available-exact candidate | Same checked 1x3, 3.00 mm pitch, 1.02 mm drill and (3,-4.32) locator pattern as the controller mate. | Use the same mirrored circuit numbering on both boards and retain the Molex edge-distance requirement. |

Additional selected power components:

| BOM / part | Status | Candidate / checked source | Action before capture release |
| --- | --- | --- | --- |
| BOM-64 / BOM-94 TPS259470ARPWR | source lands verified | `CrystalShim:TPS259470A_RPW0010A` reproduces TI 4225183/A: ten functional lands, four rounded L corner pads and long IN/OUT pads 5/6; no exposed ground pad. | The initial-export adapter moves the converter's circular anchor into each L leg, preserving effective copper at all cardinal rotations. Keep source routing disabled. TI p74 split paste windows, mask, courtyard and native adoption remain required; generic 2 x 2 QFN/RPU is not a substitute. |
| BOM-65 STPS2L40U | source lands verified | Same checked ST SMB source as BOM-27. | Preserve negative-clamp polarity: pad 1 V5_PSU, pad 2 GND_ISO. Transient/clamp evidence remains separate. |
| BOM-106 SMBJ8.0CA | source lands verified | `CrystalShim:SMBJ8_0CA` uses Littelfuse p5 limits: 2.160 x 2.260 rectangular lands at x=+/-2.450, with 2.740 inner gap. | Source terminals 1/2 are nonpolar for the CA bidirectional part. Complete body/courtyard/stencil and connected pulse model; this is not a precise 5 V clamp. |

The eFuse's exact ERA-3A divider/current resistors (BOM-70 through BOM-73)
reuse the checked Panasonic 0603 lands. Service ERA3AEB2612V, ERA3AEB3832V and
ERA3AEB2871V use the same pattern. ERA6AEB474V and ERA6AEB222V require an 0805
pattern: Panasonic DMM0000COL17 p1 gives inner gap 1.0-1.4, outer span 3.2-3.8
and width 0.9-1.4. Adopt midpoint rectangular lands 1.15 x 1.15 at x=+/-1.175.
The current resistor wrapper assumes 0603 for every value; add per-value pattern
metadata before registering these two ERA6A parts. All five exact service
resistor codes are 0.1%, 25 ppm/K; ERA3A is 0.100 W and ERA6A 0.125 W, with
derating above 85 C. ERA3AEB's range ends at 330 kohm, so 470 kohm is not a
same-package substitution.

BOM-74 / service C1608C0G1H472J080AA is 4.7 nF, 5%, C0G, 50 V, with nominal
1.60 x 0.80 x 0.80 mm body. TDK GC11010030, September 2026, printed p18/PDF p19
defines inner gap, individual land length and width as 0.6-0.8 each for C1608
reflow. Existing 0.70 mm square lands at x=+/-0.70 match the selected midpoints.
Keep each capacitor's exact characterization URL separate from shared package
geometry metadata. These checked mappings await registry/source integration;
mask, stencil, courtyard and native adoption remain separate work.

Mains C2/C3/C4 and R7 are now independently counted as BOM-75 through BOM-78.
C2 is TDK 0805, C3 TDK 0603, C4 the same 1210 Murata part as controller
BOM-63, and R7 Panasonic ERA-6A 0805. Their exact primary drawings and net/ref
assignments are in the secondary protection contract. Stock package names remain
candidates until their lands/stencil are checked; no accepted footprint is implied.

## Sensor power components

| BOM / part | Status | Candidate / checked source | Action before capture release |
| --- | --- | --- | --- |
| BOM-17 LT3042IMSE#PBF | needs-validation | `Package_SO:MSOP-10-1EP_3x3mm_P0.5mm_EP1.68x1.88mm` has the correct exposed-pad dimensions and four paste apertures. ADI MSE drawing 05-08-1664 Rev I specifies 0.50 mm pitch, 3 x 3 body and 4.90 mm lead span. | Compare all lead lands, polarity and stencil dimensions; solder pad 11 to GND. An ordinary MSOP-10 without the exposed pad is wrong. |
| BOM-66 C3216X7R1E106K160AB (x2) | needs-validation | TDK 1206 body is 3.20 +/-0.20 x 1.60 +/-0.20 x 1.60 +/-0.20. Stock `Capacitor_SMD:C_1206_3216Metric` has 1.15 x 1.80 pads at x=+/-1.475. | Compare TDK's reflow PA/PB/PC dimension drawing; the stock IPC pattern is not an exact reproduction of its recommended lands. The inspected bias curve establishes capacitance planning, not land geometry approval. |
| BOM-67 C2012X7R1E474K125AA | needs-validation | 0805 package candidate; exact TDK product drawing linked in sensor basis. | Validate land dimensions and assembly height. |
| BOM-68/69 ERA3AEB333V / ERA3AEB2491V | needs-validation | `Resistor_SMD:R_0603_1608Metric` candidate for Panasonic ERA-3A 0603. | Compare exact Panasonic dimensions and pads; retain 0.1% / 25 ppm/C ordering codes. |

The FN2090A-1-06 filter, Schurter 6200.2300 inlet and RC320 cover, Littelfuse
0215.800MXP fuse cartridge, Faston terminals, housings, contacts, wires, cord,
gland and PE rings are chassis or harness parts. They have no PCB
footprint in this design. Capture their mounting holes, tabs, clearances and
wire-entry geometry in the enclosure and harness drawings. The fuse is held by
the inlet, not by a PCB fuse holder.

## Source and reproducibility notes

Primary part links are retained in [controller-design-basis.md](controller-design-basis.md),
[mains-design-basis.md](mains-design-basis.md), and [bom.csv](../../bom/bom.csv).
The following fetched source artifacts were used for the checked comparisons:

| Source | Revision or fetched SHA-256 |
| --- | --- |
| [Espressif KiCad footprint](https://raw.githubusercontent.com/espressif/kicad-libraries/dd76561812ab300351234ba6e0ec1295641796f0/footprints/Espressif.pretty/ESP32-C6-WROOM-1.kicad_mod) | Git `dd76561812ab300351234ba6e0ec1295641796f0`; file SHA-256 `801e051393f57c7e45523b91de1c1b61f595a923c9a02b8fae846c4af4a926b1` |
| [Bourns SRP5030TA drawing](https://www.bourns.com/docs/product-datasheets/srp5030ta.pdf) | fetched file SHA-256 `4a4ce681e20e29b4b888dc3a783f7e30eb7a75541f16591b2c1da921b26c7e32` |
| [GCT USB4105 drawing](https://gct.co/files/drawings/usb4105.pdf) | fetched file SHA-256 `fb331fbabee8392ed2937ed757c1610cb0f174b84625147c0b580a18eea8c0e5` |
| [Mean Well IRM-05 specification](https://www.meanwell.com/Upload/PDF/IRM-05/IRM-05-SPEC.pdf) | drawing dated 2025-08-08; fetched file SHA-256 `8e13f9373a39d8e0d92d540082cb97a9f3172111ea749b807af96db9e27d878a` |
| [Mean Well IRM-10 specification](https://www.meanwell.com/Upload/PDF/IRM-10/IRM-10-SPEC.pdf) | drawing dated 2025-08-08; fetched file SHA-256 `1aab6b30492328818e4d0900416676891eeb1076f409d56dc2277d7119ed208a`; mechanical drawing visually inspected |
| [TI TPS25947 specification](https://www.ti.com/lit/ds/symlink/tps25947.pdf) | Rev C, May 2026; SHA-256 `8f96de389903091650d4f462dcfad3210071c3ae7093623a7978f34baf8a65b4`; RPW land/stencil drawing 4225183/A inspected |
| [TDK C3216X7R1E106K160AB characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c3216x7r1e106k160ab_200122.pdf) | 2020-01-22; SHA-256 `b2cca941451d5867e9bffe084773e891be09e55add8dd8d7f5a6944007c7c8e8`; DC-bias curve visually inspected |
| [TDK C2012X7R1E105K125AB characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c2012x7r1e105k125ab.pdf) | 2016-01-03; SHA-256 `5ca8971a17b99f12b5263703343c3a321d272cafa8281282bf39ae4140f85874`; DC-bias curve visually inspected |
| [Molex 43650 drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf) | document SD-43650-001, Rev E1, document revision D8, release 2024-11-05 |
| [Diodes AP63200 family datasheet](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf) | DS41326 Rev 3-2; fetched file SHA-256 `ef99daa3789d835bc025dfcb4c605c5c2e6d3e7223e86d40b33e6b497ea5a722` |
| [TI TCA9517A datasheet](https://www.ti.com/lit/ds/symlink/tca9517a.pdf) | Rev E as cited in the basis; fetched file SHA-256 `ad2d7dc5994583006aa21b67ee9f18507a2698ad9366285dff56816f065790c6` |
| [onsemi FSUSB42 datasheet](https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf) | fetched file SHA-256 `2a7d7d7e42d9d3a4d1a95fb0407012e73bf4145e374fba7fb04d7b29b861e5b7` |

Representative installed-library hashes are USB4105
`3b8d7da3cae5114ec83022a759a78925113bc2eeec100ea447594f6d8687e4b8` and the
SRP5030T near match
`ae5eba5b3e06bf10ab405120318a6791981474ffadb9da00c23569b349aaab37`.
These hashes identify the locally inspected files, not a KiCad library release.

## Additional capture evidence, 2026-09-12

- [ST DS2146 Rev 6 manufacturer PDF mirror](https://www.ic-components.pl/files/fe/STPS2L40AF.pdf): SHA-256 `1072d6381bcda6cea295901df6db4d7c766566860e90b085f31a042732b6e08a`; SMB p1/7/8 inspected.
- [ST DS4260 Rev 7 manufacturer PDF mirror](https://store.comet.bg/download-file.php?id=30778): SHA-256 `1c61ac54a7cce343899a55ff9e19229444c0e22a3e7265c24fe979be476ca7de`; pinout and land p1/12/13 inspected. Direct ST downloads failed; these hashes identify actual mirrored manufacturer bytes.
- [Murata detailed reference sheet](https://pim.murata.com/asset/pim4/ceramicCapacitorSMD/GRM32ER71E226ME15-04CA-EN_PDF_CERAMICCAPACITORSMD?lastModifiedDatetime=20260730173647): SHA-256 `167a6933d9fb0b46ed47eff2bcb1b43822cb141c9a10abfb46ff7f204f17acdb`; p27 reflow table and p2 body/termination dimensions.
- Native 43045-0600: `1189d97f82d7fb3431677e14c083aca02bb7d19cf70b3b44453348b7371d963d`; 43045-0200: `8e925c4f589c229e874438e65821325e6f912a3852dc7341d6539d24986eed66`; 43650-0300: `6b669b0fab1c154bd32124d3f453b52a4dbb4ff697b7aab6dffc95fbbf582d76`. These hashes identify the installed KiCad 10.0.5 files reproduced in source, not downloaded Molex PDF bytes.
- [Littelfuse SMBJ manufacturer PDF mirror](https://atta.szlcsc.com/upload/public/pdf/source/20250918/1F4D01A109F9E96436584D6D9E812816.pdf): JC.07/04/25 v4, SHA-256 `d7df155be4b1f612085401e8c946f065e284d65a0e7de22b9225a7b73946e51b`. Exact SMBJ8.0CA selection, p5 land dimensions and CA polarity were checked. Canonical Littelfuse downloads returned HTTP 403.
- [Panasonic resistor land drawing](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/DMM0000COL17.pdf): 2025-12-24, p1, SHA-256 `fc707b230cce91d464bc3aaf1ed614fa5b412f40cbe7df7cab1541d2c164a882`. ERA 0603/0805 gap/span/width ranges visually checked.
- [Panasonic ERA specifications](https://industrial.panasonic.com/cdbs/www-data/pdf/RDM0000/AOA0000C307.pdf): 2024-04-24, p1-3, SHA-256 `2ffb715174964a986d8cd22f38607a14465c938bb5ff9817e0948124ebb69a5b`. Exact code classes, ratings and body dimensions checked with manufacturer model pages.
- [TDK exact 4.7 nF characterization](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608c0g1h472j080aa.pdf): 2019-05-21, p1, SHA-256 `07fe6542d046e96878552c0c2dfba1b7027b45231fec57092052b755a2bf6f45`.
- [TDK family delivery specification](https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/specification/mlccspec_commercial_general_midvoltage_en.pdf): GC11010030, September 2026, SHA-256 `4e6084e013d796f311636cc4c8e2e3e27d05beef7c876fbf5a3759c4cd32624e`. Printed p18/PDF p19 reflow diagram and table visually checked; flow-solder lands differ.

The final manufacturer's/component-side mating drawing and physical retention
checks remain distinct from the source/native copper and drill comparison.
