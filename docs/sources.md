# Sources and provenance

Manufacturer references checked 2026-09-11 for the starting brief. Follow the exact
part's current datasheet before freezing a footprint, rating or order. References
do not certify the assembly or constitute measured Crystal Shim results.

| Source | Supports |
| --- | --- |
| [OASE CrystalSkim 350, North America](https://www.oase.com/en-US/aquarium/crystalskim-350) | 120 V / 60 Hz / 4 W load identity; do not substitute European model ratings |
| [TI FDC1004](https://www.ti.com/lit/ds/symlink/fdc1004.pdf) | Supply, four inputs, active shields, VSSOP-10 and package/pin data |
| [TI TIDA-00317](https://www.ti.com/tool/TIDA-00317) and [TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf) | Continuous liquid-level, matched references, shield geometry and design files |
| [Mean Well IRM-05 specification](https://www.meanwell.com/Upload/PDF/IRM-05/IRM-05-SPEC.pdf) | 5 V / 1 A variant, isolation and module approvals |
| [Espressif ESP32-C6-WROOM-1/-1U](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf) | Module-specific mechanical, pin and RF constraints |
| [Omron-origin G5RL family](https://components.omron.com/us-en/products/relays/G5RL) | Candidate family; exact contact/load/coil rating still requires variant review |
| [Relay precautions K337-E1](https://components.omron.com/us-en/system/files/2026-05/ds_related_pdf/K337-E1.pdf) | RC/varistor suppression and actual-load validation |
| [TE/Schaffner FN2090](https://www.te.com/en/product-CAT-P97-F2090.html) | Two-stage family and variant leakage/termination choices |
| [Molex Mini-Fit Jr specification](https://www.molex.com/content/dam/molex/molex-dot-com/products/automated/en-us/productspecificationpdf/555/5556/PS-5556-001-001.pdf) | Configuration-dependent system ratings |
| [Molex 43025-0600](https://www.molex.com/en-us/products/part-detail/430250600) | Six-position dual-row 3.0 mm housing, latch and polarization |
| [Pushover Message API](https://pushover.net/api) | HTTPS message endpoint, application token, recipient key and normal-priority delivery |

## Stillair reference

Setup inspected `../stillair` at commit
`428417dfcdb608eabdad410895cd37806ea4d308`. That checkout's `AGENTS.md`,
`firmware/`, `pcb/package.json`, native skills and sync map establish the tooling
conventions. Shared files have reciprocal entries in both projects' sync maps.

Connector evidence is in
[`stillair/bom/bom.csv` at that commit](https://github.com/micthiesen/stillair/blob/428417dfcdb608eabdad410895cd37806ea4d308/bom/bom.csv):
`43045-0200`, `43025-0200`, `43650-0300`, `43645-0300`, and `43030-0038` are
recorded as received 2026-08-14. This resolves the earlier unknown family as
Micro-Fit 3.0. It does not reserve that stock, establish remaining quantities, or
select the six-position mating set for this project.

Stillair's motor, fan control, MINI-module pin map, purchase history and finished
board geometry are outside this project's design. Shared tooling may retain legacy
fixture names internally; those are test identities, not Crystal Shim boards.
