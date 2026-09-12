//! Offline end-to-end tool checks. Fresh device keys stay in private scratch.
//! The checked-in key is the upstream public TEST ISSUER, never a device key.
use crystal_shim_matter::{
    provisioning::{Provisioning, MAX_BYTES},
    sdk::dm::clusters::dev_att::DeviceAttestation,
};
use std::fs::{self, DirBuilder, OpenOptions};
use std::io::Write;
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicU64, Ordering};
static NEXT: AtomicU64 = AtomicU64::new(0);
struct Scratch(PathBuf);
impl Scratch {
    fn new() -> Self {
        let nonce = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "crystal-shim-provision-test-{}-{nonce}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        DirBuilder::new().mode(0o700).create(&path).unwrap();
        let this = Self(path);
        let fixtures =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/development-authority");
        for name in [
            "pai.pem",
            "PUBLIC-TEST-ISSUER-key.pem",
            "paa.pem",
            "cd-signer.pem",
            "cd.der",
        ] {
            this.write(name, &fs::read(fixtures.join(name)).unwrap());
        }
        this.write("metadata.txt", b"vendor_id=0xFFF1\nproduct_id=0x8000\nhardware_version=1\nvendor_name=Crystal Shim private test\nserial_number=offline-test\nhardware_version_string=test\n");
        this
    }
    fn path(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
    fn write(&self, name: &str, bytes: &[u8]) {
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .mode(0o600)
            .open(self.path(name))
            .unwrap()
            .write_all(bytes)
            .unwrap();
    }
    fn issue(&self, out: &str, cd: &str) -> Output {
        tool(&[
            "issue-dev",
            "--metadata",
            self.path("metadata.txt").to_str().unwrap(),
            "--pai-cert",
            self.path("pai.pem").to_str().unwrap(),
            "--pai-key",
            self.path("PUBLIC-TEST-ISSUER-key.pem").to_str().unwrap(),
            "--cd",
            self.path(cd).to_str().unwrap(),
            "--paa-cert",
            self.path("paa.pem").to_str().unwrap(),
            "--cd-signer",
            self.path("cd-signer.pem").to_str().unwrap(),
            "--out",
            self.path(out).to_str().unwrap(),
        ])
    }
    fn validate(&self, record: &str, paa: &str, signer: &str) -> Output {
        tool(&[
            "validate",
            "--record",
            self.path(record).to_str().unwrap(),
            "--paa-cert",
            self.path(paa).to_str().unwrap(),
            "--cd-signer",
            self.path(signer).to_str().unwrap(),
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
    assert!(output.status.success(), "offline tool operation failed");
}
fn failure(output: &Output) {
    assert!(!output.status.success(), "invalid input was accepted");
}
fn no_secrets(output: &Output, record: &Provisioning<'_>) {
    for stream in [&output.stdout, &output.stderr] {
        assert!(!stream
            .windows(32)
            .any(|window| window == record.dac_priv_key().access()));
        assert!(!String::from_utf8_lossy(stream).contains(&record.passcode.to_string()));
        assert!(!String::from_utf8_lossy(stream).contains("PRIVATE KEY"));
    }
}

fn pseudo_terminal() -> (std::fs::File, std::fs::File, PathBuf) {
    use std::os::fd::FromRawFd;
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
    let path = unsafe { std::ffi::CStr::from_ptr(name.as_ptr()) }
        .to_str()
        .unwrap();
    (
        unsafe { std::fs::File::from_raw_fd(master) },
        unsafe { std::fs::File::from_raw_fd(slave) },
        PathBuf::from(path),
    )
}

fn send_args(scratch: &Scratch, record: &str, serial: &Path, paa: &str) -> Output {
    tool(&[
        "send",
        "--record",
        scratch.path(record).to_str().unwrap(),
        "--paa-cert",
        scratch.path(paa).to_str().unwrap(),
        "--cd-signer",
        scratch.path("cd-signer.pem").to_str().unwrap(),
        "--serial",
        serial.to_str().unwrap(),
    ])
}

#[test]
fn sender_rejects_private_file_and_trust_failures_before_any_terminal_mutation() {
    use std::os::fd::AsRawFd;
    let scratch = Scratch::new();
    success(&scratch.issue("send", "cd.der"));
    let (master, slave, path) = pseudo_terminal();
    let mut original: libc::termios = unsafe { std::mem::zeroed() };
    assert_eq!(
        unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut original) },
        0
    );
    original.c_cflag |= libc::HUPCL;
    original.c_lflag |= libc::ECHO;
    assert_eq!(
        unsafe { libc::tcsetattr(slave.as_raw_fd(), libc::TCSANOW, &original) },
        0
    );
    scratch.write("bad-record.bin", b"invalid secret-bearing record");
    scratch.write("bad-root.pem", b"invalid root certificate");
    std::os::unix::fs::symlink(scratch.path("send/record.bin"), scratch.path("symlink.bin"))
        .unwrap();
    scratch.write(
        "world-readable.bin",
        &fs::read(scratch.path("send/record.bin")).unwrap(),
    );
    fs::set_permissions(
        scratch.path("world-readable.bin"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    let record_bytes = fs::read(scratch.path("send/record.bin")).unwrap();
    let record = Provisioning::decode(&record_bytes).unwrap();
    for (file, root) in [
        ("bad-record.bin", "paa.pem"),
        ("symlink.bin", "paa.pem"),
        ("world-readable.bin", "paa.pem"),
        ("send/record.bin", "bad-root.pem"),
        ("send/record.bin", "pai.pem"),
    ] {
        let output = send_args(&scratch, file, &path, root);
        failure(&output);
        no_secrets(&output, &record);
        assert!(
            !String::from_utf8_lossy(&output.stderr).contains("serial"),
            "validation must fail before serial access"
        );
        let mut after = original;
        assert_eq!(unsafe { libc::tcgetattr(slave.as_raw_fd(), &mut after) }, 0);
        assert_eq!(after.c_cflag, original.c_cflag);
        assert_eq!(after.c_lflag, original.c_lflag);
        let mut descriptor = libc::pollfd {
            fd: master.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        };
        assert_eq!(unsafe { libc::poll(&mut descriptor, 1, 0) }, 0);
    }
    let invalid_flag = tool(&["validate", "--reboot"]);
    failure(&invalid_flag);
    let duplicate_flag = tool(&["send", "--reboot", "--reboot"]);
    failure(&duplicate_flag);
}

#[test]
fn validated_cli_sends_exact_loaded_record_over_fragmented_pseudo_terminal() {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    use std::os::fd::AsRawFd;
    let scratch = Scratch::new();
    success(&scratch.issue("send", "cd.der"));
    let bytes = fs::read(scratch.path("send/record.bin")).unwrap();
    let expected = bytes.clone();
    let replacement_path = scratch.path("send/record.bin");
    let (mut master, _slave, path) = pseudo_terminal();
    let emulator = std::thread::spawn(move || {
        let mut line = Vec::new();
        let mut collected = Vec::new();
        let mut owner = String::new();
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            assert!(
                !remaining.is_zero(),
                "bounded pseudo-terminal exchange timed out"
            );
            let mut descriptor = libc::pollfd {
                fd: master.as_raw_fd(),
                events: libc::POLLIN,
                revents: 0,
            };
            let timeout = remaining.as_millis().clamp(1, i32::MAX as u128) as i32;
            let polled = unsafe { libc::poll(&mut descriptor, 1, timeout) };
            if polled < 0
                && std::io::Error::last_os_error().kind() == std::io::ErrorKind::Interrupted
            {
                // Concurrent OpenSSL child exits can interrupt poll on Linux.
                // Retry against the same deadline, never a renewed timeout.
                continue;
            }
            if polled == 0 {
                continue;
            }
            assert_eq!(polled, 1);
            let mut byte = [0];
            master.read_exact(&mut byte).unwrap();
            if byte[0] != b'\n' {
                line.push(byte[0]);
                continue;
            }
            let text = std::str::from_utf8(&line).unwrap();
            let fields: Vec<_> = text.split_ascii_whitespace().collect();
            let id = fields[0];
            let result = match fields[1] {
                "PROVISION_BEGIN" => {
                    assert_eq!(fields.len(), 5);
                    assert_eq!(fields[2].len(), 32);
                    assert_ne!(fields[2], "00000000000000000000000000000000");
                    assert_eq!(fields[3].parse::<usize>().unwrap(), expected.len());
                    assert_eq!(
                        fields[4],
                        Sha256::digest(&expected)
                            .iter()
                            .map(|b| format!("{b:02x}"))
                            .collect::<String>()
                    );
                    owner = format!("1:{}", fields[2]);
                    // Prove there is no second record read after opening USB.
                    fs::write(&replacement_path, b"replacement after validation").unwrap();
                    master
                        .write_all(
                            format!("SENSOR invalid\r\nPROVISION {id} {owner} Ok(Pending)\r\n")
                                .as_bytes(),
                        )
                        .unwrap();
                    "Ready(0)".to_owned()
                }
                "PROVISION_CHUNK" => {
                    assert_eq!(fields.len(), 5);
                    assert_eq!(fields[2], owner);
                    assert_eq!(fields[3].parse::<usize>().unwrap(), collected.len());
                    assert!(fields[4].len() <= 512);
                    for pair in fields[4].as_bytes().as_chunks::<2>().0 {
                        collected.push(
                            u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap(),
                        );
                    }
                    format!("Next({})", collected.len())
                }
                "PROVISION_COMMIT" => {
                    assert_eq!(fields[2], owner);
                    assert_eq!(collected, expected);
                    master
                        .write_all(
                            format!("PROVISION {id} {owner} Ok(Complete(StoredVerified))\r\n")
                                .as_bytes(),
                        )
                        .unwrap();
                    return master; // Keep master alive until child has consumed final bytes.
                }
                _ => panic!(
                    "default sender must not reboot, exit maintenance or send other commands"
                ),
            };
            let reply = format!("PROVISION {id} {owner} Ok({result})\r\n");
            // Deliberate boundaries inside prefix, owner and payload.
            for fragment in reply.as_bytes().chunks(7) {
                master.write_all(fragment).unwrap();
            }
            line.fill(0);
            line.clear();
        }
    });
    let output = send_args(&scratch, "send/record.bin", &path, "paa.pem");
    let _master = emulator.join().unwrap();
    success(&output);
    no_secrets(&output, &Provisioning::decode(&bytes).unwrap());
    assert!(String::from_utf8_lossy(&output.stdout)
        .contains("remains in maintenance; no reboot requested"));
}
#[test]
fn fresh_issuance_import_and_validation_use_real_codec_without_printing_secrets() {
    let scratch = Scratch::new();
    let first = scratch.issue("first", "cd.der");
    success(&first);
    let second = scratch.issue("second", "cd.der");
    success(&second);
    let first_bytes = fs::read(scratch.path("first/record.bin")).unwrap();
    let second_bytes = fs::read(scratch.path("second/record.bin")).unwrap();
    let first_record = Provisioning::decode(&first_bytes).unwrap();
    let second_record = Provisioning::decode(&second_bytes).unwrap();
    assert!(first_bytes.len() <= MAX_BYTES);
    assert!(first_record.dac_priv_key().access() != second_record.dac_priv_key().access());
    assert!(first_record.unique_id != second_record.unique_id);
    no_secrets(&first, &first_record);
    no_secrets(&second, &second_record);
    let checked = scratch.validate("first/record.bin", "paa.pem", "cd-signer.pem");
    success(&checked);
    no_secrets(&checked, &first_record);
    let imported = tool(&[
        "import",
        "--metadata",
        scratch.path("metadata.txt").to_str().unwrap(),
        "--pai-cert",
        scratch.path("pai.pem").to_str().unwrap(),
        "--dac-cert",
        scratch.path("first/dac.der").to_str().unwrap(),
        "--dac-key",
        scratch.path("first/device-key.pem").to_str().unwrap(),
        "--cd",
        scratch.path("cd.der").to_str().unwrap(),
        "--paa-cert",
        scratch.path("paa.pem").to_str().unwrap(),
        "--cd-signer",
        scratch.path("cd-signer.pem").to_str().unwrap(),
        "--out",
        scratch.path("imported").to_str().unwrap(),
    ]);
    success(&imported);
    no_secrets(&imported, &first_record);
    let imported_bytes = fs::read(scratch.path("imported/record.bin")).unwrap();
    let imported_record = Provisioning::decode(&imported_bytes).unwrap();
    assert!(first_record.dac_priv_key().access() == imported_record.dac_priv_key().access());
    for folder in ["first", "second", "imported"] {
        assert_eq!(
            fs::metadata(scratch.path(folder))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        for file in fs::read_dir(scratch.path(folder)).unwrap() {
            assert_eq!(
                file.unwrap().metadata().unwrap().permissions().mode() & 0o777,
                0o600
            );
        }
    }
}
#[test]
fn signature_trust_and_cd_identity_fail_without_publishing_a_record() {
    let scratch = Scratch::new();
    success(&scratch.issue("good", "cd.der"));
    let mut bytes = fs::read(scratch.path("good/record.bin")).unwrap();
    // DAC signature change is structurally valid to the embedded decoder.
    *bytes.last_mut().unwrap() ^= 1;
    assert!(Provisioning::decode(&bytes).is_ok());
    scratch.write("changed.bin", &bytes);
    failure(&scratch.validate("changed.bin", "paa.pem", "cd-signer.pem"));
    failure(&scratch.validate("good/record.bin", "cd-signer.pem", "cd-signer.pem"));
    failure(&scratch.validate("good/record.bin", "paa.pem", "paa.pem"));
    let mut cd = fs::read(scratch.path("cd.der")).unwrap();
    *cd.last_mut().unwrap() ^= 1;
    scratch.write("changed-cd.der", &cd);
    failure(&scratch.issue("bad-cd", "changed-cd.der"));
    assert!(!scratch.path("bad-cd/record.bin").exists());
    let metadata = fs::read_to_string(scratch.path("metadata.txt"))
        .unwrap()
        .replace("0x8000", "0x8064");
    fs::write(scratch.path("metadata.txt"), metadata).unwrap();
    failure(&scratch.issue("outside-cd", "cd.der"));
    assert!(!scratch.path("outside-cd/record.bin").exists());
}
#[test]
fn unsafe_files_and_existing_output_are_rejected_without_overwrite() {
    let scratch = Scratch::new();
    success(&scratch.issue("good", "cd.der"));
    let original = fs::read(scratch.path("good/record.bin")).unwrap();
    failure(&scratch.issue("good", "cd.der"));
    assert!(fs::read(scratch.path("good/record.bin")).unwrap() == original);
    fs::set_permissions(
        scratch.path("good/record.bin"),
        fs::Permissions::from_mode(0o644),
    )
    .unwrap();
    failure(&scratch.validate("good/record.bin", "paa.pem", "cd-signer.pem"));
    fs::set_permissions(
        scratch.path("good/record.bin"),
        fs::Permissions::from_mode(0o600),
    )
    .unwrap();
    std::os::unix::fs::symlink(scratch.path("good/record.bin"), scratch.path("link.bin")).unwrap();
    failure(&scratch.validate("link.bin", "paa.pem", "cd-signer.pem"));
    assert!(Command::new("mkfifo")
        .arg(scratch.path("fifo.bin"))
        .status()
        .unwrap()
        .success());
    failure(&scratch.validate("fifo.bin", "paa.pem", "cd-signer.pem"));
    fs::create_dir(scratch.path(".git")).unwrap();
    failure(&scratch.issue("inside-git", "cd.der"));
    assert!(!scratch.path("inside-git").exists());
}
