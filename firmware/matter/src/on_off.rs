//! Only Off/On/Toggle are exposed. No timed, startup, scene or lighting features.
use core::cell::Cell;
use crystal_shim_core::runtime::{
    Acknowledgement, Error as ControlError, Reply, Request, RuntimeCommand,
};
use crystal_shim_core::runtime_ingress::{Source, Token};
use rs_matter::dm::clusters::decl::on_off::{
    self, CommandId, OffWithEffectRequest, OnWithTimedOffRequest,
};
use rs_matter::dm::{Cluster, Dataver, HandlerContext, InvokeContext, ReadContext};
use rs_matter::error::{Error, ErrorCode};
use rs_matter::with;

pub const ENDPOINT: u16 = 1;
pub const REPLY_TIMEOUT_MS: u64 = 250;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BridgeError {
    Busy,
    NotReady,
    Timeout,
    Control(ControlError),
}

/// App implementation touches only copied mailboxes. Tests inject control/time.
pub trait Control {
    fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError>;
    fn reply(&self, token: Token) -> Option<Reply>;
    fn cancel(&self, token: Token);
    fn reported_on(&self) -> bool;
    fn now_ms(&self) -> u64;
    fn wait(&self) -> impl core::future::Future<Output = ()>;
}

pub struct OnOff<C> {
    control: C,
    dataver: Dataver,
    last_report: Cell<Option<bool>>,
}

impl<C: Control> OnOff<C> {
    pub const fn new(control: C, dataver: Dataver) -> Self {
        Self {
            control,
            dataver,
            last_report: Cell::new(None),
        }
    }

    /// The USB producer also uses this ingress; correlation IDs never own replies.
    pub fn begin(&self, source: Source, request: Request) -> Result<Token, BridgeError> {
        self.control.begin(source, request)
    }

    pub fn reported_on(&self) -> bool {
        self.control.reported_on()
    }

    /// Call on every service pass; transport subscriptions call this in `run` too.
    pub fn refresh(&self) -> bool {
        let current = self.reported_on();
        if self.last_report.replace(Some(current)) != Some(current) {
            self.dataver.changed();
            true
        } else {
            false
        }
    }

    pub async fn command(&self, command: RuntimeCommand) -> Result<(), BridgeError> {
        if !matches!(
            command,
            RuntimeCommand::Off | RuntimeCommand::On | RuntimeCommand::Toggle
        ) {
            return Err(BridgeError::Control(ControlError::Superseded));
        }
        let token = self.begin(Source::Matter, Request { id: 0, command })?;
        let _claim = Claim {
            control: &self.control,
            token,
        };
        let started = self.control.now_ms();
        loop {
            if let Some(reply) = self.control.reply(token) {
                return match reply.result {
                    Ok(Acknowledgement::Applied) => Ok(()),
                    Ok(Acknowledgement::Durable) => {
                        Err(BridgeError::Control(ControlError::Superseded))
                    }
                    Err(error) => Err(BridgeError::Control(error)),
                };
            }
            if self
                .control
                .now_ms()
                .checked_sub(started)
                .is_none_or(|age| age >= REPLY_TIMEOUT_MS)
            {
                return Err(BridgeError::Timeout);
            }
            self.control.wait().await;
        }
    }
}

struct Claim<'a, C: Control> {
    control: &'a C,
    token: Token,
}
impl<C: Control> Drop for Claim<'_, C> {
    fn drop(&mut self) {
        self.control.cancel(self.token);
    }
}

fn matter_error(error: BridgeError) -> Error {
    match error {
        BridgeError::Busy | BridgeError::Control(ControlError::Busy) => ErrorCode::Busy,
        BridgeError::NotReady => ErrorCode::InvalidState,
        BridgeError::Timeout => ErrorCode::Failure,
        BridgeError::Control(_) => ErrorCode::InvalidAction,
    }
    .into()
}

impl<C: Control> on_off::ClusterAsyncHandler for OnOff<C> {
    const CLUSTER: Cluster<'static> = on_off::FULL_CLUSTER
        .with_features(0)
        .with_attrs(with!(required))
        .with_cmds(with!(CommandId::Off | CommandId::On | CommandId::Toggle));

    fn dataver(&self) -> u32 {
        self.dataver.get()
    }
    fn dataver_changed(&self) {
        self.dataver.changed();
    }
    async fn on_off(&self, _ctx: impl ReadContext) -> Result<bool, Error> {
        Ok(self.reported_on())
    }
    async fn handle_off(&self, _ctx: impl InvokeContext) -> Result<(), Error> {
        self.command(RuntimeCommand::Off)
            .await
            .map_err(matter_error)
    }
    async fn handle_on(&self, _ctx: impl InvokeContext) -> Result<(), Error> {
        self.command(RuntimeCommand::On).await.map_err(matter_error)
    }
    async fn handle_toggle(&self, _ctx: impl InvokeContext) -> Result<(), Error> {
        self.command(RuntimeCommand::Toggle)
            .await
            .map_err(matter_error)
    }
    async fn handle_off_with_effect(
        &self,
        _ctx: impl InvokeContext,
        _request: OffWithEffectRequest<'_>,
    ) -> Result<(), Error> {
        Err(ErrorCode::CommandNotFound.into())
    }
    async fn handle_on_with_recall_global_scene(
        &self,
        _ctx: impl InvokeContext,
    ) -> Result<(), Error> {
        Err(ErrorCode::CommandNotFound.into())
    }
    async fn handle_on_with_timed_off(
        &self,
        _ctx: impl InvokeContext,
        _request: OnWithTimedOffRequest<'_>,
    ) -> Result<(), Error> {
        Err(ErrorCode::CommandNotFound.into())
    }
    async fn run(&self, ctx: impl HandlerContext) -> Result<(), Error> {
        let mut notified = None;
        loop {
            self.refresh();
            let version = self.dataver.get();
            if notified != Some(version) {
                notified = Some(version);
                ctx.notify_cluster_changed(ENDPOINT, Self::CLUSTER.id);
            }
            self.control.wait().await;
        }
    }
}
