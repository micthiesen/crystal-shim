//! Optional rejection-only certificate policy. The caller retains its verifier.
use crate::sys::*;
use core::{
    ffi::{c_int, c_void},
    marker::PhantomData,
};
#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
#[cfg_attr(feature = "defmt", derive(defmt::Format))]
pub struct CertificateTime {
    pub year: i32,
    pub month: i32,
    pub day: i32,
    pub hour: i32,
    pub minute: i32,
    pub second: i32,
}
impl From<mbedtls_x509_time> for CertificateTime {
    fn from(t: mbedtls_x509_time) -> Self {
        Self {
            year: t.year,
            month: t.mon,
            day: t.day,
            hour: t.hour,
            minute: t.min,
            second: t.sec,
        }
    }
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[cfg_attr(feature = "defmt", derive(defmt::Format))]
pub struct CertificateValidity {
    pub not_before: CertificateTime,
    pub not_after: CertificateTime,
    pub depth: u32,
}
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CertificateRejected;
/// This can add rejection only; Ok never clears baseline errors. Must not panic,
/// block, allocate, log secrets or re-enter the same TLS session.
pub trait CertificateVerifier: Sync {
    fn check(&self, certificate: CertificateValidity) -> Result<(), CertificateRejected>;
}
/// Safe borrowed callback, with no heap allocation. The verifier must outlive
/// every configuration/session clone. It is never exposed to or freed by C.
#[derive(Clone, Copy)]
pub struct CertificateRestriction<'a> {
    context: *const c_void,
    callback: unsafe extern "C" fn(*mut c_void, *mut mbedtls_x509_crt, c_int, *mut u32) -> c_int,
    _borrow: PhantomData<&'a ()>,
}
impl core::fmt::Debug for CertificateRestriction<'_> {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str("CertificateRestriction")
    }
}
#[cfg(feature = "defmt")]
impl defmt::Format for CertificateRestriction<'_> {
    fn format(&self, f: defmt::Formatter<'_>) {
        defmt::write!(f, "CertificateRestriction");
    }
}
impl<'a> CertificateRestriction<'a> {
    pub fn new<V: CertificateVerifier>(verifier: &'a V) -> Self {
        Self {
            context: (verifier as *const V).cast(),
            callback: restrict::<V>,
            _borrow: PhantomData,
        }
    }
    pub(crate) fn install(&self, config: &mut mbedtls_ssl_config) {
        // SAFETY: SessionState retains this lifetime-bearing policy until its owned
        // SSL context/configuration have been freed. C only calls during TLS methods.
        unsafe {
            mbedtls_ssl_conf_verify(config, Some(self.callback), self.context.cast_mut());
        }
    }
}
unsafe extern "C" fn restrict<V: CertificateVerifier>(
    context: *mut c_void,
    certificate: *mut mbedtls_x509_crt,
    depth: c_int,
    flags: *mut u32,
) -> c_int {
    if context.is_null() || certificate.is_null() || flags.is_null() || depth < 0 {
        return MBEDTLS_ERR_X509_FATAL_ERROR;
    }
    // SAFETY: install only passes a borrowed V pointer to its matching trampoline.
    // C owns the live certificate and flag slot for this synchronous invocation.
    let verifier = unsafe { &*context.cast::<V>() };
    let cert = unsafe { &*certificate };
    let copied = CertificateValidity {
        not_before: cert.valid_from.into(),
        not_after: cert.valid_to.into(),
        depth: depth as u32,
    };
    if verifier.check(copied).is_err() {
        unsafe {
            *flags |= MBEDTLS_X509_BADCERT_OTHER;
        }
    }
    0
}
