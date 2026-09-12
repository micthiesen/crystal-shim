# UTC interval control

The runtime accepts an original UTC interval and evaluates scheduled eligibility
conservatively. The interval must lie wholly within the same selected occurrence.
The latest possible UTC controls expiry; a narrower or backward correction cannot
restore a suppressed occurrence or extend an active relay deadline. Manual leases
remain bounded by monotonic time and independent of clock availability.

`core::utc_bounds::UtcBounds` keeps inclusive millisecond endpoints within 1970
through 9999. `UtcObservation::bounded` carries those endpoints, their original
monotonic capture and an explicit `ClockRateBound`. The mailbox and control keep
the complete observation. Dispatch and reads never refresh its capture. Observed
timer rollback, saturation, calendar overflow and expiry latch invalidity until a
new observation arrives. Existing CASE and USB constructors retain their previous
point-clock contract; they do not gain a claim of measured subsecond accuracy.

## Timer error model

The caller supplies relative rate error `p < 1,000,000` ppm and a bound `q` on the
quantization error of a difference of two timer readings, in measured milliseconds.
There is no default C6 oscillator bound. `ClockRateBound::EXACT` represents the
existing point-clock contract and deterministic tests, not measured hardware
accuracy. Selecting a hardware allowance still requires the justification and
operating constraints in [unattended time](unattended-time.md).

For measured age `a`, the implementation bounds actual elapsed milliseconds by:

```text
lower = floor(max(0, a-q) * 1,000,000 / (1,000,000+p))
upper = ceil((a+q) * 1,000,000 / (1,000,000-p))
```

Projection adds those bounds to the original interval. Trust expires when the
upper elapsed bound reaches one hour. Calculations use checked conversions and
u128 intermediate products. To cap a run with `R` remaining real milliseconds,
the maximum permitted measured delta is:

```text
delta = max(0, floor(R * (1,000,000-p) / 1,000,000) - q)
```

Zero permits no run. The supervisor retains its existing rule that later schedule
updates can shorten but cannot extend a lease. Actual GPIO stop latency remains
subject to the control-loop and commissioning timing gates.

## Schedule and TLS boundaries

`Scheduler::evaluate_interval` checks both civil endpoints using the configured
timezone and the existing UTC occurrence resolver. Both must select the identical
occurrence, including start/end identity. Occurrences are continuous UTC intervals,
selected in fixed start order; one selected at both endpoints remains selected
through the interior. This permits midnight and DST folds inside a run, while
rejecting intervals that straddle entry, expiry or selection between overlapping
occurrences. The latest endpoint retains its milliseconds when computing the cap.

Runtime observes the previous interval's possible expiry before processing a new
observation, even when an old eligibility write finishes on that iteration. The
existing durable suppression, source/operator generation ordering and sole flash
owner remain in force. An interval constructor authenticates nothing by itself;
authority validation belongs to the producer.

The current scalar TLS provider deliberately refuses uncertain observations,
including a point capture with a nonzero future rate allowance. It cannot choose
an endpoint and call that interval validation. The Linux test exercises the actual
provider and MbedTLS rejection. The [borrowed certificate callback](tls-restriction.md)
is implemented separately; complete
chain checks, source-generation cancellation and bounded handshake/request horizon
are still required before TLS can use intervals. Outward certificate seconds are
available as `floor(earliest/1000)` and `ceil(latest/1000)`, not as a scalar clock.

The public Roughtime verifier remains offline. Provider agreement, UDP scheduling,
source adoption, drift-policy selection and runtime use of the TLS wrapper
remain separate integration work. No new time authority, background request or flash write is
enabled by this change.

## Verification

Focused host cases check outward integer bounds, inverse deadline tightness,
overflow, original capture/expiry, rollback, scalar refusal, interval entry/exit,
overlap, midnight and a Vancouver DST fold. Actual Runtime tests cover durable
eligibility, latest-bound shutdown, a late write acknowledgement followed by a
backward correction, and an unaffected manual valid-low lease. These are software
checks; they do not measure oscillator error, radio availability or C6 latency.
