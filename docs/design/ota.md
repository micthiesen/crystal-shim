# Over-the-air updates

Firmware updates arrive as Matter commands to the manufacturer cluster of
[esp-lan-ota](https://github.com/micthiesen/esp-lan-ota), pinned at
`9b6df6712f2727ecdc7cce8045e39b347085340c` with feature `rs-matter-0-2`. They use the
existing CASE sessions and UDP socket; no socket, listener or receive buffer is
added. Every command needs Administer privilege on one of the device's fabrics.
Decision [D-24](../decisions.md) records the choice. Nothing here has run on hardware.

## Layout and USB flashing

[`firmware/app/partitions.csv`](../../firmware/app/partitions.csv) keeps espflash's
default `nvs` (0x9000, 0x6000) and `phy_init` (0xf000, 0x1000) exactly, then adds
`otadata` (0x10000, 0x2000) and equal `ota_0`/`ota_1` slots of 0x3F0000 bytes at
0x20000 and 0x410000, filling the WROOM-1-N8's 8 MiB. There is no factory app.
The 2026-10-12 release image is 2,174,736 bytes, 52.67% of a slot, leaving
1,954,032 bytes (47.3%) for growth, above the 20% resource gate. Static RAM grew
1,720 bytes (`.data` +112, `.bss` +1,608), shrinking the linker stack region from
85,208 to 83,488 bytes; no heap is used. Runtime stack use is unmeasured.

`scripts/flash.sh` is the only USB flash path. It needs explicit authorization
because it writes a connected device. It builds the release ELF and runs `espflash
flash --chip esp32c6 --flash-size 8mb` with the rollback bootloader from
[`firmware/bootloader/`](../../firmware/bootloader/README.md), this partition table,
`--target-app-partition ota_0` and `--erase-parts otadata`. It never erases NVS.
It refuses to run unless the vendored bootloader matches its recorded SHA-256.

## Enrollment and updates

A boot that follows a USB flash finds an `otadata` record it did not write and
opens a 15-minute basic commissioning window once persisted fabrics are loaded.
The library's `announce_enrollment` hands the line
`esp-lan-ota enroll passcode=... discriminator=...` to the USB service, the sole
console writer, every five seconds, then ends the enrollment period. The first
upload also ends it; a reset before either reopens the window. Physical USB access
is the consent; the line exposes the provisioned setup passcode to that console
only. Later boots, including updates, open nothing.

```sh
sh scripts/flash.sh --port <port>        # one USB flash, authorized
esp-ota enroll crystal-shim               # reads the console line, commissions esp-ota's fabric
esp-ota push crystal-shim firmware/app/target/riscv32imac-unknown-none-elf/release/crystal-shim
esp-ota status crystal-shim
```

Uploads start only while `update::accepts_upload` holds: no run or override is
active (demand off), the relay is commanded off, and no retained or configuration
write is in flight. Otherwise `Begin` answers Busy and `esp-ota` retries for two
minutes; push again after the window or run ends. An upload already in progress
continues.

The image must carry project `crystal-shim-app` and an ESP32-C6 chip ID; the
device refuses other images. Bump `firmware/app` `version` per release; the
console `OTA` line and `esp-ota status` report it.

## Flash ownership

`app/src/ota_flash.rs::OtaFlash` is the updater's only flash client. It is a second
`FlashStorage` handle, so it follows the [flash contract](flash-storage.md) itself:
each 256-byte read block, page-contained program and single-sector erase holds a
relay-off permit acknowledged by a completed control iteration. Programs and erases
are restricted to `otadata` and the spare slot, validated at boot by
`partition::ota_regions`; NVS, the partition table and the running slot are refused
before any flash access. A one-block read cache serves the library's 64-byte
verification reads; any program or erase through this client drops it.

A ticket now wakes the Priority3 control task instead of waiting for its next 20 ms
tick. Each chunk still waits for its own complete iteration after the GPIO-low
write and watchdog feed; only the iteration count rises during flash activity.
At one 20 ms tick per 256-byte block, the `Finish` re-read of the current image
would take an estimated three minutes inside one Matter invoke.

## Output across updates, resets and rollback

The update cannot leave the pump or skimmer energized by design:

- During an upload every flash chunk forces `HardwarePermit::ForcedOff`, which the
  interlock treats as a `HardwareOff` fault: the relay is commanded off, any timed
  override is cancelled, and restart needs ten seconds of uninterrupted fresh
  recovery after the gate clears. Chunks arrive far more often than that, so the
  relay stays off for the whole upload without chatter. A host pause longer than the
  recovery interval may allow one automatic restart before the next chunk.
- Uploads begin only while the output is idle (above), so an update never
  interrupts an active run or override.
- A staged update resets 1.5 s after `Finish`, normally inside that off interval.
  Every update or rollback reset first holds a flash-gate permit, so control has
  written the relay GPIO low and acknowledged that exact ticket before
  `software_reset`; nothing can raise it in between. A reset also removes relay drive through the coil gate pull-down, and boot starts off
  (AGENTS design rules; [controls](../controls.md#diagnostics-and-resilience)).
  The [boot storage policy](firmware-integration.md) converts an eligible active run
  to suppressed before control can use schedules, so a reset cannot renew a run.
- A rollback reset is the same gated reset. A new image may drive the relay during
  its trial, as any USB-flashed image does; the trial is bounded and its reset
  turns the output off first.
- Both resets first wait up to 10 s for an in-flight retained or configuration write
  (`update::reset_ready`). A reset between the two records of a configuration
  save would otherwise land in revision-mismatch maintenance recovery. That outcome
  is safe but needs an explicit exit; expiry of the wait resets anyway.

Physical relay behavior through reset remains CTL-02 and CTL-13 work.

## Self-confirmation

An updated image boots `PendingVerify` and refuses further uploads until it confirms.
`update::confirmation` confirms only when all of these hold at once:

- the gated store opened and boot records loaded without error;
- the output owner completed an iteration within the last second;
- Matter has an operational interface with IPv4;
- the calibrated reading has been valid and current (acquired within 1 s) for an
  unbroken 10 s, with no acquisition failure in between (`update::SensorStability`).

Otherwise the image resets after 300 s and the bootloader starts the previous slot.
An update therefore lands only while Wi-Fi, storage and the calibrated sensor
currently work; an uncalibrated or disconnected unit rolls back and needs USB. Without a
rollback bootloader (`rollback=unsupported`) a reset would restart the same image,
so the trial keeps waiting for health instead of looping. A watchdog reset before
confirmation also rolls back.

Rollback restores the old image, not old NVS. A release that changes a stored
format must keep the previous release able to read it, or the rolled-back image
reports `STORAGE_RECOVERY_REQUIRED` with the relay off.

## Evidence and remaining work

Host tests drive esp-lan-ota's `Ota` through the production `OtaFlash` with the
shipped partition table: enrollment ending at the first upload, an unaligned
70 KiB upload and verification, a fresh acknowledgement before every raw access, no mutation outside
`otadata` and the spare slot, refusals before access, and the read cache.
`partition-tests` checks the shipped layout and malformed tables. Core tests cover
the confirmation, sensor-stability, upload-admission, rollback-support and
reset-grace decisions.

Hardware verification is pending ([CTL-13](../../testing/test-matrix.csv)): the
first USB flash prints the enrollment line, `esp-ota enroll` succeeds and Home
fabrics still work, `esp-ota push` reboots into the other slot and confirms with
`rollback=supported`, a build that skips confirmation rolls back, and the relay
GPIO stays low through upload, reboot and rollback.
