//! Production adapters for the pinned Matter API; transport is a separate assembly.
#![no_std]

pub mod on_off;
pub mod storage;
pub use rs_matter as sdk;
