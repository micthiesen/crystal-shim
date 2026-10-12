# Rollback bootloader

`esp32c6-bootloader.bin` is the ESP-IDF second-stage bootloader that
`scripts/flash.sh` writes on every USB flash. The script refuses to run if the
file is missing or its SHA-256 differs from the value below.

| Field | Value |
| --- | --- |
| Source | [esp-lan-ota](https://github.com/micthiesen/esp-lan-ota) `bootloaders/esp32c6-bootloader.bin` at `9b6df6712f2727ecdc7cce8045e39b347085340c` |
| Build | esp-lan-ota `bootloaders` workflow, `espressif/idf:release-v5.5` container |
| ESP-IDF | `v5.5.5-832-g2553c5ad432` (release/v5.5) |
| SHA-256 | `97f6c5bf41da12eb1e656e7f27150965e60da72e83b09e496c14f90e456e04fd` (matches that repo's `SHA256SUMS`) |

Configuration: espflash's bundled ESP-IDF v5.5 defaults plus
`CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y`. A `New` image boots as
`PendingVerify`; if it resets before confirming, the bootloader marks it `Aborted`
and starts the previous slot. `CONFIG_ESPTOOLPY_FLASHSIZE_64MB=y` is the 64 MB
flash-size setting espflash requires for C6 bootloaders with esp-hal's 64 KiB
MMU page; espflash writes the actual 8 MiB size into the header when flashing.

To update, copy the new binary from esp-lan-ota, check it against that repo's
`SHA256SUMS`, and change this table and the checksum in `scripts/flash.sh`
together. Without this bootloader an unconfirmed image is never rolled back;
the console `OTA` line then reports `rollback=unsupported` after an update.
