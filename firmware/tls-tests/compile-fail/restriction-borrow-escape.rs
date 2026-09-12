use mbedtls_rs::{
    CertificateRejected, CertificateRestriction, CertificateValidity, CertificateVerifier,
};

struct Policy;
impl CertificateVerifier for Policy {
    fn check(&self, _: CertificateValidity) -> Result<(), CertificateRejected> {
        Ok(())
    }
}

fn escape() -> CertificateRestriction<'static> {
    let policy = Policy;
    CertificateRestriction::new(&policy)
}

fn main() {
    let _ = escape();
}
