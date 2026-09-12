//! Production adapters for the pinned Matter API; transport is a separate assembly.
#![no_std]

#[cfg(test)]
extern crate self as crystal_shim_matter;

pub mod on_off;
pub mod profile;
pub mod provision_transfer;
pub mod provisioning;
pub mod service;
pub mod storage;
pub use rs_matter as sdk;

pub mod time_source;
