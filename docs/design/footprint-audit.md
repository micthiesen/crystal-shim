# Controller and mains footprint audit

Status: read-only library inventory for schematic capture, 2026-09-11. This
does not create or approve a product footprint. `available-exact` means a
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
| BOM-02 ESP32-C6-WROOM-1-N8 | custom-required | No installed WROOM candidate. The fetched Espressif footprint has pads 1-14 at x=-8.75, pads 15-28 at x=8.75, 1.27 mm pitch, 1.5 x 0.9 pads, and exposed pad 29 as a 3 x 3 array of 0.8 x 0.8 pads. Silk body is 18 x 25.5. | Vendor the fetched file only after comparing every module pad to the datasheet, antenna keepout and the project pad map. Record the adopted revision. |
| BOM-15 AO3400A | needs-validation | `Package_TO_SOT_SMD:SOT-23`: pads 1-3, pad centres (-0.9375,-0.95), (-0.9375,0.95), (0.9375,0), each 1.475 x 0.6. | Compare AOS SOT-23 drawing and land pattern, including pin 1 orientation, before assigning the footprint. |
| BOM-16 AP63203WU-7 | needs-validation | `Package_TO_SOT_SMD:TSOT-23-6`: pads 1-6, centres x=±1.1375 and y=-0.95, 0, 0.95, 1.325 x 0.6. | Diodes calls the package TSOT26 and suggests 0.7 x 1.0 mm pads with 0.95 mm pitch. The stock candidate is a near match only; validate or replace it with a package-specific land pattern. |
| BOM-26 SRP5030TA-4R7M | available-exact candidate | `Inductor_SMD:L_Bourns_SRP5030T` has 5.7 x 5.2 body graphics, pad centres ±2.25 (4.5 mm apart), and 2.0 x 1.8 pads. | Visual comparison confirms the drawing's 6.5 mm outer span and 2.5 mm inner gap imply 2.0 mm wide pads at 4.5 mm centres. The initial centre-spacing mismatch claim was incorrect. Verify the selected suffix and final rendered placement. |
| BOM-27 STPS1L40A (x2) | needs-validation | `Diode_SMD:D_SMA`: pads 1 and 2 at (-2,0) and (2,0), each 2.5 x 1.8. | Compare ST’s SMA package and recommended land pattern, then check diode polarity and solder-mask openings. |
| BOM-28 TPS3808G01DBVR | needs-validation | `Package_TO_SOT_SMD:SOT-23-6`: pads 1-6, x=±1.1375, y=-0.95, 0, 0.95, 1.325 x 0.6. | Confirm TI DBV0006A dimensions, pad length and pin 1 orientation against the selected package. |
| BOM-29 SN74LVC1G08DBVR | needs-validation | `Package_TO_SOT_SMD:SOT-23-5`: pads 1-5, x=±1.1375, y=-0.95, 0, 0.95, 1.325 x 0.6. | Confirm TI DBV0005A land pattern and pin 1 orientation. |
| BOM-30 FSUSB42 | needs-validation | `Package_SO:MSOP-10_3x3mm_P0.5mm`: pads 1-10, x=±2.1, y=-1,-0.5,0,0.5,1, each 1.5 x 0.35. | The onsemi part is MSOP10, but its case drawing and solder land pattern must be compared before using the generic footprint. |
| BOM-31 SN74LVC1G14DBVR | needs-validation | `Package_TO_SOT_SMD:SOT-23-5`, same checked 1-5 pad set and 1.325 x 0.6 pad geometry as BOM-29. | Confirm TI DBV0005A land pattern and pin 1 orientation. |
| BOM-32 USBLC6-2SC6 | needs-validation | `Package_TO_SOT_SMD:SOT-23-6`, checked 1-6 pad set, x=±1.1375, y=-0.95, 0, 0.95, 1.325 x 0.6. | ST’s SOT-23-6 package drawing and ESD routing/ground pad requirements must be checked; the generic name does not establish exactness. |
| BOM-33 TCA9517ADGKR | needs-validation | `Package_SO:VSSOP-8_3x3mm_P0.65mm`: pads 1-8, x=±2.1125, y=±0.975 and ±0.325, each 1.625 x 0.5. | TI DGK0008A drawing recommends 1.4 x 0.45 lands on 0.65 mm pitch. Validate pad length, mask definition and pin 1 orientation or adopt a TI-specific pattern. |
| BOM-18 GCT USB4105-GF-A | available-exact | `Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal`. Checked A/B pads A1,A4,A5,A6,A7,A8,A9,A12 and B1,B4,B5,B6,B7,B8,B9,B12, plus four `SH` through-hole pads. Signal pads are 0.3 or 0.6 x 1.15; shell pads are at x=±4.32. | Retain this part-specific candidate, then run the final rendered component-side check against the GCT drawing and verify D+/D- mapping. |
| BOM-06/07 43025-0600 / 43045-0600 | available-exact | BOM-06 housing has no PCB footprint. `Connector_Molex:Molex_Micro-Fit_3.0_43045-0600_2x03_P3.00mm_Horizontal` has pads 1-6 at (0,0),(3,0),(6,0),(0,3),(3,3),(6,3), 1.02 mm drills and 1.5 x 2.02 lands, plus the 3 mm locator at (3,-4.32). | Preserve the six-circuit numbering and verify mating clearance, edge distance and the manufacturer drawing in the rendered board. |
| BOM-38/39/40 43045-0200 / 43025-0200 / 43030-0007 | available-exact for header | `Connector_Molex:Molex_Micro-Fit_3.0_43045-0200_2x01_P3.00mm_Horizontal` has pads 1 and 2 at (0,0) and (0,3), 1.4 mm drills and 1.5 mm pad diameter, plus a 3 mm locator at (0,-4.32). Housing and contacts have no PCB footprints. | Verify the two-position drawing and ensure this keyed service header cannot mate with the sensor or coil harness. |
| BOM-35/36/37 43650-0300 / 43645-0300 / 43030-0007 | available-exact for header | `Connector_Molex:Molex_Micro-Fit_3.0_43650-0300_1x03_P3.00mm_Horizontal` has pads 1-3 at (0,0),(3,0),(6,0), 1.02 mm drills and 1.5 x 2.02 lands, plus the 3 mm locator at (3,-4.32). Housing and contacts have no PCB footprints. | This matches the Molex component-side layout checked in drawing SD-43650-001, Rev E1, document revision D8. Keep pad 1 marking and the 10.16 mm edge limit visible. |
| BOM-19 status LED and BOM-20 buttons | open | No exact MPN, package or installed candidate is selected. | Select the actual LED, buttons and resistor values, then assign package-specific footprints. |
| BOM-62 TPS2553DBVR | needs-validation | `Package_TO_SOT_SMD:SOT-23-6` is the DBV package candidate, as for the supervisor above. | Compare the TPS2553 DBV drawing and pin map before adoption; preserve separate power enable and fault nets. |
| BOM-63 GRM32ER71E226ME15L (x5) | needs-validation | `Capacitor_SMD:C_1210_3225Metric` is a package candidate for the 3.2 x 2.5 mm nominal body. | Compare Murata's land pattern and 2.7 mm maximum height; the capacitance/bias calculation does not validate the footprint. |

The generic `SOT-23`, `SOT-23-5`, `SOT-23-6`, `TSOT-23-6`, `MSOP-10` and
`VSSOP-8` entries are usable review candidates only. Their names identify a
package family, not a checked manufacturer land pattern.

## Mains

| BOM / part | Status | Installed candidate and checked geometry | Action before capture release |
| --- | --- | --- | --- |
| BOM-03 IRM-05-5 | available-exact candidate | `Converter_ACDC:Converter_ACDC_MeanWell_IRM-05-xx_THT` has body/fab extents 45.7 x 25.4, 1.5 mm drills, and pads 1=(0,0), 2=(0,10.75), 3=(38.5,10.75), 4=(38.5,2.75). | Native symbol functions are 1 AC/N, 2 AC/L, 3 -Vo, 4 +Vo. Rotate 180 degrees and translate by (42.1,14.2) to match the component-side manufacturer functions exactly. The initial output-swap claim was incorrect. The manufacturer does not number the pins; adopt the native symbol numbering consistently. Validate drill/annulus against the final fabrication rules. |
| BOM-04 G5RL-1A-TV8 DC5 | custom-required | No G5RL footprint is installed. The selected drawing requires four 1.3 mm finished holes: pin 1=(20,0), pin 5=(20,7.5), pin 3=(0,0), pin 4=(0,7.5), with a 29.0 x 12.7 mm maximum body. | Author or import the exact Omron pattern. Keep coil and contact columns and the 8 mm isolation boundary explicit. |
| BOM-25 1N4007-E3/54 | available-exact candidate | `Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal` has pads 1 and 2 at (0,0) and (10.16,0), 1.1 mm drills and 2.2 mm lands. | Check the Vishay lead diameter, body clearance, polarity mark and final creepage around the coil. |
| BOM-13 TMOV14RP175E | custom-required | The nearest installed `Varistor:RV_Disc_D15.5mm_W8mm_P7.5mm` has pad 1=(0,0), pad 2=(7.5,4.4), 0.8 mm drills and 1.8 mm lands. | The selected TMOV has straight leads on 7.5 ± 1.0 mm spacing and the basis calls for 1.1 mm finished holes. The diagonal near match is not suitable; create an exact straight-lead pattern after checking the Littelfuse drawing and thermal keepout. |
| BOM-24 PR02FS0201000KA100 | custom-required | The nearest installed `Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P15.24mm_Horizontal` has 15.24 mm pad spacing, 0.8 mm drills and 1.6 mm lands, but a 6.3 x 2.5 mm body. | The selected PR02-FS body is 10.0 x 3.9 mm with 0.78 mm leads and the basis calls for 1.0 mm holes. Use a PR02-specific pattern or a validated larger-body axial footprint. |
| BOM-14 B32921C3473K000 | available-exact candidate | `Capacitor_THT:C_Rect_L13.0mm_W5.0mm_P10.00mm_FKS3_FKP3_MKS4` has pads 1 and 2 at (0,0) and (10,0), 1 mm drills and 2 x 2 lands; fab body is 13.0 x 5.0 mm. | The selected TDK part is specified as 13 x 5 x 11 mm maximum with 10 mm lead pitch. Verify lead-to-body clearance, X2 spacing and the assembled height in the final render. |
| BOM-09, BOM-43, BOM-46, BOM-49 43160-0102/-0103/-0104/-0106 | needs-validation | Read-only scan found installed `Connector_Molex:Molex_Sabre_43160-0102_1x02_P7.49mm_Vertical`, `...0103_1x03...`, `...0104_1x04...` and `...0106_1x06...` candidates. Each checked file has two plated-hole rows per circuit at y=-3.18 and 0, duplicate pad numbers, 1.78 mm drills and 7.49 mm pitch, with 3.78 x 3.43 mm copper. The two-tail arrangement must be compared to the exact drawing; it does not establish cross-mating behavior. | Compare the candidate's two-tail geometry, pad size and pin numbering to the exact 43160 drawing. A proposed 3.50 mm copper pad on 7.493 mm pitch gives 3.993 mm nominal copper gap (above the 3.2 mm project rule), but account for every unused header blade, solder fillet and shroud in CAD and final DRC. Drawing header envelopes are 21.08/28.58/36.07/51.05 mm for 2/3/4/6 circuits; actual board fit remains owed. |
| BOM-35 43650-0300 | available-exact candidate | Same checked 1x3, 3.00 mm pitch, 1.02 mm drill and (3,-4.32) locator pattern as the controller mate. | Use the same mirrored circuit numbering on both boards and retain the Molex edge-distance requirement. |

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
| [Molex 43650 drawing](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/salesdrawingpdf/436/43650/436501200_sd.pdf) | document SD-43650-001, Rev E1, document revision D8, release 2024-11-05 |
| [Diodes AP63200 family datasheet](https://www.diodes.com/datasheet/download/AP63200-AP63201-AP63203-AP63205.pdf) | DS41326 Rev 3-2; fetched file SHA-256 `ef99daa3789d835bc025dfcb4c605c5c2e6d3e7223e86d40b33e6b497ea5a722` |
| [TI TCA9517A datasheet](https://www.ti.com/lit/ds/symlink/tca9517a.pdf) | Rev E as cited in the basis; fetched file SHA-256 `ad2d7dc5994583006aa21b67ee9f18507a2698ad9366285dff56816f065790c6` |
| [onsemi FSUSB42 datasheet](https://www.onsemi.com/download/data-sheet/pdf/fsusb42-d.pdf) | fetched file SHA-256 `2a7d7d7e42d9d3a4d1a95fb0407012e73bf4145e374fba7fb04d7b29b861e5b7` |

Representative installed-library hashes are USB4105
`3b8d7da3cae5114ec83022a759a78925113bc2eeec100ea447594f6d8687e4b8` and the
SRP5030T near match
`ae5eba5b3e06bf10ab405120318a6791981474ffadb9da00c23569b349aaab37`.
These hashes identify the locally inspected files, not a KiCad library release.
