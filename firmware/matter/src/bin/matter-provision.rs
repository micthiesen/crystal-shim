//! Host-only private provisioning. Serial writes require explicit `send`; no flash/network tools.
#[path = "provision/cd.rs"]
mod cd;
#[path = "provision/crypto.rs"]
mod crypto;
#[path = "provision/files.rs"]
mod files;
#[path = "provision/sender.rs"]
mod sender;
#[path = "provision/serial.rs"]
mod serial;

use crystal_shim_matter::{
    provisioning::{self, Attestation, Metadata, Provisioning},
    sdk::{
        dm::clusters::dev_att::DeviceAttestation,
        pairing::{
            qr::{no_optional_data, CommFlowType, QrPayload},
            DiscoveryCapabilities,
        },
        BasicCommData,
    },
};
use files::{Bytes, Directory, Result};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};

const HELP: &str = "Private Matter provisioning (host tool; only send opens the explicitly named USB port)\n\
Commands: issue-dev, import, validate, send\n\
issue-dev/import required: --metadata FILE --pai-cert FILE --cd FILE --paa-cert FILE --cd-signer FILE --out NEW_DIRECTORY\n\
issue-dev also requires: --pai-key FILE (fresh device key; explicit development VID FFF1-FFF4)\n\
import also requires: --dac-cert FILE --dac-key FILE (unencrypted P-256 PEM)\n\
validate required: --record FILE --paa-cert FILE --cd-signer FILE\n\
send required: --record FILE --paa-cert FILE --cd-signer FILE --serial /absolute/device [--reboot]\n\
send verifies the same private bytes offline before opening USB. Success stays in maintenance unless --reboot requests a fresh writer acknowledgement. Close other terminal programs. No credentials are printed.\n\
Metadata has exactly vendor_id, product_id, hardware_version, vendor_name, serial_number, hardware_version_string as key=value lines. IDs accept decimal or 0x hex.\n\
PIN, discriminator and unique ID are freshly generated; private record.bin and pairing.txt are never printed. Certificates may be PEM or DER; CD is DER. Output must be new and outside git.\n\
Validation uses explicit local trust certificates, not an assertion of CSA certification or Apple Home acceptance. See docs/design/matter-provisioning.md.";

fn main() {
    let args: Vec<_> = std::env::args_os().skip(1).collect();
    if args.is_empty() || args[0] == "--help" || args[0] == "help" {
        println!("{HELP}");
        return;
    }
    match run(&args) {
        Ok(message) => println!("OK: {message}"),
        Err(error) => {
            eprintln!("ERROR: {error}");
            std::process::exit(1);
        }
    }
}
fn run(args: &[std::ffi::OsString]) -> Result<&'static str> {
    let command = args[0].to_str().ok_or("invalid command")?;
    if !matches!(command, "issue-dev" | "import" | "validate" | "send") {
        return Err("unknown command; use --help");
    }
    let mut options = BTreeMap::new();
    let mut reboot = false;
    let mut fields = args[1..].iter();
    while let Some(option) = fields.next() {
        let key = option.to_str().ok_or("invalid option name")?;
        if key == "--reboot" {
            if command != "send" || reboot {
                return Err("--reboot is allowed once, only with send");
            }
            reboot = true;
            continue;
        }
        let value = fields.next().ok_or("every file option requires one path")?;
        if options.insert(key, PathBuf::from(value)).is_some() {
            return Err("duplicate option");
        }
    }
    let expected: &[&str] = match command {
        "issue-dev" => &[
            "--metadata",
            "--pai-cert",
            "--pai-key",
            "--cd",
            "--paa-cert",
            "--cd-signer",
            "--out",
        ],
        "import" => &[
            "--metadata",
            "--pai-cert",
            "--dac-cert",
            "--dac-key",
            "--cd",
            "--paa-cert",
            "--cd-signer",
            "--out",
        ],
        "send" => &["--record", "--paa-cert", "--cd-signer", "--serial"],
        _ => &["--record", "--paa-cert", "--cd-signer"],
    };
    if expected.len() != options.len() || expected.iter().any(|key| !options.contains_key(key)) {
        return Err("missing or unsupported option; use --help");
    }
    let path = |key: &str| {
        options
            .get(key)
            .map(PathBuf::as_path)
            .ok_or("missing option")
    };
    if matches!(command, "validate" | "send") {
        let bytes = files::read(path("--record")?, true, provisioning::MAX_BYTES)?;
        let record =
            Provisioning::decode(&bytes.0).map_err(|_| "record rejected by production decoder")?;
        let scratch = temporary_directory()?;
        let result = validate(&scratch, &record, path("--paa-cert")?, path("--cd-signer")?);
        std::fs::remove_dir_all(&scratch.0).map_err(|_| "cannot remove validation scratch")?;
        result?;
        if command == "send" {
            // No serial inspection/open/configuration until decoder, signatures,
            // explicit PAA/CD trust, scratch cleanup and fresh randomness succeed.
            let random = crypto::random(16)?;
            let nonce: [u8; 16] = random.0.as_slice().try_into().map_err(|_| "nonce length")?;
            if nonce == [0; 16] {
                return Err("random nonce rejected; no serial device opened");
            }
            let mut port = serial::Serial::open(path("--serial")?)?;
            let success = sender::send(&mut port, &bytes.0, nonce, reboot)
                .map_err(sender::Failure::message)?;
            return Ok(if success.reboot_acknowledged {
                "installation verified; fresh reboot acknowledgement received (physical activation is not verified)"
            } else {
                "installation verified; controller remains in maintenance; no reboot requested"
            });
        }
        return Ok("offline provisioning validation complete; no credentials are printed");
    }
    let metadata_file = files::read(path("--metadata")?, false, 2048)?;
    let metadata = parse_metadata(&metadata_file.0)?;
    let vid = number(metadata["vendor_id"])?;
    let pid = number(metadata["product_id"])?;
    if command == "issue-dev" && !(0xfff1..=0xfff4).contains(&vid) {
        return Err("issue-dev requires an explicit Matter development VID FFF1-FFF4; no vendor ownership is assigned");
    }
    let directory = Directory::create(path("--out")?)?;
    let pai = crypto::certificate(path("--pai-cert")?, false)?;
    directory.write("pai.der", &pai.0)?;
    directory.write(
        "pai.pem",
        &crypto::pem_from_der(&directory.path("pai.der"))?.0,
    )?;
    let key = if command == "issue-dev" {
        crypto::generate_key()?
    } else {
        crypto::normalize_key(path("--dac-key")?)?
    };
    directory.write("device-key.pem", &key.0)?;
    let (private, public) = crypto::keypair(&directory.path("device-key.pem"))?;
    let dac = if command == "issue-dev" {
        crypto::issue_dac(&directory, path("--pai-key")?, vid, pid)?
    } else {
        crypto::certificate(path("--dac-cert")?, false)?
    };
    let declaration = files::read(path("--cd")?, false, 1536)?;
    let random = crypto::random(18)?;
    let unique_id = hex(&random.0[..16]);
    let discriminator =
        u16::from_le_bytes(random.0[16..18].try_into().map_err(|_| "random length")?) & 0x0fff;
    let pin = new_pin()?;
    let mut encoded = Bytes(vec![0; provisioning::MAX_BYTES]);
    let length = provisioning::encode(
        Metadata {
            vendor_id: vid,
            product_id: pid,
            hardware_version: number(metadata["hardware_version"])?,
            discriminator,
            passcode: pin,
            vendor_name: metadata["vendor_name"],
            serial_number: metadata["serial_number"],
            unique_id: &unique_id,
            hardware_version_string: metadata["hardware_version_string"],
        },
        Attestation {
            public_key: &public,
            private_key: private
                .0
                .as_slice()
                .try_into()
                .map_err(|_| "private key length")?,
            declaration: &declaration.0,
            pai: &pai.0,
            dac: &dac.0,
        },
        &mut encoded.0,
    )
    .map_err(|_| "metadata or attestation rejected by production encoder")?;
    let record = Provisioning::decode(&encoded.0[..length])
        .map_err(|_| "encoded record validation failed")?;
    // validate writes the normalized public materials and verifies their signatures.
    let cd = validate(
        &directory,
        &record,
        path("--paa-cert")?,
        path("--cd-signer")?,
    )?;
    if command == "issue-dev" && cd.certification_type != 0 {
        return Err("issue-dev requires a Development and Test CD");
    }
    directory.write("pairing.txt", &pairing(&record)?.0)?;
    directory.write("metadata.txt", &metadata_file.0)?;
    directory.write("validation.txt", format!("format=CSMAT01\nmode={command}\nrecord_length={length}\ncd_device_type=0x{:04X}\ncd_certification_type={}\ntrust=explicit-local-inputs\ncommissioner_acceptance=unverified\n", cd.device_type, cd.certification_type).as_bytes())?;
    // Atomically publish only after all validation and private files completed.
    directory.publish_record(&encoded.0[..length])?;
    Ok("offline provisioning validation complete; no credentials are printed")
}
fn parse_metadata(bytes: &[u8]) -> Result<BTreeMap<&str, &str>> {
    let text = std::str::from_utf8(bytes).map_err(|_| "metadata must be UTF-8")?;
    let mut map = BTreeMap::new();
    for line in text.lines().filter(|line| !line.is_empty()) {
        let (key, value) = line
            .split_once('=')
            .ok_or("metadata uses key=value lines")?;
        if value.is_empty()
            || value.chars().any(char::is_control)
            || map.insert(key, value).is_some()
        {
            return Err("metadata has an empty, duplicate or invalid field");
        }
    }
    let keys = [
        "vendor_id",
        "product_id",
        "hardware_version",
        "vendor_name",
        "serial_number",
        "hardware_version_string",
    ];
    if map.len() != keys.len() || keys.iter().any(|key| !map.contains_key(key)) {
        return Err("metadata fields do not match the documented schema");
    }
    Ok(map)
}
fn number(text: &str) -> Result<u16> {
    if let Some(hex) = text.strip_prefix("0x") {
        u16::from_str_radix(hex, 16)
    } else {
        text.parse()
    }
    .map_err(|_| "metadata integer outside u16 range")
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02X}")).collect()
}
fn new_pin() -> Result<u32> {
    for _ in 0..128 {
        let random = crypto::random(4)?;
        let pin = u32::from_le_bytes(
            random
                .0
                .as_slice()
                .try_into()
                .map_err(|_| "random length")?,
        ) & 0x07ff_ffff;
        // Rejection sampling, no modulo bias, same admitted set as production.
        if (1..=99_999_998).contains(&pin)
            && !pin.is_multiple_of(11_111_111)
            && !matches!(pin, 12_345_678 | 87_654_321)
        {
            return Ok(pin);
        }
    }
    Err("random source did not produce a valid setup PIN")
}
fn pairing(record: &Provisioning<'_>) -> Result<Bytes> {
    let commissioning = BasicCommData {
        password: record.passcode.to_le_bytes().into(),
        discriminator: record.discriminator,
    };
    let manual = commissioning.compute_pairing_code();
    let qr = QrPayload::new(
        DiscoveryCapabilities::BLE,
        CommFlowType::Standard,
        commissioning,
        record.vendor_id,
        record.product_id,
        record.serial_number,
        no_optional_data,
    );
    let mut scratch = [0; 512];
    let (payload, _) = qr
        .as_str(&mut scratch)
        .map_err(|_| "cannot encode pairing payload")?;
    Ok(Bytes(format!("Manual pairing code: {manual}\nQR payload: {payload}\nSetup PIN: {}\nDiscriminator: {}\nKeep private. Pairing and controller acceptance are not tested by this file.\n", record.passcode, record.discriminator).into_bytes()))
}
fn temporary_directory() -> Result<Directory> {
    let nonce = hex(&crypto::random(8)?.0);
    Directory::create(&std::env::temp_dir().join(format!(
        "crystal-shim-provision-{}-{nonce}",
        std::process::id()
    )))
}
fn validate(
    directory: &Directory,
    record: &Provisioning<'_>,
    root: &Path,
    signer: &Path,
) -> Result<cd::Declaration> {
    let paa = crypto::certificate(root, false)?;
    let signer = crypto::certificate(signer, false)?;
    for (name, bytes) in [
        ("dac.der", record.dac()),
        ("cd.der", record.cert_declaration()),
        ("paa.der", paa.0.as_slice()),
        ("cd-signer.der", signer.0.as_slice()),
    ] {
        directory.write(name, bytes)?;
    }
    // issue/import already wrote the PAI before signing. Validation-only did not.
    if !directory.path("pai.der").exists() {
        directory.write("pai.der", record.pai())?;
    }
    for name in ["dac", "pai", "paa", "cd-signer"] {
        if !directory.path(&format!("{name}.pem")).exists() {
            directory.write(
                &format!("{name}.pem"),
                &crypto::pem_from_der(&directory.path(&format!("{name}.der")))?.0,
            )?;
        }
    }
    crypto::verify_chain(directory)?;
    let payload = crypto::verify_cd(directory)?;
    cd::check(&payload.0, record, &paa.0).map_err(|_| "CD payload does not apply to this record")
}
