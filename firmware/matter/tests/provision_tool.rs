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
