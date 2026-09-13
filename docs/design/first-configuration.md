# First configuration through USB

`matter-provision` can create and validate a private first-configuration record
offline, then send it through the existing physical USB CONFIG command. It uses
the production [configuration codec](configuration.md), runtime transaction and
single gated flash owner. It does not write a partition image or require network
credentials. Physical USB and flash behavior remain final-board commissioning work.

The bootstrap profile is revision 1, with a fresh random settings token and no
calibration, schedule entries or Pushover credentials. Missing calibration keeps
sensor readings invalid and the relay off. A successful configuration save ends
in durable maintenance. This workflow does not supply measured calibration,
current UTC, a Matter identity, an operating schedule or maintenance exit.

## Create and inspect offline

Build from the repository root:

```sh
cargo build --locked --manifest-path firmware/Cargo.toml -p crystal-shim-matter --bin matter-provision
```

Prepare a UTF-8 `key=value` parameter file outside the repository. The file is
bounded to 2048 bytes. Unknown, duplicate, empty and whitespace-containing fields
are rejected. Numbers are unsigned decimal integers with checked conversion.

| Required field | Meaning |
| --- | --- |
| `stop_level` | Explicit 0..1000 calibrated-domain threshold |
| `restart_level` | Explicit threshold greater than stop, at most 1000 |
| `max_sample_age_ms` | Explicit positive whole milliseconds, up to u64 maximum |
| `timezone_rule` | Explicit ASCII POSIX timezone rule, at most 128 bytes |

There are no default thresholds or sample freshness. Values in the level domain
are thousandths of the sensing range, not millimetres. Choose and validate actual
settings during final-board commissioning; the encoder does not measure them.

Optional `run_duration_seconds` defaults to 900 and permits 1..86400 seconds.
Optional `low_confirmation_ms`, `recovery_ms` and `minimum_off_ms` default to
`Timing::PROVISIONAL`: 1000, 10000 and 30000 ms. Each accepts a positive u64.
Those defaults are design starting values, not measured pump performance.

This is a synthetic example for offline checks, not recommended operating values:

```text
stop_level=200
restart_level=800
max_sample_age_ms=500
timezone_rule=UTC0
```

Use explicit local paths; the output directory must not already exist:

```sh
firmware/target/debug/matter-provision config-create \
  --parameters /private/path/bootstrap.txt \
  --out /private/path/NEW-config-directory

firmware/target/debug/matter-provision config-validate \
  --record /private/path/NEW-config-directory/record.bin
```

Creation uses OpenSSL's random source for the 32-byte token, rejects an all-zero
result and validates through the production builder, encoder and decoder. It
creates a 0700 directory outside Git working trees and 0600 files:

* `record.bin`: canonical CSCF format 2, containing the private settings token.
* `settings-token.txt`: the token as 64 hex characters, for the settings page.
* `parameters.txt`: the resolved input values, including provisional defaults.
* `validation.txt`: format/profile and unverified physical-validation status.

The final record is published only after validation and the other files complete,
using an exclusive temporary file and no-overwrite publication. Interrupted
creation can leave an incomplete private directory; it is not a successful record
generation. Retain successful private files outside source control. Record and
token bytes are never printed or accepted as CLI arguments. Regular-file,
size, no-follow and private-permission checks precede record use; FIFOs are
rejected before opening. `config-validate` requires the same restricted bootstrap
profile. A calibrated configuration or Matter identity is not a bootstrap record.

## Explicit USB send

Close terminal programs using the device. Select its physical USB Serial/JTAG
character device explicitly, using an absolute path:

```sh
firmware/target/debug/matter-provision config-send \
  --record /private/path/NEW-config-directory/record.bin \
  --serial /absolute/device
```

The sender loads and validates the exact private bytes before inspecting or
opening the port. It reuses the exclusive no-echo/raw serial transport from the
[Matter provisioning tool](matter-provisioning.md). It does not discover ports,
toggle reset or modem signals, send a break, or open a network connection.
No token, UTC, calibration or identity is generated during sending.

One fresh random nonzero u32 ID correlates one `<id> CONFIG <hex>` command.
There is no automatic repeat, revision increment, force/erase, Off, maintenance
exit or reboot. The initial record is 92 plus timezone-length bytes, at most 220;
the command fits within 459 ASCII bytes including a ten-digit ID and newline.
The device's existing line limit is 4128 bytes with five original seconds. The
host allows one second for writing and ten seconds total from before the write;
these bounds do not promise a maximum flash commit time. Replies are capped at
1024 bytes. Traffic and partial input never renew the original deadline. Elapsed
time is checked after I/O too, and backwards time or exact expiry fails closed.

The device requires exactly the next configuration revision, so a healthy empty
store accepts revision 1 and a configured device rejects it. CONFIG itself enters
maintenance and cancels active leases. It stores the new retained maintenance
record first, then the configuration, and publishes only after both matching
storage completions. An unconfigured MAINTENANCE command alone cannot provide
this durable prerequisite for Matter provisioning. Boot storage failure rejects
administration with `NOT_READY`; the host never repairs or erases that storage.

Only the matching `REPLY <id> Ok(Durable)` reports success. `ACCEPTED` means queued;
`Ok(Applied)`, `STORAGE` diagnostics and revision status are not configuration
receipts. An omitted ACCEPTED does not invalidate a matching final durable reply.
Malformed matching replies, including invalid UTF-8 and overlong payloads, cannot
be discarded in favor of a later success. Unrelated diagnostics and other IDs are
discarded without logging. The physical USB channel is trusted: correlation IDs
are not authentication, and the ordinary reply does not include a device identity,
record digest or boot nonce.

Busy, NotReady and typed control rejections are reported without retry. Storage
and exhaustion errors, disconnection, failed writes, missing final replies and
timeouts report an uncertain outcome. Even a failed write can mean its terminating
newline reached the device. No cleanup command is appended to uncertain framing.
The retained maintenance write or complete configuration may already be durable.

CONFIG has no content readback or idempotent AlreadyPresent receipt. Repeating
revision 1 after a lost success may return Revision, which does not prove the
installed bytes match. Do not infer rollback, generate a replacement token or
advance revisions to resolve this. Inspection and deliberate recovery are separate
actions. Revision diagnostics and token retrieval alone are not complete record
readback. The Matter identity sender's verified identical-record retry contract
does not apply to CONFIG.

After confirmed configuration durability, use the separate explicit Matter
identity provisioning workflow. That writer obtains its own durable maintenance
and relay-low acknowledgment. Once networking is commissioned, the
[settings page](settings.md) can edit timings, thresholds and schedules using the
saved token. Rotation invalidates the host's old token; the existing explicit USB
`SETTINGS_TOKEN` command retrieves the current one. Measured calibration remains a
separate workflow, and automatic schedules still require usable authenticated UTC.
Maintenance exit is always an explicit separate operation.

## Verification and limits

Tests exercise the production codec, Receiver, Ingress and Runtime, including
both storage failures, first-record-only completion, reserved Off, provisioning
reservation, existing revision rejection and lost durable replies. Deterministic
fake streams cover malformed/misattributed replies, overflow, partial I/O, fixed
deadlines, exact expiry and rollback without sleeps. CLI tests create only their
own pseudo terminals and verify exact prevalidated bytes, fragmented replies,
file replacement after loading, private permissions, no echoed credentials and
rejection before terminal changes. Existing identity sender tests remain required.

Private host byte buffers are wiped on return. The shared core uses Copy values
and fixed encoding buffers without a guaranteed wipe, so this does not promise
complete process-memory erasure. No secret-bearing logs or transcripts are made.
Host tests do not prove physical USB, actual flash/power-cut timing, calibrated
sensor behavior, browser-to-device operation or final Matter pairing.

Run the focused checks from the repository root:

```sh
cargo fmt --manifest-path firmware/Cargo.toml --all -- --check
cargo clippy --locked --manifest-path firmware/Cargo.toml -p crystal-shim-matter --all-targets -- -D warnings
cargo test --locked --manifest-path firmware/Cargo.toml -p crystal-shim-matter --bin matter-provision --test configuration_tool --test provision_tool
```

The complete project gate remains `sh scripts/check.sh`. This host-only addition
changes no embedded source, dependencies or storage contract.
