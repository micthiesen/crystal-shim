#![no_std]
#![forbid(unsafe_code)]
//! Bounded advisory delivery. Control, credentials, flash, networking and TLS stay caller-owned.
#[cfg(test)]
extern crate std;
pub mod guard;
pub mod http;
pub mod policy;
