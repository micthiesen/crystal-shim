# Pushover transition delivery

The ESP application captures confirmed HIGH-to-LOW and LOW-to-HIGH water events
and runs one verified-HTTPS sender through the existing Matter network stack.
The first confirmed state is silent. Water events remain independent of relay
state, scheduling and manual override. There are no built-in credentials and no
live API call was made during implementation.

## Ownership and limits

`app/src/control.rs` passes the fresh `Step.status` to `app/src/pushover.rs` once,
after writing the relay GPIO. The short critical section copies the event and
committed configuration into `crystal_shim_pushover::policy::Queue`. It performs
no allocation, I/O, flash access, logging, await or watchdog service. Polling the
replaceable status snapshot cannot lose or replay an edge because that snapshot
is not the event source.

The [pure crate](../../firmware/pushover/README.md) implements these bounds:

| Item | Policy |
| --- | --- |
| Queue | Eight RAM slots including one active attempt; FIFO, no coalescing |
| Overflow | Preserve active work, evict oldest pending event, increment diagnostic |
| Event lifetime | 15 minutes from original capture, including retries and offline time |
| Attempt | Original absolute 20-second deadline, shortened by event expiry |
| Retry | At most three attempts; 5 seconds then 30 seconds between transient failures |
| Configuration | Accepted replacement immediately cancels old work; pause lasts until a committed revision change |
| Credentials | Separate checked generation; ordinary schedule edits do not clear rejection suspension |
| HTTP rejection | Any 4xx including 429, or complete integer API status other than 1, suspends the credential generation |
| Success | HTTP 200 with a complete JSON integer `status: 1`; API acceptance, not phone delivery |
| Reset | Queue, diagnostic counters and suspension are RAM-only; establish a silent water baseline |

Opaque tokens include event, attempt, configuration revision and credential
generation. Stale completion cannot retire or acknowledge different work.
Admission of a settings replacement pauses delivery before any flash work while
the old configuration remains authoritative for recovery. A failed save leaves
delivery paused until a later save commits a new revision. This pause preserves
rejected-credential suspension; an unrelated save cannot clear an API rejection. Checked
identifier exhaustion stops delivery; diagnostic counters saturate. Every event
includes its original monotonic capture, optional UTC bounds, event ID, actual
relay command and control state at capture. The message has normal priority 0.

This replaces the earlier proposed four-entry persistent FIFO and indefinite
five-minute retries. Notification flash writes would require the same relay-off
storage gate as settings and Matter KV. The RAM queue preserves local operation
and bounds delayed alerts. There is no durable delivery or exactly-once claim.

## Verified operation and cancellation

`Application::run` joins the sender with existing settings and clock tasks. There
is one radio, one TLS engine and one sequential notification socket. The sender
waits for operational IPv4, configured credentials and accepted UTC bounds.

A borrowed [TLS operation lease](tls-restriction.md) fixes the complete certificate
horizon before claiming an event. DNS and TCP each have five-second ceilings and
the explicit handshake has ten seconds, all shortened by the original deadline.
`TlsConnector` construction alone is not a handshake. The app awaits
`socket.session_mut().connect()` before `http::exchange` constructs credential
bytes. Required root, hostname, algorithm, date and full-horizon checks apply.

The same host-tested guard checks monotonic time, lease validity, queue token and
network address before and after every future poll. Its periodic monitor wakes
within 20 ms when I/O stays pending. An observed interface change cancels the
operation. Returning, timeout or cancellation drops the complete session/socket;
there is no split, save, resumption, reconnect or reuse. An active-token drop guard
retires interrupted work through the bounded retry policy. The static queue
survives a network-task restart within each event's original lifetime.

Source withdrawal invalidates a network lease inside the clock mailbox update,
before control next consumes the withdrawal. Operator authority survives unrelated
network-clock loss. A newer accepted authority cancels an older operation even
when its UTC observation bytes are identical. Expiry and observed rollback latch
failure. The sender cannot substitute build time, SDK RTC, SNTP or an interval
midpoint when trust is unavailable.

## HTTP handling and diagnostics

Only the fixed `https://api.pushover.net/1/messages.json` endpoint is used. There
are no redirects, compressed bodies or HTTP connection reuse. Headers are limited
to 2 KiB and 24 fields; decoded JSON to 2 KiB/depth 8; response bytes to 8 KiB.
Each HTTP I/O has a two-second ceiling within the original attempt.

The pinned edge-http parser is reused after avoiding its unsafe length-resolution
helpers. Strict framing rejects malformed/duplicate lengths, conflicting transfer
framing and compression. The bounded chunk decoder requires an explicit zero
chunk and empty trailer; extensions and trailers are unsupported. This avoids the
pinned decoder's acceptance of EOF without the required terminator. Serde checks
all JSON values and requires one integer status, rejecting duplicate status,
trailing documents, invalid strings and excessive nesting. Request/response arrays
are wiped on completion or future drop. Existing copied configuration credentials
are not claimed to be erased by wiping transport buffers.

USB emits a bounded `PUSHOVER` diagnostics line with queue state, credential
generation, suspension reason and counters. It contains no keys or request bodies.
Counters distinguish API acceptance, rejection, expiry, overflow, cancellation,
retry, protocol failure and uncertain acceptance. A partial write or timeout may
have reached the API; retry can therefore duplicate a message. A known rejection
for the still-active token remains restrictive across the completion deadline.

To enable delivery, provision the Pushover application token and recipient
user/group key through the private settings workflow. A device name is optional.
To clear a rejected credential generation explicitly, save with credentials
disabled, then save the corrected/restored credentials. This permits the same keys
after a quota reset; unrelated settings edits cannot resume a suspended sender.
The normal durable-save maintenance and explicit-exit behavior still applies.

## Verification boundary

The pure queue/HTTP tests use in-memory streams and fake credentials. Linux TLS
tests compile the actual provider, clock and operation lease and use local
OpenSSL servers with marked synthetic keys. The separate callback matrix retains
its baseline root/name/signature/algorithm/date failures. Embedded compilation
checks the actual shared-network sender and its borrowed session lifetimes.

These checks do not prove real API acceptance, phone delivery, Apple Home pairing,
Wi-Fi recovery, oscillator accuracy, control latency under RF load or runtime
heap/stack peaks. CASE/USB are still the available clock authorities; signed-source
agreement, drift selection and unattended acquisition remain separate work. All
final-unit commissioning rows remain Not run.

The combined C6 image at this checkpoint has ELF SHA-256
`4d2cd234d4a1e7d0a0779f3a48e4db4c82bc2ddb2781a8c08bf3e9705c292ea5`.
`llvm-size` reports text 2,235,706 / data 27,196 / BSS 262,824 bytes. RAM execution
remains 80,392 bytes; static SRAM excluding stack is 370,412 bytes, leaving an
81,696-byte linker stack region. Compared with the first-configuration checkpoint,
static SRAM grows by 11,032 bytes. This includes the actual DNS/TCP/TLS/HTTP caller,
so handshake code is no longer absent merely because only readiness was linked.
The application binary is 2,171,584 bytes from offline `espflash save-image` with
8 MiB selected. The exporter's default partition capacity is not an adopted
partition layout. This exported file was not flashed. Evidence is in
`/tmp/crystal-shim-notifications-image`. Static totals do not establish peak heap
or the required 48 KiB margin after measured runtime stack use.

The final `sh scripts/check.sh` passes, including 20 pure queue/HTTP tests and
29 Linux provider/lease/actual-worker tests. Four of those compile and run the
actual sender through in-memory DNS/TCP/socket fakes: whole-worker/network loss
at each pending stage, immediate clock revocation and accepted-configuration
pause. Socket cleanup precedes queue/lease release. Independent review found
these assertions substantive. They open no ports and do not reach HTTP; pure
HTTP cancellation/wiping and local full-chain handshakes are separate evidence.
The complete gate also checks C6 Clippy/release and the existing host/UI/PCB suites.
See `/tmp/crystal-shim-notifications-final-full-check.log` and
`/tmp/crystal-shim-pushover-app-test-feasibility/evidence.json`.
