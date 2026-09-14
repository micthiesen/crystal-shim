# Sources and provenance

Manufacturer references checked 2026-09-11 for the starting brief. Follow the exact
part's current datasheet before freezing a footprint, rating or order. References
do not certify the assembly or constitute measured Crystal Shim results.

| Source | Supports |
| --- | --- |
| [OASE CrystalSkim 350, North America](https://www.oase.com/en-US/aquarium/crystalskim-350) | 120 V / 60 Hz / 4 W load identity; do not substitute European model ratings |
| [TI FDC1004](https://www.ti.com/lit/ds/symlink/fdc1004.pdf) | Supply, four inputs, active shields, VSSOP-10 and package/pin data |
| [TI TIDA-00317](https://www.ti.com/tool/TIDA-00317) and [TIDU736A](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf) | Continuous liquid-level, matched references, shield geometry and design files |
| [Mean Well IRM-45 specification](https://www.meanwell.com/Upload/PDF/IRM-45/IRM-45-SPEC.pdf) | 12 V / 3.8 A isolated module; 87 x 52 x 29.5 mm envelope and derating |
| [Espressif ESP32-C6-WROOM-1/-1U](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf) | Module-specific mechanical, pin and RF constraints |
| [Omron-origin G5RL family](https://components.omron.com/us-en/products/relays/G5RL) | Candidate family; exact contact/load/coil rating still requires variant review |
| [Relay precautions K337-E1](https://components.omron.com/us-en/system/files/2026-05/ds_related_pdf/K337-E1.pdf) | RC/varistor suppression and actual-load validation |
| [TE/Schaffner FN2090](https://www.te.com/en/product-CAT-P97-F2090.html) | Two-stage family and variant leakage/termination choices |
| [Phoenix Contact 1868076](https://www.phoenixcontact.com/en-us/products/pcb-terminal-block-mkds-5-2-762-1868076) | Selected two-position MKDS 5/2-7,62 fixed side-entry terminal on mains J1–J4; see terminal capture basis for drawing receipt and assembly limits |
| [JST XH series](https://www.jst.com/wp-content/uploads/2025/06/eXH.pdf) | Controller J2 S2B-XH-A right-angle header, XHP-2 housing and SXH-001T-P0.6 contacts; 2.5 mm interface distinct from 12 V Micro-Fit |
| [Molex 43025-0600](https://www.molex.com/en-us/products/part-detail/430250600) | Six-position dual-row 3.0 mm housing, latch and polarization |
| [TI TPS7A24](https://www.ti.com/lit/ds/symlink/tps7a24.pdf) | Fixed 3.3 V sensor regulator and pin/land mapping |
| [Hammond 1590ZGRP243](https://www.hammfg.com/part/1590ZGRP243) | Current GRP enclosure and manufacturer drawing/STEP |
| [Future refill artifact](https://public.mcp.syas.ca/boris/artifacts/art_c4il1nmrk3mtz55xb2) | Deferred feature specification; present provisions summarized in the refill attachment contract |
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
