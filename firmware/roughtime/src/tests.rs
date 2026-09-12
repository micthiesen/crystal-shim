use super::*;
use ed25519_dalek::{Signer, SigningKey};
use std::{vec, vec::Vec};

const SE_REQUEST: &[u8] = include_bytes!("../tests/fixtures/roughtime.se.request.bin");
const SE_RESPONSE: &[u8] = include_bytes!("../tests/fixtures/roughtime.se.response.bin");
const INT_REQUEST: &[u8] = include_bytes!("../tests/fixtures/roughtime.int08h.com.request.bin");
const INT_RESPONSE: &[u8] = include_bytes!("../tests/fixtures/roughtime.int08h.com.response.bin");

type Fields = Vec<(u32, Vec<u8>)>;

fn field(key: &[u8; 4], bytes: impl AsRef<[u8]>) -> (u32, Vec<u8>) {
    (tag(key), bytes.as_ref().to_vec())
}

fn encode(mut fields: Fields) -> Vec<u8> {
    fields.sort_by_key(|(key, _)| *key);
    let mut bytes = (fields.len() as u32).to_le_bytes().to_vec();
    let mut offset = 0u32;
    for (_, value) in fields.iter().take(fields.len() - 1) {
        offset += value.len() as u32;
        bytes.extend_from_slice(&offset.to_le_bytes());
    }
    for (key, _) in &fields {
        bytes.extend_from_slice(&key.to_le_bytes());
    }
    for (_, value) in fields {
        bytes.extend_from_slice(&value);
    }
    bytes
}

fn framed(body: &[u8]) -> Vec<u8> {
    let mut result = b"ROUGHTIM".to_vec();
    result.extend_from_slice(&(body.len() as u32).to_le_bytes());
    result.extend_from_slice(body);
    result
}

fn fields(bytes: &[u8]) -> Fields {
    let message = Message::parse(bytes).unwrap();
    let count = word(&bytes[..4]).unwrap() as usize;
    bytes[4 * count..8 * count]
        .as_chunks::<4>()
        .0
        .iter()
        .map(|key| {
            let key = u32::from_le_bytes(*key);
            (key, message.get(key).unwrap().to_vec())
        })
        .collect()
}

fn set(fields: &mut Fields, key: &[u8; 4], value: impl AsRef<[u8]>) {
    fields
        .iter_mut()
        .find(|(candidate, _)| *candidate == tag(key))
        .unwrap()
        .1 = value.as_ref().to_vec();
}

fn remove(fields: &mut Fields, key: &[u8; 4]) {
    fields.retain(|(candidate, _)| *candidate != tag(key));
}

// Deliberately public, deterministic TEST-ONLY keys. No production entry point
// accepts these roots or contains a private signing key.
fn root() -> SigningKey {
    SigningKey::from_bytes(&[41; 32])
}
fn delegated() -> SigningKey {
    SigningKey::from_bytes(&[79; 32])
}

fn sign(key: &SigningKey, context: &[u8], message: &[u8]) -> [u8; 64] {
    key.sign(&[context, message].concat()).to_bytes()
}

struct Model {
    top: Fields,
    delegation: Fields,
    signed: Fields,
    certificate_extra: Fields,
}

impl Model {
    fn new(request: &Request) -> Self {
        Self {
            top: vec![
                field(b"NONC", request.nonce),
                field(b"TYPE", 1u32.to_le_bytes()),
                field(b"PATH", []),
                field(b"INDX", 0u32.to_le_bytes()),
            ],
            delegation: vec![
                field(b"PUBK", delegated().verifying_key().to_bytes()),
                field(b"MINT", 0u64.to_le_bytes()),
                field(b"MAXT", u64::MAX.to_le_bytes()),
            ],
            signed: vec![
                field(b"VER\0", VERSION.to_le_bytes()),
                field(b"VERS", VERSION.to_le_bytes()),
                field(b"MIDP", 1_800_000_000u64.to_le_bytes()),
                field(b"RADI", 5u32.to_le_bytes()),
                field(b"ROOT", hash(&[&[0], request.bytes()])),
            ],
            certificate_extra: vec![],
        }
    }

    fn encode(self) -> Vec<u8> {
        let delegation = encode(self.delegation);
        let signed = encode(self.signed);
        let mut certificate = self.certificate_extra;
        certificate.push(field(b"DELE", &delegation));
        certificate.push(field(b"SIG\0", sign(&root(), CERT_CONTEXT, &delegation)));
        let mut top = self.top;
        top.push(field(b"CERT", encode(certificate)));
        top.push(field(b"SREP", &signed));
        top.push(field(
            b"SIG\0",
            sign(&delegated(), RESPONSE_CONTEXT, &signed),
        ));
        framed(&encode(top))
    }
}

fn request() -> Request {
    Request::new(Provider::RoughtimeSe, [123; 32], 100)
}

fn verify_model(request: &Request, model: Model) -> Result<VerifiedResponse, Error> {
    request.verify_with_key(
        &model.encode(),
        180,
        82,
        || 185,
        &root().verifying_key().to_bytes(),
    )
}

#[test]
fn captured_independent_public_packets_match_encoder_and_authenticate() {
    for (provider, req, response, radius, receive, upper) in [
        (Provider::RoughtimeSe, SE_REQUEST, SE_RESPONSE, 1, 255, 156),
        (Provider::Int08h, INT_REQUEST, INT_RESPONSE, 5, 170, 71),
    ] {
        let nonce = frame(req)
            .unwrap()
            .get(tag(b"NONC"))
            .unwrap()
            .try_into()
            .unwrap();
        let request = Request::new(provider, nonce, 100);
        assert_eq!(request.bytes(), req);
        let verified = request.verify(response, receive, upper, || 260).unwrap();
        assert_eq!(verified.provider, provider);
        assert_eq!(verified.midpoint_unix_seconds, 1_789_235_933);
        assert_eq!(verified.radius_seconds, radius);
        assert_eq!(
            verified.interval,
            Interval {
                earliest_unix_ms: (1_789_235_933 - u64::from(radius)) * 1000,
                latest_unix_ms: (1_789_235_933 + u64::from(radius)) * 1000 + upper,
                captured_at_ms: receive,
            }
        );
    }
}

#[test]
fn pinned_roots_are_out_of_band_and_public_reply_cannot_choose_its_root() {
    let nonce = frame(SE_REQUEST)
        .unwrap()
        .get(tag(b"NONC"))
        .unwrap()
        .try_into()
        .unwrap();
    let wrong = Request::new(Provider::Int08h, nonce, 100);
    assert_eq!(
        wrong.verify(SE_RESPONSE, 180, 81, || 185),
        Err(Error::Signature)
    );
    let local = request();
    let response = Model::new(&local).encode();
    assert_eq!(
        local.verify(&response, 180, 81, || 185),
        Err(Error::Signature)
    );
}

#[test]
fn complete_request_frame_and_padding_are_in_merkle_leaf() {
    let mut request = request();
    let response = Model::new(&request).encode();
    for index in [0, 8, REQUEST_FRAME_LEN - 1] {
        request.bytes[index] ^= 1;
        assert_eq!(
            request.verify_with_key(
                &response,
                180,
                81,
                || 185,
                &root().verifying_key().to_bytes()
            ),
            Err(Error::Merkle)
        );
        request.bytes[index] ^= 1;
    }
}

#[test]
fn nonempty_merkle_paths_verify_both_orders_and_require_exhausted_index() {
    let request = request();
    let siblings = [[10; 32], [20; 32], [30; 32]];
    for original_index in 0u32..8 {
        let mut model = Model::new(&request);
        let mut index = original_index;
        let mut node = hash(&[&[0], request.bytes()]);
        for sibling in &siblings {
            node = if index & 1 == 0 {
                hash(&[&[1], &node, sibling])
            } else {
                hash(&[&[1], sibling, &node])
            };
            index >>= 1;
        }
        set(&mut model.top, b"INDX", original_index.to_le_bytes());
        set(&mut model.top, b"PATH", siblings.concat());
        set(&mut model.signed, b"ROOT", node);
        assert!(verify_model(&request, model).is_ok());
    }
    let mut model = Model::new(&request);
    set(&mut model.top, b"INDX", 1u32.to_le_bytes());
    assert_eq!(verify_model(&request, model), Err(Error::Merkle));
    let mut model = Model::new(&request);
    set(&mut model.top, b"PATH", [0; 4]);
    assert_eq!(verify_model(&request, model), Err(Error::Merkle));
}

#[test]
fn independent_reference_tree_vector_has_three_levels_with_mixed_sides() {
    let encoded = include_bytes!("../tests/fixtures/reference-tree.request.bin");
    let response = include_bytes!("../tests/fixtures/reference-tree.response.bin");
    let nonce = frame(encoded)
        .unwrap()
        .get(tag(b"NONC"))
        .unwrap()
        .try_into()
        .unwrap();
    let mut request = Request::new(Provider::RoughtimeSe, nonce, 100);
    // The independent reference query selected the TEST-ONLY root via SRV.
    // Production Request::verify always selects a compiled Provider root.
    request.bytes.copy_from_slice(encoded);
    let verified = request
        .verify_with_key(
            response,
            180,
            82,
            || 185,
            &root().verifying_key().to_bytes(),
        )
        .unwrap();
    assert_eq!(verified.midpoint_unix_seconds, 1_800_000_000);
    let mut top = fields(&response[12..]);
    let mut path = frame(response).unwrap().get(tag(b"PATH")).unwrap().to_vec();
    assert_eq!(path.len(), 96);
    path[32] ^= 1;
    set(&mut top, b"PATH", path);
    assert_eq!(
        request.verify_with_key(
            &framed(&encode(top)),
            180,
            82,
            || 185,
            &root().verifying_key().to_bytes()
        ),
        Err(Error::Merkle)
    );
}

#[test]
fn replay_with_different_nonce_or_same_nonce_but_different_packet_is_rejected() {
    let old = request();
    let response = Model::new(&old).encode();
    let fresh = Request::new(Provider::RoughtimeSe, [124; 32], 100);
    assert_eq!(
        fresh.verify_with_key(
            &response,
            180,
            81,
            || 185,
            &root().verifying_key().to_bytes()
        ),
        Err(Error::Nonce)
    );
    let fresh = Request::new(Provider::Int08h, old.nonce, 100);
    assert_eq!(
        fresh.verify_with_key(
            &response,
            180,
            81,
            || 185,
            &root().verifying_key().to_bytes()
        ),
        Err(Error::Merkle)
    );
}

#[test]
fn original_deadline_is_checked_after_ready_work_and_capture_is_not_refreshed() {
    let request = request();
    let response = Model::new(&request).encode();
    let key = root().verifying_key().to_bytes();
    let verify = |receive, upper, completion| {
        request.verify_with_key(&response, receive, upper, || completion, &key)
    };
    let accepted = verify(180, 81, 2099).unwrap();
    assert_eq!(accepted.interval.captured_at_ms, 180);
    assert_eq!(accepted.interval.latest_unix_ms, 1_800_000_005_081);
    assert_eq!(verify(180, 81, 2100), Err(Error::Deadline));
    assert_eq!(verify(180, 81, 3100), Err(Error::Deadline));
    assert_eq!(verify(2100, 2000, 2100), Err(Error::Deadline));
    assert_eq!(verify(180, 79, 185), Err(Error::Timing));
    assert_eq!(verify(99, 81, 185), Err(Error::Timing));
    assert_eq!(verify(180, 81, 179), Err(Error::Timing));
    assert_eq!(verify(180, 81, 99), Err(Error::Timing));
    // A wrapping monotonic counter cannot revive an outstanding request.
    let wrapped = Request::new(Provider::RoughtimeSe, request.nonce, u64::MAX - 10);
    assert_eq!(
        wrapped.verify_with_key(&response, 4, 15, || 5, &key),
        Err(Error::Timing)
    );
}

#[test]
fn unknown_canonical_tags_are_opaque_in_every_message() {
    let request = request();
    let mut model = Model::new(&request);
    model.top.push(field(b"MORE", [0xff; 4]));
    model.signed.push(field(b"MORE", []));
    model.delegation.push(field(b"SREP", [0xff; 4]));
    model.certificate_extra.push(field(b"MORE", [0xff; 4]));
    assert!(verify_model(&request, model).is_ok());
}

#[test]
fn captured_signatures_accept_unknown_final_values_of_one_two_or_three_bytes() {
    for (provider, encoded_request, response) in [
        (Provider::RoughtimeSe, SE_REQUEST, SE_RESPONSE),
        (Provider::Int08h, INT_REQUEST, INT_RESPONSE),
    ] {
        let nonce = frame(encoded_request)
            .unwrap()
            .get(tag(b"NONC"))
            .unwrap()
            .try_into()
            .unwrap();
        for length in 1..=3 {
            let mut top = fields(&response[12..]);
            // Only the last value ends off alignment. All encoded offsets and
            // authenticated CERT/SREP/signature/Merkle fields remain unchanged.
            top.push(field(b"ZZZZ", vec![0x42; length]));
            let extended = framed(&encode(top));
            assert_eq!(extended.len(), response.len() + 8 + length);
            let result = Request::new(provider, nonce, 100)
                .verify(&extended, 180, 82, || 185)
                .unwrap();
            assert_eq!(result.midpoint_unix_seconds, 1_789_235_933);

            // The same unaligned final shape is not valid for the known INDX
            // scalar: relaxing the container must not relax its exact u32 size.
            let mut top = fields(&response[12..]);
            set(&mut top, b"INDX", vec![0; length]);
            assert_eq!(
                Request::new(provider, nonce, 100).verify(&framed(&encode(top)), 180, 82, || 185,),
                Err(Error::Length)
            );
        }
    }
}

#[test]
fn signed_version_type_and_radius_fail_closed() {
    let request = request();
    for version in [0, 1, VERSION - 1, u32::MAX] {
        let mut model = Model::new(&request);
        set(&mut model.signed, b"VER\0", version.to_le_bytes());
        assert_eq!(verify_model(&request, model), Err(Error::Version));
    }
    for versions in [
        vec![],
        vec![0],
        vec![VERSION, VERSION],
        vec![VERSION, 0],
        vec![VERSION; 33],
    ] {
        let mut model = Model::new(&request);
        set(
            &mut model.signed,
            b"VERS",
            versions
                .into_iter()
                .flat_map(u32::to_le_bytes)
                .collect::<Vec<_>>(),
        );
        assert_eq!(verify_model(&request, model), Err(Error::Version));
    }
    let mut model = Model::new(&request);
    set(
        &mut model.signed,
        b"VERS",
        [0, VERSION, u32::MAX]
            .into_iter()
            .flat_map(u32::to_le_bytes)
            .collect::<Vec<_>>(),
    );
    assert!(verify_model(&request, model).is_ok());
    for value in [0u32, 2, u32::MAX] {
        let mut model = Model::new(&request);
        set(&mut model.top, b"TYPE", value.to_le_bytes());
        assert_eq!(verify_model(&request, model), Err(Error::Type));
    }
    for radius in [0u32, MAX_RADIUS_SECONDS + 1, u32::MAX] {
        let mut model = Model::new(&request);
        set(&mut model.signed, b"RADI", radius.to_le_bytes());
        assert_eq!(verify_model(&request, model), Err(Error::Radius));
    }
}

#[test]
fn delegation_boundaries_are_inclusive_without_calendar_restricting_keys() {
    let request = request();
    let mut model = Model::new(&request);
    set(
        &mut model.delegation,
        b"MINT",
        1_800_000_000u64.to_le_bytes(),
    );
    set(
        &mut model.delegation,
        b"MAXT",
        1_800_000_000u64.to_le_bytes(),
    );
    assert!(verify_model(&request, model).is_ok());
    for (minimum, maximum) in [(1_800_000_001, u64::MAX), (0, 1_799_999_999), (u64::MAX, 0)] {
        let mut model = Model::new(&request);
        set(&mut model.delegation, b"MINT", minimum.to_le_bytes());
        set(&mut model.delegation, b"MAXT", maximum.to_le_bytes());
        assert_eq!(verify_model(&request, model), Err(Error::Delegation));
    }
}

#[test]
fn returned_utc_bounds_reject_underflow_overflow_and_calendar_overrun() {
    let request = request();
    for midpoint in [0, 4, u64::MAX, u64::MAX / 1000, MAX_UNIX_MS / 1000 - 4] {
        let mut model = Model::new(&request);
        set(&mut model.signed, b"MIDP", midpoint.to_le_bytes());
        assert_eq!(verify_model(&request, model), Err(Error::TimeRange));
    }
}

#[test]
fn every_required_tag_and_exact_scalar_size_is_enforced() {
    let request = request();
    for key in [b"NONC", b"TYPE", b"PATH", b"INDX"] {
        let mut model = Model::new(&request);
        remove(&mut model.top, key);
        assert_eq!(verify_model(&request, model), Err(Error::MissingTag));
    }
    for key in [b"VER\0", b"VERS", b"MIDP", b"RADI", b"ROOT"] {
        let mut model = Model::new(&request);
        remove(&mut model.signed, key);
        assert_eq!(verify_model(&request, model), Err(Error::MissingTag));
    }
    for key in [b"PUBK", b"MINT", b"MAXT"] {
        let mut model = Model::new(&request);
        remove(&mut model.delegation, key);
        assert_eq!(verify_model(&request, model), Err(Error::MissingTag));
    }
    for (scope, key) in [
        (0, b"TYPE"),
        (0, b"INDX"),
        (1, b"VER\0"),
        (1, b"MIDP"),
        (1, b"RADI"),
        (1, b"ROOT"),
        (2, b"PUBK"),
        (2, b"MINT"),
        (2, b"MAXT"),
    ] {
        for size in [0, 12, 36] {
            let mut model = Model::new(&request);
            set(
                match scope {
                    0 => &mut model.top,
                    1 => &mut model.signed,
                    _ => &mut model.delegation,
                },
                key,
                vec![0; size],
            );
            assert_eq!(verify_model(&request, model), Err(Error::Length));
        }
    }
}

#[test]
fn missing_envelopes_signatures_and_malformed_nested_headers_are_rejected() {
    let request = request();
    let response = Model::new(&request).encode();
    let key = root().verifying_key().to_bytes();
    let verify = |bytes: &[u8]| request.verify_with_key(bytes, 180, 81, || 185, &key);
    for name in [b"CERT", b"SREP", b"SIG\0"] {
        let mut top = fields(&response[12..]);
        remove(&mut top, name);
        assert_eq!(verify(&framed(&encode(top))), Err(Error::MissingTag));
    }
    let top = frame(&response).unwrap();
    let certificate = top.get(tag(b"CERT")).unwrap();
    for name in [b"DELE", b"SIG\0"] {
        let mut cert = fields(certificate);
        remove(&mut cert, name);
        let mut top = fields(&response[12..]);
        set(&mut top, b"CERT", encode(cert));
        assert_eq!(verify(&framed(&encode(top))), Err(Error::MissingTag));
    }
    for name in [b"CERT", b"SREP"] {
        let mut top = fields(&response[12..]);
        set(&mut top, name, [0xff; 8]);
        assert_eq!(verify(&framed(&encode(top))), Err(Error::Length));
    }
    let mut cert = fields(certificate);
    set(&mut cert, b"DELE", [0xff; 8]);
    let mut top = fields(&response[12..]);
    set(&mut top, b"CERT", encode(cert));
    assert_eq!(verify(&framed(&encode(top))), Err(Error::Length));
    for nested in [false, true] {
        for size in [0, 60, 68] {
            let mut top = fields(&response[12..]);
            if nested {
                let mut cert = fields(certificate);
                set(&mut cert, b"SIG\0", vec![0; size]);
                set(&mut top, b"CERT", encode(cert));
            } else {
                set(&mut top, b"SIG\0", vec![0; size]);
            }
            assert_eq!(verify(&framed(&encode(top))), Err(Error::Length));
        }
    }
}

#[test]
fn maximum_response_size_accepts_unknown_padding_but_rejects_amplification() {
    let request = request();
    let response = Model::new(&request).encode();
    let mut top = fields(&response[12..]);
    top.push(field(
        b"ZZZZ",
        vec![0; MAX_RESPONSE_FRAME_LEN - response.len() - 8],
    ));
    let maximum = framed(&encode(top.clone()));
    assert_eq!(maximum.len(), MAX_RESPONSE_FRAME_LEN);
    assert!(request
        .verify_with_key(
            &maximum,
            180,
            81,
            || 185,
            &root().verifying_key().to_bytes()
        )
        .is_ok());
    top.last_mut().unwrap().1.extend_from_slice(&[0; 4]);
    assert!(matches!(frame(&framed(&encode(top))), Err(Error::Length)));
}

#[test]
fn signatures_cover_original_signed_bytes_and_use_the_exact_contexts() {
    let request = request();
    let response = Model::new(&request).encode();
    let parsed = frame(&response).unwrap();
    let signed = parsed.get(tag(b"SREP")).unwrap();
    let sig = parsed.get(tag(b"SIG\0")).unwrap();
    let key = delegated().verifying_key().to_bytes();
    assert_eq!(signature(&key, sig, RESPONSE_CONTEXT, signed), Ok(()));
    assert_eq!(
        signature(&key, sig, CERT_CONTEXT, signed),
        Err(Error::Signature)
    );
    assert_eq!(
        signature(&key, &sig[..60], RESPONSE_CONTEXT, signed),
        Err(Error::Length)
    );
    let mut altered = sig.to_vec();
    altered[0] ^= 1;
    assert_eq!(
        signature(&key, &altered, RESPONSE_CONTEXT, signed),
        Err(Error::Signature)
    );
    let mut altered = signed.to_vec();
    *altered.last_mut().unwrap() ^= 1;
    assert_eq!(
        signature(&key, sig, RESPONSE_CONTEXT, &altered),
        Err(Error::Signature)
    );
    // Ed25519 verify_strict rejects the low-order identity key/signature forgery.
    let mut identity = [0; 32];
    identity[0] = 1;
    let mut forged = [0; 64];
    forged[0] = 1;
    assert_eq!(
        signature(&identity, &forged, RESPONSE_CONTEXT, signed),
        Err(Error::Signature)
    );
}

#[test]
fn frame_length_magic_truncation_and_oversize_are_bounded() {
    for size in 0..SE_RESPONSE.len() {
        assert!(frame(&SE_RESPONSE[..size]).is_err());
    }
    let mut bytes = SE_RESPONSE.to_vec();
    bytes[0] ^= 1;
    assert!(matches!(frame(&bytes), Err(Error::Frame)));
    let mut bytes = SE_RESPONSE.to_vec();
    bytes.push(0);
    assert!(matches!(frame(&bytes), Err(Error::Frame)));
    let oversize = framed(&vec![0; REQUEST_MESSAGE_LEN + 4]);
    assert!(matches!(frame(&oversize), Err(Error::Length)));
}

#[test]
fn canonical_offsets_tags_and_count_fail_before_slicing_or_crypto() {
    let body = encode(vec![
        field(b"AAA\0", [0; 4]),
        field(b"BBB\0", []),
        field(b"CCC\0", [0; 4]),
    ]);
    assert!(Message::parse(&body).is_ok());
    for count in [0, 5, u32::MAX] {
        let mut malformed = body.clone();
        malformed[..4].copy_from_slice(&count.to_le_bytes());
        assert!(matches!(Message::parse(&malformed), Err(Error::Length)));
    }
    for offset in [1, 9, u32::MAX] {
        let mut malformed = body.clone();
        malformed[4..8].copy_from_slice(&offset.to_le_bytes());
        assert!(matches!(Message::parse(&malformed), Err(Error::Offsets)));
    }
    let mut descending = body.clone();
    descending[4..8].copy_from_slice(&8u32.to_le_bytes());
    assert!(matches!(Message::parse(&descending), Err(Error::Offsets)));
    for key in [*b"AAA\0", *b"\0AAA", *b"B\0B\0", *b"bbb\0"] {
        let mut malformed = body.clone();
        malformed[16..20].copy_from_slice(&key);
        assert!(matches!(Message::parse(&malformed), Err(Error::Tags)));
    }
    let mut unsorted = body.clone();
    unsorted[12..16].copy_from_slice(b"DDD\0");
    assert!(matches!(Message::parse(&unsorted), Err(Error::Tags)));
    // Full arbitrary byte mutations exercise all parser indices without panics.
    for index in 0..SE_RESPONSE.len() {
        for value in [0, 1, 127, 255] {
            let mut mutated = SE_RESPONSE.to_vec();
            mutated[index] = value;
            let _ = frame(&mutated);
        }
    }
}
