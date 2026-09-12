//! OpenSSL uses file arguments and captured pipes; never echo its stderr or key data.
use crate::files::{self, Bytes, Directory, Result};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use std::ffi::OsString;
use std::path::Path;
use std::process::{Command, Stdio};

pub fn openssl(args: &[OsString]) -> Result<Bytes> {
    openssl_input(args, None)
}
fn openssl_input(args: &[OsString], input: Option<&[u8]>) -> Result<Bytes> {
    use std::io::Write;
    let mut child = Command::new("openssl")
        .args(args)
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "OpenSSL is unavailable")?;
    if let Some(input) = input {
        let written = child
            .stdin
            .take()
            .ok_or("missing OpenSSL input pipe")?
            .write_all(input);
        if written.is_err() {
            let _ = child.kill();
            let _ = child.wait();
            return Err("OpenSSL input failed");
        }
    }
    let mut output = child
        .wait_with_output()
        .map_err(|_| "OpenSSL did not complete")?;
    output.stderr.fill(0);
    if !output.status.success() {
        output.stdout.fill(0);
        return Err("OpenSSL operation failed; no subprocess output is echoed");
    }
    Ok(Bytes(output.stdout))
}
pub fn arguments(args: &[&str]) -> Vec<OsString> {
    args.iter().map(OsString::from).collect()
}
pub fn certificate(path: &Path, private: bool) -> Result<Bytes> {
    let input = files::read(path, private, 8192)?;
    let format = if input.0.starts_with(b"-----BEGIN CERTIFICATE-----") {
        "PEM"
    } else {
        "DER"
    };
    openssl_input(
        &arguments(&["x509", "-inform", format, "-outform", "DER"]),
        Some(&input.0),
    )
}
pub fn pem_from_der(path: &Path) -> Result<Bytes> {
    let mut args = arguments(&["x509", "-inform", "DER", "-in"]);
    args.push(path.as_os_str().to_owned());
    args.extend(arguments(&["-outform", "PEM"]));
    openssl(&args)
}
pub fn normalize_key(path: &Path) -> Result<Bytes> {
    let private = files::read(path, true, 8192)?;
    openssl_input(&arguments(&["pkey", "-passin", "pass:"]), Some(&private.0))
}
pub fn generate_key() -> Result<Bytes> {
    openssl(&arguments(&[
        "genpkey",
        "-algorithm",
        "EC",
        "-pkeyopt",
        "ec_paramgen_curve:P-256",
    ]))
}
pub fn random(count: usize) -> Result<Bytes> {
    let result = openssl(&arguments(&["rand", &count.to_string()]))?;
    if result.0.len() != count {
        return Err("random source returned an invalid length");
    }
    Ok(result)
}
pub fn keypair(path: &Path) -> Result<(Bytes, [u8; 65])> {
    let mut args = arguments(&["ec", "-passin", "pass:", "-in"]);
    args.push(path.as_os_str().to_owned());
    args.extend(arguments(&["-outform", "DER"]));
    let der = openssl(&args)?;
    // SEC1 ECPrivateKey: SEQUENCE, version INTEGER 1, OCTET STRING scalar.
    // OpenSSL normalized it; still check every boundary and derive/validate P-256.
    let mut cursor = der.0.as_slice();
    let sequence = take_der(&mut cursor, 0x30)?;
    if !cursor.is_empty() {
        return Err("invalid private key encoding");
    }
    let mut sequence = sequence;
    if take_der(&mut sequence, 0x02)? != [1] {
        return Err("unsupported private key version");
    }
    let raw = take_der(&mut sequence, 0x04)?;
    let key = p256::SecretKey::from_slice(raw).map_err(|_| "invalid P-256 device private key")?;
    // Confirm the key really names P-256, not another 32-byte scalar curve.
    if take_der(&mut sequence, 0xa0)?
        != [0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07]
    {
        return Err("device private key must use named P-256");
    }
    let public = key.public_key().to_encoded_point(false);
    Ok((
        Bytes(key.to_bytes().to_vec()),
        public
            .as_bytes()
            .try_into()
            .map_err(|_| "invalid public key length")?,
    ))
}
fn take_der<'a>(cursor: &mut &'a [u8], expected_tag: u8) -> Result<&'a [u8]> {
    if cursor.first() != Some(&expected_tag) {
        return Err("invalid DER field");
    }
    let (header, length) = match cursor.get(1) {
        Some(n @ 0..=127) => (2, usize::from(*n)),
        Some(0x81) => (3, usize::from(*cursor.get(2).ok_or("truncated DER")?)),
        Some(0x82) => (
            4,
            usize::from(u16::from_be_bytes(
                cursor
                    .get(2..4)
                    .ok_or("truncated DER")?
                    .try_into()
                    .map_err(|_| "truncated DER")?,
            )),
        ),
        _ => return Err("unsupported DER length"),
    };
    let value = cursor.get(header..header + length).ok_or("truncated DER")?;
    *cursor = &cursor[header + length..];
    Ok(value)
}
pub fn verify_chain(directory: &Directory) -> Result<()> {
    let args = vec![
        "verify".into(),
        "-check_ss_sig".into(),
        "-no-CApath".into(),
        "-no-CAstore".into(),
        "-CAfile".into(),
        directory.path("paa.pem").into_os_string(),
        "-untrusted".into(),
        directory.path("pai.pem").into_os_string(),
        directory.path("dac.pem").into_os_string(),
    ];
    openssl(&args).map(|_| ())
}
pub fn verify_cd(directory: &Directory) -> Result<Bytes> {
    let cms = files::read(&directory.path("cd.der"), false, 1536)?;
    check_cd_cms(&cms.0)?;
    let public = openssl(&[
        "x509".into(),
        "-in".into(),
        directory.path("cd-signer.pem").into_os_string(),
        "-pubkey".into(),
        "-noout".into(),
    ])?;
    let spki = openssl_input(
        &arguments(&["pkey", "-pubin", "-outform", "DER"]),
        Some(&public.0),
    )?;
    check_p256_spki(&spki.0)?;

    openssl(&[
        "cms".into(),
        "-verify".into(),
        "-binary".into(),
        "-inform".into(),
        "DER".into(),
        "-in".into(),
        directory.path("cd.der").into_os_string(),
        "-nointern".into(),
        "-noverify".into(),
        "-certfile".into(),
        directory.path("cd-signer.pem").into_os_string(),
    ])
}

fn check_p256_spki(bytes: &[u8]) -> Result<()> {
    let mut outer = bytes;
    let mut spki = take_der(&mut outer, 0x30)?;
    let algorithm = take_der(&mut spki, 0x30)?;
    // id-ecPublicKey followed by named prime256v1, with no other parameters.
    if !outer.is_empty()
        || algorithm
            != [
                6, 7, 0x2a, 0x86, 0x48, 0xce, 0x3d, 2, 1, 6, 8, 0x2a, 0x86, 0x48, 0xce, 0x3d, 3, 1,
                7,
            ]
    {
        return Err("CD signer must use named P-256");
    }
    let key = take_der(&mut spki, 3)?;
    if !spki.is_empty() || key.len() != 66 || key[0] != 0 || key[1] != 4 {
        return Err("invalid CD signer public key");
    }
    p256::PublicKey::from_sec1_bytes(&key[1..]).map_err(|_| "invalid CD signer public key")?;
    Ok(())
}
pub fn issue_dac(directory: &Directory, issuer_key: &Path, vid: u16, pid: u16) -> Result<Bytes> {
    let private = files::read(issuer_key, true, 8192)?;
    let config = format!("oid_section = matter_oids\n[matter_oids]\nMatterVID = 1.3.6.1.4.1.37244.2.1\nMatterPID = 1.3.6.1.4.1.37244.2.2\n[req]\nprompt = no\ndistinguished_name = subject\n[subject]\nCN = Crystal Shim private device\nMatterVID = {vid:04X}\nMatterPID = {pid:04X}\n[extensions]\nbasicConstraints = critical,CA:FALSE\nkeyUsage = critical,digitalSignature\nsubjectKeyIdentifier = hash\nauthorityKeyIdentifier = keyid:always\n");
    directory.write("dac-request.cnf", config.as_bytes())?;
    let csr = openssl(&[
        "req".into(),
        "-new".into(),
        "-sha256".into(),
        "-key".into(),
        directory.path("device-key.pem").into_os_string(),
        "-config".into(),
        directory.path("dac-request.cnf").into_os_string(),
    ])?;
    directory.write("dac-request.pem", &csr.0)?;
    // Positive, independent random serial. No CA serial file is modified.
    let mut serial = random(16)?;
    serial.0[0] &= 0x7f;
    serial.0[0] |= 1;
    let serial = format!("0x{}", crate::hex(&serial.0));
    openssl_input(
        &[
            "x509".into(),
            "-req".into(),
            "-sha256".into(),
            "-days".into(),
            "3650".into(),
            "-in".into(),
            directory.path("dac-request.pem").into_os_string(),
            "-CA".into(),
            directory.path("pai.pem").into_os_string(),
            "-CAkey".into(),
            "/dev/stdin".into(),
            "-passin".into(),
            "pass:".into(),
            "-set_serial".into(),
            serial.into(),
            "-extfile".into(),
            directory.path("dac-request.cnf").into_os_string(),
            "-extensions".into(),
            "extensions".into(),
            "-outform".into(),
            "DER".into(),
        ],
        Some(&private.0),
    )
}

fn check_cd_cms(bytes: &[u8]) -> Result<()> {
    const SIGNED: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 1, 7, 2];
    const DATA: &[u8] = &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 1, 7, 1];
    const SHA256: &[u8] = &[0x60, 0x86, 0x48, 1, 0x65, 3, 4, 2, 1];
    const ECDSA256: &[u8] = &[0x2a, 0x86, 0x48, 0xce, 0x3d, 4, 3, 2];
    let mut outer = bytes;
    let mut info = take_der(&mut outer, 0x30)?;
    if !outer.is_empty() || take_der(&mut info, 6)? != SIGNED {
        return Err("invalid CD CMS envelope");
    }
    let mut explicit = take_der(&mut info, 0xa0)?;
    let mut signed = take_der(&mut explicit, 0x30)?;
    if !info.is_empty() || !explicit.is_empty() || take_der(&mut signed, 2)? != [3] {
        return Err("invalid CD SignedData version");
    }
    let mut digests = take_der(&mut signed, 0x31)?;
    algorithm(&mut digests, SHA256)?;
    if !digests.is_empty() {
        return Err("CD must have one SHA256 digest");
    }
    let mut encapsulated = take_der(&mut signed, 0x30)?;
    if take_der(&mut encapsulated, 6)? != DATA {
        return Err("invalid CD content type");
    }
    let mut payload = take_der(&mut encapsulated, 0xa0)?;
    let _ = take_der(&mut payload, 4)?;
    if !encapsulated.is_empty() || !payload.is_empty() {
        return Err("invalid CD embedded payload");
    }
    // Matter's CD profile contains no embedded certificates, CRLs or attributes.
    let mut signers = take_der(&mut signed, 0x31)?;
    let mut signer = take_der(&mut signers, 0x30)?;
    if !signed.is_empty()
        || !signers.is_empty()
        || take_der(&mut signer, 2)? != [3]
        || take_der(&mut signer, 0x80)?.len() != 20
    {
        return Err("CD must contain one v3 SKID signer");
    }
    algorithm(&mut signer, SHA256)?;
    algorithm(&mut signer, ECDSA256)?;
    let _ = take_der(&mut signer, 4)?;
    if !signer.is_empty() {
        return Err("unsupported CD signer fields");
    }
    Ok(())
}
fn algorithm(cursor: &mut &[u8], expected: &[u8]) -> Result<()> {
    let mut value = take_der(cursor, 0x30)?;
    if take_der(&mut value, 6)? != expected || (!value.is_empty() && value != [5, 0]) {
        return Err("unsupported CD signature algorithm");
    }
    Ok(())
}
