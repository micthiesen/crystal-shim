# Firmware behavior

Owner-confirmed behavior, 2026-09-11: scheduled runs, automatic low-water stop and
restart when allowed, plus temporary HomeKit overrides. **Every run is bounded.**
HomeKit uses Stillair's Matter-over-Wi-Fi approach, presented as a switch.

| Condition | Required behavior |
| --- | --- |
| Boot/reset/brownout recovery | Relay off; do not restore an unfinished manual override |
| Scheduled window, enough water | Automatic run only after stable recovery and minimum off period; stop at window end |
| Scheduled run, below stop threshold | Off after low confirmation; recovery may resume only the remainder of that window |
| HomeKit Off | Stop and cancel manual demand; suppress automatic restart for the rest of the current scheduled window |
| HomeKit On outside a window or at a valid low level | Timed manual override, allowed to bypass the low-level threshold |
| Run duration expires | Off; no automatic renewal from a held switch, repeated On command, or overlapping window |
| Disconnected/stale/invalid/outside calibration | Immediately off and report fault |
| Network/Wi-Fi failure | Local control continues independently |
| Maintenance | Force off; explicit exit required |

The common scheduled/override duration starts at **15 minutes (900 s)**. Run a few
scheduled windows each day; exact times, count and timezone are still open, so the
scaffold must not invent a daily schedule. Duration, schedule, stop/restart
thresholds, freshness limits and debounce/recovery/off timings must be configurable
through firmware. The override uses the same configured duration as a scheduled run.

Other tuning seeds remain **1 s** low confirmation, **10 s** stable recovery and
**30 s** minimum off. These are provisional, not OASE requirements or measured safe
limits. Stop/restart thresholds, sample age, acquisition period and calibration
bounds require sensor measurements. Restart threshold must exceed stop threshold.

Use continuous dwell periods, not accumulated scattered samples. Invalid input
preempts debounce and clears recovery. Minimum off applies from boot and each
on-to-off transition. Changes within the hysteresis band do not start an off
controller or trip a running one unless the low dwell requirement is met.
Ordinary network requests cannot bypass these interlocks. The explicit manual
override is the sole exception for a **valid low-water level**, not for an
untrustworthy sensor, calibration fault or maintenance state.

## Run windows and HomeKit

Scheduled windows have an original start/end and stable identity. A late start or
recovery after low water gets only the remaining window, never a fresh full period.
HomeKit Off suppresses that window until its original end, even if the water
recovers. The next distinct scheduled window can run normally. Outside a window,
Off cancels any override without cancelling future schedule entries.
The eventual app must retain current-window Off suppression across reset until
that original window ends. Losing the suppression record must not silently
restart a window the user cancelled.

HomeKit On requests a finite override even outside a scheduled window or while the
water is validly below the automatic stop threshold. It does not latch permanent
power. Repeated On while already active does not move the deadline; switching
from automatic to override mode must not reset an active run's cap. Config edits
cannot lengthen an active run. Adjacent/overlapping schedule entries cannot keep
the relay continuously on by repeatedly renewing its deadline. A new explicit
request after a completed/stopped run is a new bounded run and still obeys the
minimum off period.

The scaffold measures an override's deadline from the accepted request time.
Waiting for minimum off consumes part of that allowance; it does not queue a
fresh 15 minutes for later. Duration edits may shorten an active request but
cannot extend it. Final commissioning should retain this visible, bounded behavior.

Invalid/stale sensor input, maintenance and reset cancel a manual override rather
than leaving a surprise queued restart. Minimum off remains applicable to manual
requests. The app must report actual relay command as the HomeKit switch state,
including automatic starts and timed/fault stops; HomeKit's last requested value
is not the truth. This switch state is advisory about commanded power, not feedback
that proves relay contacts moved. Diagnostics distinguish scheduled, overridden,
suppressed, low, fault and maintenance conditions and show the remaining duration.

Use `rs-matter` + `rs-matter-embassy` over Wi-Fi as in Stillair for Apple Home
integration; local control and HomeKit do not require a cloud service. Keep schedule execution, level
control and monotonic run deadlines local when Wi-Fi fails. If wall-clock time is
unknown, do not start a scheduled window; a received explicit override uses the
monotonic duration. The app must define timezone/DST, clock-correction and duplicate
window handling before commissioning so time changes cannot extend an active run.

## Water-change notifications

Send a **Pushover notification on confirmed high-to-low and low-to-high water
transitions**, whether the pump is scheduled, overridden, suppressed or idle.
These are water-state events, not relay events. Use the same calibrated hysteresis
and confirmation periods as water control so noise near a threshold does not
generate repeated alerts. The first confirmed valid state establishes a silent
baseline. Intermediate-band readings preserve the prior classification; sensor
faults do not pretend that the water changed. After valid readings resume, emit a
transition only if a different water state is confirmed.

Use normal-priority messages such as `Crystal Shim: water level is low` and
`Crystal Shim: water level is high again`, with event time and useful current
status. No emergency/repeating alarm is requested. Emit one logical event per
transition; maintain delivery state separately from water classification. The
network adapter must use bounded retries/queueing, avoid resending acknowledged
events, record failures and keep control timing independent of HTTP or Wi-Fi.
Do not claim exactly-once remote delivery after an ambiguous network timeout.

Pushover requires an application token and recipient user/group key. Provision
them outside tracked source and avoid exposing them in logs or HomeKit attributes.
Use verified HTTPS to the Message API; delivery needs internet, but its failure
must never delay a local stop or extend a run. See [Pushover API](https://pushover.net/api).
The initial scaffold has no live sender or credentials. Persistence and offline
queue policy remain app work; a reboot establishes a fresh baseline unless a
validated persisted classification is restored.

## Implementation boundary

`firmware/core/` contains a `no_std`, host-tested control model with injected time,
calibrated integer level input and explicit validity. `firmware/cli/` demonstrates
the model using synthetic readings. `firmware/app/` is a separate ESP32-C6 build,
initially inert with no GPIO binding. See [firmware commands](../firmware/README.md).

The model does not measure capacitance, validate an aquarium, or establish physical
relay state. An eventual FDC1004 adapter must reject invalid channel/reference
data and provide a timestamp for the complete fresh measurement set. Stored or
repeated samples cannot qualify recovery by themselves. Hardware initialization
must hold the relay off before sensor, USB or network setup.

Maintenance must not silently clear through reset. Implement retained maintenance
state, a maintained physical input, or equivalent explicit recovery policy before
hardware commissioning. The initial in-memory model alone does not provide this
persistence. On exiting maintenance, require fresh recovery and the off delay.

## Diagnostics and resilience

Retain raw level/wet/dry capacitances, calculated level, sensor validity and fault
reason, sample age, calibration revision, relay command, state/timer status and
reset reason. Raw capacitance conversion, calibration storage, USB protocol,
watchdog integration, wall-clock scheduling and the Matter adapter are implementation
work, not connected features claimed by the scaffold. The network technology is
selected; pairing, Pushover sending and their credentials/storage are not implemented yet.

Use hardware gate pulldown and watchdog recovery so reset removes relay drive.
Verify bootloader/flashing, brownout and unpowered GPIO behavior on the real board.
The command is not feedback: welded relay contacts may leave the pump powered
despite an off command. No contact-weld detection is currently specified.

Acceptance includes window expiry, HomeKit Off suppression, bounded valid-low
override, repeated On, configuration/time changes, threshold chatter, interrupted
recovery, unplugged/stuck I2C, stale data, reference failure, lost calibration,
reset, maintenance and Wi-Fi loss.
Also verify both Pushover water transitions, suppression of duplicate alerts, and
continued local control during API failure or an offline interval.
Host tests validate logic; the [commissioning matrix](../testing/test-matrix.csv)
tracks the physical behavior still owed.
