# Verified TLS provider for Pushover

Status: selected and cross-compiled. The provider policy, trust anchor, certificate
clock, and edge-nal adapter are implemented in
`firmware/app/src/tls.rs`. A public-endpoint host test completed a verified
handshake. ESP32-C6 execution remains a final-board test.

## Decision

Use `edge-nal-tls 0.2.0` over `mbedtls-rs 0.2.0`. This is the selected
Pushover client TLS provider because it has the exact interfaces used by the
Stillair Matter `UserTask`:

- `edge-nal 0.7.0::TcpConnect`;
- `embedded-io-async 0.7.0::{Read, Write}`;
- a `no_std` implementation for
  `riscv32imac-unknown-none-elf`;
- Mbed TLS certificate-chain, DNS-name, and validity-date verification.

The crates resolve to edge-net commit
[`c1f0db5`](https://github.com/sysgrok/edge-net/tree/c1f0db549735a6604d35b56b5f401d6a520be4a9)
and mbedtls-rs commit
[`ef5a274`](https://github.com/esp-rs/mbedtls-rs/tree/ef5a274f3506f14bf90df4490b34a83ba35c4c12).
The latter contains Mbed TLS 3.6.5. The app lockfile records all transitive
versions.

Do not use reqwless's `embedded-tls` backend for this path. It does not provide
server-certificate verification. Do not change `AuthMode::Required`, omit the
server name, or continue after an untrusted clock.

## Compiled profile

`edge-nal-tls` has default features disabled. The direct `mbedtls-rs`
dependency selects the required algorithms and sizes:

| Capability | Cargo feature or setting | Reason |
| --- | --- | --- |
| Protocol | `tls-client`, `tls-core`, `tls-proto-tls12` | TLS client with a TLS 1.2 minimum. `mbedtls-rs 0.2.0` also enables TLS 1.3 in its own dependency declaration. |
| Key exchange and signatures | `kex-ecdhe-rsa`, `alg-rsa`, `alg-rsa-pss`, `alg-ecdh`, `alg-ecp`, `curve-secp256r1`, `pk` | Matches the endpoint's current RSA chain and ECDHE service. RSA-PSS is required when the endpoint selects TLS 1.3. |
| Record protection | `alg-aes`, `alg-gcm`, `alg-sha256` | Supports the observed AES-GCM suites and certificate signatures. |
| Randomness | `drbg-ctr`, `entropy` | Required by the mbedtls-rs session machinery. The callback is supplied by the app. |
| Certificate validation | `x509-parse`, `hook-wall-clock` | Parses the chain and checks both certificate validity bounds using injected trusted UTC. |
| Timing | `embassy-time` | Installs MbedTLS's monotonic timer from the same Embassy clock as the application. |
| Records | `ssl-in-content-len-8192`, `ssl-out-content-len-2048` | The current three-certificate server chain is 4,188 DER bytes before handshake framing. A 4,096-byte input setting failed the live handshake. 2,048 bytes covers the bounded Pushover POST. |

The direct `esp-alloc 0.10` dependency enables `global-allocator`, `compat`,
and `esp32c6`. Mbed TLS uses the C-compatible `calloc` and `free` symbols.
The direct `tinyrlibc 0.5` dependency supplies only `memchr`, `strchr`,
`strcmp`, `strlen`, `strncmp`, `strncpy`, and `strstr`. The
construction-linked C6 probe resolved with that set. Enabling tinyrlibc's
`snprintf` or `all` feature invokes a separate GCC build and is unnecessary.

The certificate-date hook forces mbedtls-rs-sys to compile its bundled portable
C source instead of using its prebuilt configuration. On macOS, Apple Clang has
no RISC-V backend. `scripts/with-esp-toolchain.sh` first accepts any `clang`
whose `--print-targets` contains `riscv32`, then prepends Homebrew LLVM when
available, and otherwise fails with the installation action. Linux CI installs
Clang, libclang, and CMake. Do not hard-code a user-specific compiler path.

## Fixed policy and API

`tls.rs` embeds the official
[DigiCert Global Root G2 DER](https://cacerts.digicert.com/DigiCertGlobalRootG2.crt).
It is 914 bytes and its SHA-256 fingerprint is:

```text
CB:3C:CB:B7:60:31:E5:E0:13:8F:8D:D3:9A:23:F9:DE:
47:FF:C3:5E:43:C1:14:4C:EA:27:D4:6A:5A:B1:CB:5F
```

The value agrees with DigiCert's
[trusted-root inventory](https://knowledge.digicert.com/general-information/digicert-trusted-root-authority-certificates).
This is a root-specific trust store, not a leaf pin. It accepts a normal chain
to that root and survives leaf/intermediate renewal. A Pushover CA migration
away from this root fails closed and requires a reviewed firmware trust-anchor
update.

The public API is deliberately narrow:

- `UtcDateTime::new` validates Gregorian UTC from 1970 through 9999, including
  leap years and all field bounds.
- `install_certificate_clock` installs static MbedTLS wall-clock and monotonic
  hooks. It is `unsafe`; call it exactly once during single-threaded startup,
  after `esp_rtos::start` and before any MbedTLS validation.
- `set_trusted_utc` anchors a newly acquired UTC observation to the same
  monotonic timer used by MbedTLS. The clock module calls it only after SNTP
  plausibility and freshness checks; republishing cached UTC would incorrectly
  renew its trust and is forbidden.
- UTC advances by elapsed whole seconds, including Gregorian calendar rollover.
  `TRUSTED_UTC_MAX_AGE_MS` is 3,600,000 ms: the anchor expires at exactly one hour
  without a new observation. Reads and connector construction never renew it.
  This bounds reliance on an unattended anchor while allowing transient SNTP
  outages. It does not authenticate SNTP or replace the clock module's checks.
- `has_trusted_utc` and the MbedTLS wall-clock hook apply the same age check.
  Observed monotonic rollback, reset, signed timer saturation, or advancing past
  year 9999 also revoke the anchor until a new trusted observation arrives.
- `clear_trusted_utc` removes time trust. New connector construction and
  MbedTLS validation then fail closed.
- `pushover_connector(tls.reference(), net_stack)` returns
  `edge_nal_tls::TlsConnector` only when UTC is trusted. Its private
  `ClientSessionConfig` sets the CA certificate, server name
  `api.pushover.net`, `AuthMode::Required`, and a TLS 1.2 minimum. Callers
  cannot substitute another host, root, or authentication mode.

MbedTLS receives the same `api.pushover.net` value through
`mbedtls_ssl_set_hostname`; Mbed TLS uses it for SNI and X.509 DNS-name
verification. The wall-clock hook returns `None` when UTC is unavailable or stale,
including when a connector was constructed while the clock was fresh. The actual
MbedTLS chain verifier returns `MBEDTLS_ERR_X509_FATAL_ERROR` (`-0x3000`) with all
verification flags set when it cannot obtain UTC. An absent clock cannot accept
a certificate. An already established TLS session is not revalidated when the
anchor expires; the network task still owns the bounded per-attempt deadline.

## Stillair UserTask integration

Use the provider from the normal-priority network task. The exact ownership
sequence is:

1. Initialize the 100 KiB application heap and call `esp_rtos::start`, as
   Stillair does.
2. Keep `TrngSource::new(rng, adc1)` alive. Place a
   `esp_hal::rng::Trng::try_new()` in a `StaticCell`; the pinned esp-hal
   implements rand_core 0.10 `TryRng` and `TryCryptoRng` directly.
3. Construct the single process-wide `mbedtls_rs::Tls` with
   `Tls::new(tls_rng)`. Keep it alive for every notification attempt.
4. Call `unsafe { install_certificate_clock() }` once after the Embassy timer
   driver is active. Publish each new trusted UTC observation and clear UTC when
   trust is lost. Acquire a new observation before the one-hour expiry; do not
   refresh the provider from a cached clock value.
5. Inside `rs_matter_embassy::stack::UserTask::run`, resolve
   `api.pushover.net` using the supplied `NetStack`, then create the fixed
   connector from the same stack. Connect to port 443 and issue
   `POST /1/messages.json`.
6. Use sequential `embedded_io_async::Write` then `Read`. Do not call
   `TcpSplit::split`; edge-nal-tls 0.2.0 implements it with a panic.
   Its `Readable` implementation returns immediately, so it is not a wait
   primitive.
7. Apply an Embassy deadline around DNS, TCP connect, the first write
   (which drives the TLS handshake), all remaining writes, reads, and shutdown.
   mbedtls-rs marks an async handshake as not cancellation-safe. On timeout,
   drop the entire socket/session and create a fresh one for the retry; never
   resume or reuse a cancelled session.

The TLS future stays in thread mode. It never enters the Priority2 sensor task
or Priority3 control task. Heap failure, DNS failure, a certificate error, or a
timeout leaves the persistent notification record queued and has no control
effect.

## Evidence

All evidence below was collected on 2026-09-11 without credentials, API POSTs,
flashing, or notifications.

The C6 app library passed:

```sh
cd firmware/app
sh ../../scripts/with-esp-toolchain.sh \
  cargo clippy --locked --all-targets -- -D warnings
sh ../../scripts/with-esp-toolchain.sh cargo build --locked --release
```

A separate C6 scratch binary, before the automatic UTC-age fixes, linked the
code path that initializes a 64 KiB
heap, constructs `Tls`, installs both time hooks, parses the root, and creates
the fixed connector. It included the same esp-rtos Embassy timer driver,
esp-alloc compatibility symbols, and narrow tinyrlibc features. An otherwise
identical binary omitted provider construction:

| C6 linked image | `.text` | `.data` | `.bss` |
| --- | ---: | ---: | ---: |
| Baseline probe | 478,310 | 588 | 66,276 |
| Provider-construction probe | 526,994 | 972 | 66,440 |
| Difference | **48,684** | **384** | **164** |

These are historical measurements of the initial provider, not the current
freshness implementation or final application. The current C6 library builds;
repeat linked-size measurement when the real app calls it. This measures program
sections, not maximum live heap. The configured TLS
record buffers alone require 10,240 bytes per live session. Parsed chain nodes,
RSA/ECP working values, and session state add dynamic allocations. One
notification TLS session at a time is therefore mandatory. The final combined
Matter image still needs the repository's 48 KiB free-SRAM gate and allocator
high-water measurement.

A Linux host harness used the same `tls.rs` policy, edge-nal-std 0.7, and
MbedTLS feature set against the public endpoint. It performed a HEAD request,
not a Pushover API call:

| Case | Result |
| --- | --- |
| Trusted UTC 2026-09-11, fixed root and host | Verified handshake; `HTTP/1.1 200 OK` |
| UTC absent | `ProviderError::ClockUnavailable` before TCP |
| UTC 2025-01-01 | Rejected as not yet valid; Mbed TLS X.509 verify error `-0x2700` |
| UTC 2030-01-01 | Rejected as expired; Mbed TLS X.509 verify error `-0x2700` |
| Test-only wrong hostname configuration | Handshake rejected; no alternate-host API exists in production |

The current endpoint supplied certificates of 1,827, 1,207, and 1,154 DER
bytes. Its leaf was `CN=*.pushover.net`, included the wildcard in SAN, was
issued by RapidSSL TLS RSA CA G1, and chained to DigiCert Global Root G2. OpenSSL
also confirmed TLS 1.2 with `ECDHE-RSA-AES128-GCM-SHA256`. The live Rust
provider selected TLS 1.3; removing `alg-rsa-pss` caused a fatal handshake
alert, which is why that feature is retained.

The checked-in [host harness](../../firmware/tls-tests/README.md) compiles
`firmware/app/src/tls.rs` directly, including its private connector policy. It
uses the production MbedTLS algorithm and record-size features plus the host
`std` backend. Its eleven deterministic tests cover Gregorian bounds and C `tm`
conversion; advancing UTC; exact expiry; refresh and clearing; monotonic
rollback/reset/saturation; calendar overflow; the root's parse and SHA-256
fingerprint; the fixed hostname, required authentication and TLS minimum; and
MbedTLS verification of the saved public chain with valid, absent, stale,
premature, expired, wrong-host and unrelated-root inputs. One test crosses the
leaf's expiration second without refreshing UTC, proving that the actual C
verifier sees the advancing clock.

The test timer supplies monotonic values directly, so the suite has no sleeps,
sockets, credentials or dependency on today's date. These tests exercise X.509
verification, not an end-to-end TCP/TLS handshake. The earlier live handshake
remains separate evidence. Run the host gate with:

```sh
sh scripts/check-tls.sh
```

The harness requires Linux, Rust, a C compiler, CMake and libclang. The gate runs
natively on Linux and through an available OrbStack Linux machine on macOS. Its
Cargo lockfile is checked in. The app library still disables the target test
harness because Rust does not ship `test` for `riscv32imac-unknown-none-elf`;
`cargo clippy --all-targets` checks a small harness-free target artifact.

## Remaining runtime gate

The dependency and security path is build-proven. The final-board network test
must still demonstrate a real ESP32-C6 handshake through the Matter-owned Wi-Fi
stack, capture peak heap use, and show timeout/drop/retry behavior while the
Priority3 control cadence remains within its deadline. No certificate or
hostname verification exception is permitted to pass that gate.

## Primary sources

- [Pushover message API](https://pushover.net/api)
- [edge-nal-tls 0.2.0 source](https://github.com/sysgrok/edge-net/tree/c1f0db549735a6604d35b56b5f401d6a520be4a9/edge-nal-tls)
- [mbedtls-rs 0.2.0 source](https://github.com/esp-rs/mbedtls-rs/tree/ef5a274f3506f14bf90df4490b34a83ba35c4c12/mbedtls-rs)
- [mbedtls-rs-sys wall-clock hook](https://github.com/esp-rs/mbedtls-rs/blob/ef5a274f3506f14bf90df4490b34a83ba35c4c12/mbedtls-rs-sys/src/hook/wall_clock.rs)
- [mbedtls-rs async session cancellation notes](https://github.com/esp-rs/mbedtls-rs/blob/ef5a274f3506f14bf90df4490b34a83ba35c4c12/mbedtls-rs/src/session/asynch.rs)
- [DigiCert trusted root inventory](https://knowledge.digicert.com/general-information/digicert-trusted-root-authority-certificates)
