//! Uncommissioned ESP32-C6 build scaffold. No sensor bus or relay GPIO is bound.
#![no_std]
#![no_main]

use crystal_shim_core::RelayCommand;
use esp_backtrace as _;

esp_bootloader_esp_idf::esp_app_desc!();

#[esp_hal::main]
fn main() -> ! {
    let _peripherals = esp_hal::init(esp_hal::Config::default());
    esp_println::println!(
        "Crystal Shim UNCOMMISSIONED: desired relay {:?}; no hardware output bound",
        RelayCommand::Off
    );
    let delay = esp_hal::delay::Delay::new();
    loop {
        // An inert image, not the control loop. External coil pull-down must provide
        // the hardware off state during reset and until reviewed I/O is implemented.
        delay.delay_millis(1000);
    }
}
