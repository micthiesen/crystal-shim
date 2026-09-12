//! The actual Matter command future receives the actual runtime's final result.
use core::cell::{Cell, RefCell};
use crystal_shim_core::calibration::{
    CalibrationData, ChannelLimits, Channels, CountsRange, LevelDomain, MinimumRatioSpan,
    ReferenceSign,
};
use crystal_shim_core::configuration::{RawDeviceConfig, ValidatedDeviceConfig};
use crystal_shim_core::runtime::{Error, Observation, Reply, Request, Runtime, RuntimeCommand};
use crystal_shim_core::runtime_ingress::{Ingress, Source, Token};
use crystal_shim_core::{
    Demand, Fault, HardwarePermit, Level, Millis, Reading, RelayCommand, RetainedState,
    SupervisorStatus, Timing,
};
use crystal_shim_matter::on_off::{BridgeError, Control, OnOff};
use crystal_shim_matter::sdk::dm::Dataver;

fn configuration() -> ValidatedDeviceConfig {
    // Synthetic arithmetic fixture, never a hardware calibration.
    let limits = ChannelLimits {
        envelope: CountsRange {
            min: -5_000,
            max: 5_000,
        },
        max_slew_counts_per_second: 70_000,
    };
    let calibration = CalibrationData {
        level_empty_counts: 1_000,
        low_endpoint: Channels {
            level: 1_200,
            wet_reference: 700,
            dry_reference: 300,
        },
        high_endpoint: Channels {
            level: 2_500,
            wet_reference: 900,
            dry_reference: 300,
        },
        channels: Channels {
            level: limits,
            wet_reference: limits,
            dry_reference: limits,
        },
        reference_sign: ReferenceSign::Positive,
        minimum_reference_span_counts: 100,
        minimum_endpoint_ratio_span: MinimumRatioSpan {
            numerator: 1,
            denominator: 10,
        },
        supported_level: LevelDomain {
            min: Level::new(100).unwrap(),
            max: Level::new(900).unwrap(),
        },
        max_frame_age_ms: 500,
        max_frame_duration_ms: 100,
        max_level_slew_per_second: 8_000,
    };
    ValidatedDeviceConfig::from_raw(
        RawDeviceConfig::builder(
            1,
            200,
            800,
            500,
            Timing {
                low_confirmation_ms: 50,
                recovery_ms: 60,
                minimum_off_ms: 100,
            },
            3,
            [0x5a; 32],
        )
        .timezone_rule("UTC0")
        .unwrap()
        .calibration(Some(calibration))
        .build(),
    )
    .unwrap()
}

struct Backend {
    ingress: RefCell<Ingress>,
    runtime: RefCell<Runtime>,
    input: Cell<Observation>,
    status: Cell<Option<SupervisorStatus>>,
}
impl Backend {
    fn new() -> Self {
        Self {
            ingress: RefCell::new(Ingress::new()),
            runtime: RefCell::new(
                Runtime::new(
                    Some(configuration()),
                    Some(RetainedState::new(1).unwrap()),
                    Millis(0),
                )
                .unwrap(),
            ),
            input: Cell::new(Observation {
                now: Millis(0),
                sensor_revision: 1,
                reading: Reading::Valid {
                    level: Level::new(100).unwrap(),
                    observed_at: Millis(0),
                },
                hardware: HardwarePermit::Allowed,
                maintenance_pressed: false,
                force_off: false,
                clock_update: Default::default(),
            }),
            status: Cell::new(None),
        }
    }
}
impl Control for &Backend {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        self.ingress
            .borrow_mut()
            .submit_from(source, request)
            .ok_or(BridgeError::Busy)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        self.ingress.borrow_mut().take_reply_for(token)
    }
    fn cancel(&self, token: Token) {
        self.ingress.borrow_mut().cancel(token);
    }
    fn reported_on(&self) -> bool {
        self.status
            .get()
            .is_some_and(|status| status.control.relay == RelayCommand::On)
    }
    fn now_ms(&self) -> u64 {
        self.input.get().now.0
    }
    async fn wait(&self) {
        let (force_off, request) = self.ingress.borrow_mut().take();
        let mut input = self.input.get();
        input.force_off |= force_off;
        let step = self.runtime.borrow_mut().step(input, request, None);
        // The real app writes GPIO first, publishes observed status, then replies.
        self.status.set(step.status);
        if let Some(reply) = step.command_reply {
            self.ingress.borrow_mut().complete(reply);
        }
        input.now = Millis(input.now.0 + 20);
        self.input.set(input);
    }
}

#[test]
fn actual_runtime_rejection_reaches_matter_while_valid_low_pending_remains_successful() {
    for command in [RuntimeCommand::On, RuntimeCommand::Toggle] {
        for scenario in 0..7 {
            let backend = Backend::new();
            let mut input = backend.input.get();
            match scenario {
                0 => {} // Valid low override waiting for minimum-off.
                1 => input.reading = Reading::Invalid(Fault::Bus),
                2 => input.hardware = HardwarePermit::ForcedOff,
                3 => input.maintenance_pressed = true,
                4 => input.sensor_revision = 2,
                5 => {
                    input.reading = Reading::Valid {
                        level: Level::new(100).unwrap(),
                        observed_at: Millis(1),
                    }
                }
                _ => input.now = Millis(501),
            }
            backend.input.set(input);
            let handler = OnOff::new(&backend, Dataver::new(0));
            let result = embassy_futures::block_on(handler.command(command));
            assert!(!handler.reported_on());
            let status = backend.status.get().unwrap();
            if scenario == 0 {
                assert_eq!(result, Ok(()));
                assert_eq!(status.demand, Demand::Override);
                assert_eq!(status.deadline, Some(Millis(3_000)));
            } else {
                assert_eq!(
                    result,
                    Err(BridgeError::Control(Error::Rejected)),
                    "scenario {scenario}"
                );
                assert_eq!(status.demand, Demand::Off);
                assert_eq!(status.deadline, None);
            }
        }
    }
}
