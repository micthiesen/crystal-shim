# Runtime transactions and local command ingress

The application now drives the existing supervisor and scheduler through
`firmware/core/src/runtime.rs`. Priority3 owns that coordinator and the relay.
Thread mode owns the existing `Store` and services one immutable storage request
at a time. `firmware/app/src/runtime.rs` contains only bounded copied mailboxes;
it performs no I/O or waits under its critical-section locks.

This unit adds a working USB path for configuration, commands, maintenance and
explicit UTC observations. Matter, HTTP settings and SNTP are still separate
integration work. No current date, schedule or calibration is compiled into the
application. A valid configured calibration and matching sensor revision remain
required before an explicit run request can energize the output.

## Configuration replacement

The request carries a `ValidatedDeviceConfig`. Its revision must be exactly the
currently published revision plus one, or one for an unconfigured first boot.
Validation and hexadecimal decoding run in thread mode. Invalid, repeated or
out-of-order revisions do not change the active configuration.

An accepted replacement follows this sequence:

1. Control enters maintenance, cancels any automatic or manual run through the
   existing Off path and suppresses the retained occurrence. It keeps the existing
   supervisor instance and its occurrence/suppression history.
2. Storage writes the new revision's retained record with maintenance set and the
   existing occurrence watermark preserved as suppressed.
3. After that exact write succeeds, storage writes the new configuration.
4. After its exact acknowledgement, control publishes the configuration revision
   and replies `Durable`. The output remains in maintenance.
5. An explicit `EXIT` writes maintenance-clear before control exits maintenance.
   It still requires valid input, recovery and minimum-off timing.

Applying a configuration save deliberately stops the active run and requires an
explicit maintenance exit while this runtime remains alive. A settings page must
expose this consequence when it uses this API. A future noninterrupting settings
path cannot silently replace this transaction policy. After the new configuration
and an explicit exit are durable, a distinct later window may start its own
bounded run after the usual eligibility, input, recovery and minimum-off checks.
It cannot resume the cancelled run or borrow its old deadline.

The two NVS keys are individually replaced, not one physical atomic write. The
public configuration does not change between them. Before the first retained
record commits, a reset recovers the old configuration and retained state. An
uncommitted request cannot survive that boundary: `ACCEPTED` is a queue receipt,
and neither it nor a temporary maintenance indication promises durable intent.
If the old retained record had maintenance clear, the old settings can run again
after the ordinary clock/input/eligibility checks. An old Eligible occurrence is
still converted to Suppressed by boot repair before control starts, so an
interrupted eligible window cannot replay through this case.

After the first retained record commits, a reset between writes sees a revision
mismatch and recovers in maintenance through `load_retained`; a reset after both
sees the matching new configuration with maintenance set. If a write
fails, the coordinator leaves the old configuration published, inhibits output
and reports `Storage`. It does not retry continuously. A replacement at the next
revision is the explicit repair path; it may reuse an already durable identical
maintenance record before retrying the configuration write.

Storage requests use monotonically increasing tickets. Duplicate, late or
mismatched completions cannot advance a transaction. Ticket exhaustion inhibits
output and returns `Exhausted`, requiring restart rather than ticket reuse.
The same `Store` methods still acquire the relay-off gate, await the matching
GPIO-low acknowledgement and checkpoint every bounded flash chunk. Runtime also
withholds eligibility throughout a multi-key transaction, including the gap
between its individually gated writes. Storage does not feed the watchdog.

## Sensor revision boundary

Control publishes only `{revision, calibration}` to the sensor task after the
configuration is durable. Publication immediately invalidates the old reading.
Before starting a new frame, the sensor detects a revision change and resets its
calibration stage, including its sequence/slew history. Each published reading
carries the revision that produced it.

A frame already in progress may finish under the preceding revision. Control
rejects it until a fresh frame with the currently published revision arrives.
The durable configuration acknowledgement does not claim that a matching sensor
frame has already arrived. Missing calibration continues to produce invalid
input even when the revision matches.

## Schedule and command handling

The coordinator evaluates the configured POSIX timezone and daily schedule in
the local control task using an explicitly supplied UTC observation anchored to
monotonic time. It advances that anchor automatically and invalidates it at an
elapsed age of 3,600,000 ms, monotonic rollback or counter saturation. A clock
observation is never persisted or invented at boot. It does not feed the TLS
certificate clock yet; the future clock service must publish each fresh trusted
observation to both consumers after its plausibility checks.

`PersistBeforeRun` becomes an immutable retained-eligibility write. No schedule
window reaches the supervisor until that write succeeds and a fresh evaluation
still finds it active. The existing retained watermark blocks earlier/replayed
occurrences. Ordinary eligibility persistence waits while the relay is energized
or a manual override is active or waiting for minimum off; it cannot cancel an
accepted override merely because a scheduled window appears.

An observed UTC expiry marks the desired occurrence Suppressed even while its
old eligibility write is pending. Control observes the preceding clock anchor
before accepting a correction, so a late acknowledgement and backwards correction
in the same iteration cannot hide expiry. Losing or explicitly clearing the clock
also suppresses the saved occurrence, since a future correction cannot safely
reconstruct an unexposed occurrence's elapsed cap. Matching an old write only
updates the durable copy and cannot overwrite the newer desired suppression.

A backwards correction that moves before the saved occurrence also suppresses
it. Calendar suppression revokes an existing automatic lease through Off, so a
later distinct occurrence cannot reuse that lease or its deadline. Corrections
that remain within the active occurrence preserve or shorten its existing cap;
normal overlapping windows do not renew it. Explicit manual demand remains
independent of calendar validity and uses its existing monotonic deadline.

If expiry suppression is the only pending change, its flash write waits for an
accepted manual lease, including minimum-off waiting, to finish. That exact
Eligible-to-Suppressed difference does not inhibit the manual output, and the
schedule already sees the suppression in RAM. Reset meanwhile repairs the old
durable Eligible record. Off, maintenance and configuration transactions do not
use this deferral; they retain their immediate stop and storage exclusion.

Off immediately cancels demand and marks the current or newly discovered
occurrence suppressed. Accepted Off receives an `Applied` reply after control
writes GPIO low; it does not wait for flash. Its storage acknowledgement is
separate from immediate output revocation. If Off arrives during an eligibility write, the immutable old
write may finish but its completion cannot overwrite the newer desired
suppression; that suppression is written next before eligibility can return.
A reset before the suppression write still converts the old eligible record to
suppressed at boot. USB and physical maintenance entry immediately revoke both
automatic and manual leases through the same Off path, preserving occurrence and
suppression history. A durable explicit exit cannot resume the cancelled lease;
a distinct later eligible window starts its own bounded run after recovery and
minimum off. A pressed maintenance button supersedes a pending exit, including
when its completion arrives in the same control iteration.

The supervisor still owns all run deadlines. Repeated On cannot extend an active
override or its minimum-off waiting allowance. Adjacent/overlapping windows
cannot extend a continuous run, and flash exclusion never resets the supervisor.
The status snapshot reports actual commanded relay state, not the latest request.

## USB protocol

Native USB Serial/JTAG provides physical administration. It does not use the
settings HTTP token; a network adapter must authenticate before reaching these
APIs. Commands are newline-terminated ASCII:

| Command | Effect |
| --- | --- |
| `<id> ON` | One bounded manual request under the existing safety checks. |
| `<id> OFF` | Immediate output revocation and retained suppression. |
| `<id> MAINTENANCE` | Enter maintenance and persist it. |
| `<id> EXIT` | Persist maintenance-clear before exit. |
| `<id> UTC <unix-seconds>` | Anchor a newly acquired UTC observation supplied by the operator. This is not SNTP authentication or automatic synchronization. |
| `<id> CLEAR_UTC` | Invalidate the schedule clock. |
| `<id> CONFIG <hex>` | Decode and save a canonical `CSCF` configuration blob at the next revision. |

IDs are nonzero `u32` correlation values. There is one request slot through final
reply consumption. `ACCEPTED <id>` means queued, not applied or durable.
`REPLY <id> Ok(Applied)` means control handled the request; it does not promise
the relay is on. `REPLY <id> Ok(Durable)` means the matching configuration or
maintenance writes completed. Off receives `Applied`, while its independent
suppression write is reported through `STORAGE <ticket> <result>` and the latest
stored-ticket status. No second durable command reply is promised for Off.
Failures use a typed error, without echoing the command or configuration.

`BUSY <id>` means the slot could not accept the request. Off also sets a reserved
lossless flag before the slot check, so Busy cannot delay a stop. That flag
supersedes a queued On before its control iteration. A Busy Off has no correlated
command acknowledgement; storage status reports eventual suppression independently.
Boot storage failure reports `NOT_READY` and
leaves the output off rather than accepting requests with no control owner.

The parser caps a line at 4,128 bytes and gives the entire line five seconds.
Partial, oversized or timed-out lines drain through newline before a new command
can begin. Parsing buffers are cleared after each line, and neither received
configuration bytes nor stored bytes are logged. Thread-mode reads and writes
have deadlines; Priority3 control and its watchdog service do not wait for USB.
Reply delivery itself is not durable: a disconnected host can miss a response.

## Verification and remaining integrations

Host tests exercise the production coordinator, ingress and parser. They cover
both configuration write failures, power cuts before and after the first record
commit, retry after
an already-durable first record, stale completions, revision mismatch, maintenance
exit and button races, schedule eligibility, Off during persistence, full-slot
Off, manual deadline preservation, sensor revision mismatch, missing calibration,
clock ageing/rollback, late eligibility acknowledgements across expiry, automatic
lease cancellation during configuration saves, USB/physical maintenance and clock
discontinuities, manual preservation during expiry suppression, unchanged caps
during active-window corrections, ticket exhaustion, partial input and oversized
lines. Twenty-nine new focused regressions pass, bringing the host suite to 108 core tests,
nine driver tests and one CLI test. Host fmt/clippy and the actual app's embedded
fmt/clippy/release build pass. Run these through `sh scripts/check.sh`, or the
host workspace directly with `cargo test --manifest-path firmware/Cargo.toml --locked`.
Hardware timing and USB
behavior remain final-board evidence, not host-test results.

Remaining work includes authenticated HTTP adapters and UI, real SNTP acquisition
and joint schedule/TLS clock publication, Matter command/attribute adapters, the
shared Matter KV trait adapter, notification persistence/delivery, settings-token
rotation, and factory reset/recovery when the partition itself cannot be opened.
No notification or network request is added by this unit. Final-board tests must
still measure control execution time, flash/output timing, calibration transitions
and power-cut recovery using the actual storage part.
