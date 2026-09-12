use super::*;
use crystal_shim_core::{
    configuration::CONFIGURATION_BLOB_MAX_LEN,
    runtime::{Acknowledgement, Reply, Request},
    runtime_ingress::{Ingress, Source, Token},
};
use crystal_shim_matter::{
    on_off::Control,
    provision_transfer::{parse_line, LocalCommand, Readiness, Transfer},
    storage::ProvisionStore,
};
use std::{
    cell::{Cell, RefCell},
    collections::VecDeque,
};
#[path = "../../../tests/support/provision_record.rs"]
mod public_fixture;

#[derive(Default)]
struct Controller {
    ingress: RefCell<Ingress>,
    admissions: Cell<usize>,
    stall: Cell<bool>,
}
impl Control for Controller {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        self.admissions.set(self.admissions.get() + 1);
        let mut ingress = self.ingress.borrow_mut();
        let token = ingress
            .submit_from(source, request)
            .ok_or(BridgeError::Busy)?;
        let (_, request) = ingress.take();
        if !self.stall.get() {
            ingress.complete(Reply {
                id: request.unwrap().id,
                result: Ok(Acknowledgement::Durable),
            });
        }
        Ok(token)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        self.ingress.borrow_mut().take_reply_for(token)
    }
    fn cancel(&self, token: Token) {
        self.ingress.borrow_mut().cancel(token);
    }
    fn reported_on(&self) -> bool {
        false
    }
    fn now_ms(&self) -> u64 {
        0
    }
    async fn wait(&self) {}
}
#[derive(Default)]
struct Store {
    bytes: RefCell<Vec<u8>>,
    calls: Cell<usize>,
    error: Cell<Option<InstallError>>,
}
impl ProvisionStore for Store {
    fn install(&self, bytes: &[u8]) -> Result<InstallOutcome, InstallError> {
        self.calls.set(self.calls.get() + 1);
        if let Some(error) = self.error.get() {
            return Err(error);
        }
        if !self.bytes.borrow().is_empty() {
            return if *self.bytes.borrow() == bytes {
                Ok(InstallOutcome::AlreadyPresentVerified)
            } else {
                Err(InstallError::Conflict)
            };
        }
        self.bytes.replace(bytes.to_vec());
        Ok(InstallOutcome::StoredVerified)
    }
}
#[derive(Default)]
struct Fake {
    writer: Transfer,
    controller: Controller,
    store: Store,
    now: u64,
    incoming: VecDeque<u8>,
    commands: Vec<(String, Option<usize>)>,
    drop_chunk_ack: bool,
    drop_commit_ack: bool,
    drop_chunk_request: bool,
    drop_commit_request: bool,
    drop_begin_pending: bool,
    drop_ready: bool,
    drop_reboot_ack: bool,
    reboot_on_commit: bool,
    noise: bool,
    incorrect_offset: bool,
    write_failure: bool,
    flood: bool,
}
impl Fake {
    fn queue(&mut self, response: Response) {
        self.incoming.extend(format!("{response}\r\n").bytes());
    }
    fn ready(&self) -> Readiness {
        Readiness {
            configured: true,
            durable_maintenance: true,
            relay_off: true,
            observed_at_ms: self.now,
        }
    }
}
impl Stream for Fake {
    fn now_ms(&self) -> u64 {
        self.now
    }
    fn write(&mut self, bytes: &[u8], deadline: u64) -> Result<(), ()> {
        assert!(self.now < deadline);
        if self.write_failure {
            return Err(());
        }
        self.now += 5;
        let text = std::str::from_utf8(bytes).unwrap();
        let fields: Vec<_> = text.split_ascii_whitespace().collect();
        let verb = fields[1];
        let offset = (verb == "PROVISION_CHUNK").then(|| fields[3].parse::<usize>().unwrap());
        if verb == "PROVISION_CHUNK" {
            assert!(fields[4].len() <= 2 * CHUNK_BYTES);
        }
        self.commands.push((verb.to_owned(), offset));
        if (verb == "PROVISION_CHUNK" && std::mem::take(&mut self.drop_chunk_request))
            || (verb == "PROVISION_COMMIT" && std::mem::take(&mut self.drop_commit_request))
        {
            return Ok(());
        }
        let mut scratch = [0; CONFIGURATION_BLOB_MAX_LEN];
        let LocalCommand::Provision(request) = parse_line(bytes, &mut scratch).unwrap() else {
            panic!("sender used non-provisioning command")
        };
        let mut response = self.writer.handle(
            request,
            self.now,
            &self.controller,
            self.ready(),
            Some(&self.store),
        );
        if self.noise {
            self.incoming.extend(vec![b'x'; LINE_BYTES + 20]);
            self.incoming.extend(b"\nSENSOR level=invalid\n\xff\xfe\n");
            let mut stale = response;
            stale.id += 999;
            self.queue(stale);
            let mut stale = response;
            stale.owner = Some(Owner {
                generation: 900,
                nonce: [0x77; 16],
            });
            self.queue(stale);
            self.incoming
                .extend(b"PROVISION 1 - Ok(Complete(StoredVerified)) extra\n");
        }
        if verb == "PROVISION_CHUNK" && self.incorrect_offset {
            response.result = Ok(Progress::Next(1));
        }
        let drop = (verb == "PROVISION_CHUNK" && std::mem::take(&mut self.drop_chunk_ack))
            || (verb == "PROVISION_COMMIT" && std::mem::take(&mut self.drop_commit_ack))
            || (verb == "PROVISION_BEGIN" && self.drop_begin_pending);
        if !drop {
            self.queue(response);
        }
        if verb == "PROVISION_COMMIT" && self.reboot_on_commit {
            self.incoming.clear();
            self.writer = Transfer::new();
        }
        if let Some(response) = self.writer.poll(self.now, &self.controller, self.ready()) {
            if !(self.drop_ready && response.result == Ok(Progress::Ready(0))
                || self.drop_reboot_ack && response.result == Ok(Progress::Rebooting))
            {
                self.queue(response);
            }
        }
        Ok(())
    }
    fn read(&mut self, deadline: u64) -> Result<Option<u8>, ()> {
        if self.flood {
            self.now += 1;
            return Ok(Some(b'x'));
        }
        if let Some(byte) = self.incoming.pop_front() {
            return Ok(Some(byte));
        }
        self.now = deadline;
        Ok(None)
    }
}

#[test]
fn actual_writer_installs_identical_bytes_and_only_explicit_reboot_gets_fresh_admission() {
    let bytes = public_fixture::record();
    let mut fake = Fake {
        noise: true,
        drop_begin_pending: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &bytes, [1; 16], false),
        Ok(Success {
            outcome: InstallOutcome::StoredVerified,
            reboot_acknowledged: false
        })
    );
    assert_eq!(*fake.store.bytes.borrow(), bytes);
    assert_eq!(fake.controller.admissions.get(), 1);
    assert!(!fake
        .commands
        .iter()
        .any(|(verb, _)| verb == "PROVISION_REBOOT"));
    assert_eq!(
        send(&mut fake, &bytes, [2; 16], true),
        Ok(Success {
            outcome: InstallOutcome::AlreadyPresentVerified,
            reboot_acknowledged: true
        })
    );
    assert_eq!(
        fake.controller.admissions.get(),
        3,
        "reboot needs its own fresh durable control acknowledgement"
    );
}

#[test]
fn lost_chunk_and_commit_acks_are_resolved_without_duplicate_writes() {
    let bytes = public_fixture::record();
    let mut fake = Fake {
        drop_chunk_ack: true,
        drop_commit_ack: true,
        ..Default::default()
    };
    assert!(send(&mut fake, &bytes, [3; 16], false).is_ok());
    let chunks: Vec<_> = fake
        .commands
        .iter()
        .filter_map(|(_, offset)| *offset)
        .collect();
    assert_eq!(
        chunks,
        (0..bytes.len()).step_by(CHUNK_BYTES).collect::<Vec<_>>()
    );
    assert_eq!(fake.store.calls.get(), 1);
    assert_eq!(
        fake.commands
            .iter()
            .filter(|(verb, _)| verb == "PROVISION_STATUS")
            .count(),
        2
    );
}

#[test]
fn lost_requests_replay_only_after_status_proves_the_unchanged_offset() {
    let mut fake = Fake {
        drop_chunk_request: true,
        drop_commit_request: true,
        ..Default::default()
    };
    assert!(send(&mut fake, &public_fixture::record(), [4; 16], false).is_ok());
    let verbs: Vec<_> = fake
        .commands
        .iter()
        .map(|(verb, _)| verb.as_str())
        .collect();
    assert_eq!(
        &verbs[1..5],
        &[
            "PROVISION_CHUNK",
            "PROVISION_STATUS",
            "PROVISION_STATUS",
            "PROVISION_CHUNK"
        ]
    );
    assert_eq!(
        &verbs[verbs.len() - 4..],
        &[
            "PROVISION_COMMIT",
            "PROVISION_STATUS",
            "PROVISION_STATUS",
            "PROVISION_COMMIT"
        ]
    );
    assert_eq!(fake.store.calls.get(), 1);
}

#[test]
fn reboot_during_lost_commit_is_uncertain_and_identical_retry_is_verified() {
    let bytes = public_fixture::record();
    let mut fake = Fake {
        reboot_on_commit: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &bytes, [5; 16], false),
        Err(Failure::CommitUncertain)
    );
    assert_eq!(*fake.store.bytes.borrow(), bytes);
    fake.reboot_on_commit = false;
    assert_eq!(
        send(&mut fake, &bytes, [6; 16], false).unwrap().outcome,
        InstallOutcome::AlreadyPresentVerified
    );
}

#[test]
fn bad_offsets_cancel_owned_staging_and_never_commit() {
    let mut fake = Fake {
        incorrect_offset: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &public_fixture::record(), [7; 16], false),
        Err(Failure::Protocol)
    );
    assert_eq!(fake.store.calls.get(), 0);
    assert_eq!(fake.commands.last().unwrap().0, "PROVISION_CANCEL");
    assert!(fake
        .writer
        .allows_runtime(crystal_shim_core::runtime::RuntimeCommand::ExitMaintenance));
}

#[test]
fn storage_errors_never_report_success_or_reboot() {
    for error in [
        InstallError::Storage,
        InstallError::Verification,
        InstallError::Conflict,
    ] {
        let mut fake = Fake::default();
        fake.store.error.set(Some(error));
        let result = send(&mut fake, &public_fixture::record(), [8; 16], true);
        assert_eq!(
            result,
            Err(if error == InstallError::Conflict {
                Failure::Rejected(Error::Store(error))
            } else {
                Failure::CommitUncertain
            })
        );
        assert_eq!(fake.controller.admissions.get(), 1);
    }
}

#[test]
fn no_ready_no_chunks_and_partial_transport_failure_never_appends_cancel() {
    let bytes = public_fixture::record();
    for stall in [false, true] {
        let mut fake = Fake {
            drop_ready: !stall,
            ..Default::default()
        };
        fake.controller.stall.set(stall);
        assert_eq!(
            send(&mut fake, &bytes, [9; 16], false),
            Err(Failure::Timeout)
        );
        assert!(!fake
            .commands
            .iter()
            .any(|(verb, _)| verb == "PROVISION_CHUNK"));
        assert!(fake.now <= ADMISSION_MS + 500);
    }
    let mut fake = Fake {
        write_failure: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &bytes, [10; 16], false),
        Err(Failure::Transport)
    );
    assert!(fake.commands.is_empty());
}

#[test]
fn bounded_diagnostic_flood_and_lost_reboot_ack_fail_honestly() {
    let mut fake = Fake {
        flood: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &public_fixture::record(), [11; 16], false),
        Err(Failure::Timeout)
    );
    assert!(fake.now < TOTAL_MS);
    let mut fake = Fake {
        drop_reboot_ack: true,
        ..Default::default()
    };
    assert_eq!(
        send(&mut fake, &public_fixture::record(), [12; 16], true),
        Err(Failure::RebootUncertain)
    );
    assert_eq!(fake.store.calls.get(), 1);
}

#[test]
fn replies_require_exact_grammar_ids_tokens_and_verified_outcomes() {
    let owner = Owner {
        generation: 4,
        nonce: [0x34; 16],
    };
    for result in [
        Ok(Progress::Pending),
        Ok(Progress::Ready(0)),
        Ok(Progress::Next(256)),
        Ok(Progress::Complete(InstallOutcome::StoredVerified)),
        Ok(Progress::Complete(InstallOutcome::AlreadyPresentVerified)),
        Ok(Progress::Cancelled),
        Ok(Progress::Rebooting),
        Err(Error::Store(InstallError::Storage)),
        Err(Error::Control(BridgeError::Control(
            ControlError::RecoveryRequired,
        ))),
    ] {
        let reply = Response {
            id: 17,
            owner: Some(owner),
            result,
        };
        assert_eq!(parse_response(format!("{reply}").as_bytes()), Some(reply));
    }
    for line in [
        "PROVISION 0 - Ok(Pending)",
        "PROVISION 01 - Ok(Pending)",
        "PROVISION 1 - Ok(Complete(Stored))",
        "PROVISION 1 - Ok(Pending) extra",
        "PROVISION 1 - Ok(Next(0256))",
        "PROVISION 1 - Ok(Next(99999))",
        "PROVISION 1 0:34343434343434343434343434343434 Ok(Pending)",
        "PROVISION 1 1:00000000000000000000000000000000 Ok(Pending)",
        "PROVISION 1 - Err(secret)",
    ] {
        assert_eq!(parse_response(line.as_bytes()), None);
    }
    let mut fake = Fake::default();
    assert_eq!(
        send(&mut fake, &public_fixture::record(), [0; 16], false),
        Err(Failure::Protocol)
    );
    assert!(fake.commands.is_empty());
}
