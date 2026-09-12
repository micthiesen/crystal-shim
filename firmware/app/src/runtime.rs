//! Small cross-priority mailboxes. Flash remains exclusively in thread mode.
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::runtime::{Reply, Request, RuntimeCommand, StoreCompletion, StoreRequest};
use crystal_shim_core::runtime_ingress::{Ingress, Source, Token};

static INGRESS: Mutex<Cell<Ingress>> = Mutex::new(Cell::new(Ingress::new()));
static WRITE: Mutex<Cell<Option<StoreRequest>>> = Mutex::new(Cell::new(None));
static COMPLETION: Mutex<Cell<Option<StoreCompletion>>> = Mutex::new(Cell::new(None));
static LAST_STORED: Mutex<Cell<Option<StoreCompletion>>> = Mutex::new(Cell::new(None));

fn ingress<R>(f: impl FnOnce(&mut Ingress) -> R) -> R {
    critical_section::with(|cs| {
        let mut value = INGRESS.borrow(cs).get();
        let result = f(&mut value);
        INGRESS.borrow(cs).set(value);
        result
    })
}

pub fn submit(source: Source, mut request: Request) -> Option<Token> {
    // The stamp and command admission share one critical section with generation
    // invalidation: older network work cannot race an accepted operator command.
    critical_section::with(|_| {
        let clock_command = matches!(
            request.command,
            RuntimeCommand::SetUtc(_)
                | RuntimeCommand::SetUtcObserved(_)
                | RuntimeCommand::ClearUtc
        );
        if let RuntimeCommand::SetUtc(utc) = request.command {
            request.command = match crystal_shim_core::utc::UtcObservation::from_seconds(
                utc,
                crate::snapshot::now(),
            ) {
                Some(sample) => RuntimeCommand::SetUtcObserved(sample),
                // Preserve an invalid capture as unrepresentable UTC. A timer
                // recovery before dispatch must not manufacture a fresh stamp.
                None => RuntimeCommand::SetUtc(crystal_shim_core::UtcSeconds(u64::MAX)),
            };
        }
        let token = ingress(|ingress| ingress.submit_from(source, request));
        if token.is_some() && clock_command {
            crate::clock::operator_command();
        }
        token
    })
}
pub fn reply(token: Token) -> Option<Reply> {
    ingress(|ingress| ingress.take_reply_for(token))
}
pub fn cancel(token: Token) {
    ingress(|ingress| ingress.cancel(token));
}
pub fn take() -> (bool, Option<Request>) {
    ingress(Ingress::take)
}
pub fn complete(reply: Reply) {
    ingress(|ingress| ingress.complete(reply));
}
pub fn take_reply() -> Option<Reply> {
    ingress(Ingress::take_reply)
}
pub fn publish_write(write: Option<StoreRequest>) {
    critical_section::with(|cs| WRITE.borrow(cs).set(write));
}
pub fn write_request() -> Option<StoreRequest> {
    critical_section::with(|cs| WRITE.borrow(cs).get())
}
pub fn store_completed(completion: StoreCompletion) {
    critical_section::with(|cs| {
        COMPLETION.borrow(cs).set(Some(completion));
        LAST_STORED.borrow(cs).set(Some(completion));
    });
}
pub fn take_completion() -> Option<StoreCompletion> {
    critical_section::with(|cs| COMPLETION.borrow(cs).take())
}
pub fn last_stored() -> Option<StoreCompletion> {
    critical_section::with(|cs| LAST_STORED.borrow(cs).get())
}

pub fn reserve_provisioning(active: bool) {
    ingress(|ingress| ingress.reserve_provisioning(active));
}

pub fn settings_view(
    bearer: &crystal_shim_settings::Bearer,
) -> Result<crystal_shim_settings::Snapshot, crystal_shim_settings::Error> {
    critical_section::with(|_| {
        let view = crate::snapshot::settings().ok_or(crystal_shim_settings::Error::NotReady)?;
        crystal_shim_settings::authorize(Some(view.configuration), bearer, None)?;
        Ok(view)
    })
}

pub fn submit_settings(
    bearer: &crystal_shim_settings::Bearer,
    revision: u32,
    command: RuntimeCommand,
) -> Result<Token, crystal_shim_settings::Error> {
    use crystal_shim_settings::Error;
    critical_section::with(|_| {
        let view = crate::snapshot::settings().ok_or(Error::NotReady)?;
        ingress(|ingress| {
            crystal_shim_settings::admit(
                ingress,
                Some(view.configuration),
                bearer,
                revision,
                command,
            )
        })
    })
}
