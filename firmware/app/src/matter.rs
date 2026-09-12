//! Live command/KV integration only. This build has no radio or commissioned node.
use crystal_shim_core::runtime::{Reply, Request};
use crystal_shim_core::runtime_ingress::{Source, Token};
use crystal_shim_core::RelayCommand;
use crystal_shim_matter::on_off::{BridgeError, Control, OnOff};
use crystal_shim_matter::sdk::dm::Dataver;

pub struct LocalControl;
impl Control for LocalControl {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        if crate::snapshot::boot_configuration().is_none() {
            return Err(BridgeError::NotReady);
        }
        crate::runtime::submit(source, request).ok_or(BridgeError::Busy)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        crate::runtime::reply(token)
    }
    fn cancel(&self, token: Token) {
        crate::runtime::cancel(token);
    }
    fn reported_on(&self) -> bool {
        critical_section::with(|cs| crate::snapshot::STATUS.borrow(cs).get())
            .is_some_and(|status| status.control.relay == RelayCommand::On)
    }
    fn now_ms(&self) -> u64 {
        crate::snapshot::now().0
    }
    async fn wait(&self) {
        embassy_time::Timer::after_millis(20).await;
    }
}

pub fn handler() -> OnOff<LocalControl> {
    // A commissioning assembly must seed its initial data version from the TRNG.
    OnOff::new(LocalControl, Dataver::new(0))
}
