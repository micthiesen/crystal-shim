use crystal_shim_core::runtime::{Acknowledgement, Error, Reply, Request, RuntimeCommand};
use crystal_shim_core::runtime_ingress::{Ingress, Source, Token};
use crystal_shim_matter::on_off::{BridgeError, Control, OnOff, REPLY_TIMEOUT_MS};
use crystal_shim_matter::sdk::dm::{
    clusters::decl::on_off::{self, AttributeId, ClusterAsyncHandler, CommandId},
    Dataver,
};
use std::{
    cell::{Cell, RefCell},
    future::Future,
    pin::pin,
    task::{Context, Waker},
};

struct Backend {
    ingress: RefCell<Ingress>,
    now: Cell<u64>,
    reported: Cell<bool>,
    applied: Cell<Option<Result<Acknowledgement, Error>>>,
    dispatch: Cell<bool>,
}
impl Backend {
    fn new() -> Self {
        Self {
            ingress: RefCell::new(Ingress::new()),
            now: Cell::new(0),
            reported: Cell::new(false),
            applied: Cell::new(None),
            dispatch: Cell::new(false),
        }
    }
    fn control_tick(&self) {
        let (_, request) = self.ingress.borrow_mut().take();
        if let Some(request) = request {
            if let Some(result) = self.applied.get() {
                // The backend publishes observed GPIO state before completing.
                if result == Ok(Acknowledgement::Applied) {
                    self.reported
                        .set(matches!(request.command, RuntimeCommand::On));
                }
                self.ingress.borrow_mut().complete(Reply {
                    id: request.id,
                    result,
                });
            }
        }
    }
}
impl Control for &Backend {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        self.ingress
            .borrow_mut()
            .submit_from(source, request)
            .ok_or(BridgeError::Busy)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        self.ingress.borrow_mut().take_reply_for(token)
    }
    fn cancel(&self, token: Token) {
        self.ingress.borrow_mut().cancel(token);
    }
    fn reported_on(&self) -> bool {
        self.reported.get()
    }
    fn now_ms(&self) -> u64 {
        self.now.get()
    }
    async fn wait(&self) {
        self.now.set(self.now.get() + 20);
        if self.dispatch.get() {
            self.control_tick();
        }
        embassy_futures::yield_now().await;
    }
}

#[test]
fn handler_advertises_only_bounded_commands_and_reports_observed_state() {
    let backend = Backend::new();
    let handler = OnOff::new(&backend, Dataver::new(3));
    let _actual_generated_adaptor = on_off::HandlerAsyncAdaptor(&handler);
    let cluster = <OnOff<&Backend> as ClusterAsyncHandler>::CLUSTER;
    assert_eq!(cluster.feature_map, 0);
    for id in [CommandId::Off, CommandId::On, CommandId::Toggle] {
        assert!(cluster.command(id as _).is_some());
    }
    for id in [
        CommandId::OffWithEffect,
        CommandId::OnWithTimedOff,
        CommandId::OnWithRecallGlobalScene,
    ] {
        assert!(cluster.command(id as _).is_none());
    }
    assert!(cluster.attribute(AttributeId::StartUpOnOff as _).is_none());
    assert!(cluster.attribute(AttributeId::OnTime as _).is_none());
    assert!(handler.refresh());
    assert!(!handler.reported_on());
    assert!(!handler.refresh());
    let version = handler.dataver();
    backend.reported.set(true);
    assert!(handler.refresh());
    assert!(handler.reported_on());
    assert_ne!(handler.dataver(), version);
}

#[test]
fn success_waits_for_control_application_and_rejection_is_not_acknowledged() {
    let backend = Backend::new();
    let handler = OnOff::new(&backend, Dataver::new(0));
    let mut future = pin!(handler.command(RuntimeCommand::On));
    let mut cx = Context::from_waker(Waker::noop());
    assert!(future.as_mut().poll(&mut cx).is_pending());
    assert!(!handler.reported_on());
    backend.applied.set(Some(Ok(Acknowledgement::Applied)));
    backend.dispatch.set(true);
    assert_eq!(embassy_futures::block_on(future), Ok(()));
    assert!(handler.reported_on());
    backend.applied.set(Some(Err(Error::Busy)));
    assert_eq!(
        embassy_futures::block_on(handler.command(RuntimeCommand::On)),
        Err(BridgeError::Control(Error::Busy))
    );
}

#[test]
fn full_usb_slot_preserves_off_and_dropping_queued_matter_work_releases_its_claim() {
    let backend = Backend::new();
    let handler = OnOff::new(&backend, Dataver::new(0));
    {
        let mut pending = pin!(handler.command(RuntimeCommand::On));
        assert!(pending
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending());
    }
    assert!(backend.ingress.borrow_mut().take().1.is_none());
    let usb = handler
        .begin(
            Source::Usb,
            Request {
                id: 1,
                command: RuntimeCommand::On,
            },
        )
        .unwrap();
    backend.reported.set(true);
    backend.applied.set(Some(Ok(Acknowledgement::Applied)));
    backend.dispatch.set(true);
    assert_eq!(
        embassy_futures::block_on(handler.command(RuntimeCommand::Off)),
        Ok(())
    );
    assert!(!handler.reported_on());
    assert_eq!(
        backend.ingress.borrow_mut().take_reply_for(usb).unwrap(),
        Reply {
            id: 1,
            result: Err(Error::Superseded),
        }
    );
    assert!(backend.ingress.borrow_mut().take().1.is_none());
}

#[test]
fn timeout_cancels_queued_work_and_never_reuses_its_claim() {
    let backend = Backend::new();
    let handler = OnOff::new(&backend, Dataver::new(0));
    assert_eq!(
        embassy_futures::block_on(handler.command(RuntimeCommand::On)),
        Err(BridgeError::Timeout)
    );
    assert!(backend.now.get() >= REPLY_TIMEOUT_MS);
    assert!(backend.ingress.borrow_mut().take().1.is_none());
    assert!(handler
        .begin(
            Source::Usb,
            Request {
                id: 1,
                command: RuntimeCommand::On
            }
        )
        .is_ok());
}

#[test]
fn abandoned_dispatched_command_keeps_ownership_until_its_late_completion() {
    let backend = Backend::new();
    let handler = OnOff::new(&backend, Dataver::new(0));
    let dispatched;
    {
        let mut pending = pin!(handler.command(RuntimeCommand::On));
        assert!(pending
            .as_mut()
            .poll(&mut Context::from_waker(Waker::noop()))
            .is_pending());
        dispatched = backend.ingress.borrow_mut().take().1.unwrap();
    }
    assert_eq!(
        handler.begin(
            Source::Usb,
            Request {
                id: 1,
                command: RuntimeCommand::On
            }
        ),
        Err(BridgeError::Busy)
    );
    backend.reported.set(true);
    backend.ingress.borrow_mut().complete(Reply {
        id: dispatched.id,
        result: Ok(Acknowledgement::Applied),
    });
    assert!(handler.reported_on()); // Cancelling the caller does not undo applied GPIO.
    let next = handler
        .begin(
            Source::Usb,
            Request {
                id: 1,
                command: RuntimeCommand::Off,
            },
        )
        .unwrap();
    let new_request = backend.ingress.borrow_mut().take().1.unwrap();
    assert_ne!(new_request.id, dispatched.id);
    backend.ingress.borrow_mut().complete(Reply {
        id: dispatched.id,
        result: Ok(Acknowledgement::Applied),
    });
    assert!(backend.ingress.borrow_mut().take_reply_for(next).is_none());
}

#[test]
fn pending_command_expires_at_boundary_or_monotonic_rollback() {
    for observed in [100 + REPLY_TIMEOUT_MS, 99] {
        let backend = Backend::new();
        backend.now.set(100);
        let handler = OnOff::new(&backend, Dataver::new(0));
        let mut pending = pin!(handler.command(RuntimeCommand::On));
        let mut context = Context::from_waker(Waker::noop());
        assert!(pending.as_mut().poll(&mut context).is_pending());
        backend.now.set(observed);
        assert_eq!(
            pending.as_mut().poll(&mut context),
            core::task::Poll::Ready(Err(BridgeError::Timeout))
        );
        assert!(backend.ingress.borrow_mut().take().1.is_none());
    }
}
