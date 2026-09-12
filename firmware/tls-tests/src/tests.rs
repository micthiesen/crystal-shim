extern crate std;

use core::ptr;
use std::sync::{
    atomic::{AtomicI64, Ordering},
    Mutex as TestMutex, MutexGuard, Once,
};

use edge_nal_tls::mbedtls::sys;

use super::*;

static MONOTONIC_MS: AtomicI64 = AtomicI64::new(0);
static CLOCK_TEST: TestMutex<()> = TestMutex::new(());
static INSTALL: Once = Once::new();

pub(super) struct TestTimer;

impl MbedtlsTimer for TestTimer {
    fn now(&self) -> i64 {
        MONOTONIC_MS.load(Ordering::SeqCst)
    }
}

pub(super) fn clock_test() -> MutexGuard<'static, ()> {
    // Each test resets all state, so a failure need not hide independent cases.
    let guard = CLOCK_TEST.lock().unwrap_or_else(|error| error.into_inner());
    INSTALL.call_once(|| {
        // SAFETY: all tests that use MbedTLS hooks hold CLOCK_TEST. This is the
        // only installation, before any operation that reads those hooks.
        unsafe { install_certificate_clock() };
    });
    operation::reset_for_test();
    tick(0);
    guard
}

pub(super) fn tick(ms: i64) {
    MONOTONIC_MS.store(ms, Ordering::SeqCst);
}

pub(super) fn date(year: u16, month: u8, day: u8, hour: u8, minute: u8, second: u8) -> UtcDateTime {
    UtcDateTime::new(year, month, day, hour, minute, second).expect("valid fixture date")
}

pub(super) fn fixture_date() -> UtcDateTime {
    date(2026, 9, 11, 12, 0, 0)
}

pub(super) fn hooked_utc() -> Option<tm> {
    let mut value = tm::default();
    // SAFETY: MbedTLS ignores the timestamp pointer and writes only the supplied
    // valid output. clock_test installed the static hook before this call.
    let result = unsafe { sys::mbedtls_platform_gmtime_r(ptr::null(), &mut value) };
    (!result.is_null()).then_some(value)
}

#[test]
fn validates_gregorian_limits() {
    assert!(UtcDateTime::new(2024, 2, 29, 23, 59, 59).is_ok());
    for (fields, error) in [
        ((1969, 1, 1, 0, 0, 0), DateTimeError::Year),
        ((10000, 1, 1, 0, 0, 0), DateTimeError::Year),
        ((2026, 0, 1, 0, 0, 0), DateTimeError::Month),
        ((2026, 13, 1, 0, 0, 0), DateTimeError::Month),
        ((2026, 1, 0, 0, 0, 0), DateTimeError::Day),
        ((2100, 2, 29, 0, 0, 0), DateTimeError::Day),
        ((2026, 4, 31, 0, 0, 0), DateTimeError::Day),
        ((2026, 1, 1, 24, 0, 0), DateTimeError::Hour),
        ((2026, 1, 1, 0, 60, 0), DateTimeError::Minute),
        ((2026, 1, 1, 0, 0, 60), DateTimeError::Second),
    ] {
        let (y, m, d, h, min, s) = fields;
        assert_eq!(UtcDateTime::new(y, m, d, h, min, s), Err(error));
    }
}

#[test]
fn converts_to_c_calendar_fields() {
    let value = date(2026, 9, 11, 12, 34, 56).as_tm();
    assert_eq!(value.tm_year, 126);
    assert_eq!(value.tm_mon, 8);
    assert_eq!(value.tm_yday, 253);
    assert_eq!(value.tm_wday, 5);
    assert_eq!(value.tm_isdst, 0);
}

#[test]
fn clock_expires_without_publisher_or_caller_refresh() {
    let _guard = clock_test();
    assert!(!has_trusted_utc());
    assert!(hooked_utc().is_none());
    assert!(matches!(
        pushover_ready(),
        Err(ProviderError::ClockUnavailable)
    ));

    tick(12_345);
    set_trusted_utc(fixture_date());
    tick(12_345 + 999);
    assert_eq!(hooked_utc().unwrap().tm_sec, 0);
    tick(12_345 + 1_000);
    assert_eq!(hooked_utc().unwrap().tm_sec, 1);
    tick(12_345 + TRUSTED_UTC_MAX_AGE_MS - 1);
    assert_eq!(trusted_utc(), Some(date(2026, 9, 11, 12, 59, 59)));
    assert!(has_trusted_utc());

    tick(12_345 + TRUSTED_UTC_MAX_AGE_MS);
    assert!(!has_trusted_utc());
    assert!(hooked_utc().is_none());
    assert!(matches!(
        pushover_ready(),
        Err(ProviderError::ClockUnavailable)
    ));
    // An invalid anchor cannot revive even if a broken clock returns in range.
    tick(12_345);
    assert!(!has_trusted_utc());
}

#[test]
fn a_new_observation_renews_the_anchor_and_explicit_clear_revokes_it() {
    let _guard = clock_test();
    set_trusted_utc(fixture_date());
    tick(TRUSTED_UTC_MAX_AGE_MS - 1);
    let refreshed = date(2026, 9, 11, 13, 0, 0);
    set_trusted_utc(refreshed);
    tick(2 * TRUSTED_UTC_MAX_AGE_MS - 2);
    assert_eq!(trusted_utc(), Some(date(2026, 9, 11, 13, 59, 59)));
    clear_trusted_utc();
    assert!(!has_trusted_utc());
    assert!(hooked_utc().is_none());
    assert!(matches!(
        pushover_ready(),
        Err(ProviderError::ClockUnavailable)
    ));
    set_trusted_utc(refreshed);
    assert!(has_trusted_utc());
}

#[test]
fn observed_monotonic_rollback_revokes_trust_even_after_the_anchor() {
    let _guard = clock_test();
    tick(100);
    set_trusted_utc(fixture_date());
    tick(200);
    assert!(has_trusted_utc());
    tick(199);
    assert!(hooked_utc().is_none());
    tick(201);
    assert!(!has_trusted_utc());
}

#[test]
fn monotonic_reset_wrap_and_saturation_fail_closed() {
    let _guard = clock_test();
    for invalid in [0, -1, i64::MIN, i64::MAX] {
        tick(100);
        set_trusted_utc(fixture_date());
        tick(invalid);
        assert!(hooked_utc().is_none(), "invalid time {invalid}");
        assert!(!has_trusted_utc());
    }
    for invalid_anchor in [-1, i64::MIN, i64::MAX] {
        tick(invalid_anchor);
        set_trusted_utc(fixture_date());
        assert!(!has_trusted_utc());
    }
    tick(i64::MAX - 2_000);
    set_trusted_utc(fixture_date());
    tick(i64::MAX - 1);
    assert_eq!(trusted_utc(), Some(date(2026, 9, 11, 12, 0, 1)));
    tick(i64::MAX);
    assert!(hooked_utc().is_none());
}

#[test]
fn advancing_utc_crosses_day_month_leap_day_and_year_boundaries() {
    let _guard = clock_test();
    for (start, next) in [
        (date(2026, 9, 11, 23, 59, 59), date(2026, 9, 12, 0, 0, 0)),
        (date(2026, 4, 30, 23, 59, 59), date(2026, 5, 1, 0, 0, 0)),
        (date(2024, 2, 28, 23, 59, 59), date(2024, 2, 29, 0, 0, 0)),
        (date(2024, 2, 29, 23, 59, 59), date(2024, 3, 1, 0, 0, 0)),
        (date(2100, 2, 28, 23, 59, 59), date(2100, 3, 1, 0, 0, 0)),
        (date(1999, 12, 31, 23, 59, 59), date(2000, 1, 1, 0, 0, 0)),
    ] {
        tick(0);
        set_trusted_utc(start);
        tick(1_000);
        assert_eq!(trusted_utc(), Some(next));
        let hooked = hooked_utc().unwrap();
        assert_eq!(hooked.tm_yday, next.as_tm().tm_yday);
        assert_eq!(hooked.tm_wday, next.as_tm().tm_wday);
    }
    tick(0);
    set_trusted_utc(date(9999, 12, 31, 23, 59, 59));
    tick(1_000);
    assert!(hooked_utc().is_none());
    assert!(!has_trusted_utc());
}

#[test]
fn fixed_policy_parses_the_exact_root_and_requires_hostname_and_verification() {
    let _guard = clock_test();
    set_trusted_utc(fixture_date());
    let lease = OperationLease::begin().unwrap();
    let config = pushover_config(&lease).expect("embedded certificate parses");
    assert!(config.certificate_restriction.is_some());
    assert!(config.ca_chain.is_some());
    assert_eq!(config.server_name, Some(c"api.pushover.net"));
    assert!(matches!(config.auth_mode, AuthMode::Required));
    assert!(matches!(config.min_version, TlsVersion::Tls1_2));
    assert!(config.creds.is_none());
    assert!(config.alpn_protocols.is_none());
    assert_eq!(PUSHOVER_PORT, 443);
    assert_eq!(DIGICERT_GLOBAL_ROOT_G2_DER.len(), 914);

    let mut digest = [0_u8; 32];
    // SAFETY: both input and output buffers are valid for their supplied sizes.
    assert_eq!(
        unsafe {
            sys::mbedtls_sha256(
                DIGICERT_GLOBAL_ROOT_G2_DER.as_ptr(),
                DIGICERT_GLOBAL_ROOT_G2_DER.len(),
                digest.as_mut_ptr(),
                0,
            )
        },
        0
    );
    let expected = [
        0xcb, 0x3c, 0xcb, 0xb7, 0x60, 0x31, 0xe5, 0xe0, 0x13, 0x8f, 0x8d, 0xd3, 0x9a, 0x23, 0xf9,
        0xde, 0x47, 0xff, 0xc3, 0x5e, 0x43, 0xc1, 0x14, 0x4c, 0xea, 0x27, 0xd4, 0x6a, 0x5a, 0xb1,
        0xcb, 0x5f,
    ];
    assert_eq!(digest, expected);
}

// Exercise the actual MbedTLS X.509 implementation using captured public
// certificates, with its production clock hook and hostname. No sockets or keys.
struct Chain(sys::mbedtls_x509_crt);

impl Chain {
    fn parse(certificates: &[&[u8]]) -> Self {
        let mut chain = Self(sys::mbedtls_x509_crt::default());
        // SAFETY: initializes the owned context before parsing.
        unsafe { sys::mbedtls_x509_crt_init(&mut chain.0) };
        for certificate in certificates {
            // SAFETY: MbedTLS copies this valid DER slice into the owned context.
            let result = unsafe {
                sys::mbedtls_x509_crt_parse_der(
                    &mut chain.0,
                    certificate.as_ptr(),
                    certificate.len(),
                )
            };
            assert_eq!(result, 0, "fixture certificate must parse");
        }
        chain
    }

    fn endpoint() -> Self {
        Self::parse(&[
            include_bytes!("../fixtures/pushover-leaf.der"),
            include_bytes!("../fixtures/rapidssl-intermediate.der"),
            include_bytes!("../fixtures/digicert-g2-cross-signed.der"),
        ])
    }

    fn verify(&mut self, root: &mut Self, host: &CStr) -> (i32, u32) {
        let mut flags = 0;
        // SAFETY: both certificate contexts were initialized/parsed and remain
        // owned for this call. Host is NUL terminated; flags is writable.
        let result = unsafe {
            sys::mbedtls_x509_crt_verify(
                &mut self.0,
                &mut root.0,
                ptr::null_mut(),
                host.as_ptr(),
                &mut flags,
                None,
                ptr::null_mut(),
            )
        };
        (result, flags)
    }
}

impl Drop for Chain {
    fn drop(&mut self) {
        // SAFETY: only this owner frees the initialized context, once.
        unsafe { sys::mbedtls_x509_crt_free(&mut self.0) };
    }
}

fn rejected(result: (i32, u32), expected_flags: u32) {
    assert_eq!(result.0, sys::MBEDTLS_ERR_X509_CERT_VERIFY_FAILED);
    assert_eq!(result.1 & expected_flags, expected_flags);
}

#[test]
fn public_chain_validates_and_wrong_hostname_or_trust_is_rejected() {
    let _guard = clock_test();
    set_trusted_utc(fixture_date());
    let lease = OperationLease::begin().unwrap();
    let config = pushover_config(&lease).unwrap();
    let mut chain = Chain::endpoint();
    let mut root = Chain::parse(&[DIGICERT_GLOBAL_ROOT_G2_DER]);
    assert_eq!(chain.verify(&mut root, config.server_name.unwrap()), (0, 0));
    rejected(
        chain.verify(&mut root, c"wrong.example"),
        sys::MBEDTLS_X509_BADCERT_CN_MISMATCH,
    );
    let mut unrelated = Chain::parse(&[include_bytes!("../fixtures/unrelated-isrg-root-x1.der")]);
    rejected(
        chain.verify(&mut unrelated, config.server_name.unwrap()),
        sys::MBEDTLS_X509_BADCERT_NOT_TRUSTED,
    );
}

#[test]
fn actual_verifier_rejects_missing_stale_and_out_of_validity_utc() {
    let _guard = clock_test();
    let mut chain = Chain::endpoint();
    let mut root = Chain::parse(&[DIGICERT_GLOBAL_ROOT_G2_DER]);
    assert_eq!(
        chain.verify(&mut root, PUSHOVER_HOST),
        (sys::MBEDTLS_ERR_X509_FATAL_ERROR, u32::MAX)
    );
    set_trusted_utc(fixture_date());
    let lease = OperationLease::begin().unwrap();
    let existing_config = pushover_config(&lease).unwrap();
    tick(TRUSTED_UTC_MAX_AGE_MS);
    // Covers a connector constructed while fresh but used after publisher loss.
    assert_eq!(
        chain.verify(&mut root, PUSHOVER_HOST),
        (sys::MBEDTLS_ERR_X509_FATAL_ERROR, u32::MAX)
    );
    drop(existing_config);
    drop(lease);
    set_trusted_utc(date(2025, 1, 1, 0, 0, 0));
    rejected(
        chain.verify(&mut root, PUSHOVER_HOST),
        sys::MBEDTLS_X509_BADCERT_FUTURE,
    );
    set_trusted_utc(date(2030, 1, 1, 0, 0, 0));
    rejected(
        chain.verify(&mut root, PUSHOVER_HOST),
        sys::MBEDTLS_X509_BADCERT_EXPIRED,
    );
}

#[test]
fn scalar_tls_cannot_accept_an_interval_by_choosing_one_endpoint() {
    use crystal_shim_core::utc_bounds::{ClockRateBound, UtcBounds};
    let _guard = clock_test();
    let mut chain = Chain::endpoint();
    let mut root = Chain::parse(&[DIGICERT_GLOBAL_ROOT_G2_DER]);
    for (lo, hi, rate) in [
        (1_789_128_000_000, 1_789_128_010_000, ClockRateBound::EXACT),
        (
            1_789_128_000_000,
            1_789_128_000_000,
            ClockRateBound::new(100, 0).unwrap(),
        ),
    ] {
        let sample =
            UtcObservation::bounded(UtcBounds::new(lo, hi).unwrap(), Millis(0), rate).unwrap();
        set_trusted_observation(sample);
        assert!(!has_trusted_utc());
        assert!(pushover_ready().is_ok());
        assert!(has_trusted_bounds());
        assert_eq!(
            chain.verify(&mut root, PUSHOVER_HOST),
            (sys::MBEDTLS_ERR_X509_FATAL_ERROR, u32::MAX)
        );
    }
}

#[test]
fn verifier_observes_certificate_expiry_as_utc_advances() {
    let _guard = clock_test();
    let mut chain = Chain::endpoint();
    let mut root = Chain::parse(&[DIGICERT_GLOBAL_ROOT_G2_DER]);
    set_trusted_utc(date(2027, 3, 6, 23, 59, 59));
    assert_eq!(chain.verify(&mut root, PUSHOVER_HOST), (0, 0));
    tick(1_000);
    assert!(has_trusted_utc());
    rejected(
        chain.verify(&mut root, PUSHOVER_HOST),
        sys::MBEDTLS_X509_BADCERT_EXPIRED,
    );
}

#[test]
fn control_accepted_original_capture_drives_both_clocks_without_dispatch_refresh() {
    let _guard = clock_test();
    let sample = UtcObservation::new(1_709_251_199_999, Millis(100)).unwrap();
    let mut schedule_anchor = UtcAnchor::new(sample, Millis(700)).unwrap();
    tick(900);
    set_trusted_observation(sample);
    let expected = schedule_anchor.at(Millis(900)).unwrap();
    assert_eq!(trusted_utc(), UtcDateTime::from_unix(expected));
    assert_eq!(hooked_utc().unwrap().tm_sec, 0);
    tick(100 + TRUSTED_UTC_MAX_AGE_MS - 1);
    assert!(schedule_anchor
        .at(Millis((100 + TRUSTED_UTC_MAX_AGE_MS - 1) as u64))
        .is_some());
    assert!(has_trusted_utc());
    // Even an accidental repeat carries the old capture and cannot renew it.
    set_trusted_observation(sample);
    tick(100 + TRUSTED_UTC_MAX_AGE_MS);
    assert!(schedule_anchor
        .at(Millis((100 + TRUSTED_UTC_MAX_AGE_MS) as u64))
        .is_none());
    assert!(hooked_utc().is_none());
    set_trusted_observation(sample);
    assert!(!has_trusted_utc());
    tick(99);
    set_trusted_observation(sample);
    assert!(!has_trusted_utc());
}

#[path = "operation_handshake_tests.rs"]
mod operation_handshake_tests;
