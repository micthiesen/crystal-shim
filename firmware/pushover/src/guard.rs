//! One immutable operation deadline, including immediately-ready completions.
use core::{
    cell::Cell,
    future::{poll_fn, Future},
    pin::pin,
    task::Poll,
};
use embassy_futures::select::{select, Either};

pub const ATTEMPT_MS: u64 = 20_000;
pub const WAKE_MS: u64 = 20;

pub trait Guard {
    fn now_ms(&self) -> u64;
    /// Includes the current configuration/queue token and the caller's TLS lease.
    fn valid(&self) -> bool;
    /// Must wake at least every WAKE_MS, even when network I/O remains Pending.
    fn wait(&self) -> impl Future<Output = ()>;
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GuardError {
    Cancelled,
    Timeout,
    ClockRollback,
    InvalidDeadline,
}

/// Reusable for DNS, TCP, explicit TLS handshake and HTTP. Dropping this future
/// cancels the borrowed operation; the caller must then drop its socket/session.
pub async fn within<H: Guard, F: Future>(
    host: &H,
    started_at_ms: u64,
    deadline_ms: u64,
    future: F,
) -> Result<F::Output, GuardError> {
    if deadline_ms
        .checked_sub(started_at_ms)
        .is_none_or(|duration| duration == 0 || duration > ATTEMPT_MS)
    {
        return Err(GuardError::InvalidDeadline);
    }
    let last = Cell::new(started_at_ms);
    let check = || {
        let now = host.now_ms();
        if now < last.get() {
            return Err(GuardError::ClockRollback);
        }
        last.set(now);
        if now >= deadline_ms {
            return Err(GuardError::Timeout);
        }
        if !host.valid() {
            return Err(GuardError::Cancelled);
        }
        Ok(())
    };
    check()?;
    let mut future = pin!(future);
    let operation = poll_fn(|cx| {
        if let Err(error) = check() {
            return Poll::Ready(Err(error));
        }
        let result = future.as_mut().poll(cx);
        if let Err(error) = check() {
            return Poll::Ready(Err(error));
        }
        result.map(Ok)
    });
    let monitor = async {
        loop {
            host.wait().await;
            if let Err(error) = check() {
                return error;
            }
        }
    };
    match select(operation, monitor).await {
        Either::First(result) => result,
        Either::Second(error) => Err(error),
    }
}
