# Persisted device configuration

Implemented in
[`firmware/core/src/configuration.rs`](../../firmware/core/src/configuration.rs).
The module provides one allocation-free configuration model shared by USB,
local HTTP, storage, schedule and sensor adapters, with fields for the pending
notification worker. It validates a
complete candidate before any runtime component can observe it. It does not supply
production thresholds, calibration values, schedule entries, timezone or credentials.

The [first-configuration tool](first-configuration.md) uses this codec directly
for a private revision-1 record and one USB transaction. Subsequent settings saves
use the same validation and next-revision contract.

## Runtime model

`RawDeviceConfig::builder(...)` copies bounded transport values into fixed arrays.
`ValidatedDeviceConfig::from_raw(...)` then establishes the cross-field invariants and
constructs the existing validated core types. The resulting snapshot provides:

- `revision()` for retained-record matching;
- `supervisor_config()` using the configured thresholds, freshness deadline, dwell
  timings and the shared run duration;
- `calibration()`, which is `None` until the assembled unit is commissioned;
- `schedule()` and the parsed `timezone()` resolver;
- `timezone_rule()` for lossless settings display and re-encoding; and
- settings-token and optional Pushover credential accessors for the adapters that
  consume those secrets; their `Debug` implementations emit only a redaction marker.

The revision is nonzero. Stop and restart are valid thousandths with stop strictly
below restart. Every freshness, confirmation, recovery and minimum-off duration is
positive. The single run duration is 1 through 86,400 seconds and constructs both the
supervisor's millisecond cap and the schedule duration, so those limits cannot diverge.

There are at most 16 daily entries. Each entry has a unique stable ID from 1 through
4095, a nonempty seven-bit weekday mask and a local start from 0 through 86,399.
Validated entries are sorted by stable ID to give one persistent representation.
The timezone is a nonempty ASCII POSIX rule of at most 128 bytes accepted by
`PosixTimeZone::parse`. The parsed resolver deliberately omits names, so the validated
configuration also preserves the exact accepted input bytes.

An installed `CalibrationData` must pass `Calibration::new`. Both water thresholds
must lie within its commissioned `supported_level` domain. Its
`max_frame_age_ms` must equal the supervisor sample-age limit because both stages age
the same acquisition-start timestamp. `Calibration::new` separately requires the
complete-frame duration to be positive and no greater than that age limit. An absent
calibration is valid storage state, but remains uncommissioned and cannot produce a
valid sensor reading.

The local settings bearer/CSRF token is exactly 32 caller-generated random bytes. Core
can only verify that it is not the all-zero sentinel; the app is responsible for using
its CSPRNG. Pushover credentials are optional. Application tokens and user/group keys
are exactly 30 ASCII alphanumeric characters. An optional device is 1 through 25
characters from `[A-Za-z0-9_-]`, matching the
[Pushover Message API](https://pushover.net/api). Secret wrappers implement only a
redacted `Debug`; the complete raw and encoded records have no `Debug` implementation.

## Format version 2

`ValidatedDeviceConfig::encode()` returns an `EncodedConfiguration` backed by a
2,048-byte fixed array and exposing only its used slice. Version 2 currently uses at
most 525 bytes. Integers are little-endian. The exact byte sequence is:

| Bytes | Field |
| --- | --- |
| 0..4 | Magic `CSCF` |
| 4 | Format version, currently 2 |
| 5 | Flags: bit 0 calibration, bit 1 Pushover; every other bit is zero |
| 6..8 | Exact total record length including CRC, `u16` |
| 8..12 | Nonzero configuration revision, `u32` |
| 12 | Daily-entry count, 0 through 16 |
| 13 | Reserved zero |
| 14..16 | POSIX timezone byte length, `u16` |
| 16..20 | Shared schedule/override duration in seconds, `u32` |
| 20..24 | Stop then restart levels, two `u16` values |
| 24..56 | Sample age, low confirmation, recovery and minimum off, four `u64` millisecond values |
| 56..88 | Settings authentication token, 32 opaque bytes |
| 88.. | `entry_count` entries, timezone, optional sections, then CRC |

Each eight-byte entry is stable ID `u16`, weekday mask `u8`, reserved zero `u8`, and
local start second `u32`. Entries appear in strictly increasing ID order. The timezone
immediately follows the entries and has the length declared in the header.

The 88-byte calibration section, when flagged, contains every `CalibrationData`
input in this order: dry LEVEL and dry RL counts; low and high LEVEL/RL pairs; the two
channel envelope-minimum, envelope-maximum and maximum-slew triples; reference-sign
tag plus three reserved zero bytes; minimum reference span; minimum endpoint-ratio
numerator and denominator; supported-level minimum and maximum; maximum frame age;
maximum frame duration; and maximum level slew. Decode reconstructs this exact record
and calls `Calibration::new`; it never trusts encoded derived ratios.
Version 1 records are rejected, not migrated: their three-channel live-RE model
is incompatible with the two-channel board. No deployed calibration exists.

The 89-byte Pushover section, when flagged, contains the 30-byte application token,
30-byte user/group key, device length `u8`, three reserved zero bytes, and a fixed
25-byte device field. Bytes after the named device are zero. The final four bytes of
every record are an IEEE CRC-32 over all preceding bytes, using reflected polynomial
`0xedb88320`, initial value `0xffffffff` and final complement.

Decode rejects records larger than 2,048 bytes, truncation or appended bytes, wrong
magic or version, a nonmatching little-endian length, CRC failure, unknown flags,
nonzero reserved or padding bytes, noncanonical entry order, invalid UTF-8/ASCII,
malformed credentials, and every model or cross-field validation failure. CRC is an
integrity check, not permission to bypass semantic validation.

## Storage transaction

The caller owns revision allocation and persistence. For an accepted settings change,
it must increment the current revision with checked arithmetic without producing zero, encode the
complete new configuration, and commit it with a retained record carrying the same
revision. The storage acknowledgement for that matching pair must complete before the
app publishes the new runtime snapshot or reports success to USB or HTTP. If either
write fails, the old configuration remains published and output stays inhibited.
The [implemented runtime transaction](runtime-transactions.md) writes the matching
maintenance-retained record first, then configuration, and requires an explicit
durable maintenance exit after a successful save. Boot applies the retained
lifecycle rules in `retained.rs`; a missing, corrupt or mismatched retained record on a
configured unit enters recoverable maintenance.

Changing calibration is an explicit commissioning operation while output is held off.
After the matching configuration and retained state are durable, the app creates a new
calibration stage and resets water-notification confirmation/baselines. Duration
changes use the existing supervisor and retained occurrence end clamps, so increasing
the setting cannot extend a run that already started.
