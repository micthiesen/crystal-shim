extern crate std;

use super::*;
use core::{
    cell::Cell,
    future::Future,
    task::{Context, Poll, Waker},
};
use embedded_hal_async::i2c::{ErrorKind, ErrorType, Operation};
use std::{collections::VecDeque, vec, vec::Vec};

#[derive(Debug)]
enum Step {
    Read(u8, Result<u16, ErrorKind>),
    Write(u8, u16),
    Pending,
}

struct Bus(VecDeque<Step>);

impl ErrorType for Bus {
    type Error = ErrorKind;
}

impl I2c for Bus {
    async fn transaction(
        &mut self,
        address: u8,
        operations: &mut [Operation<'_>],
    ) -> Result<(), Self::Error> {
        assert_eq!(address, 0x50);
        match (
            self.0.pop_front().expect("unexpected I2C transaction"),
            operations,
        ) {
            (Step::Pending, _) => core::future::pending().await,
            (
                Step::Read(register, response),
                [Operation::Write(pointer), Operation::Read(bytes)],
            ) => {
                assert_eq!(*pointer, [register]);
                assert_eq!(bytes.len(), 2);
                bytes.copy_from_slice(&response?.to_be_bytes());
            }
            (Step::Write(register, value), [Operation::Write(bytes)]) => {
                let [high, low] = value.to_be_bytes();
                assert_eq!(*bytes, [register, high, low]);
            }
            (step, _) => panic!("wrong transaction shape for {step:?}"),
        }
        Ok(())
    }
}

struct Delay<'a>(&'a Cell<u64>);

impl DelayNs for Delay<'_> {
    async fn delay_ns(&mut self, ns: u32) {
        self.0.set(self.0.get() + u64::from(ns).div_ceil(1_000_000));
    }
}

fn run<T>(future: impl Future<Output = T>) -> T {
    let mut future = core::pin::pin!(future);
    match future
        .as_mut()
        .poll(&mut Context::from_waker(Waker::noop()))
    {
        Poll::Ready(value) => value,
        Poll::Pending => panic!("mock unexpectedly yielded"),
    }
}

fn read(register: u8, value: u16) -> Step {
    Step::Read(register, Ok(value))
}

fn configuration() -> Vec<Step> {
    vec![read(0x08, 0x0c00), read(0x09, 0x2c00), read(0x0a, 0x4c00)]
}

fn boot() -> Vec<Step> {
    let mut steps = vec![
        read(0xfe, 0x5449),
        read(0xff, 0x1004),
        Step::Write(0x0c, 0x8000),
        read(0x0c, 0x8000),
        read(0x0c, 0),
        Step::Write(0x08, 0x0c00),
        Step::Write(0x09, 0x2c00),
        Step::Write(0x0a, 0x4c00),
    ];
    steps.extend(configuration());
    steps
}

fn frame() -> Vec<Step> {
    let mut steps = configuration();
    steps.extend([
        Step::Write(0x0c, 0x0480),
        read(0x0c, 0x0480),
        read(0x0c, 0x0488),
        read(0x00, 0x0800),
        read(0x01, 0x0000), // +1 pF
        Step::Write(0x0c, 0x0440),
        read(0x0c, 0x0444),
        read(0x02, 0xff80),
        read(0x03, 0x0000), // -1/16 pF
        Step::Write(0x0c, 0x0420),
        read(0x0c, 0x0422),
        read(0x04, 0x0000),
        read(0x05, 0x0100), // smallest positive count
    ]);
    steps.extend(configuration());
    steps
}

#[test]
fn reads_ordered_single_shots_and_preserves_signed_counts() {
    let clock = Cell::new(100);
    let mut steps = boot();
    steps.extend(frame());
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || clock.get())).unwrap();
    let frame = run(driver.acquire(&mut Delay(&clock), || clock.get())).unwrap();
    assert_eq!(frame.level.counts(), 1 << 19);
    assert_eq!(frame.wet_reference.counts(), -(1 << 15));
    assert_eq!(frame.dry_reference.counts(), 1);
    assert_eq!(frame.started_ms, 101);
    assert_eq!(frame.completed_ms, 102);
    assert!(driver.bus.0.is_empty());
}

#[test]
fn decode_rejects_reserved_bits_and_converter_limits() {
    assert_eq!(decode::<()>(0, 1), Err(Error::MalformedResult));
    assert_eq!(decode::<()>(0x7800, 0), Err(Error::OutsideConverterRange));
    assert_eq!(decode::<()>(0x8800, 0), Err(Error::OutsideConverterRange));
    assert_eq!(
        decode::<()>(0x7fff, 0xff00),
        Err(Error::OutsideConverterRange)
    );
    assert_eq!(decode::<()>(0x8000, 0), Err(Error::OutsideConverterRange));
    assert_eq!(decode::<()>(0xffff, 0xff00).unwrap().counts(), -1);
    assert_eq!(
        decode::<()>(0x77ff, 0xff00).unwrap().counts(),
        RAW_LIMIT - 1
    );
}

#[test]
fn partial_frame_bus_error_invalidates_driver_until_reset() {
    let clock = Cell::new(0);
    let mut steps = boot();
    steps.extend(configuration());
    steps.extend([
        Step::Write(0x0c, 0x0480),
        read(0x0c, 0x0488),
        read(0, 0x100),
        Step::Read(1, Err(ErrorKind::Bus)),
    ]);
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || clock.get())).unwrap();
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || clock.get())),
        Err(Error::Bus(ErrorKind::Bus))
    );
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || clock.get())),
        Err(Error::NotInitialized)
    );
    assert!(driver.bus.0.is_empty());
}

#[test]
fn brownout_configuration_is_not_returned_as_zero_water() {
    let clock = Cell::new(0);
    let mut steps = boot();
    let mut readings = frame();
    readings.truncate(readings.len() - 3);
    steps.extend(readings);
    steps.push(read(0x08, 0x1c00));
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || clock.get())).unwrap();
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || clock.get())),
        Err(Error::ConfigurationChanged {
            register: 0x08,
            actual: 0x1c00
        })
    );
    assert!(!driver.initialized);
}

#[test]
fn stuck_conversion_has_finite_poll_count_even_with_frozen_clock() {
    let clock = Cell::new(0);
    let mut steps = boot();
    steps.extend(configuration());
    steps.push(Step::Write(0x0c, 0x0480));
    steps.extend((0..40).map(|_| read(0x0c, 0x0480)));
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || 0)).unwrap();
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || 0)),
        Err(Error::Timeout)
    );
    assert!(driver.bus.0.is_empty());
}

#[test]
fn wrong_identity_cannot_initialize() {
    let mut driver = Fdc1004::new(Bus(vec![read(0xfe, 0xffff), read(0xff, 0x1004)].into()));
    assert_eq!(
        run(driver.initialize(&mut Delay(&Cell::new(0)), || 0)),
        Err(Error::WrongDevice {
            manufacturer: 0xffff,
            device: 0x1004
        })
    );
    assert!(!driver.initialized);
}

#[test]
fn backwards_clock_between_frames_requires_explicit_recovery() {
    let clock = Cell::new(100);
    let mut driver = Fdc1004::new(Bus(boot().into()));
    run(driver.initialize(&mut Delay(&clock), || clock.get())).unwrap();
    clock.set(0);
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || clock.get())),
        Err(Error::ClockWentBackwards)
    );
    assert!(!driver.initialized);
}

#[test]
fn cancelled_bus_future_requires_reset_before_another_frame() {
    let clock = Cell::new(0);
    let mut steps = boot();
    steps.push(Step::Pending);
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || clock.get())).unwrap();
    {
        let mut delay = Delay(&clock);
        let mut acquisition = core::pin::pin!(driver.acquire(&mut delay, || clock.get()));
        assert_eq!(
            acquisition
                .as_mut()
                .poll(&mut Context::from_waker(Waker::noop())),
            Poll::Pending
        );
    }
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), || clock.get())),
        Err(Error::NotInitialized)
    );
    assert!(driver.bus.0.is_empty());
}

#[test]
fn completed_conversion_at_deadline_is_still_timed_out() {
    let clock = Cell::new(0);
    let mut steps = boot();
    steps.extend(configuration());
    steps.extend([Step::Write(0x0c, 0x0480), read(0x0c, 0x0488)]);
    let mut driver = Fdc1004::new(Bus(steps.into()));
    run(driver.initialize(&mut Delay(&clock), || 0)).unwrap();
    let calls = Cell::new(0);
    let now = || {
        calls.set(calls.get() + 1);
        if calls.get() > 2 {
            40
        } else {
            0
        }
    };
    assert_eq!(
        run(driver.acquire(&mut Delay(&clock), now)),
        Err(Error::Timeout)
    );
    assert!(!driver.initialized);
    assert!(driver.bus.0.is_empty());
}
