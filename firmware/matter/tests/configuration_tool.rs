//! Host-only bootstrap checks. Serial tests allocate their own pseudo terminals.
use crystal_shim_core::{
    configuration::{RawDeviceConfig, RawScheduleEntry, ValidatedDeviceConfig},
    runtime::{Acknowledgement, Observation, Record, Runtime, RuntimeCommand, StoreCompletion},
    runtime_ingress::Receiver,
    Fault, HardwarePermit, Millis, Reading, RelayCommand, State, Timing,
};
use std::{
    fs::{self, DirBuilder, File, OpenOptions},
    io::{Read, Write},
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt},
    },
    path::{Path, PathBuf},
    process::{Command, Output},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

static NEXT: AtomicU64 = AtomicU64::new(0);
const PARAMETERS: &[u8] =
    b"stop_level=200\nrestart_level=800\nmax_sample_age_ms=500\ntimezone_rule=UTC0\n";
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "crystal-shim-config-test-{}-{stamp}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        DirBuilder::new().mode(0o700).create(&path).unwrap();
        let this = Self(path);
        this.write("parameters.txt", PARAMETERS);
        this
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn write(&self, name: &str, bytes: &[u8]) {
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(self.path(name))
            .unwrap()
            .write_all(bytes)
            .unwrap();
    }
    fn create(&self, parameters: &str, output: &str) -> Output {
        tool(&[
            "config-create",
            "--parameters",
            self.path(parameters).to_str().unwrap(),
            "--out",
            self.path(output).to_str().unwrap(),
        ])
    }
    fn send(&self, record: &str, serial: &Path) -> Output {
        tool(&[
            "config-send",
            "--record",
            self.path(record).to_str().unwrap(),
            "--serial",
            serial.to_str().unwrap(),
        ])
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn tool(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_matter-provision"))
        .args(args)
        .output()
        .unwrap()
}
fn success(output: &Output) {
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
}
fn failure(output: &Output) {
    assert!(!output.status.success());
}
fn no_secrets(output: &Output, record: &[u8]) {
    let config = ValidatedDeviceConfig::decode(record).unwrap();
    let hex: String = config
        .settings_auth_token()
        .as_bytes()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    for text in [&output.stdout, &output.stderr] {
        assert!(!text
            .windows(32)
            .any(|bytes| bytes == config.settings_auth_token().as_bytes()));
        assert!(!String::from_utf8_lossy(text).contains(&hex));
        assert!(!text.windows(record.len()).any(|bytes| bytes == record));
    }
}
fn fixture(revision: u32, scheduled: bool) -> Vec<u8> {
    let entries = [RawScheduleEntry::new(1, 0x7f, 3600)];
    let raw = RawDeviceConfig::builder(
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
    .build();
    ValidatedDeviceConfig::from_raw(raw)
        .unwrap()
        .encode()
        .unwrap()
        .as_bytes()
        .to_vec()
}

#[test]
fn create_and_validate_private_bootstrap_with_fresh_tokens_and_no_physical_claims() {
    let scratch = Scratch::new();
    let mut tokens = Vec::new();
    for name in ["first", "second"] {
        let output = scratch.create("parameters.txt", name);
        success(&output);
        let record = fs::read(scratch.path(&format!("{name}/record.bin"))).unwrap();
        no_secrets(&output, &record);
        let config = ValidatedDeviceConfig::decode(&record).unwrap();
        assert_eq!(record.len(), 96);
        assert_eq!(config.revision(), 1);
        assert_eq!(config.thresholds(), (200, 800));
        assert_eq!(config.max_sample_age_ms(), 500);
        assert_eq!(config.timing(), Timing::PROVISIONAL);
        assert_eq!(config.schedule().run_duration_seconds(), 900);
        assert!(config.schedule().entries().is_empty());
        assert!(config.calibration().is_none());
        assert!(config.pushover().is_none());
        let token = fs::read(scratch.path(&format!("{name}/settings-token.txt"))).unwrap();
        let expected = format!(
            "{}\n",
            config
                .settings_auth_token()
                .as_bytes()
                .iter()
                .map(|byte| format!("{byte:02x}"))
                .collect::<String>()
        );
        assert_eq!(token, expected.as_bytes());
        tokens.push(token);
        assert_eq!(
            fs::metadata(scratch.path(name))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        for file in [
            "record.bin",
            "parameters.txt",
            "settings-token.txt",
            "validation.txt",
        ] {
            assert_eq!(
                fs::metadata(scratch.path(&format!("{name}/{file}")))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        assert!(!scratch.path(&format!("{name}/record.pending")).exists());
        let validation = tool(&[
            "config-validate",
            "--record",
            scratch
                .path(&format!("{name}/record.bin"))
                .to_str()
                .unwrap(),
        ]);
        success(&validation);
        no_secrets(&validation, &record);
        let again = scratch.create("parameters.txt", name);
        failure(&again);
        no_secrets(&again, &record);
        assert_eq!(
            fs::read(scratch.path(&format!("{name}/record.bin"))).unwrap(),
            record
        );
    }
    assert_ne!(tokens[0], tokens[1]);
}

#[test]
fn malformed_parameters_and_unsupported_mutations_publish_nothing() {
    let scratch = Scratch::new();
    for (index, extra) in [
        "revision=2\n",
        "settings_auth_token=secret\n",
        "calibration=synthetic\n",
        "schedule=1\n",
        "stop_level=201\n",
        "low_confirmation_ms=0\n",
        "recovery_ms=0\n",
        "minimum_off_ms=0\n",
    ]
    .iter()
    .enumerate()
    {
        let input = format!("invalid-{index}.txt");
        let output = format!("invalid-{index}");
        scratch.write(&input, &[PARAMETERS, extra.as_bytes()].concat());
        failure(&scratch.create(&input, &output));
        assert!(!scratch.path(&output).exists());
    }
    for command in ["config-create", "config-validate", "config-send"] {
        failure(&tool(&[command, "--reboot"]));
        failure(&tool(&[command, "--force", "yes"]));
        failure(&tool(&[command, "--record", "one", "--record", "two"]));
    }
}

fn pseudo_terminal() -> (File, File, PathBuf) {
    let mut master = -1;
    let mut slave = -1;
    let mut name = [0 as libc::c_char; 256];
    assert_eq!(
        unsafe {
            libc::openpty(
                &mut master,
                &mut slave,
                name.as_mut_ptr(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        },
        0
    );
    // The CLI must not inherit its emulator's master: that would keep the PTY
    // alive after a simulated disconnect and exercise timeout instead of EOF.
    for descriptor in [master, slave] {
        assert_eq!(
            unsafe { libc::fcntl(descriptor, libc::F_SETFD, libc::FD_CLOEXEC) },
            0
        );
    }
    let path = PathBuf::from(
        unsafe { std::ffi::CStr::from_ptr(name.as_ptr()) }
            .to_str()
            .unwrap(),
    );
    (
        unsafe { File::from_raw_fd(master) },
        unsafe { File::from_raw_fd(slave) },
        path,
    )
}
fn readable(file: &File, until: Instant) -> bool {
    loop {
        let remaining = until.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return false;
        }
        let mut descriptor = libc::pollfd {
            fd: file.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        let result = unsafe {
            libc::poll(
                &mut descriptor,
                1,
                remaining.as_millis().clamp(1, i32::MAX as u128) as i32,
            )
        };
        if result < 0 && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted {
            continue;
        }
        assert!(result >= 0, "owned PTY poll failed");
        if result == 0 {
            continue;
        }
        return descriptor.revents & libc::POLLIN != 0;
    }
}

#[test]
fn invalid_private_files_and_profiles_fail_before_any_serial_mutation() {
    let scratch = Scratch::new();
    let record = fixture(1, false);
    scratch.write("valid.bin", &record);
    scratch.write("bad.bin", b"CSMAT01 not a configuration");
    let mut crc = record.clone();
    crc[20] ^= 1;
    scratch.write("crc.bin", &crc);
    scratch.write("revision.bin", &fixture(2, false));
    scratch.write("scheduled.bin", &fixture(1, true));
    scratch.write("oversized.bin", &[0x5a; 2049]);
    scratch.write("public.bin", &record);
    fs::set_permissions(
        scratch.path("public.bin"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    std::os::unix::fs::symlink(scratch.path("valid.bin"), scratch.path("link.bin")).unwrap();
    let fifo = std::ffi::CString::new(scratch.path("fifo").as_os_str().as_encoded_bytes()).unwrap();
    assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
    let (master, slave, path) = pseudo_terminal();
    let mut before: libc::termios = unsafe { std::mem::zeroed() };
    assert_eq!(
        unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut before) },
        0
    );
    before.c_cflag |= libc::HUPCL;
    before.c_lflag |= libc::ECHO;
    assert_eq!(
        unsafe { libc::tcsetattr(slave.as_raw_fd(), libc::TCSANOW, &before) },
        0
    );
    for name in [
        "bad.bin",
        "crc.bin",
        "revision.bin",
        "scheduled.bin",
        "oversized.bin",
        "public.bin",
        "link.bin",
        "fifo",
        ".",
    ] {
        let result = scratch.send(name, &path);
        failure(&result);
        no_secrets(&result, &record);
        let mut after = before;
        assert_eq!(unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut after) }, 0);
        assert_eq!(after.c_cflag, before.c_cflag);
        assert_eq!(after.c_lflag, before.c_lflag);
        assert!(!readable(
            &master,
            Instant::now() + Duration::from_millis(2)
        ));
    }
}

fn observation(now: u64) -> Observation {
    Observation {
        now: Millis(now),
        sensor_revision: 0,
        reading: Reading::Invalid(Fault::Uncalibrated),
        hardware: HardwarePermit::Allowed,
        maintenance_pressed: false,
        force_off: false,
        clock_update: Default::default(),
    }
}

#[test]
fn real_cli_sends_one_validated_record_over_fragmented_owned_pty() {
    let scratch = Scratch::new();
    success(&scratch.create("parameters.txt", "send"));
    let bytes = fs::read(scratch.path("send/record.bin")).unwrap();
    let expected = bytes.clone();
    let replacement = scratch.path("send/record.bin");
    let (mut master, slave, path) = pseudo_terminal();
    let emulator = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut receiver = Receiver::new();
        let mut changed = false;
        let request = loop {
            assert!(readable(&master, deadline), "bounded PTY request timeout");
            let mut byte = [0];
            master.read_exact(&mut byte).unwrap();
            if !changed {
                // Sender already loaded bytes before it opened/configured this port.
                fs::write(&replacement, b"invalid replacement after open").unwrap();
                changed = true;
                let mut state: libc::termios = unsafe { std::mem::zeroed() };
                assert_eq!(unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut state) }, 0);
                assert_eq!(state.c_lflag & (libc::ECHO | libc::ICANON), 0);
                assert_eq!(state.c_cflag & libc::HUPCL, 0);
            }
            if let Some(request) = receiver.push(0, byte[0]) {
                break request.unwrap();
            }
        };
        assert_ne!(request.id, 0);
        let RuntimeCommand::SaveConfiguration(actual) = request.command else {
            panic!("only CONFIG allowed");
        };
        assert_eq!(actual.encode().unwrap().as_bytes(), expected);
        let mut runtime = Runtime::new(None, None, Millis(0)).unwrap();
        let initial = runtime.step(observation(0), Some(request), None);
        assert!(initial.command_reply.is_none());
        assert!(matches!(
            runtime.store_request().unwrap().record,
            Record::Retained(_)
        ));
        master
            .write_all(format!("diagnostic uncalibrated\r\nACCEPTED {}\r\n", request.id).as_bytes())
            .unwrap();
        let ticket = runtime.store_request().unwrap().ticket;
        let first = runtime.step(
            observation(20),
            None,
            Some(StoreCompletion {
                ticket,
                succeeded: true,
            }),
        );
        assert!(first.completed_reply.is_none());
        assert!(runtime.configuration().is_none());
        let ticket = runtime.store_request().unwrap().ticket;
        let done = runtime.step(
            observation(40),
            None,
            Some(StoreCompletion {
                ticket,
                succeeded: true,
            }),
        );
        let reply = done.completed_reply.unwrap();
        assert_eq!(reply.result, Ok(Acknowledgement::Durable));
        assert!(runtime.durable_maintenance());
        assert_eq!(done.status.unwrap().control.state, State::Maintenance);
        assert_eq!(done.status.unwrap().control.relay, RelayCommand::Off);
        for fragment in format!("REPLY {} {:?}\r\n", reply.id, reply.result)
            .as_bytes()
            .chunks(3)
        {
            master.write_all(fragment).unwrap();
        }
        assert!(
            !readable(&master, Instant::now() + Duration::from_millis(100)),
            "unexpected second command or echo"
        );
        (master, slave)
    });
    let result = scratch.send("send/record.bin", &path);
    let _ports = emulator.join().unwrap();
    success(&result);
    no_secrets(&result, &bytes);
    assert!(String::from_utf8_lossy(&result.stdout)
        .contains("acknowledged durable; maintenance remains active"));
}

#[test]
fn disconnected_pty_after_complete_config_reports_unknown_without_retry() {
    let scratch = Scratch::new();
    let bytes = fixture(1, false);
    scratch.write("record.bin", &bytes);
    let (mut master, slave, path) = pseudo_terminal();
    let emulator = std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut receiver = Receiver::new();
        loop {
            assert!(readable(&master, deadline));
            let mut byte = [0];
            master.read_exact(&mut byte).unwrap();
            if let Some(request) = receiver.push(0, byte[0]) {
                assert!(matches!(
                    request.unwrap().command,
                    RuntimeCommand::SaveConfiguration(_)
                ));
                break;
            }
        }
        // The complete newline arrived; no durable reply can reach this host.
        drop(master);
        drop(slave);
    });
    let result = scratch.send("record.bin", &path);
    emulator.join().unwrap();
    failure(&result);
    no_secrets(&result, &bytes);
    assert!(String::from_utf8_lossy(&result.stderr).contains("outcome is uncertain"));
}
