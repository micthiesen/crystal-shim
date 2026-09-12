//! Small cross-priority mailboxes. Flash remains exclusively in thread mode.
use core::cell::Cell;
use critical_section::Mutex;
use crystal_shim_core::runtime::{Reply, Request, StoreCompletion, StoreRequest};
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

pub fn submit(source: Source, request: Request) -> Option<Token> {
    ingress(|ingress| ingress.submit_from(source, request))
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
