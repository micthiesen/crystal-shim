# Unattended authenticated time

The offline [Roughtime crate](../../firmware/roughtime/src/lib.rs) implements one
pinned draft-19 exchange. It is a host workspace member and builds for C6 without
`std` or allocation. It is **not linked into the application or enabled as a clock
authority**. Current operating UTC remains the [control-accepted CASE/operator
path](trusted-utc.md); unattended final-unit availability remains unresolved.

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
transport error. A future coordinator still needs its own original total deadline
and source/operator-generation checks around every await and before adoption.

The next interval coordinator should project both providers to one original
capture with outward-rounded elapsed bounds, require overlap, and preserve the
**hull**, not the intersection. Under the assumption that at least one accepted
source interval contains true UTC, the hull also contains it; an adversarial narrow
interval can make an intersection exclude it. Propose an explicit **20-second
maximum hull width** for separate review. A 10-second threshold would reject the
observed valid pair. No single-provider fallback or silent radius reduction is
proposed. This two-source agreement policy deliberately differs from draft
sections 8.1/8.2's at-least-three-provider, twice-chained query process. It does not
implement that process or claim a complete transferable malfeasance proof.

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

For a justified relative error bound `p` ppm, a measured age `a` can be projected
using `floor(a*1e6/(1e6+p))` for the lower elapsed bound and
`ceil(a*1e6/(1e6-p))` for the upper, plus outward timer quantization. At 100 ppm,
one hour would add at most 361 ms to either side with integer outward rounding,
before quantization. Changes of clock source, discontinuity, unsupported sleep
or expiry must invalidate the anchor. Re-reading the retained anchor never grants
fresh age. Selecting this model is separate from the offline verifier.

TLS must check every certificate's notBefore against the interval's **earliest**
instant and notAfter against its **latest** instant, with outward second rounding.
The pinned mbedtls-rs 0.2.0 wall-clock hook returns one calendar instant; its public
ClientSessionConfig/async Session API exposes neither a verification callback nor
the peer chain. Choosing a midpoint or either one endpoint cannot enforce both
boundaries. A narrow reviewed provider/upstream seam is still required. Global
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
without allowing baseline flags to be cleared. This extension is not implemented.
The probe, source identities and required handshake/resumption checks are in
`/tmp/crystal-shim-tls-interval-seam-probe`. No TLS dependency or app behavior changed.

Schedule eligibility must conservatively account for intervals crossing occurrence
boundaries, while preserving manual override independence and immutable run
deadlines. Future adoption must use one control-accepted original interval for
schedule/TLS, preserve USB generation precedence, expire the old anchor first,
and ensure source loss/revocation cannot clear a newer operator authority or wait
behind storage Busy. The existing shared UDP/RNG owners should be reused without
periodic flash writes. Runtime query backoff, source agreement, total deadlines,
generation coupling, interval-aware CASE/operator input and final-device service
availability remain implementation work. The public probe does not establish that
an Apple Home hub supplies a usable CASE time server.
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
