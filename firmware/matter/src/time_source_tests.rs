extern crate std;
use super::*;
use sdk::dm::clusters::decl::time_synchronization::{AttributeId, CommandId, Feature};
use sdk::dm::{Access, Cluster};

fn source() -> SourceId {
    SourceId::capture(
        TrustedTimeSource {
            fab_idx: NonZeroU8::MIN,
            node_id: 0x1234,
            endpoint: 3,
        },
        0x5678,
        0x9abc,
        b"abc",
    )
}

#[test]
fn capture_binds_target_and_sha256_of_the_encoded_root_ca() {
    let captured = source();
    assert_eq!(captured.fab_idx.get(), 1);
    assert_eq!(captured.node_id, 0x1234);
    assert_eq!(captured.endpoint, 3);
    assert_eq!(captured.fabric_id, 0x5678);
    assert_eq!(captured.compressed_fabric_id, 0x9abc);
    // SHA-256's standard "abc" test vector also checks byte order and full length.
    assert_eq!(
        captured.root_ca_sha256,
        [
            0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
            0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
            0xf2, 0x00, 0x15, 0xad,
        ]
    );
}

#[test]
fn source_removal_and_every_identity_change_reject_the_captured_request() {
    let captured = source();
    assert_eq!(validate_source(Some(captured), captured), Ok(()));
    assert_eq!(validate_source(None, captured), Err(SourceChanged));

    let mut different_root = captured.root_ca_sha256;
    different_root[31] ^= 1;
    let replacements = [
        SourceId {
            fab_idx: NonZeroU8::new(2).expect("nonzero test index"),
            ..captured
        },
        SourceId {
            node_id: captured.node_id + 1,
            ..captured
        },
        SourceId {
            endpoint: captured.endpoint + 1,
            ..captured
        },
        SourceId {
            fabric_id: captured.fabric_id + 1,
            ..captured
        },
        SourceId {
            compressed_fabric_id: captured.compressed_fabric_id + 1,
            ..captured
        },
        SourceId {
            root_ca_sha256: different_root,
            ..captured
        },
    ];
    for replacement in replacements {
        assert_eq!(
            validate_source(Some(replacement), captured),
            Err(SourceChanged),
            "a changed identity field must invalidate the old request"
        );
    }
    let error: Error = SourceChanged.into();
    assert_eq!(error.code(), ErrorCode::InvalidState);
}

fn assert_cluster_preserved(actual: &Cluster<'_>, expected: &Cluster<'_>) {
    assert_eq!(actual.id, expected.id);
    assert_eq!(actual.revision, expected.revision);
    assert_eq!(actual.feature_map, expected.feature_map);
    assert!(actual
        .attributes
        .iter()
        .filter_map(|attribute| actual.attribute(attribute.id))
        .map(|attribute| (attribute.id, attribute.access, attribute.quality))
        .eq(expected
            .attributes
            .iter()
            .filter_map(|attribute| expected.attribute(attribute.id))
            .map(|attribute| (attribute.id, attribute.access, attribute.quality))));
    assert!(actual
        .commands
        .iter()
        .filter_map(|command| actual.command(command.id))
        .map(|command| (command.id, command.resp_id, command.access))
        .eq(expected
            .commands
            .iter()
            .filter_map(|command| expected.command(command.id))
            .map(|command| (command.id, command.resp_id, command.access))));
    assert!(actual
        .events
        .iter()
        .filter_map(|event| actual.event(event.id))
        .map(|event| (event.id, event.access))
        .eq(expected
            .events
            .iter()
            .filter_map(|event| expected.event(event.id))
            .map(|event| (event.id, event.access))));
}

#[test]
fn root_preserves_the_wifi_server_clusters_and_advertises_the_time_client() {
    const ORIGINAL: Endpoint<'static> = sdk::root_endpoint!(wifi);
    assert_eq!(ROOT.id, ORIGINAL.id);
    assert!(ROOT
        .device_types
        .iter()
        .map(|device| (device.dtype, device.drev))
        .eq(ORIGINAL
            .device_types
            .iter()
            .map(|device| (device.dtype, device.drev))));
    assert_eq!(ROOT.clusters.len(), ORIGINAL.clusters.len());
    assert_eq!(ROOT.client_clusters, &[0x0038]);
    for cluster in ORIGINAL.clusters {
        let actual = ROOT.cluster(cluster.id).expect("preserved root cluster");
        if cluster.id != 0x0038 {
            assert_cluster_preserved(actual, cluster);
        }
    }
}

#[test]
fn time_sync_adds_only_the_administered_trusted_source_feature() {
    let time = ROOT
        .cluster(0x0038)
        .expect("root TimeSynchronization server");
    assert_eq!(time.feature_map, Feature::TIME_SYNC_CLIENT.bits());
    for attribute in [
        AttributeId::UTCTime,
        AttributeId::Granularity,
        AttributeId::TimeSource,
        AttributeId::TrustedTimeSource,
    ] {
        assert!(time.attribute(attribute as _).is_some());
    }
    for attribute in [
        AttributeId::TimeZone,
        AttributeId::DSTOffset,
        AttributeId::LocalTime,
        AttributeId::DefaultNTP,
        AttributeId::SupportsDNSResolve,
        AttributeId::NTPServerAvailable,
    ] {
        assert!(time.attribute(attribute as _).is_none());
    }
    assert!(time.command(CommandId::SetUTCTime as _).is_some());
    let configure = time
        .command(CommandId::SetTrustedTimeSource as _)
        .expect("administrator can configure the CASE source");
    assert_eq!(configure.access, Access::WA | Access::FAB_SCOPED);
    for command in [
        CommandId::SetTimeZone,
        CommandId::SetDSTOffset,
        CommandId::SetDefaultNTP,
    ] {
        assert!(time.command(command as _).is_none());
    }
}

#[test]
fn deadline_and_enclosing_cancellation_drop_an_unfinished_read() {
    use core::{
        cell::Cell,
        future::{pending, ready},
        pin::pin,
        task::{Context, Poll, Waker},
    };
    struct Held<'a>(&'a Cell<u32>);
    impl Drop for Held<'_> {
        fn drop(&mut self) {
            self.0.set(self.0.get() + 1);
        }
    }
    let dropped = Cell::new(0);
    let read = async {
        let _held = Held(&dropped);
        pending::<Result<Option<u64>, Error>>().await
    };
    let error =
        embassy_futures::block_on(with_deadline(read, ready(()), 0, READ_DEADLINE_MS, || 0))
            .unwrap_err();
    assert_eq!(error.code(), ErrorCode::RxTimeout);
    assert_eq!(
        dropped.get(),
        1,
        "a timeout releases the exchange read future"
    );
    {
        let read = async {
            let _held = Held(&dropped);
            pending::<Result<Option<u64>, Error>>().await
        };
        let mut future = pin!(with_deadline(read, pending(), 0, READ_DEADLINE_MS, || 0));
        let mut context = Context::from_waker(Waker::noop());
        assert!(matches!(future.as_mut().poll(&mut context), Poll::Pending));
    }
    assert_eq!(
        dropped.get(),
        2,
        "cancelling the service releases unfinished reads"
    );
    let null = embassy_futures::block_on(with_deadline(
        ready(Ok::<Option<u64>, Error>(None)),
        pending(),
        0,
        READ_DEADLINE_MS,
        || 0,
    ))
    .unwrap();
    assert_eq!(
        null, None,
        "null cannot be confused with successful fresh UTC"
    );
}

#[test]
fn both_deadlines_reject_ready_work_at_or_after_expiry_and_broken_monotonic_time() {
    use core::{
        cell::Cell,
        future::poll_fn,
        pin::pin,
        task::{Context, Poll, Waker},
    };
    for limit in [READ_DEADLINE_MS, TOTAL_DEADLINE_MS] {
        // Construction and first polling can also be separated by scheduling.
        // The original start is supplied by the caller, never reset on first poll.
        let error = embassy_futures::block_on(with_deadline(
            core::future::ready(Ok::<_, Error>(17)),
            core::future::ready(()),
            100,
            limit,
            || 100 + limit,
        ))
        .unwrap_err();
        assert_eq!(error.code(), ErrorCode::RxTimeout);
        for finished in [
            100,
            100 + limit - 1,
            100 + limit,
            100 + limit + 1_000,
            99,
            i64::MAX as u64,
            u64::MAX,
        ] {
            let now = Cell::new(100);
            let ready = Cell::new(false);
            let work = poll_fn(|_| {
                if ready.get() {
                    Poll::Ready(Ok::<_, Error>(17))
                } else {
                    Poll::Pending
                }
            });
            let timer = poll_fn(|_| {
                if now.get() >= 100 + limit {
                    Poll::Ready(())
                } else {
                    Poll::Pending
                }
            });
            let mut future = pin!(with_deadline(work, timer, 100, limit, || now.get()));
            let mut cx = Context::from_waker(Waker::noop());
            assert!(future.as_mut().poll(&mut cx).is_pending());
            now.set(finished);
            ready.set(true);
            let Poll::Ready(result) = future.as_mut().poll(&mut cx) else {
                panic!("ready work")
            };
            if finished >= 100 && finished < 100 + limit {
                assert_eq!(result.unwrap(), 17);
            } else {
                assert_eq!(
                    result.unwrap_err().code(),
                    ErrorCode::RxTimeout,
                    "ready-first poll must not accept {finished} with limit {limit}"
                );
            }
        }
    }
}

fn utc_path() -> sdk::im::AttrPath {
    sdk::im::AttrPath {
        endpoint: Some(source().endpoint),
        cluster: Some(0x0038),
        attr: Some(0),
        ..Default::default()
    }
}
fn data<'a>(path: sdk::im::AttrPath, value: &'a [u8]) -> AttrResp<'a> {
    sdk::im::AttrData::new(Some(1), path, sdk::tlv::TLVElement::new(value)).into()
}
fn encoded_report(entries: &[AttrResp<'_>]) -> std::vec::Vec<u8> {
    use sdk::tlv::{TLVTag, TLVWrite, ToTLV};
    let mut bytes = [0; 512];
    let mut writer = sdk::utils::storage::WriteBuf::new(&mut bytes);
    writer.start_struct(&TLVTag::Anonymous).unwrap();
    writer.start_array(&TLVTag::Context(1)).unwrap();
    for entry in entries {
        entry.to_tlv(&TLVTag::Anonymous, &mut writer).unwrap();
    }
    writer.end_container().unwrap();
    writer.bool(&TLVTag::Context(4), true).unwrap();
    writer.end_container().unwrap();
    writer.as_slice().to_vec()
}
fn decode(bytes: &[u8]) -> Result<Option<u64>, Error> {
    let response = ReportDataResp::from_tlv(&sdk::tlv::TLVElement::new(bytes))?;
    decode_utc_report(&response, source())
}

#[test]
fn exact_utc_path_and_one_nullable_unsigned_scalar_are_required() {
    let valid = data(utc_path(), &[0x04, 7]);
    assert_eq!(
        decode(&encoded_report(core::slice::from_ref(&valid))).unwrap(),
        Some(7)
    );
    assert_eq!(
        decode(&encoded_report(&[data(utc_path(), &[0x14])])).unwrap(),
        None
    );
    let mut path = utc_path();
    path.node = Some(source().node_id);
    path.tag_compression = Some(false);
    assert_eq!(
        decode(&encoded_report(&[data(path, &[0x04, 7])])).unwrap(),
        Some(7)
    );
    let paths = [
        sdk::im::AttrPath {
            endpoint: Some(9),
            ..utc_path()
        },
        sdk::im::AttrPath {
            cluster: Some(6),
            ..utc_path()
        },
        sdk::im::AttrPath {
            attr: Some(2),
            ..utc_path()
        }, // Granularity is also an integer
        sdk::im::AttrPath {
            endpoint: None,
            ..utc_path()
        },
        sdk::im::AttrPath {
            cluster: None,
            ..utc_path()
        },
        sdk::im::AttrPath {
            attr: None,
            ..utc_path()
        },
        sdk::im::AttrPath {
            node: Some(source().node_id + 1),
            ..utc_path()
        },
        sdk::im::AttrPath {
            tag_compression: Some(true),
            ..utc_path()
        },
        sdk::im::AttrPath {
            list_index: Some(Nullable::new(Some(0))),
            ..utc_path()
        },
        sdk::im::AttrPath {
            list_index: Some(Nullable::none()),
            ..utc_path()
        },
    ];
    for path in paths {
        let wrong = data(path, &[0x04, 1]);
        assert!(decode(&encoded_report(core::slice::from_ref(&wrong))).is_err());
        assert!(decode(&encoded_report(&[wrong.clone(), valid.clone()])).is_err());
        assert!(decode(&encoded_report(&[valid.clone(), wrong])).is_err());
    }
    assert!(decode(&encoded_report(&[])).is_err());
    assert!(decode(&encoded_report(&[valid.clone(), valid.clone()])).is_err());
    for scalar in [&[0x00, 7][..], &[0x09], &[0x16, 0x18], &[0x0c, 1, b'x']] {
        assert!(decode(&encoded_report(&[data(utc_path(), scalar)])).is_err());
    }
    let status: AttrResp<'_> =
        sdk::im::AttrStatus::new(utc_path(), sdk::im::IMStatusCode::UnsupportedAccess, None).into();
    assert!(decode(&encoded_report(core::slice::from_ref(&status))).is_err());
    assert!(decode(&encoded_report(&[valid, status])).is_err());
}

#[test]
fn subscription_events_continuation_missing_reports_and_malformed_tlv_are_rejected() {
    let bytes = encoded_report(&[data(utc_path(), &[0x04, 7])]);
    for change in 0..4 {
        let mut response = ReportDataResp::from_tlv(&sdk::tlv::TLVElement::new(&bytes)).unwrap();
        match change {
            0 => response.subscription_id = Some(1),
            1 => response.more_chunks = Some(true),
            2 => {
                response.event_reports =
                    Some(sdk::tlv::TLVArray::new(sdk::tlv::TLVElement::new(&[0x16, 0x18])).unwrap())
            }
            _ => response.attr_reports = None,
        }
        assert!(decode_utc_report(&response, source()).is_err());
    }
    // Truncated attribute/scalar data must never produce a partial success.
    // The SDK tolerates an absent outer end after a complete attribute array;
    // ReadRespChunk exposes only its parsed response, not the raw outer framing.
    assert_eq!(&bytes[bytes.len() - 3..], &[0x29, 4, 0x18]);
    for cut in 0..bytes.len() - 3 {
        assert!(decode(&bytes[..cut]).is_err(), "cut {cut}");
    }
}

#[test]
fn ack_wait_keeps_the_validated_report_capture_and_cannot_publish_after_read_deadline() {
    use core::{
        cell::Cell,
        future::{pending, poll_fn},
        pin::pin,
        task::{Context, Poll, Waker},
    };
    for ack_at in [1_000, 100 + READ_DEADLINE_MS] {
        let now = Cell::new(100);
        let ack_ready = Cell::new(false);
        let bytes = encoded_report(&[data(utc_path(), &[0x04, 7])]);
        let work = async {
            let observation = UtcRead {
                matter_micros: decode(&bytes)?,
                captured_at_ms: now.get(),
            };
            poll_fn(|_| {
                if ack_ready.get() {
                    Poll::Ready(())
                } else {
                    Poll::Pending
                }
            })
            .await;
            Ok(observation)
        };
        let mut future = pin!(with_deadline(
            work,
            pending(),
            100,
            READ_DEADLINE_MS,
            || now.get()
        ));
        let mut cx = Context::from_waker(Waker::noop());
        assert!(future.as_mut().poll(&mut cx).is_pending());
        now.set(ack_at);
        ack_ready.set(true);
        let Poll::Ready(result) = future.as_mut().poll(&mut cx) else {
            panic!("ack ready")
        };
        if ack_at < 100 + READ_DEADLINE_MS {
            assert_eq!(
                result.unwrap(),
                UtcRead {
                    matter_micros: Some(7),
                    captured_at_ms: 100
                }
            );
        } else {
            assert_eq!(result.unwrap_err().code(), ErrorCode::RxTimeout);
        }
    }
}
