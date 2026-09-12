# Pushover delivery policy

This `no_std` crate queues confirmed water transitions and sends one normal-priority
Pushover request over a caller-provided verified stream. It owns no GPIO, clock,
flash, socket, TLS configuration, or watchdog. Networking cannot await or block the
control hook.

`Queue::observe` consumes each fresh control step once, after the relay output write.
It copies the transition, original monotonic time, optional UTC bounds, controller
state, actual relay command and committed configuration revision. A silent initial
water baseline remains silent. Eight RAM slots include the active attempt. Events
are FIFO without coalescing; overflow preserves the active slot and evicts the
oldest pending event. Each event expires 15 minutes after capture, including while
queued or in flight. Reboot discards the queue and runtime diagnostics.

`claim` reserves one active slot and returns copied `Work`. Its opaque token binds
the event, attempt, revision and credential generation. An attempt lasts at most
20 seconds, shortened by event expiry. Transient failures retry after 5 seconds
and then 30 seconds, with at most three attempts. Pending retries retain their
place ahead of newer events. Every generation counter is checked; exhaustion
stops delivery. Diagnostic counters saturate. `finish` ignores stale tokens and
never acknowledges a different event.

Accepted configuration replacement immediately cancels old work through
`pause_for_configuration`. A failed save remains paused until a new revision
commits. The app calls this after observing each post-control configuration while
`Runtime::configuration_pending` is true. Credential identity is tracked
separately so schedule edits cannot restart a rejected credential generation. Any
HTTP 4xx response, including 429, or a complete JSON integer status other than 1
suspends that generation and drops its pending work. Diagnostics retain the reason.
To recover explicitly, save with credentials disabled, then save the restored
credentials. This also works with the same keys after a quota reset. Changing the
credential tuple creates a new generation. Suspension is RAM state.

Only HTTP 200 with a complete JSON integer `status: 1` yields `ApiAccepted`. This
proves API acceptance, not delivery to a phone. Partial writes, timeouts and failed
responses may leave acceptance unknown. These are counted explicitly, as are
invalidated active attempts conservatively. Transient retries can therefore send
duplicate notifications. Protocol failures are terminal for that event; redirects
are never followed. An explicit cancellation is terminal unless the app chooses
to classify a recoverable network interruption as transient.

The app must complete and validate its TLS handshake before calling `exchange`.
Only then is the credential-bearing form built. `Guard::valid` must include the
current operation lease and queue token. `Guard::wait` must wake within 20 ms even
while I/O remains pending. `guard::within` checks validity and monotonic time before
and after every operation poll and uses the original absolute deadline. The same
host-tested guard is available to DNS, TCP and TLS setup. The caller must drop the
stream when an exchange returns or is cancelled. HTTP I/O additionally has a
2-second per-operation ceiling that cannot extend the attempt deadline.

Request and response arrays are fixed and wiped on completion or cancellation.
The headers are limited to 2 KiB and 24 fields, decoded JSON to 2 KiB and depth 8,
and total response bytes to 8 KiB. Serde validates every value, including unknown
strings, before typed status parsing; duplicate status, floats, trailing documents
and invalid escapes fail. Parser string scratch is bounded by the input limit;
there is no retained JSON tree. Credentials use the existing copied configuration
type, so wiping transport buffers is not a claim that every secret copy is erased.

The pinned edge-http header parser is reused. Strict framing runs before its
length-resolution helpers, which can panic on malformed peer lengths. Duplicate
length/transfer fields, conflicting framing and compression are rejected. The
bounded chunk decoder requires an explicit zero chunk and empty trailer; chunk
extensions and trailers are unsupported. This avoids edge-http 0.8.0's acceptance
of EOF before a required zero chunk. The HTTP sender performs exactly one POST
with priority 0 and the project's required User-Agent.

Focused checks:

```sh
cargo test --locked --manifest-path firmware/Cargo.toml -p crystal-shim-pushover
cargo clippy --locked --manifest-path firmware/Cargo.toml -p crystal-shim-pushover --all-targets -- -D warnings
```

Tests use fake credentials and in-memory streams. They cover queue ordering,
overflow, expiry, suspension, revision cancellation, checked counters, stale
completions, uncertainty, retry boundaries, exact forms, fragmented responses,
strict JSON and framing, partial writes, dropped futures and absolute deadlines.
They do not establish live API acceptance, phone delivery, real Wi-Fi recovery,
control timing under RF load or hardware commissioning results.
