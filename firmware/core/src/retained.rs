//! Versioned retained safety state, independent of any flash driver.
//!
//! The application stores this blob atomically. A missing or malformed blob after configuration
//! has existed enters recoverable maintenance; an absent blob on a never-configured unit remains
//! a usable first boot, where missing calibration already prevents relay operation.

use crate::{UtcSeconds, WindowId};

pub const RETAINED_STORAGE_KEY: u16 = 0x4353;
pub const RETAINED_BLOB_LEN: usize = 32;

const MAGIC: [u8; 4] = *b"CSRT";
const VERSION: u8 = 1;
const FLAG_MAINTENANCE: u8 = 1 << 0;
const FLAG_WINDOW: u8 = 1 << 1;
const FLAG_SUPPRESSED: u8 = 1 << 2;
const KNOWN_FLAGS: u8 = FLAG_MAINTENANCE | FLAG_WINDOW | FLAG_SUPPRESSED;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum WindowDisposition {
    Eligible,
    Suppressed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RetainedWindow {
    pub id: WindowId,
    /// The occurrence's original UTC end. Later settings and clock corrections may shorten it,
    /// never move it later.
    pub ends_utc: UtcSeconds,
    pub disposition: WindowDisposition,
}

impl RetainedWindow {
    pub(crate) fn validate(self) -> Result<(), RetainedError> {
        if self.id.0 == 0 {
            return Err(RetainedError::ZeroWindowId);
        }
        if !crate::schedule::valid_occurrence_id(self.id) {
            return Err(RetainedError::InvalidWindowId);
        }
        if self.ends_utc.0 == 0 {
            return Err(RetainedError::ZeroWindowEnd);
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RetainedState {
    pub config_revision: u32,
    pub maintenance: bool,
    pub window: Option<RetainedWindow>,
}

impl RetainedState {
    pub const fn new(config_revision: u32) -> Result<Self, RetainedError> {
        if config_revision == 0 {
            Err(RetainedError::ZeroRevision)
        } else {
            Ok(Self {
                config_revision,
                maintenance: false,
                window: None,
            })
        }
    }

    pub fn encode(self) -> Result<[u8; RETAINED_BLOB_LEN], RetainedError> {
        self.validate()?;
        let mut blob = [0u8; RETAINED_BLOB_LEN];
        blob[..4].copy_from_slice(&MAGIC);
        blob[4] = VERSION;
        blob[5] = if self.maintenance {
            FLAG_MAINTENANCE
        } else {
            0
        };
        blob[6..8].copy_from_slice(&(RETAINED_BLOB_LEN as u16).to_le_bytes());
        blob[8..12].copy_from_slice(&self.config_revision.to_le_bytes());
        if let Some(window) = self.window {
            blob[5] |= FLAG_WINDOW;
            if window.disposition == WindowDisposition::Suppressed {
                blob[5] |= FLAG_SUPPRESSED;
            }
            blob[12..20].copy_from_slice(&window.id.0.to_le_bytes());
            blob[20..28].copy_from_slice(&window.ends_utc.0.to_le_bytes());
        }
        let checksum = crc32(&blob[..28]);
        blob[28..32].copy_from_slice(&checksum.to_le_bytes());
        Ok(blob)
    }

    pub fn decode(blob: &[u8]) -> Result<Self, RetainedError> {
        if blob.len() != RETAINED_BLOB_LEN {
            return Err(RetainedError::Length);
        }
        if blob[..4] != MAGIC {
            return Err(RetainedError::Magic);
        }
        if blob[4] != VERSION {
            return Err(RetainedError::Version);
        }
        let flags = blob[5];
        if flags & !KNOWN_FLAGS != 0 || flags & FLAG_SUPPRESSED != 0 && flags & FLAG_WINDOW == 0 {
            return Err(RetainedError::Flags);
        }
        if u16::from_le_bytes([blob[6], blob[7]]) as usize != RETAINED_BLOB_LEN {
            return Err(RetainedError::Length);
        }
        let expected = u32::from_le_bytes(blob[28..32].try_into().unwrap());
        if crc32(&blob[..28]) != expected {
            return Err(RetainedError::Checksum);
        }

        let config_revision = u32::from_le_bytes(blob[8..12].try_into().unwrap());
        let window_id = u64::from_le_bytes(blob[12..20].try_into().unwrap());
        let window_end = u64::from_le_bytes(blob[20..28].try_into().unwrap());
        let window = if flags & FLAG_WINDOW != 0 {
            Some(RetainedWindow {
                id: WindowId(window_id),
                ends_utc: UtcSeconds(window_end),
                disposition: if flags & FLAG_SUPPRESSED != 0 {
                    WindowDisposition::Suppressed
                } else {
                    WindowDisposition::Eligible
                },
            })
        } else {
            if window_id != 0 || window_end != 0 {
                return Err(RetainedError::NonCanonical);
            }
            None
        };
        let state = Self {
            config_revision,
            maintenance: flags & FLAG_MAINTENANCE != 0,
            window,
        };
        state.validate()?;
        Ok(state)
    }

    fn validate(self) -> Result<(), RetainedError> {
        if self.config_revision == 0 {
            return Err(RetainedError::ZeroRevision);
        }
        if let Some(window) = self.window {
            window.validate()?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ConfigurationLifecycle {
    NeverConfigured,
    Configured { revision: u32 },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LoadDisposition {
    Restored,
    /// An eligible occurrence was present when the device restarted. It is converted to a
    /// suppression record, so neither a reset nor a power loss can renew that run.
    InterruptedWindowSuppressed,
    RecoveryRequired(RetainedError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct LoadedRetainedState {
    pub state: RetainedState,
    pub disposition: LoadDisposition,
    /// Store `state` before accepting an exit from maintenance or exposing a schedule window.
    pub must_store: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RetainedError {
    Missing,
    UnexpectedRecord,
    ZeroRevision,
    RevisionMismatch,
    Length,
    Magic,
    Version,
    Flags,
    Checksum,
    NonCanonical,
    ZeroWindowId,
    InvalidWindowId,
    ZeroWindowEnd,
}

/// Apply boot lifecycle rules to a retained blob.
///
/// `Ok(None)` is the only first-boot path. It leaves provisioning reachable while the absent
/// calibrated configuration keeps the relay off. Every configured-unit failure returns a valid
/// state latched in maintenance, which can be replaced through an explicit recovery workflow.
pub fn load_retained(
    blob: Option<&[u8]>,
    lifecycle: ConfigurationLifecycle,
) -> Result<Option<LoadedRetainedState>, RetainedError> {
    let revision = match lifecycle {
        ConfigurationLifecycle::NeverConfigured => {
            return match blob {
                None => Ok(None),
                Some(_) => Err(RetainedError::UnexpectedRecord),
            };
        }
        ConfigurationLifecycle::Configured { revision } if revision != 0 => revision,
        ConfigurationLifecycle::Configured { .. } => return Err(RetainedError::ZeroRevision),
    };

    let decoded = match blob {
        Some(blob) => RetainedState::decode(blob),
        None => Err(RetainedError::Missing),
    };
    let mut state = match decoded {
        Ok(state) if state.config_revision == revision => state,
        Ok(_) => {
            return Ok(Some(recovery_state(
                revision,
                RetainedError::RevisionMismatch,
            )))
        }
        Err(error) => return Ok(Some(recovery_state(revision, error))),
    };

    if state
        .window
        .is_some_and(|window| window.disposition == WindowDisposition::Eligible)
    {
        state.window.as_mut().unwrap().disposition = WindowDisposition::Suppressed;
        return Ok(Some(LoadedRetainedState {
            state,
            disposition: LoadDisposition::InterruptedWindowSuppressed,
            must_store: true,
        }));
    }

    Ok(Some(LoadedRetainedState {
        state,
        disposition: LoadDisposition::Restored,
        must_store: false,
    }))
}

fn recovery_state(revision: u32, error: RetainedError) -> LoadedRetainedState {
    LoadedRetainedState {
        state: RetainedState {
            config_revision: revision,
            maintenance: true,
            window: None,
        },
        disposition: LoadDisposition::RecoveryRequired(error),
        must_store: true,
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = u32::MAX;
    for byte in bytes {
        crc ^= u32::from(*byte);
        for _ in 0..8 {
            let mask = 0u32.wrapping_sub(crc & 1);
            crc = (crc >> 1) ^ (0xedb8_8320 & mask);
        }
    }
    !crc
}

#[cfg(test)]
mod tests {
    use super::*;

    fn state() -> RetainedState {
        RetainedState {
            config_revision: 17,
            maintenance: true,
            window: Some(RetainedWindow {
                id: WindowId(42),
                ends_utc: UtcSeconds(1_800_000_000),
                disposition: WindowDisposition::Suppressed,
            }),
        }
    }

    #[test]
    fn canonical_blob_round_trips() {
        let state = state();
        let blob = state.encode().unwrap();
        assert_eq!(RetainedState::decode(&blob), Ok(state));
    }

    #[test]
    fn never_configured_is_reachable_but_stale_storage_is_not_ignored() {
        assert_eq!(
            load_retained(None, ConfigurationLifecycle::NeverConfigured),
            Ok(None)
        );
        assert_eq!(
            load_retained(
                Some(&[0; RETAINED_BLOB_LEN]),
                ConfigurationLifecycle::NeverConfigured
            ),
            Err(RetainedError::UnexpectedRecord)
        );
    }

    #[test]
    fn configured_missing_corrupt_and_revision_mismatch_fail_to_maintenance() {
        let lifecycle = ConfigurationLifecycle::Configured { revision: 17 };
        let missing = load_retained(None, lifecycle).unwrap().unwrap();
        assert_eq!(
            missing.disposition,
            LoadDisposition::RecoveryRequired(RetainedError::Missing)
        );
        assert!(missing.state.maintenance);
        assert!(missing.must_store);

        let mut corrupt = state().encode().unwrap();
        corrupt[12] ^= 1;
        let loaded = load_retained(Some(&corrupt), lifecycle).unwrap().unwrap();
        assert_eq!(
            loaded.disposition,
            LoadDisposition::RecoveryRequired(RetainedError::Checksum)
        );
        assert!(loaded.state.maintenance);

        let loaded = load_retained(
            Some(&state().encode().unwrap()),
            ConfigurationLifecycle::Configured { revision: 18 },
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            loaded.disposition,
            LoadDisposition::RecoveryRequired(RetainedError::RevisionMismatch)
        );
        assert!(loaded.state.maintenance);
    }

    #[test]
    fn an_interrupted_eligible_window_becomes_suppressed_before_control_runs() {
        let mut state = state();
        state.maintenance = false;
        state.window.as_mut().unwrap().disposition = WindowDisposition::Eligible;
        let loaded = load_retained(
            Some(&state.encode().unwrap()),
            ConfigurationLifecycle::Configured { revision: 17 },
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            loaded.disposition,
            LoadDisposition::InterruptedWindowSuppressed
        );
        assert_eq!(
            loaded.state.window.unwrap().disposition,
            WindowDisposition::Suppressed
        );
        assert!(loaded.must_store);
    }

    #[test]
    fn malformed_flags_lengths_ids_and_noncanonical_fields_are_rejected() {
        let base = state().encode().unwrap();
        assert_eq!(
            RetainedState::decode(&base[..RETAINED_BLOB_LEN - 1]),
            Err(RetainedError::Length)
        );

        let mut bad_checksum = base;
        bad_checksum[12] ^= 0x80;
        assert_eq!(
            RetainedState::decode(&bad_checksum),
            Err(RetainedError::Checksum)
        );

        let mut bad_flags = base;
        bad_flags[5] |= 0x80;
        rewrite_checksum(&mut bad_flags);
        assert_eq!(RetainedState::decode(&bad_flags), Err(RetainedError::Flags));

        let mut zero_id = base;
        zero_id[12..20].fill(0);
        rewrite_checksum(&mut zero_id);
        assert_eq!(
            RetainedState::decode(&zero_id),
            Err(RetainedError::ZeroWindowId)
        );

        let mut zero_end = base;
        zero_end[20..28].fill(0);
        rewrite_checksum(&mut zero_end);
        assert_eq!(
            RetainedState::decode(&zero_end),
            Err(RetainedError::ZeroWindowEnd)
        );

        let mut no_window = RetainedState::new(1).unwrap().encode().unwrap();
        no_window[12] = 1;
        let checksum = crc32(&no_window[..28]);
        no_window[28..].copy_from_slice(&checksum.to_le_bytes());
        assert_eq!(
            RetainedState::decode(&no_window),
            Err(RetainedError::NonCanonical)
        );

        let invalid = RetainedState {
            config_revision: 1,
            maintenance: false,
            window: Some(RetainedWindow {
                id: WindowId(0),
                ends_utc: UtcSeconds(1),
                disposition: WindowDisposition::Eligible,
            }),
        };
        assert_eq!(invalid.encode(), Err(RetainedError::ZeroWindowId));
        assert_eq!(RetainedState::new(0), Err(RetainedError::ZeroRevision));

        let max_revision = RetainedState::new(u32::MAX).unwrap();
        assert_eq!(
            RetainedState::decode(&max_revision.encode().unwrap()),
            Ok(max_revision)
        );
    }

    fn rewrite_checksum(blob: &mut [u8; RETAINED_BLOB_LEN]) {
        let checksum = crc32(&blob[..28]);
        blob[28..].copy_from_slice(&checksum.to_le_bytes());
    }

    #[test]
    fn impossible_occurrence_ids_require_recovery_even_with_valid_crc() {
        // Reserved high bits, zero entry within a nonzero ID, and an impossible local second.
        for id in [u64::MAX, 1 << 61, 1 << 29, (86_400 << 12) | 1] {
            let mut invalid = state();
            invalid.window.as_mut().unwrap().id = WindowId(id);
            assert_eq!(invalid.encode(), Err(RetainedError::InvalidWindowId));

            let mut blob = state().encode().unwrap();
            blob[12..20].copy_from_slice(&id.to_le_bytes());
            rewrite_checksum(&mut blob);
            assert_eq!(
                RetainedState::decode(&blob),
                Err(RetainedError::InvalidWindowId)
            );
            let loaded = load_retained(
                Some(&blob),
                ConfigurationLifecycle::Configured { revision: 17 },
            )
            .unwrap()
            .unwrap();
            assert_eq!(
                loaded.disposition,
                LoadDisposition::RecoveryRequired(RetainedError::InvalidWindowId)
            );
            assert!(loaded.state.maintenance);
            assert!(loaded.must_store);
        }
    }

    #[test]
    fn crc_matches_the_standard_check_value() {
        assert_eq!(crc32(b"123456789"), 0xcbf4_3926);
    }
}
