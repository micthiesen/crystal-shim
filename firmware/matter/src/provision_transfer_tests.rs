extern crate std;
// The shared public fixture is compiled only in test targets.
use super::*;
use core::cell::{Cell, RefCell};
use crystal_shim_core::{
    configuration::{RawDeviceConfig, ValidatedDeviceConfig},
    runtime::{Observation, Reply, Runtime, StoreCompletion},
    runtime_ingress::{Ingress, Receiver},
    Fault, HardwarePermit, Millis, Reading, RelayCommand, RetainedState, Timing,
};
use std::{format, vec::Vec};

#[path = "../tests/support/provision_record.rs"]
mod public_fixture;

struct Inner {
    ingress: Ingress,
    runtime: Runtime,
    readiness: Readiness,
}
struct Harness {
    inner: RefCell<Inner>,
    now: Cell<u64>,
}
fn config() -> ValidatedDeviceConfig {
    ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(
            1,
            200,
            800,
            500,
            Timing {
                low_confirmation_ms: 100,
                recovery_ms: 100,
                minimum_off_ms: 100,
            },
            3,
            [0x5a; 32],
        )
        .timezone_rule("UTC0")
        .unwrap()
        .build(),
    )
    .unwrap()
}
impl Harness {
    fn new(configured: bool) -> Self {
        let runtime = Runtime::new(
            configured.then(config),
            configured.then(|| RetainedState::new(1).unwrap()),
            Millis(0),
        )
        .unwrap();
        let this = Self {
            inner: RefCell::new(Inner {
                ingress: Ingress::new(),
                runtime,
                readiness: Readiness::default(),
            }),
            now: Cell::new(0),
        };
        this.tick(0, None);
        this
    }
    fn tick(&self, now: u64, completion: Option<bool>) {
        self.now.set(now);
        let mut inner = self.inner.borrow_mut();
        let (force_off, request) = inner.ingress.take();
        let completion = completion.map(|succeeded| StoreCompletion {
            ticket: inner.runtime.store_request().unwrap().ticket,
            succeeded,
        });
        let step = inner.runtime.step(
            Observation {
                now: Millis(now),
                sensor_revision: 1,
                reading: Reading::Invalid(Fault::Uncalibrated),
                force_off,
                clock_update: Default::default(),
                maintenance_pressed: false,
                hardware: HardwarePermit::Allowed,
            },
            request,
            completion,
        );
        // Production control publishes this only after its actual output write.
        inner.readiness = Readiness {
            configured: inner.runtime.configuration().is_some(),
            durable_maintenance: inner.runtime.durable_maintenance(),
            relay_off: step
                .status
                .is_none_or(|status| status.control.relay == RelayCommand::Off),
            observed_at_ms: now,
        };
        for reply in [step.command_reply, step.completed_reply]
            .into_iter()
            .flatten()
        {
            inner.ingress.complete(reply);
        }
    }
    fn ready(&self) -> Readiness {
        self.inner.borrow().readiness
    }
}
impl Control for Harness {
    fn begin(&self, source: Source, request: ControlRequest) -> Result<Token, BridgeError> {
        self.inner
            .borrow_mut()
            .ingress
            .submit_from(source, request)
            .ok_or(BridgeError::Busy)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        self.inner.borrow_mut().ingress.take_reply_for(token)
    }
    fn cancel(&self, token: Token) {
        self.inner.borrow_mut().ingress.cancel(token);
    }
    fn reported_on(&self) -> bool {
        !self.ready().relay_off
    }
    fn now_ms(&self) -> u64 {
        self.now.get()
    }
    async fn wait(&self) {}
}
#[derive(Default)]
struct Store {
    calls: Cell<usize>,
    bytes: RefCell<Vec<u8>>,
    fail: Cell<Option<InstallError>>,
}
impl ProvisionStore for Store {
    fn install(&self, bytes: &[u8]) -> Result<InstallOutcome, InstallError> {
        self.calls.set(self.calls.get() + 1);
        if let Some(error) = self.fail.get() {
            return Err(error);
        }
        self.bytes.replace(bytes.to_vec());
        Ok(InstallOutcome::StoredVerified)
    }
}
fn handle(transfer: &mut Transfer, h: &Harness, store: &Store, command: Command) -> Response {
    transfer.handle(
        Request { id: 7, command },
        h.now.get(),
        h,
        h.ready(),
        Some(store),
    )
}
fn begin(transfer: &mut Transfer, h: &Harness, store: &Store, bytes: &[u8]) -> Response {
    handle(
        transfer,
        h,
        store,
        Command::Begin {
            nonce: [1; 16],
            length: bytes.len(),
            sha256: Sha256::digest(bytes).into(),
        },
    )
}
fn receiving(transfer: &mut Transfer, h: &Harness, store: &Store, bytes: &[u8]) -> Owner {
    let response = begin(transfer, h, store, bytes);
    assert_eq!(response.result, Ok(Progress::Pending));
    h.tick(20, None);
    assert!(transfer.poll(20, h, h.ready()).is_none());
    h.tick(40, Some(true));
    assert!(
        h.inner.borrow_mut().ingress.take_reply().is_none(),
        "ordinary USB cannot consume the internal ACK"
    );
    assert_eq!(
        transfer.poll(40, h, h.ready()).unwrap().result,
        Ok(Progress::Ready(0))
    );
    response.owner.unwrap()
}
fn chunk(owner: Owner, offset: usize, bytes: &[u8]) -> Command {
    let mut chunk = Chunk {
        bytes: [0; CHUNK_BYTES],
        len: bytes.len(),
    };
    chunk.bytes[..bytes.len()].copy_from_slice(bytes);
    Command::Chunk {
        owner,
        offset,
        chunk,
    }
}
fn upload(transfer: &mut Transfer, h: &Harness, store: &Store, owner: Owner, bytes: &[u8]) {
    for (index, part) in bytes.chunks(CHUNK_BYTES).enumerate() {
        let offset = index * CHUNK_BYTES;
        assert_eq!(
            handle(transfer, h, store, chunk(owner, offset, part)).result,
            Ok(Progress::Next(offset + part.len()))
        );
    }
}

#[test]
fn valid_record_needs_durable_gpio_ack_and_separate_reboot_request() {
    let h = Harness::new(true);
    let store = Store::default();
    let bytes = public_fixture::record();
    let mut transfer = Transfer::new();
    let owner = receiving(&mut transfer, &h, &store, &bytes);
    upload(&mut transfer, &h, &store, owner, &bytes);
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Commit(owner)).result,
        Ok(Progress::Complete(InstallOutcome::StoredVerified))
    );
    assert_eq!(*store.bytes.borrow(), bytes);
    assert!(transfer.bytes.iter().all(|byte| *byte == 0));
    assert!(
        transfer.poll(40, &h, h.ready()).is_none(),
        "upload never resets"
    );
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Status(owner)).result,
        Ok(Progress::Complete(InstallOutcome::StoredVerified))
    );
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Reboot(owner)).result,
        Ok(Progress::Pending)
    );
    assert!(
        transfer.poll(40, &h, h.ready()).is_none(),
        "cached readiness cannot replace the new ACK"
    );
    h.tick(60, None); // Already durable, so no new write is required.
    let mut unsafe_snapshot = h.ready();
    unsafe_snapshot.relay_off = false;
    assert!(transfer.poll(60, &h, unsafe_snapshot).is_none());
    assert_eq!(
        transfer.poll(60, &h, h.ready()).unwrap().result,
        Ok(Progress::Rebooting)
    );
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Reboot(owner)).result,
        Err(Error::StaleToken)
    );
}

#[test]
fn never_configured_applied_maintenance_and_unavailable_store_cannot_admit() {
    let store = Store::default();
    let mut transfer = Transfer::new();
    let h = Harness::new(false);
    assert_eq!(
        begin(&mut transfer, &h, &store, &[1]).result,
        Err(Error::Unconfigured)
    );
    // Also reject Applied even if a faulty/stale admission snapshot said configured.
    let mut snapshot = h.ready();
    snapshot.configured = true;
    let request = Request {
        id: 9,
        command: Command::Begin {
            nonce: [2; 16],
            length: 1,
            sha256: [0; 32],
        },
    };
    assert_eq!(
        transfer
            .handle(request, 0, &h, snapshot, Some(&store))
            .result,
        Ok(Progress::Pending)
    );
    h.tick(20, None);
    assert_eq!(
        transfer.poll(20, &h, h.ready()).unwrap().result,
        Err(Error::MaintenanceNotDurable)
    );
    let h = Harness::new(true);
    let request = Request {
        id: 9,
        command: Command::Begin {
            nonce: [2; 16],
            length: 1,
            sha256: [0; 32],
        },
    };
    assert_eq!(
        transfer.handle(request, 0, &h, h.ready(), None).result,
        Err(Error::NotReady)
    );
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn reserved_off_survives_busy_ingress_and_transfer_rejects_other_local_mutations() {
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    begin(&mut transfer, &h, &store, &[1]);
    for command in [
        RuntimeCommand::On,
        RuntimeCommand::Toggle,
        RuntimeCommand::ExitMaintenance,
        RuntimeCommand::SaveConfiguration(config()),
        RuntimeCommand::ClearUtc,
        RuntimeCommand::EnterMaintenance,
    ] {
        assert!(!transfer.allows_runtime(command));
    }
    assert!(transfer.allows_runtime(RuntimeCommand::Off));
    assert_eq!(
        h.begin(
            Source::Usb,
            ControlRequest {
                id: 1,
                command: RuntimeCommand::Off
            }
        ),
        Err(BridgeError::Busy)
    );
    assert!(
        h.inner.borrow_mut().ingress.take().0,
        "reserved Off survives a full slot"
    );
}

#[test]
fn queued_exit_or_config_prevents_maintenance_admission_and_storage_failure_cannot_ack() {
    for command in [
        RuntimeCommand::ExitMaintenance,
        RuntimeCommand::SaveConfiguration(config()),
    ] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        h.begin(Source::Usb, ControlRequest { id: 7, command })
            .unwrap();
        assert_eq!(
            begin(&mut transfer, &h, &store, &[1]).result,
            Err(Error::Control(BridgeError::Busy))
        );
    }
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    begin(&mut transfer, &h, &store, &[1]);
    h.tick(20, None);
    h.tick(40, Some(false));
    assert!(transfer.poll(40, &h, h.ready()).unwrap().result.is_err());
    assert!(!h.ready().durable_maintenance);
    assert_eq!(store.calls.get(), 0);
}

#[test]
fn malformed_owner_offsets_lengths_integrity_and_invalid_records_never_reach_store() {
    for case in 0..6 {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let bytes = public_fixture::record();
        let owner = receiving(&mut transfer, &h, &store, &bytes);
        let expected = match case {
            0 => (chunk(owner, 1, &[1]), Error::Offset),
            1 => (chunk(owner, 0, &[]), Error::Length),
            2 => (Command::Invalid(owner), Error::Malformed),
            3 => (Command::Commit(owner), Error::Length),
            4 => {
                upload(&mut transfer, &h, &store, owner, &bytes);
                transfer.bytes[0] ^= 1;
                (Command::Commit(owner), Error::Integrity)
            }
            _ => {
                upload(&mut transfer, &h, &store, owner, &bytes);
                transfer.bytes[0] ^= 1;
                transfer.active.as_mut().unwrap().sha256 =
                    Sha256::digest(&transfer.bytes[..bytes.len()]).into();
                (Command::Commit(owner), Error::InvalidRecord)
            }
        };
        assert_eq!(
            handle(&mut transfer, &h, &store, expected.0).result,
            Err(expected.1)
        );
        assert!(transfer.active.is_none());
        assert!(transfer.bytes.iter().all(|byte| *byte == 0));
        assert_eq!(store.calls.get(), 0);
    }
}

#[test]
fn silent_timeout_boundaries_rollback_total_cap_and_exhaustion_wipe() {
    for deadline in [IDLE_MS, 0] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let owner = receiving(&mut transfer, &h, &store, &[1, 2]);
        handle(&mut transfer, &h, &store, chunk(owner, 0, &[1]));
        assert!(transfer.poll(40 + IDLE_MS - 1, &h, h.ready()).is_none());
        assert_eq!(
            transfer
                .poll(
                    if deadline == 0 { 39 } else { 40 + deadline },
                    &h,
                    h.ready()
                )
                .unwrap()
                .result,
            Err(Error::Timeout)
        );
        assert!(transfer.bytes.iter().all(|byte| *byte == 0));
    }
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    let owner = receiving(&mut transfer, &h, &store, &[0; 20]);
    for (offset, at) in (1..15).map(|n| (n - 1, n as u64 * 4_000)) {
        h.tick(at, None);
        assert!(
            handle(&mut transfer, &h, &store, chunk(owner, offset, &[0]))
                .result
                .is_ok()
        );
    }
    assert_eq!(
        transfer.poll(TOTAL_MS, &h, h.ready()).unwrap().result,
        Err(Error::Timeout)
    );
    transfer.generation = u64::MAX;
    assert_eq!(
        begin(&mut transfer, &h, &store, &[1]).result,
        Err(Error::Exhausted)
    );
}

#[test]
fn stale_tokens_busy_begin_and_duplicate_chunks_cannot_complete_another_transfer() {
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    let owner = receiving(&mut transfer, &h, &store, &[1, 2]);
    assert_eq!(
        begin(&mut transfer, &h, &store, &[1]).result,
        Err(Error::Busy)
    );
    let wrong = Owner {
        generation: owner.generation + 1,
        ..owner
    };
    for command in [
        Command::Cancel(wrong),
        Command::Invalid(wrong),
        Command::Commit(wrong),
    ] {
        assert_eq!(
            handle(&mut transfer, &h, &store, command).result,
            Err(Error::StaleToken)
        );
        assert!(transfer.active.is_some());
    }
    assert_eq!(
        handle(&mut transfer, &h, &store, chunk(owner, 0, &[1])).result,
        Ok(Progress::Next(1))
    );
    assert_eq!(
        handle(&mut transfer, &h, &store, chunk(owner, 0, &[1])).result,
        Err(Error::Offset)
    );
    let next = begin(&mut transfer, &h, &store, &[1]);
    assert!(next.owner.unwrap().generation > owner.generation);
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Commit(owner)).result,
        Err(Error::StaleToken)
    );
}

#[test]
fn cancelled_or_expired_internal_request_cannot_supply_a_later_ack() {
    for dispatched in [false, true] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let owner = begin(&mut transfer, &h, &store, &[1]).owner.unwrap();
        if dispatched {
            h.tick(20, None);
        }
        assert_eq!(
            handle(&mut transfer, &h, &store, Command::Cancel(owner)).result,
            Ok(Progress::Cancelled)
        );
        if dispatched {
            assert_eq!(
                begin(&mut transfer, &h, &store, &[1]).result,
                Err(Error::Control(BridgeError::Busy))
            );
            h.tick(40, Some(true));
        }
        let next = begin(&mut transfer, &h, &store, &[1]);
        assert_eq!(next.result, Ok(Progress::Pending));
        assert!(transfer.poll(h.now.get(), &h, h.ready()).is_none());
        assert_ne!(next.owner, Some(owner));
    }
}

#[test]
fn receipt_expiry_and_failed_readback_never_authorize_reboot() {
    for failure in [None, Some(InstallError::Verification)] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let bytes = public_fixture::record();
        let owner = receiving(&mut transfer, &h, &store, &bytes);
        upload(&mut transfer, &h, &store, owner, &bytes);
        store.fail.set(failure);
        let response = handle(&mut transfer, &h, &store, Command::Commit(owner));
        if failure.is_some() {
            assert_eq!(
                response.result,
                Err(Error::Store(InstallError::Verification))
            );
        }
        transfer.poll(40 + RECEIPT_MS, &h, h.ready());
        assert!(transfer.receipt.is_none());
        assert_eq!(
            handle(&mut transfer, &h, &store, Command::Reboot(owner)).result,
            Err(Error::StaleToken)
        );
        let output = format!("{response}");
        assert!(!output.contains("20202021"));
        assert!(!output.contains("CSMAT"));
    }
}

#[test]
fn wire_parser_shares_framing_at_every_split_and_rejects_malformed_owned_chunks() {
    let owner = Owner {
        generation: 1,
        nonce: [1; 16],
    };
    let line = format!("7 PROVISION_CHUNK {owner} 0 a0b1c2\n");
    for split in 0..=line.len() {
        let mut receiver = Receiver::new();
        let mut result = None;
        for bytes in [&line.as_bytes()[..split], &line.as_bytes()[split..]] {
            for byte in bytes {
                if let Some(value) = receiver.push_with(0, *byte, parse_line) {
                    result = Some(value.unwrap());
                }
            }
        }
        let LocalCommand::Provision(Request {
            command: Command::Chunk {
                chunk, offset: 0, ..
            },
            ..
        }) = result.unwrap()
        else {
            panic!("chunk expected")
        };
        assert_eq!(&chunk.bytes[..chunk.len], &[0xa0, 0xb1, 0xc2]);
    }
    for tail in ["0 0", "0 zz", "0 aa extra", "overflow aa", "0"] {
        let line = format!("7 PROVISION_CHUNK {owner} {tail}");
        assert!(matches!(
            parse_line(line.as_bytes(), &mut [0; CONFIGURATION_BLOB_MAX_LEN]),
            Ok(LocalCommand::Provision(Request {
                command: Command::Invalid(_),
                ..
            }))
        ));
    }
    let oversized = "a".repeat(CHUNK_BYTES * 2 + 2);
    let line = format!("7 PROVISION_CHUNK {owner} 0 {oversized}");
    assert!(matches!(
        parse_line(line.as_bytes(), &mut [0; CONFIGURATION_BLOB_MAX_LEN]),
        Ok(LocalCommand::Provision(Request {
            command: Command::Invalid(_),
            ..
        }))
    ));
    let mut receiver = Receiver::new();
    for byte in b"7 PROVISION_CHUNK secret" {
        assert!(receiver.push_with(0, *byte, parse_line).is_none());
    }
    receiver.expire(5_000);
    assert!(matches!(
        receiver.push_with(5_000, b'\n', parse_line),
        Some(Err(ParseError::Timeout))
    ));
    let mut result = None;
    for byte in b"8 OFF\n" {
        result = receiver.push_with(5_001, *byte, parse_line);
    }
    assert!(matches!(
        result,
        Some(Ok(LocalCommand::Runtime(ControlRequest {
            command: RuntimeCommand::Off,
            ..
        })))
    ));
}

#[test]
fn transfer_capacity_and_exact_time_boundaries_are_enforced_without_wrap() {
    for length in [0, MAX_BYTES + 1, usize::MAX] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let result = handle(
            &mut transfer,
            &h,
            &store,
            Command::Begin {
                nonce: [1; 16],
                length,
                sha256: [0; 32],
            },
        );
        assert_eq!(result.result, Err(Error::Length));
        assert!(transfer.active.is_none());
    }
    for length in [1, MAX_BYTES] {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let bytes = std::vec![0; length];
        let owner = receiving(&mut transfer, &h, &store, &bytes);
        upload(&mut transfer, &h, &store, owner, &bytes);
        assert_eq!(
            handle(&mut transfer, &h, &store, Command::Commit(owner)).result,
            Err(Error::InvalidRecord)
        );
        assert!(transfer.bytes.iter().all(|byte| *byte == 0));
        assert_eq!(store.calls.get(), 0);
    }
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    begin(&mut transfer, &h, &store, &[1]);
    assert!(transfer.poll(ADMISSION_MS - 1, &h, h.ready()).is_none());
    assert_eq!(
        transfer.poll(ADMISSION_MS, &h, h.ready()).unwrap().result,
        Err(Error::Timeout)
    );
    assert!(h.inner.borrow_mut().ingress.take().1.is_none());
    // Detect a rollback relative to the last observation, even above the anchor.
    let h = Harness::new(true);
    let mut transfer = Transfer::new();
    receiving(&mut transfer, &h, &store, &[1]);
    assert!(transfer.poll(50, &h, h.ready()).is_none());
    assert_eq!(
        transfer.poll(45, &h, h.ready()).unwrap().result,
        Err(Error::Timeout)
    );
}

#[test]
fn receiving_loses_permission_on_stale_future_or_non_durable_gpio_observations() {
    for case in 0..4 {
        let h = Harness::new(true);
        let store = Store::default();
        let mut transfer = Transfer::new();
        let owner = receiving(&mut transfer, &h, &store, &[1]);
        let mut readiness = h.ready();
        let now = match case {
            0 => {
                readiness.relay_off = false;
                40
            }
            1 => {
                readiness.durable_maintenance = false;
                40
            }
            2 => 40 + OBSERVATION_MS,
            _ => {
                readiness.observed_at_ms = 41;
                40
            }
        };
        let response = transfer.handle(
            Request {
                id: 7,
                command: chunk(owner, 0, &[1]),
            },
            now,
            &h,
            readiness,
            Some(&store),
        );
        assert_eq!(response.result, Err(Error::MaintenanceNotDurable));
        assert!(transfer.active.is_none());
        assert!(transfer.bytes.iter().all(|byte| *byte == 0));
        assert_eq!(store.calls.get(), 0);
    }
}

#[test]
fn receiving_cancel_wipes_and_lost_final_receipt_can_be_checked_without_rewriting() {
    let h = Harness::new(true);
    let store = Store::default();
    let mut transfer = Transfer::new();
    let bytes = public_fixture::record();
    let owner = receiving(&mut transfer, &h, &store, &bytes);
    upload(&mut transfer, &h, &store, owner, &bytes);
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Cancel(owner)).result,
        Ok(Progress::Cancelled)
    );
    assert!(transfer.bytes.iter().all(|byte| *byte == 0));
    assert!(h.ready().durable_maintenance);
    assert_eq!(store.calls.get(), 0);

    let next = begin(&mut transfer, &h, &store, &bytes).owner.unwrap();
    h.tick(60, None);
    assert_eq!(
        transfer.poll(60, &h, h.ready()).unwrap().result,
        Ok(Progress::Ready(0))
    );
    upload(&mut transfer, &h, &store, next, &bytes);
    let response = handle(&mut transfer, &h, &store, Command::Commit(next));
    assert!(matches!(response.result, Ok(Progress::Complete(_))));
    assert_eq!(store.calls.get(), 1);
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Status(next)).result,
        response.result
    );
    assert_eq!(store.calls.get(), 1);
    assert_eq!(
        handle(&mut transfer, &h, &store, Command::Reboot(owner)).result,
        Err(Error::StaleToken)
    );
}
