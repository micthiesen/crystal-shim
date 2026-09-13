# Sensor calibration and validity

Implemented in [`firmware/core/src/calibration.rs`](../../firmware/core/src/calibration.rs).
This is the pure conversion and validity stage between complete FDC1004 frames
and the supervisor. It contains no driver, persistent-storage codec, calibration
UI, physical calibration values, or assumption that the current electrode
geometry has passed commissioning.

## Measurement model

The board keeps LEVEL and the always-wet liquid reference RL. It omits the
optional live environment reference RE and its out-of-phase electrode. TI's
reference design explains the live-reference approach; this project's simplified
model instead subtracts separately commissioned dry baselines for LEVEL and RL.
It does not claim live environment compensation.
[TI design guide](https://www.ti.com/lit/ug/tidu736a/tidu736a.pdf).

```text
q       = (C_LEVEL - C_LEVEL(dry)) / (C_RL - C_RL(dry))
q_low   = q evaluated from the measured lower-water endpoint pair
q_high  = q evaluated from the measured upper-water endpoint pair
fraction_thousandths = 1000 * (q - q_low) / (q_high - q_low)
```

`0` and `1000` mean the lower and upper measured response endpoints. They are
not millimetres and do not promise linear physical height between those points.
A commissioned supported domain can exclude part of this normalized span.

Measure both dry baselines with the final glass/coating/clip stack and unchanged
acquisition settings, before wetting either sensing region. RL must remain wet
throughout the accepted operating range. Its measured wet-minus-dry response
normalizes LEVEL response for the installed liquid. No electrode area assumption,
fabricated offset or live RE reading supplies either baseline. Static baseline
drift is a limitation to evaluate during final-unit commissioning; widening
limits does not establish that the model is correct.

Inputs are signed differential counts in units of `2^-19 pF`, with CAPDAC disabled
and the approved gain/offset register configuration. All counts must be strictly
inside `±(15 * 2^19)`, matching the project's driver and the converter's
differential operating limit. This fixed silicon limit is not a commissioned
channel envelope. [TI FDC1004 data sheet, differential mode and measurement conversion](https://www.ti.com/lit/ds/symlink/fdc1004.pdf).

## Calibration record

`CalibrationData` contains all measured coefficients and chosen validity limits;
there is no `Default` or fabricated production example:

- The measured dry LEVEL and RL counts and raw lower/upper endpoint pairs.
- An inclusive absolute count envelope and maximum count slew rate for each
  of LEVEL and RL. Envelopes must be strictly inside the converter limit.
- The expected reference-difference sign and minimum nonzero magnitude.
- A positive rational minimum separation of the two endpoint responses, chosen
  from the measured signal/noise margin.
- The supported normalized `LevelDomain`, within `0..1000`.
- Positive maximum frame age, maximum complete-frame duration, and maximum
  normalized level slew rate. Frame duration cannot exceed the freshness limit.

`Calibration::new(data)` checks the record before it can produce a stage. It
rejects malformed limits, invalid endpoint channels/references, reversed or
collapsed endpoint ratios, and insufficient endpoint separation. These checks
establish arithmetic and configuration consistency, not physical acceptance.
`data()` retains the original record and `endpoint_ratios()` exposes its exact
derived coefficients for diagnostics and a future persisted record.

The final-unit calibration workflow must retain the raw measurement log, known
water positions, sensor/board identity and revision, acquisition configuration,
glass/coating/clip stack, and the evidence behind every envelope/rate limit.
Those metadata and storage responsibilities belong to the eventual calibration
workflow. Capture both dry baselines with the same dielectric stack. Capture lower/upper
and intermediate points in both directions with RL wet, then validate temperature,
receding film, deposits, reseating, clip pressure, hands, cable motion and pump
switching. No such physical evidence exists merely because this code passes.

## Runtime contract

The adapter constructs `RawFrame { channels, sequence, started_at, completed_at }`
only from a complete, successful two-channel driver frame. Incomplete
acquisitions and I²C errors remain invalid readings outside this API. One
`CalibrationStage` instance lives for the boot/session and remains in place
through sensor power or bus recovery.

```text
Calibration::new(data) -> Result<Calibration, CalibrationConfigError>
CalibrationStage::new(calibration, now)
stage.process(now, raw_frame) -> CalibrationResult
```

The result includes `Reading`, the unchanged raw frame, the exact baseline-subtracted ratio on
success, and a detailed `CalibrationError` on failure. Errors include the
offending channel/count, span, timing, domain rational, or slew measurement.
`CalibrationError::fault()` provides the coarse supervisor fault. A valid result
always retains `frame.started_at` as `Reading.observed_at`, so acquisition and
processing delays cannot refresh old data.

Each submission checks:

1. Monotonic caller time, strictly increasing frame sequence, valid ordered
   start/completion times, and no future or overlapping acquisition.
2. Complete-frame duration and age measured from the first conversion's start.
3. Converter range, all absolute envelopes, reference sign/minimum, and the exact
   normalized supported domain.
4. Per-channel and normalized-result slew against the last accepted frame.

Advancing sequence IDs are consumed even for rejected frames. Retrying a rejected
frame later therefore cannot turn it into a fresh acquisition. IDs must not wrap
or reset during sensor recovery; the adapter owns that counter. Call the stage
once per new complete frame, then preserve the returned reading between control
ticks. The supervisor performs its usual age check on those intervening ticks.
Future or backwards timestamps are errors, not values to repair.

The exact output rational is checked against the supported domain before nearest
integer rounding. A fraction slightly below zero or above the accepted maximum
is invalid even if it would round to an allowed integer. Nothing is clamped into
valid LOW or HIGH.

Slew uses elapsed time between acquisition starts. Raw limits use counts/second;
the output limit uses the rounded controller fraction in thousandths/second.
Measured limits must account for sequential-channel skew and acquisition timing
variation within the bounded frame duration. The first accepted frame has no
movement history to compare. Invalid frames do not erase the last accepted slew
anchor, so an impossible jump does not become a valid new baseline on the next
sample. A sufficiently long observation gap can permit a larger physical change;
the supervisor still requires its normal recovery behavior. This is a plausibility
check, not evidence about unseen motion.

Changing calibration requires constructing a validated replacement stage as an
explicit commissioning/configuration operation while control is held off. Do not
recreate the stage on a fault to discard its history. The app must coordinate
configuration persistence and reset water-notification confirmation/baselines
when the calibration changes. Missing or unaccepted calibration remains
`Reading::Invalid(Fault::Uncalibrated)`.

## Arithmetic and verification

No floating point, allocation or external arithmetic dependency is used. The
strict converter bounds make every numerator difference and positive denominator
smaller than `2^24`. Endpoint cross-differences are smaller than `2^49`; the
normalized numerator product is smaller than `2^83` and its denominator smaller
than `2^73`. Signed `i128` therefore holds normalization and domain comparisons,
including rounding, with ample margin. Denominator positivity and endpoint order
are established before division. Slew products use `u128`; their largest operand
product is a `u32` rate times `u64` elapsed time, below `2^96`.

Host tests cover nonzero baseline arithmetic with changing reference spans,
negative calibrated polarity, converter extrema, malformed settings, collapsed
or reversed references, all channel envelopes, exact domain rejection before
rounding, stale/replayed/future/backwards/overlapping frames, frame duration, raw
and normalized slew, retained history after invalid frames, and water-transition
confirmation after an invalid frame. Test measurements are explicitly synthetic.

Run from `firmware/`: `cargo fmt --check`,
`cargo clippy --locked --all-targets -- -D warnings`, and `cargo test --locked`.
This verifies the calculation and rejection behavior. It cannot establish that
RL is wet, stored dry baselines remain representative, geometry is suitable, or the glass/clip system needs no
routine cleaning. See the [sensor design basis](sensor-design-basis.md) for those
physical assumptions and acceptance checks.
