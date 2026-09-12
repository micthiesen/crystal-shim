use core::cell::{Cell, RefCell};
use crystal_shim_matter::{
    provisioning::STORAGE_KEY,
    sdk::{
        error::{Error, ErrorCode},
        persist::{KvBlobStore, KvBlobStoreAccess},
    },
    storage::{install_provisioning, InstallError, InstallOutcome},
};
#[path = "support/provision_record.rs"]
mod provision_record;

#[derive(Clone, Copy, PartialEq)]
enum Failure {
    None,
    Load,
    Store,
    Readback,
    Missing,
    Different,
}
struct Store {
    bytes: Option<Vec<u8>>,
    loads: usize,
    writes: usize,
    failure: Failure,
}
impl KvBlobStore for Store {
    fn load<'a>(&mut self, key: u16, buf: &'a mut [u8]) -> Result<Option<&'a [u8]>, Error> {
        assert_eq!(key, STORAGE_KEY);
        self.loads += 1;
        buf.fill(0x55);
        if (self.loads == 1 && self.failure == Failure::Load)
            || (self.loads == 2 && self.failure == Failure::Readback)
        {
            return Err(ErrorCode::Failure.into());
        }
        if self.loads == 2 && self.failure == Failure::Missing {
            return Ok(None);
        }
        let Some(bytes) = &self.bytes else {
            return Ok(None);
        };
        buf[..bytes.len()].copy_from_slice(bytes);
        if self.loads == 2 && self.failure == Failure::Different {
            buf[0] ^= 1;
        }
        Ok(Some(&buf[..bytes.len()]))
    }
    fn store(&mut self, key: u16, data: &[u8], _: &mut [u8]) -> Result<(), Error> {
        assert_eq!(key, STORAGE_KEY);
        self.writes += 1;
        // Ambiguous completion: durable bytes exist but the call reports failure.
        self.bytes = Some(data.to_vec());
        if self.failure == Failure::Store {
            return Err(ErrorCode::Failure.into());
        }
        Ok(())
    }
    fn remove(&mut self, _: u16, _: &mut [u8]) -> Result<(), Error> {
        panic!("identity is never removed")
    }
}
struct Access {
    calls: Cell<usize>,
    inner: RefCell<(Store, [u8; 4096])>,
}
impl Access {
    fn new(failure: Failure, bytes: Option<Vec<u8>>) -> Self {
        Self {
            calls: Cell::new(0),
            inner: RefCell::new((
                Store {
                    failure,
                    bytes,
                    loads: 0,
                    writes: 0,
                },
                [0; 4096],
            )),
        }
    }
}
impl KvBlobStoreAccess for Access {
    fn access<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&mut dyn KvBlobStore, &mut [u8]) -> R,
    {
        self.calls.set(self.calls.get() + 1);
        let mut inner = self.inner.borrow_mut();
        let (store, scratch) = &mut *inner;
        f(store, scratch)
    }
}

#[test]
fn one_access_decides_and_verifies_installation_and_cleans_every_failure() {
    let bytes = provision_record::record();
    for (failure, expected) in [
        (Failure::None, Ok(InstallOutcome::StoredVerified)),
        (Failure::Load, Err(InstallError::Storage)),
        (Failure::Store, Err(InstallError::Storage)),
        (Failure::Readback, Err(InstallError::Storage)),
        (Failure::Missing, Err(InstallError::Verification)),
        (Failure::Different, Err(InstallError::Verification)),
    ] {
        let access = Access::new(failure, None);
        assert_eq!(install_provisioning(&access, &bytes), expected);
        assert_eq!(access.calls.get(), 1);
        let inner = access.inner.borrow();
        assert!(inner.1.iter().all(|byte| *byte == 0));
        assert_eq!(inner.0.writes, usize::from(failure != Failure::Load));
    }
}

#[test]
fn invalid_input_and_conflicting_valid_identity_never_write() {
    let bytes = provision_record::record();
    let access = Access::new(Failure::None, None);
    assert_eq!(
        install_provisioning(&access, b"invalid"),
        Err(InstallError::InvalidRecord)
    );
    assert_eq!(access.calls.get(), 0);
    let mut other = bytes.clone();
    other[16..20].copy_from_slice(&20_202_022_u32.to_le_bytes());
    let access = Access::new(Failure::None, Some(other));
    assert_eq!(
        install_provisioning(&access, &bytes),
        Err(InstallError::Conflict)
    );
    assert_eq!(access.inner.borrow().0.writes, 0);
    assert!(access.inner.borrow().1.iter().all(|byte| *byte == 0));
}
