//! Priority3 local output owner. Persistent configuration integration follows separately.
use crate::snapshot::{self, STATUS};
use crystal_shim_core::{
    Command, Fault, HardwarePermit, Inputs, Reading, RelayCommand, Supervisor, SupervisorConfig,
    SwitchCommand,
};
use embassy_time::{Duration, Ticker};
use esp_hal::{
    gpio::{interconnect::InputSignal, Input, Level, Output},
    peripherals::TIMG1,
    timer::timg::Wdt,
};

#[embassy_executor::task]
pub async fn run(
    mut relay: Output<'static>,
    maintenance: Input<'static>,
    psu_good: Input<'static>,
    sensor_fault: InputSignal<'static>,
    mut watchdog: Wdt<TIMG1<'static>>,
    config: Option<SupervisorConfig>,
) {
    let mut supervisor = config.map(|config| Supervisor::new(config, snapshot::now()));
    let mut tick = Ticker::every(Duration::from_millis(20));
    loop {
        let now = snapshot::now();
        let sample = snapshot::sensor();
        let reading = if sample.power_fault_latched {
            Reading::Invalid(Fault::Bus)
        } else if sample
            .transaction_deadline
            .is_some_and(|deadline| now >= deadline)
        {
            // HAL cancellation may spend 50 ms clearing the bus at Priority2.
            Reading::Invalid(Fault::Bus)
        } else {
            sample.reading
        };
        let status = supervisor.as_mut().map(|supervisor| {
            supervisor.update(
                now,
                Inputs {
                    reading,
                    window: None,
                    switch: SwitchCommand::None,
                    maintenance: if maintenance.is_low() {
                        Command::EnterMaintenance
                    } else {
                        Command::None
                    },
                    hardware: if psu_good.is_high() && sensor_fault.level() == Level::High {
                        HardwarePermit::Allowed
                    } else {
                        HardwarePermit::ForcedOff
                    },
                },
            )
        });
        if status.is_some_and(|status| status.control.relay == RelayCommand::On) {
            relay.set_high();
        } else {
            relay.set_low();
        }
        critical_section::with(|cs| STATUS.borrow(cs).set(status));
        watchdog.feed(); // Only after a complete output iteration, never from another task.
        tick.next().await;
    }
}
