#!/bin/sh
# USB-flash the controller with the OTA layout. This writes a connected device:
# run it only with explicit authorization, never as a side effect of setup.
# Extra arguments (for example --port /dev/cu.usbmodem1101) pass to espflash.
#
# Every USB flash writes the rollback-enabled bootloader and partition table,
# puts the app in ota_0 and erases only otadata, so the bootloader starts ota_0
# and the firmware opens its one-time `esp-ota enroll` window. NVS (Matter
# fabrics, Crystal configuration and retained safety state) is never erased.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
app="$root/firmware/app"
bootloader="$root/firmware/bootloader/esp32c6-bootloader.bin"
if [ ! -f "$bootloader" ]; then
  echo "flash.sh: missing $bootloader" >&2
  echo "Vendor the rollback-enabled ESP-IDF bootloader first; see firmware/bootloader/README.md." >&2
  exit 2
fi
expected=97f6c5bf41da12eb1e656e7f27150965e60da72e83b09e496c14f90e456e04fd
actual=$(shasum -a 256 "$bootloader" | cut -d' ' -f1)
if [ "$actual" != "$expected" ]; then
  echo "flash.sh: $bootloader SHA-256 $actual does not match the recorded $expected" >&2
  exit 2
fi
(cd "$app" && sh "$root/scripts/with-esp-toolchain.sh" cargo build --locked --release)
exec espflash flash \
  --chip esp32c6 \
  --flash-size 8mb \
  --bootloader "$bootloader" \
  --partition-table "$app/partitions.csv" \
  --target-app-partition ota_0 \
  --erase-parts otadata \
  "$@" \
  "$app/target/riscv32imac-unknown-none-elf/release/crystal-shim"
