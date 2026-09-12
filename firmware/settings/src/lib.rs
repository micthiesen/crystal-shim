#![no_std]
#![forbid(unsafe_code)]
//! Bounded settings transport. Network, clock, admission and storage remain caller-owned.
pub mod auth;
pub mod form;
pub mod http;
pub mod view;

pub use auth::Bearer;
use crystal_shim_core::{
    configuration::ValidatedDeviceConfig,
    runtime::{Reply, Request, RuntimeCommand},
    runtime_ingress::{Ingress, Source, Token},
};
pub use http::{serve, Buffers};
pub use view::{Snapshot, Status};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    BadRequest,
    TooLarge,
    Unauthorized,
    Forbidden,
    Conflict,
    Reserved,
    Busy,
    NotReady,
    Control,
    Timeout,
    OutcomeUnknown,
    Io,
}
impl core::fmt::Display for Error {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(self.label())
    }
}
impl core::error::Error for Error {}
impl embedded_io_async::Error for Error {
    fn kind(&self) -> embedded_io_async::ErrorKind {
        match self {
            Self::Timeout => embedded_io_async::ErrorKind::TimedOut,
            _ => embedded_io_async::ErrorKind::Other,
        }
    }
}
impl Error {
    pub const fn code(self) -> u16 {
        match self {
            Self::BadRequest => 400,
            Self::TooLarge => 413,
            Self::Unauthorized => 401,
            Self::Forbidden => 403,
            Self::Conflict => 409,
            Self::Reserved => 423,
            Self::OutcomeUnknown | Self::Timeout => 504,
            _ => 503,
        }
    }
    pub const fn label(self) -> &'static str {
        match self {
            Self::BadRequest => "invalid_request",
            Self::TooLarge => "too_large",
            Self::Unauthorized => "unauthorized",
            Self::Forbidden => "forbidden",
            Self::Conflict => "revision_conflict",
            Self::Reserved => "provisioning_reserved",
            Self::Busy => "busy",
            Self::NotReady => "not_ready",
            Self::Control => "control_rejected",
            Self::Timeout => "timeout",
            Self::OutcomeUnknown => "outcome_unknown",
            Self::Io => "connection_lost",
        }
    }
}

/// All methods except wait are synchronous. App implementation authenticates and
/// submits in one critical section, and copies views only from the control owner.
pub trait Backend {
    fn now_ms(&self) -> u64;
    fn view(&self, bearer: &Bearer) -> Result<Snapshot, Error>;
    fn begin(
        &self,
        bearer: &Bearer,
        revision: u32,
        command: RuntimeCommand,
    ) -> Result<Token, Error>;
    fn reply(&self, token: Token) -> Option<Reply>;
    fn cancel(&self, token: Token);
    fn wait(&self) -> impl core::future::Future<Output = ()>;
}

/// Revision and token must be checked again at actual command admission.
pub fn authorize(
    config: Option<ValidatedDeviceConfig>,
    bearer: &Bearer,
    revision: Option<u32>,
) -> Result<ValidatedDeviceConfig, Error> {
    let config = config.ok_or(Error::NotReady)?;
    if !bearer.matches(config.settings_auth_token().as_bytes()) {
        return Err(Error::Unauthorized);
    }
    if revision.is_some_and(|revision| revision != config.revision()) {
        return Err(Error::Conflict);
    }
    Ok(config)
}

/// Called under the app's one admission critical section, with its current
/// control-published configuration. Shared by actual adapter and host regressions.
pub fn admit(
    ingress: &mut Ingress,
    config: Option<ValidatedDeviceConfig>,
    bearer: &Bearer,
    revision: u32,
    command: RuntimeCommand,
) -> Result<Token, Error> {
    authorize(config, bearer, Some(revision))?;
    // HTTP edits preserve the bearer. Rotation is an explicit physical USB
    // operation; a future transport parser must not silently widen that scope.
    if let RuntimeCommand::SaveConfiguration(candidate) = command {
        if !bearer.matches(candidate.settings_auth_token().as_bytes()) {
            return Err(Error::Forbidden);
        }
    }
    if !matches!(
        command,
        RuntimeCommand::SaveConfiguration(_)
            | RuntimeCommand::EnterMaintenance
            | RuntimeCommand::ExitMaintenance
            | RuntimeCommand::Off
    ) {
        return Err(Error::Control);
    }
    if ingress.provisioning_reserved() && !matches!(command, RuntimeCommand::Off) {
        return Err(Error::Reserved);
    }
    ingress
        .submit_from(Source::Settings, Request { id: 0, command })
        .ok_or(Error::Busy)
}

#[cfg(test)]
extern crate std;
#[cfg(test)]
mod tests;
