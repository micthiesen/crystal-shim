# Device drivers

`crystal-shim-drivers` is a separate `no_std` crate using `embedded-hal-async` 1.0.
Its tests run on the host; the ESP adapter must supply bounded hardware I2C and
monotonic time. It does not run the relay, classify water or store calibration.

The FDC1004 driver uses CIN1-CIN4 for level, CIN2-CIN4 for the wet reference and
CIN3-CIN4 for the dry reference, with CIN4 physically open. It takes one 100 S/s
conversion at a time and reads MSB before LSB. This preserves the out-of-phase
shield topology while avoiding result overwrite during a split register read.
See [TI register definitions, sections 6.5.3 and 6.6](https://www.ti.com/lit/ds/symlink/fdc1004.pdf)
and [TI shield/channel sequencing, section 4.3](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf).

Initialization checks identity, resets gain/offset state, configures the three
measurements and verifies configuration. Acquisition checks configuration before
and after a full frame. Bus errors, reset/configuration changes, invalid result
bits, converter-range limits and deadlines invalidate the driver. Reinitialize
after any such error or cancellation; use `into_inner` to recover/reconstruct the
ESP I2C peripheral first if a transaction was interrupted. Construct a new driver
and initialize it before acquisition resumes. Partial frames are never returned.

The acquisition task must use the frame's **start** timestamp for sensor freshness.
Three sequential readings have a small time skew. They still require calibrated
reference/level plausibility checks and must never be declared valid solely
because the device acknowledged I2C. The driver imposes a 40 ms conversion/reset
budget, at most 40 polls, and a 100 ms full-frame budget. These are conservative
software deadlines for the selected 100 S/s rate, not measured board timings.
Each I2C transaction needs a separate 5 ms HAL timeout; the generic async trait
does not provide this. An independently scheduled control task must continue
checking sensor age during acquisition and I2C recovery.

Host mocks verify transaction order, signed conversion, partial read failure,
brownout detection, frozen/backward time and stuck conversion behavior. Actual
100 kHz bus waveforms, open/short cable behavior and conversion timing remain
final-board commissioning checks.
