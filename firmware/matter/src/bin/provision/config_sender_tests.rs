use super::*;
use crystal_shim_core::{
    configuration::{RawDeviceConfig, RawScheduleEntry, ValidatedDeviceConfig},
    runtime::{
        Acknowledgement, Observation, Record, Reply, Runtime, RuntimeCommand, StoreCompletion,
    },
    runtime_ingress::{Ingress, Receiver, Source},
    Fault, HardwarePermit, Millis, Reading, RelayCommand, RetainedState, State, Timing,
};
use std::collections::VecDeque;

fn config(revision: u32, scheduled: bool) -> ValidatedDeviceConfig {
    // Synthetic policy inputs and token, never production calibration or credentials.
    let entries = [RawScheduleEntry::new(1, 0x7f, 3600)];
    ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(
            revision,
            200,
            800,
            500,
            Timing::PROVISIONAL,
            900,
            [0x5a; 32],
        )
        .timezone_rule("UTC0")
        .unwrap()
        .schedule_entries(if scheduled { &entries } else { &[] })
        .unwrap()
        .build(),
    )
    .unwrap()
}
struct Fake {
    now: u64,
    write_at: u64,
    fail_write: bool,
    events: VecDeque<(u64, Result<Option<u8>, ()>)>,
    writes: Vec<Vec<u8>>,
}
impl Fake {
    fn new(text: &str) -> Self {
        Self {
            now: 0,
            write_at: 0,
            fail_write: false,
            events: text.bytes().map(|byte| (1, Ok(Some(byte)))).collect(),
            writes: Vec::new(),
        }
    }
}
impl Stream for Fake {
    fn now_ms(&self) -> u64 {
        self.now
    }
    fn write(&mut self, bytes: &[u8], _deadline: u64) -> Result<(), ()> {
        self.writes.push(bytes.to_vec());
        self.now = self.write_at;
        if self.fail_write {
            Err(())
        } else {
            Ok(())
        }
    }
    fn read(&mut self, deadline: u64) -> Result<Option<u8>, ()> {
        let (now, result) = self.events.pop_front().unwrap_or((deadline, Ok(None)));
        self.now = now;
        result
    }
}

#[test]
fn matching_durable_only_and_every_attempt_is_one_exact_config() {
    let encoded = config(1, false).encode().unwrap();
    for (text, result) in [
        ("REPLY 37 Ok(Durable)\n", Ok(())), // ACCEPTED itself can be lost.
        ("ACCEPTED 37\r\nREPLY 37 Ok(Durable)\r\n", Ok(())),
        ("ACCEPTED 37\n", Err(Failure::Uncertain)),
        ("REPLY 37 Ok(Applied)\n", Err(Failure::Uncertain)),
        ("STORAGE 37 Ok(())\nrevision=1\n", Err(Failure::Uncertain)),
        ("REPLY 38 Ok(Durable)\n", Err(Failure::Uncertain)),
        ("REPLY 37 Ok(Durable) extra\n", Err(Failure::Uncertain)),
        ("REPLY 37 Err(Storage)\n", Err(Failure::Uncertain)),
        ("REPLY 37 Err(Exhausted)\n", Err(Failure::Uncertain)),
        ("REPLY 37 Err(Revision)\n", Err(Failure::Rejected(Error::Revision))),
        ("REPLY 37 Err(Busy)\n", Err(Failure::Rejected(Error::Busy))),
        ("BUSY 37\n", Err(Failure::Busy)),
        ("NOT_READY 37\n", Err(Failure::NotReady)),
        ("ACCEPTED 37\nBUSY 37\n", Err(Failure::Uncertain)),
        ("ACCEPTED 37\nNOT_READY 37\n", Err(Failure::Uncertain)),
        ("PARSE_ERROR Configuration\n", Err(Failure::Uncertain)),
        ("boot=UNCOMMISSIONED\nREPLY 9 nonsense\nPROVISION 37 - Err(Busy)\nREPLY 37 Ok(Durable)\n", Ok(())),
    ] {
        let mut io = Fake::new(text);
        assert_eq!(send(&mut io, encoded.as_bytes(), 37), result, "{text}");
        assert_eq!(io.writes.len(), 1);
        let mut receiver = Receiver::new();
        let mut parsed = None;
        for byte in &io.writes[0] {
            if let Some(request) = receiver.push(0, *byte) { parsed = Some(request.unwrap()); }
        }
        let parsed = parsed.unwrap();
        assert_eq!(parsed.id, 37);
        let RuntimeCommand::SaveConfiguration(actual) = parsed.command else { panic!("not CONFIG"); };
        assert_eq!(actual.encode().unwrap().as_bytes(), encoded.as_bytes());
    }
}

#[test]
fn overflow_and_non_utf8_input_are_bounded_without_becoming_receipts() {
    let encoded = config(1, false).encode().unwrap();
    for suffix in ["", "REPLY 37 Ok(Durable)\n"] {
        let mut io = Fake::new(&format!(
            "{}REPLY 37 Ok(Durable)\n{suffix}",
            "x".repeat(LINE_BYTES + 1)
        ));
        io.events.push_front((0, Ok(Some(0xff))));
        assert_eq!(
            send(&mut io, encoded.as_bytes(), 37),
            if suffix.is_empty() {
                Err(Failure::Uncertain)
            } else {
                Ok(())
            }
        );
        assert_eq!(io.writes.len(), 1);
    }
    for (prefix, expected) in [
        ("REPLY 37 ", Err(Failure::Uncertain)),
        ("REPLY 38 ", Ok(())),
        ("diagnostic ", Ok(())),
    ] {
        for payload in [vec![0xff], vec![b'x'; LINE_BYTES + 1]] {
            let mut io = Fake::new("");
            let reply = [prefix.as_bytes(), &payload, b"\nREPLY 37 Ok(Durable)\n"].concat();
            io.events = reply.into_iter().map(|byte| (1, Ok(Some(byte)))).collect();
            assert_eq!(send(&mut io, encoded.as_bytes(), 37), expected);
            assert_eq!(io.writes.len(), 1);
        }
    }
}

#[test]
fn partial_io_lost_reply_and_original_deadlines_never_retry() {
    let encoded = config(1, false).encode().unwrap();
    for mode in 0..8 {
        let mut io = Fake::new("REPLY 37 Ok(Durable)\n");
        match mode {
            0 => io.fail_write = true,
            1 => io.write_at = WRITE_MS,
            2 => io.write_at = WRITE_MS + 1,
            3 => {
                io.events.back_mut().unwrap().0 = TOTAL_MS;
            }
            4 => {
                io.events.back_mut().unwrap().0 = TOTAL_MS + 1;
            }
            5 => {
                io.events.back_mut().unwrap().0 = 0;
            } // Backwards after prior byte.
            6 => {
                io.events.clear();
                io.events.push_back((1, Err(())));
            }
            _ => {
                io.events.clear();
                io.events
                    .extend((1..=10).map(|n| (n * 1000, Ok(Some(b'x')))));
            }
        }
        assert_eq!(
            send(&mut io, encoded.as_bytes(), 37),
            Err(Failure::Uncertain)
        );
        assert_eq!(io.writes.len(), 1);
    }
    let mut io = Fake::new("REPLY 37 Ok(Durable)\n");
    io.now = 10;
    io.write_at = 9;
    assert_eq!(
        send(&mut io, encoded.as_bytes(), 37),
        Err(Failure::Uncertain)
    );
    assert_eq!(io.writes.len(), 1);
    let mut io = Fake::new("");
    io.now = u64::MAX;
    assert_eq!(send(&mut io, encoded.as_bytes(), 37), Err(Failure::NotSent));
    assert!(io.writes.is_empty());
}

#[test]
fn invalid_profile_or_id_never_writes() {
    for bytes in [
        vec![],
        b"CSMAT01 invalid identity".to_vec(),
        config(2, false).encode().unwrap().as_bytes().to_vec(),
        config(1, true).encode().unwrap().as_bytes().to_vec(),
    ] {
        let mut io = Fake::new("");
        assert_eq!(send(&mut io, &bytes, 37), Err(Failure::Invalid));
        assert!(io.writes.is_empty());
    }
    let mut io = Fake::new("");
    assert_eq!(
        send(&mut io, config(1, false).encode().unwrap().as_bytes(), 0),
        Err(Failure::Invalid)
    );
    assert!(io.writes.is_empty());
}

fn observation(now: u64, force_off: bool) -> Observation {
    Observation {
        now: Millis(now),
        sensor_revision: 0,
        reading: Reading::Invalid(Fault::Uncalibrated),
        hardware: HardwarePermit::Allowed,
        maintenance_pressed: false,
        force_off,
        clock_update: Default::default(),
    }
}
struct Device {
    io: Fake,
    runtime: Runtime,
    ingress: Ingress,
    // 0 both success, 1 first failure, 2 second failure, 3 missing final ACK,
    // 4 incomplete first phase, 5 provisioning reservation, 6 existing revision.
    mode: u8,
    writes_completed: usize,
}
impl Device {
    fn new(mode: u8) -> Self {
        let mut ingress = Ingress::new();
        if mode == 5 {
            ingress.reserve_provisioning(true);
        }
        let runtime = if mode == 6 {
            Runtime::new(
                Some(config(1, false)),
                Some(RetainedState::new(1).unwrap()),
                Millis(0),
            )
            .unwrap()
        } else {
            Runtime::new(None, None, Millis(0)).unwrap()
        };
        Self {
            io: Fake::new(""),
            runtime,
            ingress,
            mode,
            writes_completed: 0,
        }
    }
    fn emit(&mut self, text: &str) {
        self.io
            .events
            .extend(text.bytes().map(|byte| (1, Ok(Some(byte)))));
    }
    fn reply(&mut self, reply: Option<Reply>) {
        if let Some(reply) = reply {
            self.ingress.complete(reply);
            let reply = self.ingress.take_reply().unwrap();
            if self.mode != 3 {
                self.emit(&format!("REPLY {} {:?}\n", reply.id, reply.result));
            }
        }
    }
}
impl Stream for Device {
    fn now_ms(&self) -> u64 {
        self.io.now_ms()
    }
    fn read(&mut self, deadline: u64) -> Result<Option<u8>, ()> {
        self.io.read(deadline)
    }
    fn write(&mut self, bytes: &[u8], deadline: u64) -> Result<(), ()> {
        self.io.write(bytes, deadline)?;
        let mut receiver = Receiver::new();
        let request = bytes
            .iter()
            .filter_map(|byte| receiver.push(0, *byte))
            .next()
            .unwrap()
            .unwrap();
        let id = request.id;
        if self.ingress.submit_from(Source::Usb, request).is_none() {
            self.emit(&format!("BUSY {id}\n"));
            return Ok(());
        }
        self.emit(&format!("ACCEPTED {id}\n"));
        let (off, request) = self.ingress.take();
        let step = self.runtime.step(observation(0, off), request, None);
        self.reply(step.command_reply);
        if self.mode == 6 {
            return Ok(());
        }
        assert!(!self.runtime.durable_maintenance());
        assert!(self.runtime.configuration().is_none());
        assert!(matches!(
            self.runtime.store_request().unwrap().record,
            Record::Retained(_)
        ));
        for index in 1..=2 {
            let pending = self.runtime.store_request().unwrap();
            let step = self.runtime.step(
                observation(index * 20, false),
                None,
                Some(StoreCompletion {
                    ticket: pending.ticket,
                    succeeded: self.mode != index as u8,
                }),
            );
            self.writes_completed += 1;
            self.reply(step.completed_reply);
            if self.mode == index as u8 || self.mode == 4 {
                break;
            }
            if index == 1 {
                assert!(self.runtime.configuration().is_none());
                assert!(!self.runtime.durable_maintenance());
                assert!(matches!(
                    self.runtime.store_request().unwrap().record,
                    Record::Configuration(_)
                ));
                // Reserved Off still applies while CONFIG owns the large slot.
                assert!(self
                    .ingress
                    .submit_from(
                        Source::Usb,
                        crystal_shim_core::runtime::Request {
                            id: 99,
                            command: RuntimeCommand::Off
                        }
                    )
                    .is_some());
                let (off, request) = self.ingress.take();
                let off = self.runtime.step(observation(30, off), request, None);
                assert_eq!(
                    off.command_reply.unwrap().result,
                    Ok(Acknowledgement::Applied)
                );
                assert!(off
                    .status
                    .is_none_or(|status| status.control.relay == RelayCommand::Off));
                self.reply(off.command_reply);
            }
        }
        Ok(())
    }
}

#[test]
fn production_runtime_durability_failure_revision_and_reservation_are_observed() {
    for mode in 0..=6 {
        let mut device = Device::new(mode);
        let result = send(
            &mut device,
            config(1, false).encode().unwrap().as_bytes(),
            37,
        );
        assert_eq!(
            result,
            match mode {
                0 => Ok(()),
                5 => Err(Failure::Busy),
                6 => Err(Failure::Rejected(Error::Revision)),
                _ => Err(Failure::Uncertain),
            }
        );
        assert_eq!(device.io.writes.len(), 1);
        if mode == 0 || mode == 3 {
            assert_eq!(device.writes_completed, 2);
            assert!(device.runtime.durable_maintenance());
            let status = device
                .runtime
                .step(observation(80, false), None, None)
                .status
                .unwrap();
            assert_eq!(status.control.state, State::Maintenance);
            assert_eq!(status.control.relay, RelayCommand::Off);
            assert!(device
                .runtime
                .configuration()
                .unwrap()
                .calibration()
                .is_none());
        } else if mode != 6 {
            assert!(device.runtime.configuration().is_none());
        } else {
            assert_eq!(device.writes_completed, 0);
        }
    }
}
