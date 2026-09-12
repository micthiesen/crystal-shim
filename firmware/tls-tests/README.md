# Deterministic TLS provider checks

This host workspace compiles `../app/src/tls.rs` directly as its library. The
tests use the production private policy, trust anchor and clock code. Only the
timer backend changes to an injected monotonic counter under host `cfg(test)`.
No production policy is copied or exposed through a test-only public API.

Run from the repository root:

```sh
sh scripts/check-tls.sh
```

The gate runs on Linux, or in an available OrbStack Linux machine from macOS.
The native dependencies are Rust with rustfmt/clippy, a C compiler, CMake and
libclang. On Ubuntu, `build-essential clang libclang-dev cmake` supplies the
native build dependencies. The MbedTLS dependency does not support a native
macOS host build for this configuration.

The underlying commands on Linux are:

```sh
cargo fmt --manifest-path firmware/tls-tests/Cargo.toml -- --check
cargo clippy --locked --manifest-path firmware/tls-tests/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path firmware/tls-tests/Cargo.toml
```

The eleven tests run without network access after Cargo dependencies have been
fetched. They use a fixed UTC observation and injected elapsed time, never sleeps
or the host wall clock. A mutex serializes tests that touch the process-wide
MbedTLS hooks, and installation happens exactly once.

Coverage includes the real `mbedtls_platform_gmtime_r` hook and MbedTLS X.509
chain verification, one-hour freshness expiry, UTC/calendar advancement, timer
rollback and saturation, explicit clearing, root parsing and fingerprint, and
the fixed required-authentication/hostname/TLS-minimum policy. The certificate
checks reject absent/stale UTC, invalid dates, a wrong hostname and an unrelated
root. These are deterministic verifier tests; they do not claim a new live
handshake or C6 runtime result.

## Public fixtures

The three Pushover certificates were captured from the public
`api.pushover.net:443` endpoint on 2026-09-11 during the earlier verified TLS
probe. They are DER encodings of that same saved PEM chain. No private keys or
credentials are included. The leaf is valid from 2026-02-03 through
2027-03-06 23:59:59 UTC; tests explicitly control their UTC date so the fixtures
do not require renewal.

| File | Subject | SHA-256 |
| --- | --- | --- |
| `fixtures/pushover-leaf.der` | `*.pushover.net` | `04fa5fcdcee1d019bb44902721beec6bb2492d453adb7a6dba6b2a07a922b2e2` |
| `fixtures/rapidssl-intermediate.der` | RapidSSL TLS RSA CA G1 | `4422e963ee53cd58cc9f85cd40bf5ffec0095fdf1a154535661c1c06bcadc69b` |
| `fixtures/digicert-g2-cross-signed.der` | DigiCert Global Root G2, issued by DigiCert Global Root CA | `79d57b15dfa65c2870eafe11b637765909cfe937b49c15ce7f194030cab395ad` |
| `fixtures/unrelated-isrg-root-x1.der` | ISRG Root X1 | `96bcec06264976f37460779acf28c5a7cfe8a3c0aae11a8ffcee05c0bddf08c6` |

The unrelated ISRG Root X1 certificate came from Ubuntu's local CA store at
`/etc/ssl/certs/ISRG_Root_X1.pem`, converted with `openssl x509 -outform DER`.
It exists only to prove that trusting another root cannot validate this chain.
The production trust anchor is read from `tls.rs`, not duplicated in fixtures.
