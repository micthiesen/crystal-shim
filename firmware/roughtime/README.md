# Offline Roughtime verification and agreement

`Request` verifies one draft-19 response against one of the two compiled public
roots. `agreement::AgreementRound` owns requests for both providers and returns
an interval only after their authenticated intervals agree. Neither API adopts a
clock or performs network, RNG, flash or watchdog work. The crate is `no_std`
without allocation.

```rust
use crystal_shim_roughtime::agreement::AgreementRound;
use crystal_shim_core::utc_bounds::ClockRateBound;

// Caller-selected test values, not production timer or acquisition defaults.
let rate = ClockRateBound::new(100, 1).unwrap();
let round = AgreementRound::new(100, 5100, rate).unwrap();
drop(round);
```

Call `begin(provider, nonce, started_at_ms)` immediately before constructing and
sending that provider's request. It returns the exact original request bytes.
Capture each response's receive time once, then call
`receive(provider, datagram, received_at_ms, now)`. The injected `now` reads the
same monotonic timer before and after signature verification. Both providers may
be in flight, and historical receive captures can be processed in either order.
Actual operation clock reads must remain monotonic. Each provider gets one request
per round, with distinct caller-supplied CSPRNG nonces. Cross-round and cross-boot
nonce uniqueness remains the caller's responsibility.

The coordinator derives each transport upper bound from the supplied
`ClockRateBound` and passes it to the real verifier. It preserves the verifier's
strict two-second request deadline. It also checks the caller's immutable round
deadline at entry and verified completion. Any invalid response, duplicate or
unstarted provider, repeated nonce within the pair, time failure or expired work
closes the entire round. There is no single-provider result or retry that retains
one provider's old sample. A new round needs new requests and nonces.

After both responses succeed, `finish(completion_now)` consumes the round and
reads the clock after calculating agreement. It projects both original intervals
to the latest original receive capture using outward elapsed bounds. It requires
inclusive overlap and retains the full hull, never their intersection. A hull
width of 20,000 ms is accepted; a wider hull is rejected. Drift and quantization
are included before that decision. Ordinary later aging can widen the returned
observation further; the width limit is an agreement-time acceptance rule.
Completion and publication do not replace the original receive capture.

`Agreement::observation` is an immutable candidate for a future control owner,
with original per-provider captures and projected intervals available for
inspection. It does not accept externally constructed `VerifiedResponse` values,
and none of its public APIs can replace a pinned root. Signing-key overrides and
synthetic signing material exist only under `cfg(test)`.

The additional trust assumption is that at least one accepted source interval
contains true UTC. It includes every historical delegated private key still
accepted under that provider's root. A narrow malicious interval may overlap an
honest one while excluding true UTC; preserving the honest interval in the hull
avoids that intersection error. Agreement cannot establish truth when both sources
are wrong. This two-provider policy does not implement the draft's three-provider,
twice-chained query process or produce its transferable proof of misbehavior.

The caller must still choose a justified hardware rate/quantization bound and an
appropriate original round budget. There is no production default for either.
Source/operator generation checks around network awaits, acquisition retry policy,
CPU scheduling and measured signature-verification latency, app integration and
control acceptance remain separate work. A control-protection deadline requires
an appropriate runtime execution context; checking time after cryptography does
not itself prove that the local control task remained available.

Tests exercise both captured public signatures and test-only signed responses
through the real verifier. They cover request/round lifecycle, wrong roots,
cross-round replay, original captures, hull/overlap boundaries, outward projection,
expiration, rollback, arithmetic/calendar bounds and fixed coordinator storage.
No live public time queries are part of tests or CI.
