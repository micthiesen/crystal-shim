//! Priority3 local output owner with startup configuration and flash exclusion.
use crate::snapshot::{self, STATUS};
use crystal_shim_core::{
    Command, Fault, HardwarePermit, Inputs, Reading, RelayCommand, Supervisor, SwitchCommand,
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
) {
    let mut supervisor: Option<Supervisor> = None;
    let mut boot_maintenance_requested = false;
    let mut tick = Ticker::every(Duration::from_millis(20));
    loop {
        let now = snapshot::now();
        if supervisor.is_none() && maintenance.is_low() {
            boot_maintenance_requested = true;
        }
        let mut restore_maintenance = false;
        if supervisor.is_none() {
            if let Some(config) = snapshot::boot_configuration() {
                supervisor = Some(Supervisor::new(config.supervisor, now));
                restore_maintenance = config.maintenance || boot_maintenance_requested;
            }
        }
        let (flash_inhibited, flash_ticket) = crate::flash_gate::observation();
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
                    maintenance: if restore_maintenance || maintenance.is_low() {
                        Command::EnterMaintenance
                    } else {
                        Command::None
                    },
                    hardware: if !flash_inhibited
                        && psu_good.is_high()
                        && sensor_fault.level() == Level::High
                    {
                        HardwarePermit::Allowed
                    } else {
                        HardwarePermit::ForcedOff
                    },
                },
            )
        });
        if !flash_inhibited && status.is_some_and(|status| status.control.relay == RelayCommand::On)
        {
            relay.set_high();
        } else {
            relay.set_low();
        }
        critical_section::with(|cs| STATUS.borrow(cs).set(status));
        watchdog.feed(); // Only after a complete output iteration, never from another task.
        if let Some(ticket) = flash_ticket {
            crate::flash_gate::acknowledge_off(ticket);
        }
        tick.next().await;
    }
}
