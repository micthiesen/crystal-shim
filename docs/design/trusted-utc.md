# Trusted UTC

Control accepts one UTC observation with its original monotonic capture and uses
it for both scheduling and TLS certificate dates. Automatic observations are
fresh reads from the administrator-configured Matter `TrustedTimeSource`, over
CASE. Physical USB `UTC` remains an explicit operator assertion. There is no
unauthenticated SNTP fallback, cached-RTC refresh, build-date clock or persisted
current UTC. This implementation does not prove that Apple Home configures a
trusted source or that a Home hub serves time with a usable ACL. Those are final
pairing checks; absent a usable source, local protection and USB remain available.
Unattended automatic schedules require a usable configured CASE authority. Hourly
USB clock-setting does not satisfy unattended operation. If the Home hub does not
provide the required server/configuration/ACL, authenticated automatic-source
compatibility or fallback remains integration work.

## Production path and ownership

- `firmware/matter/src/time_source.rs` captures the source through public
  `Matter::with_rtc`, then copies its fabric identity through `with_state`.
  Identity includes nonzero fabric index, node/endpoint, fabric ID, compressed
  fabric ID and SHA256 of the encoded root CA. No state borrow crosses an await.
- The actual pinned `Exchange::initiate` CASE operation and public
  `ImClient::read_with` run through the existing Matter transport. The generated
  `TimeSynchronizationAttrReads` builder requests UTC; project code validates the
  response path and scalar before decoding it. Source identity is checked before
  initiation, after initiation and after the read. There is no second UDP socket,
  radio, network stack or RNG owner.
- `app/src/clock.rs` runs in `matter.rs::Application`, alongside TLS readiness.
  It bounds discovery/CASE/read to ten seconds total and the attribute read to
  two seconds after CASE is ready. Each deadline retains its original start and
  checks elapsed monotonic time before polling and after completion. A response
  ready alongside an expired timer cannot win trust through poll order. Capture
  occurs once immediately after validated report decoding, before waiting for
  its ACK; ACK/dispatch delays do not renew age. No network-delay correction is invented. Successful offers refresh
  every 30 minutes; failures retry after 60 seconds. If control has not accepted
  usable UTC, retries also use 60 seconds. Source changes can prompt an earlier
  read. These are engineering bounds, not measured radio performance.
- A fixed `core::utc::ClockMailbox` holds the latest observation and a separate
  revocation flag. Generation checks reject old/duplicate results across awaits,
  source changes, explicit operator commands and failed or timed-out attempts.
  Null, invalid-range, malformed parsed responses, future-capture and expired
  observations withdraw network UTC;
  transient transport failure retains only the old observation's original age.
- `control.rs` consumes clock updates in its normal 20 ms iteration. Runtime
  observes the previous anchor's expiry first, applies source revocation, considers
  a new network sample, then processes the operator command. It validates the
  configured timezone before accepting a sample. Only control publishes the
  accepted original observation to `set_trusted_observation`; it publishes changes
  rather than periodically recreating anchors from extrapolated wall-clock values.
- Control never enters Matter state or awaits networking. The TLS provider checks
  the shared anchor rules again at actual hook/connector reads between control ticks.

`core/src/utc.rs` keeps fractional milliseconds, converts the Matter 2000 epoch
with checked arithmetic, and produces Gregorian fields in constant time. Runtime
now also accepts [explicit UTC intervals](utc-intervals.md); schedule caps retain
the latest endpoint's milliseconds. Current CASE/USB producers still supply point
observations. For these, trust expires at exactly 3,600,000 ms from the original
capture; a supplied error model can require earlier expiry. Future monotonic captures, observed
rollback, the signed TLS timer's saturation, arithmetic overflow and calendar
values outside 1970 through 9999 fail closed. A new observation is needed after
invalidity. No captured value survives boot as current UTC.

## Source administration and USB ordering

The root preserves the pinned Wi-Fi server clusters, adds only TimeSyncClient,
and advertises outgoing client cluster `0x0038`. The SDK's existing root handler
implements fabric-scoped, Administer-only `SetTrustedTimeSource`. TimeZone,
NTPClient and NTPServer features remain absent. The configured POSIX timezone
continues to belong to the project configuration.

The source monitor checks identity every 100 ms and around each awaited result.
In addition, the existing `app/src/storage.rs::Store` invalidates the mailbox
before store/remove of the SDK's `TRUSTED_TIME_SOURCE_KEY`, before acquiring its
flash permit. Thus a normal A-to-B-to-A policy change between polls still rejects
older work, even if persistence fails after SDK RAM changed. Other keys and reads
have no clock side effect. The SDK may fail a null-source event before it attempts
persistence: current-source checks still reject null, and restoring a non-null
source invokes the mutation hook. A source disappearing outside this mutation
path is observed within the monitor period plus one control iteration.

This hook adds no writes and does not replace or wrap the sole flash owner.
Administratively changing TrustedTimeSource uses the SDK's existing same-owner
configuration persistence. The periodic reader does not call `set_utc_time`,
`set_utc_time_persist`, or the stock `TimeSyncClient::refresh_once`; that stock
helper can return success without a fresh value and persist last-known time.
The SDK's own CASE bootstrap/certificate policy is retained. Its last-known/build
fallback is not accepted as current project UTC or TLS trust. Mandatory root
`SetUTCTime` can update SDK RTC; it does not directly publish project UTC.

USB `UTC` is timestamped before queuing, and accepted clock commands atomically
invalidate older network work. Its ordinary correlated reply reports control's
`Applied`, `InvalidTime`, `Busy` or other error. `CLEAR_UTC` has a separate small
route/reply slot, serviced before normal commands, so a pending CONFIG transaction
cannot prevent its applied acknowledgement. A newer clear also completes an older
queued UTC request with its own `Superseded` error; that request cannot revive UTC
on the following tick. It clears both kinds of clock without waiting for flash. The existing reserved relay Off flag is independent and remains
lossless. Provisioning's existing active-transfer admission rules still apply.
Clear revokes current trust; it does not remove the configured authority or disable
later fresh acquisition.

Fatal authority-task return/cancellation withdraws its source-owned observation.
It cannot erase a newer operator observation. Short network outages let an existing
anchor age naturally to expiry. Clock loss/expiry suppresses the retained scheduled
occurrence and revokes automatic demand through the existing Off path. An immutable
old eligibility ACK cannot restore it. Manual overrides keep their monotonic
lease and minimum-off rules; corrections/overlap/repeated On do not extend a run.

## Verification and limits

The host checks exercise original-capture dispatch delay, fractional-second and
calendar boundaries, exact expiry, timer rollback/saturation, source/fabric fields,
observed and persisted source ABA, timeout/late-result generations, null/invalid
responses, cancellation of unfinished reads, and USB reply ownership while CONFIG
owns the normal ingress. Runtime cases also cover old expiry before a same-tick
correction/late eligibility ACK and waiting/energized valid-LOW overrides.

The actual production Store is compiled with a deterministic NOR backend: tests
verify source-key mutation invalidation precedes the flash permit, occurs even on
failure, and ignores reads/other keys. Pinned root metadata tests compare every
unchanged server cluster and the exact TrustedTimeSource access flags. The actual
CASE/generated-request function compiles on host and C6. Response tests require
one data report with the exact endpoint, cluster `0x0038` and `UTCTime` attribute,
no list index or compressed/wildcard path, and one nullable unsigned scalar. A
present node ID must match the authenticated target. Extra/duplicate/status
reports, events, subscription IDs and continuation chunks are rejected. The
pinned convenience `utc_time_read` decodes the first report without validating
its path, so it is deliberately not used.

Both deadline limits have deterministic ready-first, exact-boundary, late-first-
poll, rollback and saturation regressions. A fake ACK delay preserves the original
validated report capture and cannot complete after the read deadline. Scratch
mutations restoring first-report decoding or removing the post-completion elapsed
check fail these tests.

Validation operates on the public SDK's parsed `ReportDataResp`. The SDK tolerates
an absent outer TLV end after a fully encoded attribute array; `ReadRespChunk`
does not expose the raw outer payload. This is not a claim of canonical raw-TLV
validation. Truncated attribute/scalar data is rejected. These tests do not exercise
a radio session or prove a Home hub's time accuracy.

The repository TLS harness compiles the production provider and core anchor. Its
actual MbedTLS hook and verifier check shared capture/expiry, dates, fixed DigiCert
root, hostname, required verification and existing record-buffer policy. Commands:

```sh
cargo test --manifest-path firmware/Cargo.toml -p crystal-shim-core -p crystal-shim-matter --locked
cargo clippy --manifest-path firmware/Cargo.toml -p crystal-shim-core -p crystal-shim-matter --all-targets --locked -- -D warnings
sh scripts/check-tls.sh
cd firmware/app
sh ../../scripts/with-esp-toolchain.sh cargo clippy --locked --all-targets -- -D warnings
sh ../../scripts/with-esp-toolchain.sh cargo build --release --locked
sh ../../scripts/with-esp-toolchain.sh llvm-size target/riscv32imac-unknown-none-elf/release/crystal-shim
```

The 2026-09-12 scoped checks passed 128 core tests, 58 Matter/provisioning tests,
12 TLS tests, host/app formatting and Clippy, resolved Matter/TLS feature checks,
document checks and the C6 release build. A scratch mutation disabling queued-UTC
supersession makes that ordering regression fail; the repository remains unchanged
by the mutation proof.

| ELF section | Before UTC integration | With UTC integration | Change |
| --- | ---: | ---: | ---: |
| `llvm-size` text | 1,906,596 | 1,948,678 | +42,082 |
| data | 23,836 | 23,884 | +48 |
| BSS | 245,392 | 245,560 | +168 |
| RAM execution/trap sections | 80,392 | 80,392 | 0 |
| Linker stack region | 102,488 | 102,272 | -216 |

The linked image includes the actual CASE client branch without commissioning
secrets; private material is still loaded through the runtime provisioning boundary,
so no compile-time absent-identity constant removes this task. Static SRAM excluding
the linker stack grows by 216 bytes to 349,836 bytes. This does not count additional
live client-future/call-stack usage as free memory. The final authority-review fixes
reduce `llvm-size` text relative to the initial UTC implementation; 64,688 bytes
of that difference are linker alignment padding (`.text_gap` 65,220 to 532 bytes).
The actual CASE path remains linked and called from `Application`.
CASE uses existing exchange/session/bump resources and can contend with Matter
commands or commissioning. Static sizes do not measure peak heap, stack high-water,
network latency or oscillator drift; the existing 48 KiB runtime-margin gate remains.
The authority is responsible for UTC accuracy. The two-second read bound does not
prove subsecond accuracy or compensate for asymmetric packet delay.

New TLS handshakes fail without fresh UTC. The future Pushover worker must also
cancel/drop an in-progress TLS operation on trust loss; this provider cannot revoke
an already established application session. The [local HTTP/UI](settings.md) is
now linked; notification delivery and actual Home pairing/time-server/ACL
acceptance remain separate work. No live radio,
network endpoint, credentials, hardware or notification POST was used for these checks.

## Primary implementation references

- [Pinned rs-matter TimeSync implementation](https://github.com/project-chip/rs-matter/blob/6304fddc10c1e0223a3ce13825dd4f4161d93066/rs-matter/src/dm/clusters/time_sync.rs)
- [Pinned public IM client and response lifecycle](https://github.com/project-chip/rs-matter/blob/6304fddc10c1e0223a3ce13825dd4f4161d93066/rs-matter/src/im/client.rs)
- [Pinned CASE TimeSync client](https://github.com/project-chip/rs-matter/blob/6304fddc10c1e0223a3ce13825dd4f4161d93066/rs-matter/src/dm/clusters/time_sync/client.rs)
- [CHIP TimeSynchronization model and access flags](https://github.com/project-chip/connectedhomeip/blob/master/src/app/zap-templates/zcl/data-model/chip/time-synchronization-cluster.xml)
- [CHIP controller TrustedTimeSource API](https://project-chip.github.io/connectedhomeip-doc/testing/ChipDeviceCtrlAPI.html#SetTrustedTimeSource)
- [Apple public TimeSynchronization client API](https://developer.apple.com/documentation/matter/mtrclustertimesynchronization), which does not establish Home app or hub behavior.
