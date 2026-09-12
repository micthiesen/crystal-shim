# Unattended authenticated time

The offline [Roughtime crate](../../firmware/roughtime/src/lib.rs) implements
pinned draft-19 response verification and request-owning two-provider agreement.
It is a host workspace member and builds for C6 without `std` or allocation. It is
**not linked into the application or enabled as a clock authority**. Current
operating UTC remains the [control-accepted CASE/operator path](trusted-utc.md);
unattended final-unit availability remains unresolved.

## Protocol and bootstrap contract

`Request::new(Provider, nonce, started_at_ms)` produces exactly 1036 bytes: the
12-byte `ROUGHTIM` frame and a 1024-byte message. The caller captures the original
monotonic start before construction and supplies a fresh CSPRNG nonce. The request
contains `VER=0x8000000c`, the root-derived `SRV`, 32-byte `NONC`, `TYPE=0` and zero
padding. No RNG, socket, radio, flash owner, timer task or hidden clock is created.

`Request::verify` consumes that request. It validates exact datagram length,
canonical tag ordering, unique tags, tag spelling, aligned nondecreasing offsets,
mandatory fields and exact scalar sizes. Unknown well-formed tags are ignored as
required by the [draft](https://www.ietf.org/archive/id/draft-ietf-ntp-roughtime-19.txt).
Only encoded offsets must align; the final value and whole message may have an
unaligned byte length. Captured-signature regressions cover one to three trailing
unknown bytes while preserving exact known-scalar lengths.
Only the fixed CERT/DELE/SREP structure is traversed, never arbitrary recursion.
The maximum response is 1036 bytes because UDP replies must not exceed their
request. That fits the existing app's 1232-byte TX and 1583-byte RX capacity.
The bound permits at most 128 tags per message, without a separate tag allocation.

Verification requires the exact selected version and sorted unique VERS containing
it, response TYPE, nonce equality, root-signed delegation, signed response, and
Merkle inclusion of the **entire original request including frame and padding**.
Both signature contexts include their terminating zero. SHA-512 truncated to 32
bytes and ordinary strict Ed25519 come from pinned `sha2 = 0.10.9` and
`ed25519-dalek = 2.2.0`, both with default features disabled. No cryptographic
primitive is implemented here. PATH accepts at most the protocol's 32 siblings;
the datagram-size bound further limits the usable path.

RADI is nonzero **seconds**. This project's explicit usability cap is five seconds,
matching the wider observed service. MINT and MAXT remain full u64 timestamps;
`MAXT=u64::MAX` is valid and must not be rejected merely for exceeding a calendar
conversion range. MIDP must lie inclusively between them. Arithmetic for the
returned UTC interval is checked and restricted to the application's supported
1970 through 9999 calendar.

The public roots are compiled `Provider` identities, published by
[roughtime.se](https://roughtime.se/) and
[int08h](https://int08h.com/post/public-roughtime-server/). No key from DNS or a
response replaces a root. Ed25519 delegation validation does not require already
knowing UTC, so bootstrap avoids the circular step of authorizing certificate time
with unauthenticated SNTP. A signature establishes the server's claim, not that
the clock is correct. The honest-source assumption includes every historical
delegated private key still authorized by that root: compromise of an old key can
sign fresh nonces with old timestamps even after its MAXT. The observed int08h
delegation is `0..u64::MAX`. See draft section 9.4.

## Original capture and error bounds

Verification takes the original receive capture plus a caller-supplied
`elapsed_upper_ms`. This must bound real elapsed time from original start to
receipt, including timer quantization and oscillator error. It cannot be smaller
than measured elapsed time or reach 2000 ms. The crate supplies no default hardware
accuracy. For signed MIDP `M`, radius `R` and elapsed upper bound `E`, it returns
the inclusive interval `[1000*(M-R), 1000*(M+R)+E]` at the receive capture. The lower
endpoint needs no transport subtraction: server processing follows the request
start and precedes receipt. Outward inclusion preserves the draft's open interval.

After all successful crypto/format checks, an injected `completion_now` reads the
same monotonic clock. Completion at or after the original two-second deadline,
completion before receipt, backward time and arithmetic rollover reject the
result. This check handles a ready operation winning a work-first async timeout.
It never stamps the result with completion time. The two-second deadline is in
the caller's monotonic domain; the supplied elapsed upper bound separately limits
transport error. The offline agreement coordinator also checks its original total
deadline. Source/operator-generation checks around network awaits and before
control adoption remain the future app caller's responsibility.

## Offline two-provider agreement

[`AgreementRound`](../../firmware/roughtime/src/agreement.rs) owns one request for
each compiled provider. `new(started_at_ms, deadline_ms, rate)` requires an explicit
original absolute deadline and `ClockRateBound`; neither has a production default.
`begin(provider, nonce, started_at_ms)` constructs and retains the exact request.
The caller supplies distinct fresh CSPRNG nonces and still owns uniqueness across
rounds and boots. No public API imports an externally constructed
`VerifiedResponse` or replaces either pinned root.

`receive(provider, datagram, received_at_ms, now)` passes the datagram through the
real verifier with a transport upper bound derived from the supplied rate and
quantization model. It preserves the original receive capture, while reading
actual monotonic time before and after verification. Historical captures can be
processed in either order; actual operation clock reads must remain monotonic.
The individual two-second deadline and immutable round deadline include completed
verification. Invalid, duplicate or unstarted responses, repeated nonces and time
failures close the entire round. No single-provider fallback or retry retaining
one old sample is available.

After both responses verify, `finish(completion_now)` consumes the round. It
projects both intervals to the latest original receive capture using outward
elapsed bounds, requires inclusive overlap, and retains the full **hull**. The
implemented maximum hull width is **20,000 ms**, inclusive, after drift and
quantization projection. Later observation aging may widen the bounds further;
the width limit applies when agreement is formed. Completion is checked after
this work, including original-observation expiry, and cannot refresh the capture.
The returned `Agreement` exposes a candidate `UtcObservation`, each original
provider capture and each projected interval. It does not adopt a clock.

Under the assumption that at least one accepted source interval contains true UTC,
the hull also contains it; an adversarial narrow interval can make an intersection
exclude it. A 10-second threshold would reject the observed valid pair. The
assumption includes historical delegated-key security described above. This
two-source policy deliberately differs from draft sections 8.1/8.2's
at-least-three-provider, twice-chained query process. It does not implement that
process or claim a complete transferable malfeasance proof.

## Evidence and limits

On 2026-09-12, a reviewed
[Pyroughtime reference revision](https://github.com/dansarie/pyroughtime/blob/47535dc719f952dbb4faa98608c2430f9aa07144/pyroughtime.py)
validated both public replies using the pinned roots. Four UDP requests total
were made, two per service. The first pair passed reference authentication but a
local wrapper incorrectly expected a 1024-byte complete frame; correcting that
assertion allowed one final query each. No authentication was relaxed. No further
queries are part of tests or CI. Raw public requests/replies and all hashes are
checked in under [fixtures](../../firmware/roughtime/tests/fixtures/provenance.json).
There are no private device keys in these captures.

| Provider | RTT | RADI | Request frame/body | Response frame/body |
| --- | ---: | ---: | ---: | ---: |
| roughtime.se | 154.365167 ms | 1 s | 1036 / 1024 B | 416 / 404 B |
| int08h | 69.142917 ms | 5 s | 1036 / 1024 B | 420 / 408 B |

Both signed MIDP `1789235933` with selected `0x8000000c`. The int08h VERS list also
contains version zero. Both CERT values are 152 bytes, DELE 72 bytes, SREP 92/96
bytes, signatures 64 bytes and PATH empty. The largest observed reply is 420 bytes;
the parser's declared maximum remains 1036. At the second receive capture the
conservative interval hull was **10.069142917 seconds** wide before any host clock
drift allowance. Host observation is not service uptime or final-device evidence.

SHA-256 of decoded root keys:

- roughtime.se: `39a588794b4fd5cdb0cb3a7a911a60d3212b893c0b12322829c23cd7fb5ef65d`
- int08h: `b42e418f22fd940f7ab6b75129a743de8d46a765df186b55206149a91737ef36`

The retrieved draft model hash is
`6807658966791943b34094e32fcb06c5f6e9bab7fb637285c72d6d864049d533`;
reference Python source hash is
`9c4c69825ae86e8d1cd4684652715541a6601a0885a3c3874f06e660736e3014`.
The reference aggregate consistency helper used microsecond radius arithmetic,
so the probe computed seconds-based intervals independently. Our encoder matches
both captured requests byte for byte. Offline tests cover the real signatures,
an independent three-level reference-tree vector, signed nonempty paths,
replay/binding, canonical malformed inputs,
wrong roots/contexts/versions, scalar sizes, delegation/range/overflow and exact
deadline boundaries. Deterministic private test seeds are confined to Rust
`cfg(test)` and the standalone offline fixture generator; neither is linked into
the application.

An earlier scratch C6 application link retained the real strict verifier call:
code grew 25,616 bytes, rodata 1,880 bytes and static data 32 bytes, with no BSS
growth. Aggregate llvm-size text grew 91,120 bytes because 63,656 bytes were
additional alignment padding. That was a crypto-only feasibility probe, not a
measurement of this parser or a running service. No app manifest or ELF is changed
by this offline crate. The full crate builds for C6 as a release library; final
integration still needs actual linked size, peak stack and execution-latency checks.

The project crate has **31 tests** covering the verifier and agreement coordinator,
including both captured public signatures, request ownership, failed-round closure,
overlap/hull boundaries, original captures, exact deadlines, rollback and checked
projection. Independent read-only review found no actionable API or Cargo defect.
A scratch copy passed all 31 project tests plus three adversarial tests, including
24 independently modelled clock/response-order combinations. An additional external
integration test exercised the production public API and pinned roots without
test-root overrides. The dependency audit found all 204 existing lockfile package
versions, sources and checksums unchanged; the only new dependency edge is to the
local core crate. Review, test sources, logs and exact hashes are retained in
`/tmp/crystal-shim-time-agreement-review`. These checks used no live time requests
and do not establish hardware timing or app authority adoption.

## Pending clock and TLS integration

The actual Embassy driver follows `esp-rtos::now` to HAL SystemTimer Unit0.
The [pinned HAL source](https://github.com/esp-rs/esp-hal/blob/10e48dd74837bae4be663a7d1825d12875363727/esp-hal/src/timer/systimer.rs)
derives SystemTimer from the crystal; it does not currently select RC_FAST.
The [module datasheet](https://www.espressif.com/sites/default/files/documentation/esp32-c6-wroom-1_wroom-1u_datasheet_en.pdf)
shows a 40 MHz crystal, and Espressif's
[design guideline](https://docs.espressif.com/projects/esp-hardware-design-guidelines/en/latest/esp32c6/schematic-checklist.html#external-crystal-clock-source-compulsory)
recommends ±10 ppm crystal accuracy. That is not a published module-wide worst-case
bound covering temperature, aging and every power state. No oscillator calibration
has been measured. A proposed 100 ppm engineering allowance would be a tenfold
margin over the design recommendation, **an explicit operating assumption**, not
a manufacturer guarantee or an implemented default.

The 2026-09-12 pinned-source audit confirms that TIMG0 supplies RTOS wakeups;
timestamps instead use the nominal 16 MHz crystal-derived SystemTimer and a
1 MHz Embassy tick conversion. The [C6 TRM](https://www.espressif.com/sites/default/files/documentation/esp32-c6_technical_reference_manual_en.pdf)
v1.2, sections 13.3/13.5.4 and register 8.21, distinguishes the XTAL/RC_FAST
selector, Unit0 running/stall state and separate sleep compensation. An application
policy must check its supported fixed mode and revoke before a source/sleep change.
Integer conversion alone has less than 1 ms error between same-grid captures;
HAL's competing latch/read path can return an older counter value. Review a short
capture-only critical section or otherwise bound that race before adopting a
quantization allowance. Interrupt delay is not quantization. No cryptography,
networking or storage belongs in that capture section.

The planned verification context is the thread-mode network UserTask with interrupts
enabled, outside the Priority3 control and Priority2 sensor executors. Synchronous
Ed25519 work blocks sibling thread futures during that poll; async timeout cannot
interrupt it. Preserve pre/post time and generation checks and yield between
provider work. Final-device preemption/cadence, stack and crypto-latency evidence
remain required. Exact pinned symbols and primary-source receipts are retained in
`/tmp/crystal-shim-unattended-clock-policy`; this audit selects no ppm default and
does not enable an unattended authority.

For a justified relative error bound `p` ppm, a measured age `a` can be projected
using `floor(a*1e6/(1e6+p))` for the lower elapsed bound and
`ceil(a*1e6/(1e6-p))` for the upper, plus outward timer quantization. At 100 ppm,
one hour would add at most 361 ms to either side with integer outward rounding,
before quantization. Changes of clock source, discontinuity, unsupported sleep
or expiry must invalidate the anchor. Re-reading the retained anchor never grants
fresh age. Selecting this model is separate from the offline verifier.

TLS must check every certificate's notBefore against the interval's **earliest**
instant and notAfter against its **latest** instant, with outward second rounding.
The published mbedtls-rs 0.2.0 wall-clock hook returns one calendar instant; its
unpatched ClientSessionConfig/async Session API exposes neither a verification
callback nor the peer chain. Choosing a midpoint or either endpoint cannot enforce
both boundaries. The project now carries a narrow
[borrowed restriction callback and operation lease](tls-restriction.md). Global
clock alternation or relying on undocumented certificate-check order is not an
acceptable substitute. A callback may only add rejection flags, must cover all
relevant certificates in the verified chain and cannot clear baseline errors.
Root trust, hostname, required authentication and TLS version remain mandatory.

A separate offline probe exercised the pinned C library's documented
`mbedtls_ssl_conf_verify`/X.509 callback seam with the captured public chain.
The callback visits the selected root, intermediate and leaf; additional date
failures preserve the original hostname flags. Two Linux tests demonstrate
both interval edges that an otherwise valid scalar clock misses. A small safe
Rust wrapper extension can expose copied validity fields and permit rejection
without allowing baseline flags to be cleared. That wrapper extension is now
implemented and exercised with local TLS 1.2/1.3 handshakes. Both app and host
harness resolve the same source-pinned vendor copy. The app now requires a
borrowed operation lease, retaining the accepted authority and complete 20-second
certificate horizon. This does not promote an unaccepted signed-time sample. The original C probe remains in
`/tmp/crystal-shim-tls-interval-seam-probe`; current provenance and checks are
[documented separately](tls-restriction.md).

The [runtime interval path](utc-intervals.md) now requires the whole interval to
select one occurrence, keeps its latest millisecond endpoint when shortening the
run cap, and preserves manual override independence. No hardware error bound is
selected by this implementation. Future authority adoption must use one
control-accepted original interval for
schedule/TLS, preserve USB generation precedence, expire the old anchor first,
and ensure source loss/revocation cannot clear a newer operator authority or wait
behind storage Busy. The existing shared UDP/RNG owners should be reused without
periodic flash writes. App query scheduling/backoff, integration of the offline
agreement and its original deadlines, generation coupling, interval-aware
CASE/operator input and final-device service availability remain implementation
work. The public probe does not establish that an Apple Home hub supplies a usable
CASE time server.
Synchronous signature verification also needs measured C6 latency and a reviewed
runtime execution context. An after-verification deadline check cannot itself
guarantee that cryptography leaves the 20 ms local control path available.

## Reproducible checks

From the repository root, with no public network requests:

```sh
cargo fmt --manifest-path firmware/roughtime/Cargo.toml --check
cargo clippy --manifest-path firmware/Cargo.toml -p crystal-shim-roughtime --all-targets --locked --offline -- -D warnings
cargo test --manifest-path firmware/Cargo.toml -p crystal-shim-roughtime --locked --offline
sh scripts/with-esp-toolchain.sh cargo build --manifest-path firmware/Cargo.toml -p crystal-shim-roughtime --target riscv32imac-unknown-none-elf --release --locked --offline
```
