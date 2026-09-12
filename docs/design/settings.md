# Local settings service

The actual ESP application runs the settings server in `app/src/settings.rs`
alongside CASE clock acquisition and TLS readiness in the existing Matter
`UserTask`. It uses the shared network stack, one outstanding IPv4 port-80
connection and fixed buffers. The other TCP buffer remains available for a TLS
client. Interface changes cancel the current request and rebind. Startup, client
and network errors stay inside this service; USB, storage and local control do
not await it. The USB diagnostic includes `settings_ip` for discovery.

The `no_std` [settings crate](../../firmware/settings/src/lib.rs) owns framing,
authentication, fixed-capacity forms, redacted views and ticketed commands. The
application supplies time, snapshots and the existing ingress. No HTTP path opens
flash, feeds the watchdog or drives the relay directly.

## Access and behavior

Serve the page at `http://<settings_ip>/` on the trusted local LAN. HTTP is not
encrypted: the page describes that constraint before token entry. Static HTML,
JavaScript and CSS are public; every API requires the 32-byte settings token as
64 hexadecimal characters in an Authorization bearer header. Tokens are never
accepted from URLs or embedded in assets. The page retains its token in memory
only, clears it on lock/leave, disables entry until initialization completes,
and uses no third-party assets, cookies or browser persistence.

The physical USB commands are `<id> SETTINGS_TOKEN` and
`<id> SETTINGS_TOKEN_ROTATE <64 hex characters>`. Rotation requires a new nonzero
caller-generated random token and the normal next-revision CONFIG transaction.
It enters maintenance and needs a durable acknowledgment. The caller supplies
cryptographic randomness; an arbitrary hex string is not evidence of entropy.
Rotation cannot be invoked by HTTP. The first valid configuration and private
Matter identity still arrive through USB provisioning; the host configuration
encoder remains separate work.

The page edits stop/restart thresholds, shared run duration, POSIX timezone,
up to 16 schedule starts and Pushover credential keep/clear/replace actions.
Existing secrets are never returned or prefilled. Threshold units are calibrated
thousandths of the sensing range. Existing calibration, timing and sample-age
settings are preserved by this form; physical calibration remains separate.
The browser does not reinterpret starts in its own timezone.

Saving stops the current run and enters maintenance. Success requires the
matching durable configuration acknowledgment. Maintenance exit is an explicit
separate action with its own durable acknowledgment. Off uses the reserved
runtime Off path and its applied acknowledgment. HTTP serves one connection at a
time, so the page disables Off during an active request. After that request
settles, Off is available even when an ambiguous write still requires a refetch
before further edits. It cannot bypass the active HTTP connection. The page does
not expose an unbounded On operation. HomeKit retains its timed override contract.

| Route | Contract |
| --- | --- |
| GET `/api/config` | Current durable revision, editable values, calibration/credential presence; no secrets |
| GET `/api/status` | Relay command, maintenance, storage fault, clock availability and control state |
| POST `/api/config` | Strict URL-encoded form based on current revision; next revision through the sole storage owner |
| POST `/api/maintenance` | Enter persistent maintenance |
| POST `/api/exit` | Explicit exit from maintenance |
| POST `/api/off` | Apply reserved Off request |

All mutations carry the expected revision. Token, revision and provisioning
reservation are checked again atomically at actual command admission, after
request I/O. Only Off can pass an active provisioning reservation. A queued
cancellation removes that request; an already dispatched operation may still
finish through its sole owner. Timeout or lost reply therefore means unknown
outcome, never rollback. The page refetches before further edits and does not
automatically repeat a mutation. A committed configuration stays inhibited until
an explicit maintenance exit.

## Framing and deadlines

Pinned `edge-http = 0.8.0` uses only its `io` feature. Its server constructor can
panic while resolving an invalid Content-Length, so the public raw-header parser
first receives exactly through the header terminator, without consuming body
bytes. Policy validates framing and initial authorization, then immutable header
bytes replay once into the ordinary `Connection`. The crate is not patched.

Limits are 2048 header bytes, 24 header slots, 2048 body bytes and one request
per connection. Reject duplicate policy headers, malformed/duplicate lengths,
transfer/content encodings, upgrades, Expect, unsupported routes and oversized
bodies. Require the exact device IPv4 Host, same-origin mutations and no cross-site
fetch metadata. A missing Origin on a mutation is rejected. No CORS, redirects,
pipelining, keepalive reuse or body draining follows invalid framing. Pre-admission
error responses, including malformed framing and missing Origin, use JSON with
`unknown_outcome: false`; they do not imply a command was accepted. An admitted
operation with an unknown result keeps `unknown_outcome: true`. If cancellation
or a transport failure prevents a usable response, the browser conservatively
treats a mutation's outcome as unknown.

The original request limit is 10 seconds, with 2 seconds for headers, 2 seconds
for the body and 500 ms per I/O. Command admission/reply waiting stops at 9 seconds
to reserve response time. Ready-first completion, clock rollback and exact
expiry fail closed; trickle bytes do not renew the original limit. Cancellation
wipes request/response buffers and abandons only the matching reply claim.
Responses carry no-store, no-referrer, nosniff and restrictive CSP headers.

## Verification and remaining evidence

Host tests use the production parser, authorization/admission helper, runtime,
ingress and storage acknowledgments. They cover invalid framing before the SDK
constructor, revisions/token changes during I/O, provisioning reservation,
correlated durable replies, cancellation, original deadlines and secret-buffer
cleanup. Node tests exercise the actual browser module's forms, revisions,
unknown outcomes, secret handling and initialization. Resolved-feature guards
check the app and host manifests and Cargo graph.

The actual C6 release contains all three static assets. A real Brave browser
check at a compact approximately 500-pixel window loaded those exact assets
against a loopback synthetic backend, edited duration 900 to 600, observed revision
7 to 8, required refetch, performed a separate maintenance exit and locked again.
Status, schedule and save layouts were inspected. Request evidence is in
`/tmp/crystal-shim-settings-browser`; that disposable fixture and browser tab were
closed afterward. This validates browser behavior, not the ESP network adapter.
Host checks and a linked image do not prove browser-to-device operation, RAM margin under simultaneous
Matter/TLS load, physical USB, final-unit control latency or network isolation.
Independent review confirmed the corrected serial-request and preflight-error
contracts. Separate Off acknowledgement re-review is also clean; final-board commissioning
remains required. Pushover credential storage does not mean the notification
worker is running.

`sh scripts/check.sh` includes the Rust tests, Node UI tests, feature guard,
embedded build and the existing project checks. The UI can be exercised with
synthetic local fixtures without provisioning or contacting the real device.
