//! One stdin session runs one controller with simulated monotonic time. No device I/O.
use std::io::{self, BufRead};

use crystal_shim_core::{
    Command, Config, Fault, HardwarePermit, Inputs, Level, Millis, Reading, ScheduledWindow,
    Supervisor, SupervisorConfig, SwitchCommand, Timing, WindowId,
};

const USAGE: &str = "usage: crystal-shim-sim STOP RESTART MAX_SAMPLE_AGE_MS [LOW_MS RECOVERY_MS MIN_OFF_MS MAX_RUN_MS]\n\
    Thresholds are synthetic/calibrated thousandths (0..1000), STOP < RESTART.\n\
    stdin: <milliseconds> level <0..1000> | window <id> <absolute-end-ms> | no-window | on | off | tick | disconnected | uncalibrated | out-of-range | bus-fault | maintenance-on | maintenance-off | hardware-off | hardware-on\n\
    Each line advances one persistent simulation; tick reuses the last acquisition timestamp.\n\
    Supply events frequently enough to meet MAX_SAMPLE_AGE_MS. No GPIO or serial access.";

fn level(value: &str) -> Result<Level, String> {
    let number = value.parse().map_err(|_| "invalid integer level")?;
    Level::new(number).ok_or_else(|| "level must be 0..1000; use out-of-range for a fault".into())
}

fn event(line: &str, previous: Inputs) -> Result<(Millis, Inputs), String> {
    let fields: Vec<_> = line.split_whitespace().collect();
    let [time, action, rest @ ..] = fields.as_slice() else {
        return Err("expected a timestamp and action".into());
    };
    let now = Millis(time.parse().map_err(|_| "invalid timestamp")?);
    let mut input = Inputs {
        switch: SwitchCommand::None,
        maintenance: Command::None,
        ..previous
    };
    match (*action, rest) {
        ("level", [value]) => {
            input.reading = Reading::Valid {
                level: level(value)?,
                observed_at: now,
            }
        }
        ("tick", []) => {}
        ("disconnected", []) => input.reading = Reading::Invalid(Fault::Disconnected),
        ("uncalibrated", []) => input.reading = Reading::Invalid(Fault::Uncalibrated),
        ("out-of-range", []) => input.reading = Reading::Invalid(Fault::OutOfRange),
        ("bus-fault", []) => input.reading = Reading::Invalid(Fault::Bus),
        ("maintenance-on", []) => input.maintenance = Command::EnterMaintenance,
        ("maintenance-off", []) => input.maintenance = Command::ExitMaintenance,
        ("on", []) => input.switch = SwitchCommand::On,
        ("off", []) => input.switch = SwitchCommand::Off,
        ("hardware-off", []) => input.hardware = HardwarePermit::ForcedOff,
        ("hardware-on", []) => input.hardware = HardwarePermit::Allowed,
        ("no-window", []) => input.window = None,
        ("window", [id, end]) => {
            input.window = Some(ScheduledWindow {
                id: WindowId(id.parse().map_err(|_| "invalid window ID")?),
                ends_at: Millis(end.parse().map_err(|_| "invalid window end")?),
            })
        }
        _ => return Err("unknown action or wrong argument count".into()),
    }
    Ok((now, input))
}

fn initial_inputs() -> Inputs {
    Inputs {
        reading: Reading::Invalid(Fault::Uncalibrated),
        window: None,
        switch: SwitchCommand::None,
        maintenance: Command::None,
        hardware: HardwarePermit::Allowed,
    }
}

fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args.as_slice() == ["--help"] || args.as_slice() == ["-h"] {
        println!("{USAGE}");
        return Ok(());
    }
    let [stop, restart, max_age, timers @ ..] = args.as_slice() else {
        return Err(USAGE.into());
    };
    let max_age = max_age.parse().map_err(|_| "invalid maximum sample age")?;
    let (timing, max_run) = match timers {
        [] => (Timing::PROVISIONAL, SupervisorConfig::INITIAL_MAX_RUN_MS),
        [low, recovery, min_off, max_run] => (
            Timing {
                low_confirmation_ms: low.parse().map_err(|_| "invalid low confirmation")?,
                recovery_ms: recovery.parse().map_err(|_| "invalid recovery")?,
                minimum_off_ms: min_off.parse().map_err(|_| "invalid minimum off")?,
            },
            max_run.parse().map_err(|_| "invalid maximum run")?,
        ),
        _ => return Err(USAGE.into()),
    };
    let config = Config::new(level(stop)?, level(restart)?, max_age, timing)
        .map_err(|error| format!("invalid configuration: {error:?}"))?;
    let config = SupervisorConfig::new(config, max_run)
        .map_err(|error| format!("invalid configuration: {error:?}"))?;
    let mut controller = Supervisor::new(config, Millis(0));
    let mut input = initial_inputs();
    println!("milliseconds,state,relay_command,demand,deadline_ms,water_state,water_transition");
    println!("0,Boot,Off,Off,,None,");
    for (index, line) in io::stdin().lock().lines().enumerate() {
        let line = line.map_err(|error| error.to_string())?;
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let (now, next_input) =
            event(line, input).map_err(|error| format!("line {}: {error}", index + 1))?;
        input = next_input;
        let status = controller.update(now, input);
        let deadline = status
            .deadline
            .map(|time| time.0.to_string())
            .unwrap_or_default();
        let transition = status
            .water_transition
            .map(|edge| format!("{:?}->{:?}", edge.from, edge.to))
            .unwrap_or_default();
        println!(
            "{},{:?},{:?},{:?},{},{:?},{}",
            now.0,
            status.control.state,
            status.control.relay,
            status.demand,
            deadline,
            status.water_state,
            transition
        );
    }
    Ok(())
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tick_preserves_acquisition_time_and_bad_input_is_rejected() {
        let (_, reading) = event("100 level 600", initial_inputs()).unwrap();
        let (now, retained) = event("900 tick", reading).unwrap();
        assert_eq!(now, Millis(900));
        assert_eq!(retained, reading);
        assert!(event("900 level 1001", reading).is_err());
        assert!(event("900 tick extra", reading).is_err());
        assert!(event("900 unknown", reading).is_err());
    }
}
