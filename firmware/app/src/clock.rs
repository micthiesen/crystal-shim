//! Control owns trust acceptance; the thread-mode CASE task only offers observations.
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::utc::{Attempt, ClockMailbox, ClockUpdate, ReadResult, UtcObservation};
use crystal_shim_matter::{
    sdk::{crypto::Crypto, Matter},
    time_source::{self, SourceId},
};
use embassy_futures::select::select;
use embassy_time::Timer;

static MAILBOX: Mutex<Cell<ClockMailbox<SourceId>>> = Mutex::new(Cell::new(ClockMailbox::new()));
static PUBLISHED: Mutex<Cell<Option<UtcObservation>>> = Mutex::new(Cell::new(None));

fn mailbox<R>(f: impl FnOnce(&mut ClockMailbox<SourceId>) -> R) -> R {
    critical_section::with(|cs| {
        let mut value = MAILBOX.borrow(cs).get();
        let result = f(&mut value);
        MAILBOX.borrow(cs).set(value);
        result
    })
}
pub fn operator_command() {
    mailbox(ClockMailbox::operator_command);
}
/// Called before the sole Store attempts a source-policy mutation. A failed
/// persistence attempt also invalidates old work because SDK RAM changed first.
pub fn source_changed() {
    mailbox(ClockMailbox::source_changed);
}
pub fn take_update() -> ClockUpdate {
    mailbox(ClockMailbox::take)
}

/// Called only by control after runtime accepted the original capture. Repeated
/// ticks do not republish it or renew a TLS clock invalidated between ticks.
pub fn publish(sample: Option<UtcObservation>) {
    critical_section::with(|cs| {
        if PUBLISHED.borrow(cs).get() != sample {
            match sample {
                Some(sample) => crystal_shim_tls::set_trusted_observation(sample),
                None => crystal_shim_tls::clear_trusted_utc(),
            }
            PUBLISHED.borrow(cs).set(sample);
        }
    });
}

struct Session;
impl Drop for Session {
    fn drop(&mut self) {
        // Returning/cancelling the network service withdraws only network time;
        // an independently accepted operator clock remains valid until its expiry.
        mailbox(|mailbox| mailbox.set_source(None));
    }
}

/// Source administration is observed during CASE awaits as well as between reads.
/// Reads reuse Matter's exchange/UDP owner and never update or persist SDK RTC.
pub async fn run<C: Crypto>(matter: &Matter<'_>, crypto: C) {
    let _session = Session;
    let monitor = async {
        loop {
            let source = time_source::configured_source(matter);
            mailbox(|mailbox| mailbox.set_source(source));
            Timer::after_millis(100).await;
        }
    };
    let reader = async {
        let mut last_source = None;
        let mut next_read = 0;
        let mut retry_read = 0;
        loop {
            let source = time_source::configured_source(matter);
            mailbox(|mailbox| mailbox.set_source(source));
            let now = crate::snapshot::now();
            if source != last_source {
                next_read = now.0;
                last_source = source;
            }
            if now.0 >= next_read || (now.0 >= retry_read && !crystal_shim_tls::has_trusted_utc()) {
                if let Some(source) = source {
                    if let Some(attempt) = mailbox(|mailbox| mailbox.begin()) {
                        let accepted = acquire(matter, &crypto, source, attempt).await;
                        let finished_at = crate::snapshot::now().0;
                        retry_read = finished_at.saturating_add(60 * 1_000);
                        next_read = finished_at.saturating_add(if accepted {
                            30 * 60 * 1_000
                        } else {
                            60 * 1_000
                        });
                    }
                }
            }
            Timer::after_secs(1).await;
        }
    };
    select(monitor, reader).await;
}

async fn acquire<C: Crypto>(
    matter: &Matter<'_>,
    crypto: C,
    source: SourceId,
    attempt: Attempt<SourceId>,
) -> bool {
    // Both bounds use post-completion monotonic checks, not timer poll order.
    let started_at = crate::snapshot::now().0;
    let result = time_source::with_deadline(
        time_source::read_utc_micros(
            matter,
            crypto,
            source,
            || Timer::after_millis(time_source::READ_DEADLINE_MS),
            || crate::snapshot::now().0,
        ),
        Timer::after_millis(time_source::TOTAL_DEADLINE_MS),
        started_at,
        time_source::TOTAL_DEADLINE_MS,
        || crate::snapshot::now().0,
    )
    .await;
    let now = crate::snapshot::now();
    let current_source = time_source::configured_source(matter);
    mailbox(|mailbox| {
        mailbox.set_source(current_source);
        let result = match result {
            Ok(time_source::UtcRead {
                matter_micros: Some(matter_micros),
                captured_at_ms,
            }) => ReadResult::Fresh {
                matter_micros,
                captured_at: crystal_shim_core::Millis(captured_at_ms),
            },
            Ok(time_source::UtcRead {
                matter_micros: None,
                ..
            }) => ReadResult::Unavailable,
            Err(error)
                if error.code() == crystal_shim_matter::sdk::error::ErrorCode::InvalidData =>
            {
                ReadResult::Unavailable
            }
            // A transport error supplies no new evidence and preserves old age.
            _ => ReadResult::TransportFailure,
        };
        mailbox.finish(attempt, result, now)
    })
}
