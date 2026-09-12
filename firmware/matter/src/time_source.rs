//! Read-only UTC acquisition from the administrator-configured CASE peer.
//!
//! This adapter never treats the SDK RTC's extrapolated UTC as a fresh sample,
//! updates that RTC, or persists a periodic observation. The caller owns the
//! deadline, original monotonic capture, cancellation generation, and acceptance.

use core::{future::Future, num::NonZeroU8};
use embassy_futures::select::{select, Either};

use crate::sdk;
use sdk::crypto::Crypto;
use sdk::dm::clusters::decl::time_synchronization::{
    AttributeId, TimeSynchronizationAttrReads as _,
};
use sdk::dm::clusters::time_sync::TrustedTimeSource;
use sdk::dm::{Endpoint, EndptId};
use sdk::error::{Error, ErrorCode};
use sdk::im::{client::ImClient, AttrResp, ReportDataResp};
use sdk::tlv::{FromTLV, Nullable};
use sdk::transport::exchange::Exchange;
use sha2::{Digest, Sha256};

/// Preserve the standard Wi-Fi root and enable only its TimeSyncClient feature.
/// The SDK macro does not populate the outgoing client-cluster advertisement.
pub const ROOT: Endpoint<'static> = Endpoint {
    client_clusters: &[0x0038],
    ..sdk::root_endpoint!(wifi, time_sync(time_sync_client))
};

/// A copied target and fabric identity, including the encoded root CA fingerprint.
/// A reused local fabric index cannot authenticate an older captured request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SourceId {
    pub fab_idx: NonZeroU8,
    pub node_id: u64,
    pub endpoint: EndptId,
    pub fabric_id: u64,
    pub compressed_fabric_id: u64,
    pub root_ca_sha256: [u8; 32],
}

impl SourceId {
    fn capture(
        target: TrustedTimeSource,
        fabric_id: u64,
        compressed_fabric_id: u64,
        root_ca: &[u8],
    ) -> Self {
        Self {
            fab_idx: target.fab_idx,
            node_id: target.node_id,
            endpoint: target.endpoint,
            fabric_id,
            compressed_fabric_id,
            root_ca_sha256: Sha256::digest(root_ca).into(),
        }
    }
}

/// The configured target or its fabric identity no longer matches the request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SourceChanged;

impl From<SourceChanged> for Error {
    fn from(_: SourceChanged) -> Self {
        ErrorCode::InvalidState.into()
    }
}

/// Capture the trusted source only while its commissioning fabric still exists.
/// The SDK exposes RTC and fabric access through separate short state borrows;
/// recheck the target after copying the fabric identity, without yielding.
pub fn configured_source(matter: &sdk::Matter<'_>) -> Option<SourceId> {
    let target = matter.with_rtc(|rtc| rtc.trusted_time_source())?;
    let source = matter.with_state(|state| {
        let fabric = state.fabrics.get(target.fab_idx)?;
        Some(SourceId::capture(
            target,
            fabric.fabric_id(),
            fabric.compressed_fabric_id(),
            fabric.root_ca(),
        ))
    })?;
    (matter.with_rtc(|rtc| rtc.trusted_time_source()) == Some(target)).then_some(source)
}

fn validate_source(current: Option<SourceId>, captured: SourceId) -> Result<(), SourceChanged> {
    if current == Some(captured) {
        Ok(())
    } else {
        Err(SourceChanged)
    }
}

/// Validated scalar UTC and its original receive capture, before any ACK await.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UtcRead {
    pub matter_micros: Option<u64>,
    pub captured_at_ms: u64,
}

pub const TOTAL_DEADLINE_MS: u64 = 10_000;
pub const READ_DEADLINE_MS: u64 = 2_000;

/// Read exactly one nullable UTC scalar over CASE. The generated convenience
/// `utc_time_read` decodes the first report without checking its path, so use its
/// public request builder with an explicit response-shape check instead.
pub async fn read_utc_micros<C: Crypto, F: Future<Output = ()>>(
    matter: &sdk::Matter<'_>,
    crypto: C,
    source: SourceId,
    read_timeout: impl FnOnce() -> F,
    now_ms: impl Fn() -> u64,
) -> Result<UtcRead, Error> {
    validate_source(configured_source(matter), source)?;
    let exchange = Exchange::initiate(matter, crypto, source.fab_idx, source.node_id).await;
    validate_source(configured_source(matter), source)?;
    let exchange = exchange?;
    // Start the short deadline after CASE is ready, and bound the final ACK too.
    let started_at = now_ms();
    let result = with_deadline(
        read_scalar_utc(exchange, source, &now_ms),
        read_timeout(),
        started_at,
        READ_DEADLINE_MS,
        &now_ms,
    )
    .await;
    validate_source(configured_source(matter), source)?;
    result
}

async fn read_scalar_utc(
    exchange: Exchange<'_>,
    source: SourceId,
    now_ms: impl Fn() -> u64,
) -> Result<UtcRead, Error> {
    let chunk = exchange
        .read_with(|msg| {
            msg.attr_requests()?
                .time_synchronization_read()
                .utc_time(source.endpoint)?
                .end()?
                .fabric_filtered(true)?
                .end()
        })
        .await?;
    let response = chunk.response().map_err(|_| ErrorCode::InvalidData)?;
    let matter_micros = decode_utc_report(&response, source).map_err(|_| ErrorCode::InvalidData)?;
    let captured_at_ms = now_ms();
    // A single scalar cannot require continuation. Check before acknowledging,
    // then ensure the public completion API also reports a finished exchange.
    if chunk.complete().await?.is_some() {
        return Err(ErrorCode::InvalidData.into());
    }
    Ok(UtcRead {
        matter_micros,
        captured_at_ms,
    })
}

fn decode_utc_report(
    response: &ReportDataResp<'_>,
    source: SourceId,
) -> Result<Option<u64>, Error> {
    if response.subscription_id.is_some()
        || response.event_reports.is_some()
        || response.more_chunks == Some(true)
    {
        return Err(ErrorCode::InvalidData.into());
    }
    let reports = response
        .attr_reports
        .as_ref()
        .ok_or(ErrorCode::InvalidData)?;
    let mut reports = reports.iter();
    let first = reports.next().ok_or(ErrorCode::InvalidData)??;
    if reports.next().is_some() {
        return Err(ErrorCode::InvalidData.into());
    }
    let AttrResp::Data(data) = first else {
        return Err(ErrorCode::InvalidData.into());
    };
    let path = &data.path;
    if path.endpoint != Some(source.endpoint)
        || path.cluster != Some(0x0038)
        || path.attr != Some(AttributeId::UTCTime as _)
        || path.node.is_some_and(|node| node != source.node_id)
        || path.tag_compression == Some(true)
        || path.list_index.is_some()
    {
        return Err(ErrorCode::InvalidData.into());
    }
    Ok(Nullable::<u64>::from_tlv(&data.data)?.into_option())
}

/// Both timer futures and responses can become ready while this task is paused.
/// A work-first selection is not evidence of timeliness: enforce elapsed time
/// after it returns, including exact deadline, rollback and counter saturation.
pub async fn with_deadline<T>(
    work: impl Future<Output = Result<T, Error>>,
    deadline: impl Future<Output = ()>,
    started_at: u64,
    limit_ms: u64,
    now_ms: impl Fn() -> u64,
) -> Result<T, Error> {
    if !within_deadline(started_at, now_ms(), limit_ms) {
        return Err(ErrorCode::RxTimeout.into());
    }
    let result = match select(work, deadline).await {
        Either::First(result) => result,
        Either::Second(()) => Err(ErrorCode::RxTimeout.into()),
    };
    if !within_deadline(started_at, now_ms(), limit_ms) {
        return Err(ErrorCode::RxTimeout.into());
    }
    result
}

fn within_deadline(started_at: u64, completed_at: u64, limit_ms: u64) -> bool {
    started_at < i64::MAX as u64
        && completed_at < i64::MAX as u64
        && completed_at
            .checked_sub(started_at)
            .is_some_and(|age| age < limit_ms)
}

#[cfg(test)]
#[path = "time_source_tests.rs"]
mod tests;
