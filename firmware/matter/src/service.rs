//! Keep local service alive after any network startup/run result.
use core::future::Future;

/// Network completion never cancels local USB/storage service. Dropping this
/// enclosing future cancels both; the interrupt-owned protection is independent.
pub async fn alongside<L: Future, N: Future>(local: L, network: N) -> (L::Output, N::Output) {
    embassy_futures::join::join(local, network).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use core::{
        cell::Cell,
        future::poll_fn,
        pin::pin,
        task::{Context, Poll, Waker},
    };
    #[test]
    fn startup_error_does_not_cancel_or_stop_polling_local_service() {
        let polls = Cell::new(0);
        let local = poll_fn(|_| {
            polls.set(polls.get() + 1);
            Poll::<()>::Pending
        });
        let mut tasks = pin!(alongside(local, async { Err::<(), _>("startup") }));
        let mut cx = Context::from_waker(Waker::noop());
        assert!(tasks.as_mut().poll(&mut cx).is_pending());
        assert!(tasks.as_mut().poll(&mut cx).is_pending());
        assert_eq!(polls.get(), 2);
    }
    #[test]
    fn enclosing_cancellation_drops_both_owned_services() {
        struct Owned<'a>(&'a Cell<u8>);
        impl Drop for Owned<'_> {
            fn drop(&mut self) {
                self.0.set(self.0.get() + 1);
            }
        }
        let dropped = Cell::new(0);
        let local = Owned(&dropped);
        let net = Owned(&dropped);
        let tasks = alongside(
            async move {
                let _owned = local;
                core::future::pending::<()>().await
            },
            async move {
                let _owned = net;
                core::future::pending::<()>().await
            },
        );
        {
            let mut tasks = pin!(tasks);
            let mut cx = Context::from_waker(Waker::noop());
            assert!(tasks.as_mut().poll(&mut cx).is_pending());
        }
        assert_eq!(dropped.get(), 2);
    }
}
