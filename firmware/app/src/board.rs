//! Controller capture bindings; electrical and physical board release remain separate.
use esp_hal::{
    gpio::{
        interconnect::InputSignal, DriveMode, Flex, Input, InputConfig, Io, Level, Output,
        OutputConfig,
    },
    i2c::master::{Config, I2c},
    interrupt::{software::SoftwareInterruptControl, Priority},
    peripherals::{Peripherals, ADC1, BT, FLASH, RNG, TIMG0, TIMG1, WIFI},
    time::Rate,
    timer::timg::{TimerGroup, Wdt},
    usb::usb_serial_jtag::UsbSerialJtag,
    Async, Blocking,
};

pub struct SensorHardware {
    pub i2c: I2c<'static, Blocking>,
    pub sda: InputSignal<'static>,
    pub scl: InputSignal<'static>,
    pub power: Output<'static>,
    pub bus_enable: Output<'static>,
    pub fault: InputSignal<'static>,
}
pub struct Board {
    pub rng: RNG<'static>,
    pub adc1: ADC1<'static>,
    pub wifi: WIFI<'static>,
    pub bt: BT<'static>,
    pub flash: FLASH<'static>,
    pub relay: Output<'static>,
    pub maintenance: Input<'static>,
    pub psu_good: Input<'static>,
    pub sensor_fault: Input<'static>,
    pub led: Output<'static>,
    pub sensor: SensorHardware,
    pub timers: TimerGroup<'static, TIMG0<'static>>,
    pub watchdog: Wdt<TIMG1<'static>>,
    pub interrupts: SoftwareInterruptControl<'static>,
    pub usb: UsbSerialJtag<'static, Async>,
}
impl Board {
    pub fn new(p: Peripherals) -> Self {
        // External resistors supply these same safe states before application entry.
        let output = OutputConfig::default();
        let relay = Output::new(p.GPIO10, Level::Low, output);
        let bus_enable = Output::new(p.GPIO0, Level::Low, output);
        let power = Output::new(p.GPIO22, Level::Low, output);
        let led = Output::new(p.GPIO20, Level::Low, output);
        // The GPIO ISR must also preempt sensor cleanup, not only its awakened task.
        Io::new(p.IO_MUX).set_interrupt_priority(Priority::Priority3);
        let mut sda = Flex::new(p.GPIO18);
        let mut scl = Flex::new(p.GPIO19);
        for pin in [&mut sda, &mut scl] {
            pin.set_high();
            pin.apply_output_config(&output.with_drive_mode(DriveMode::OpenDrain));
            pin.set_input_enable(true);
            pin.set_output_enable(true);
        }
        let sda_input = sda.peripheral_input();
        let scl_input = scl.peripheral_input();
        let i2c = I2c::new(p.I2C0, Self::i2c_config())
            .expect("fixed 100 kHz configuration")
            .with_sda(sda)
            .with_scl(scl);
        let sensor_fault = Input::new(p.GPIO23, InputConfig::default());
        let sensor_fault_input = sensor_fault.peripheral_input();
        Self {
            rng: p.RNG,
            adc1: p.ADC1,
            wifi: p.WIFI,
            bt: p.BT,
            flash: p.FLASH,
            relay,
            maintenance: Input::new(p.GPIO11, InputConfig::default()),
            psu_good: Input::new(p.GPIO21, InputConfig::default()),
            sensor_fault,
            led,
            sensor: SensorHardware {
                i2c,
                sda: sda_input,
                scl: scl_input,
                power,
                bus_enable,
                fault: sensor_fault_input,
            },
            timers: TimerGroup::new(p.TIMG0),
            watchdog: TimerGroup::new(p.TIMG1).wdt,
            interrupts: SoftwareInterruptControl::new(p.SW_INTERRUPT),
            usb: UsbSerialJtag::new(p.USB_DEVICE).into_async(),
        }
    }
    pub fn i2c_config() -> Config {
        Config::default().with_frequency(Rate::from_khz(100))
    }
}
