//! Thread-mode flash exclusion. No waits or ROM calls inside the shared-state lock.
use core::{cell::Cell, hint::spin_loop};
use critical_section::Mutex;
use crystal_shim_core::flash_gate::{FlashGate, Ticket};
use esp_hal::interrupt::RunLevel;

static GATE: Mutex<Cell<FlashGate>> = Mutex::new(Cell::new(FlashGate::new()));

fn update<R>(f: impl FnOnce(&mut FlashGate) -> R) -> R {
    critical_section::with(|cs| {
        let mut gate = GATE.borrow(cs).get();
        let result = f(&mut gate);
        GATE.borrow(cs).set(gate);
        result
    })
}

pub fn observation() -> (bool, Option<Ticket>) {
    update(|gate| (gate.inhibited(), gate.pending()))
}
pub fn acknowledge_off(ticket: Ticket) {
    update(|gate| {
        gate.acknowledge_off(ticket);
    });
}

#[derive(Clone, Copy, Debug)]
pub enum Error {
    WrongContext,
    Busy,
    Timeout,
    Exhausted,
}

/// Exclusive ownership remains live across every chunk in one KV operation.
pub struct Permit {
    ticket: Ticket,
}
impl Permit {
    pub fn acquire() -> Result<Self, Error> {
        if !interruptible_thread() {
            return Err(Error::WrongContext);
        }
        let ticket = update(|gate| gate.request()).map_err(|_| Error::Busy)?;
        let permit = Self { ticket };
        permit.wait()?;
        Ok(permit)
    }
    pub fn checkpoint(&mut self) -> Result<(), Error> {
        if !interruptible_thread() {
            return Err(Error::WrongContext);
        }
        self.ticket = update(|gate| gate.checkpoint(self.ticket)).map_err(|_| Error::Exhausted)?;
        self.wait()
    }
    fn wait(&self) -> Result<(), Error> {
        let started = crate::snapshot::now().0;
        loop {
            if update(|gate| gate.may_access(self.ticket)) {
                return Ok(());
            }
            let now = crate::snapshot::now().0;
            if now < started || now - started >= 100 {
                return Err(Error::Timeout);
            }
            // Synchronous Matter KV callers cannot await a thread-mode task. The
            // Priority3 control executor can preempt this bounded thread-mode wait.
            spin_loop();
        }
    }
}
fn interruptible_thread() -> bool {
    // C6 critical sections clear mstatus.MIE without raising the interrupt
    // threshold read by RunLevel. Both checks are required, including when
    // called from a future Matter `sync-mutex` critical-section backend.
    RunLevel::current().is_thread() && riscv::register::mstatus::read().mie()
}
impl Drop for Permit {
    fn drop(&mut self) {
        update(|gate| {
            gate.release(self.ticket);
        });
    }
}
