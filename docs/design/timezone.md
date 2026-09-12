# POSIX timezone resolver

Status: implementation basis for the allocation-free core resolver. This is a
proleptic rule engine, not an IANA timezone database or evidence that wall clock
input is trustworthy.

## Source and grammar

The authoritative grammar is the POSIX.1-2024 `TZ` environment-variable format in
[The Open Group Base Definitions, Chapter 8](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap08.html).
That definition establishes the sign convention, where the encoded offset is added
to local time to obtain UTC; the three date forms; `M` weekday numbering with Sunday
as zero; transition times in the local time in effect before the change; and the
implementation-defined behavior when a DST name has no rules.

`PosixTimeZone` accepts at most 128 ASCII bytes and stores a fixed, `Copy` parsed
representation. It accepts:

- alphabetic names of at least three bytes, or quoted names containing ASCII letters,
  digits, `+`, and `-`;
- standard offsets and optional explicit DST offsets from 0 through 24 hours, with
  optional minute and second components;
- a fixed zone with no DST name; or
- DST with both explicit `Mmonth.week.weekday[/time]` rules. Missing `/time` means
  02:00:00. Transition times from 00:00:00 through 24:00:00 are accepted.

POSIX encodes `PST8` as local UTC-08:00 and `NPT-5:45` as local UTC+05:45. The
parser converts that sign convention immediately and validates the result with
`UtcOffset`. An omitted DST offset means one hour ahead of the standard offset.
Offsets and DST changes do not need to be whole hours.

The parser rejects `J` and zero-based Julian date rules, a DST name without both
rules, start/end rules that collapse to the same local or UTC instant, signed
transition times, and transition hours above 24. POSIX.1-2024 permits signed
transition times and hours through 167; this implementation reports
`UnsupportedTransitionTime` rather than accepting those
extensions incorrectly. A future implementation can add them without changing the
stored schedule or resolver interfaces.

Names are syntax only and are not retained in `PosixTimeZone`. Persistent
configuration preserves the original validated string when it needs a display label
or lossless re-encoding. An IANA name such as `America/Vancouver` is not accepted.
The proleptic string describes the same rules for every supported year and therefore
does not reproduce historical or future legislative changes.

## Resolution

UTC input is limited to 1970-01-01 through 9999-12-31. `civil_at` selects the active
offset from explicit yearly transitions, applies it with checked arithmetic, and
constructs `CivilTime`. It reports `LocalOutOfRange` when a valid UTC boundary would
map outside the supported local calendar, such as UTC midnight on 1970-01-01 in
`PST8`. `Fold::Second` marks only the repeated interval after an offset-decreasing
transition.

`LocalTimeResolver::resolve` forms a UTC candidate under the standard offset and,
when present, the DST offset. It retains only candidates for which the rule engine
selects that same offset. No candidates means `Missing`, one means `Unique`, and two
ordered candidates mean `Ambiguous`. This also handles southern-hemisphere seasons,
fractional offsets, and DST shifts other than one hour. Invalid local seconds,
calendar days outside 1970 through 9999, and local instants whose UTC representation
would fall outside the supported range resolve as `Missing`.

Timezone absence and UTC trust remain application-owned. The core does not install a
default timezone, read a clock, persist configuration, or decide whether a civil
snapshot is fresh enough to schedule a run.

## Verification

Host tests cover the 2026 Vancouver spring gap and autumn fold, a southern-hemisphere
season spanning New Year, Nepal's fixed 05:45 offset, a 30-minute DST shift,
malformed and unsupported rules, quoted names, 24:00 transitions, and UTC/local
calendar boundaries. Full application verification still must prove that storage and
clock adapters publish a resolver only after both the timezone string and UTC anchor
are validated and trusted.
