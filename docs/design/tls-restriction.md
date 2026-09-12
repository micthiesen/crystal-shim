# Borrowed TLS certificate restriction

The project carries a narrow source patch to the published `mbedtls-rs 0.2.0`
wrapper under [vendor/mbedtls-rs](../../vendor/mbedtls-rs). The application and
Linux TLS harness resolve that same copy. `mbedtls-rs-sys 0.2.0`, its Mbed TLS
3.6.5 source and `edge-nal-tls 0.2.0` are unchanged. The Pushover provider requires
a borrowed `OperationLease`; every connection uses its interval certificate restriction.

## Contract

`CertificateRestriction::new(&verifier)` borrows a `CertificateVerifier: Sync`.
Its safe callback receives copied notBefore/notAfter calendar fields and chain
depth. It sees neither C certificate pointers nor existing verification flags.
Returning rejection can only add `MBEDTLS_X509_BADCERT_OTHER`; returning success
cannot clear hostname, trust, signature, algorithm or date failures. Invalid C
callback arguments fail with the fatal X.509 error. A verifier must not panic,
block, allocate, log secrets or re-enter the session.

The callback uses a monomorphized C trampoline and a borrowed thin pointer, with
no policy allocation. Session state retains the lifetime after its constructor
configuration is dropped and through moves of the session. C owns its certificate
objects and never owns or frees the verifier. Debug output contains no pointer or
policy data. Required authentication remains mandatory for a restricted session;
optional authentication is rejected at construction.

Restricted blocking and async sessions reject `save` and
`connect_with_session(Some(...))` before TLS I/O. The resolved-feature guard
also rejects PSK, ticket and early-data features. Future consumers must create a
fresh session for each operation. This is deliberately narrower than supporting
resumption with a cached certificate policy.

## Production operation lease

Control publishes `ClockAuthority`: original `UtcObservation`, checked nonzero
accepted generation and operator/network source identity. An identical accepted
replacement still gets a new generation. Network identity includes the acquisition
mailbox's original source epoch. Ordinary read consumption and transport failures
do not change it; source changes, explicit withdrawal, operator commands and
checked exhaustion revoke older network work. The app publishes accepted authority
and current source epoch atomically while holding the mailbox critical section.
An independent operator authority survives network withdrawal.

`OperationLease::begin` reserves the sole certificate scope for one original
20-second operation, including DNS, TCP, handshake and response. Its certificate
horizon is earliest UTC at the original start through latest UTC at the original
deadline, rounded outward to whole seconds. It rejects an anchor that cannot cover
that entire horizon. Every selected chain certificate must contain both endpoints.
Gregorian fields and ordering are checked; no baseline verification flags can be
cleared. The fixed Pushover root, hostname, Required verification and TLS 1.2
minimum remain unchanged.

During the lease the MbedTLS clock returns the fixed lower endpoint. This is safe
only together with the borrowed full-horizon restriction; it is not scalar interval
validation. Scalar compatibility queries still refuse uncertainty without erasing
a valid bounded anchor. A revoked scope never falls back to a newer authority.
Expiry, observed rollback, authority replacement and source mismatch latch failure.
Repeated publication cannot revive the anchor. Scope and generation identifiers do
not wrap. Drop clears only the matching scope.

The [Pushover worker](pushover.md) checks the lease, current queue/configuration token,
network identity and original deadline before and after every I/O future poll.
A 20 ms monitor also cancels pending work. Explicit handshake completion precedes
credential encoding. Each attempt owns its whole socket and session, which are
dropped on completion or cancellation. A certificate callback alone cannot revoke
an established session, and the upstream handshake future is not cancel-safe.
There is no split, session save, resumption or connection reuse.

CASE and USB retain their existing point-clock contract. Signed-source agreement,
hardware drift policy and unattended acquisition remain work. Interval support
does not authenticate a new authority. Hardware timing and peak-memory gates
remain open.

## Provenance and checks

[The receipt](../../vendor/mbedtls-rs.provenance.json) retains the published archive
SHA-256, upstream file hashes, patched hashes and exact five-file change allowance.
[The patch](../../vendor/mbedtls-rs.patch) is reviewable independently of the full
vendor tree. Both upstream licenses are retained. `check_tls_vendor.py` rejects
unlisted edits or hash drift. An independently archive-derived manifest digest
pins every upstream file, so updating the mutable receipt cannot widen the
five-file patch scope. `check_tls_features.py` verifies both manifests, Cargo's
actual resolved paths, profiles and prohibited resumption features. The unpatched
sys/edge crates also require fixed registry identities and archive checksums.
The patched file set must retain every anchored upstream file plus only the
reviewed new callback module; deleting a source or license and its receipt entry
fails. Independent re-review found no remaining actionable provenance or scoped
callback-test gap after these corrections.

`sh scripts/check-tls.sh` uses the supported Linux C backend. Provider and
operation tests exercise the actual clock, immutable horizon and revocation. A
separate serialized loopback OpenSSL matrix retains: eight
accepted and 50 rejected full handshakes, two pre-I/O resumption rejections and
one canceled Pending async handshake. Both blocking and async APIs exercise
TLS 1.2/1.3 success, each selected chain depth, Required authentication, session
moves/config drop, and save/resume rejection with an actual saved session.

For TLS 1.2, both APIs test wrong hostname, unrelated root, corrupt signature,
expired/future dates and RSA-1024 rejection with no callback, an accepting callback
and a denying callback. An accepting callback retains the exact baseline flags;
a denying callback adds only OTHER. Algorithm coverage is specifically BAD_KEY,
not an exhaustive digest, curve, key-type or CRL matrix. A separate compile-fail
check requires E0515 when the verifier would escape its borrow. Synthetic private
keys are marked test-only. No production credential or external notification is
used. These tests do not establish device execution latency, allocation-failure
behavior or real-service interoperability. Production-lease loopback tests add
uncertain-clock success and rejection of a leaf expiring inside the original
horizon. Per-depth lease boundary cases call the actual policy directly; the
separate matrix proves full-chain callback dispatch. See [Pushover evidence](pushover.md)
for current integrated counts and cancellation coverage.
