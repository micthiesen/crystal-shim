//! Single borrowed HTTP socket. Neither this task nor its backend accesses flash.
use core::{
    cell::Cell,
    fmt::Write as _,
    net::{IpAddr, Ipv4Addr, SocketAddr},
};
use critical_section::Mutex;
use crystal_shim_core::{
    runtime::{Reply, RuntimeCommand},
    runtime_ingress::Token,
};
use crystal_shim_matter::sdk::{
    dm::{clusters::gen_diag::NetifDiag, networks::NetChangeNotif},
    error::Error as MatterError,
};
use crystal_shim_settings::{Backend, Bearer, Buffers, Error, Snapshot};
use edge_nal::{TcpAccept, TcpBind};
use embassy_futures::select::select;
use embassy_time::{with_timeout, Duration, Timer};
use rs_matter_embassy::stack::nal::NetStack;

pub static BUFFERS: static_cell::ConstStaticCell<Buffers> =
    static_cell::ConstStaticCell::new(Buffers::new());
static ADDRESS: Mutex<Cell<Option<Ipv4Addr>>> = Mutex::new(Cell::new(None));
pub fn address() -> Option<Ipv4Addr> {
    critical_section::with(|cs| ADDRESS.borrow(cs).get())
}
fn set_address(value: Option<Ipv4Addr>) {
    critical_section::with(|cs| ADDRESS.borrow(cs).set(value));
}
struct ClearAddress;
impl Drop for ClearAddress {
    fn drop(&mut self) {
        set_address(None);
    }
}
struct Local;
impl Backend for Local {
    fn now_ms(&self) -> u64 {
        crate::snapshot::now().0
    }
    fn view(&self, bearer: &Bearer) -> Result<Snapshot, Error> {
        crate::runtime::settings_view(bearer)
    }
    fn begin(
        &self,
        bearer: &Bearer,
        revision: u32,
        command: RuntimeCommand,
    ) -> Result<Token, Error> {
        crate::runtime::submit_settings(bearer, revision, command)
    }
    fn reply(&self, token: Token) -> Option<Reply> {
        crate::runtime::reply(token)
    }
    fn cancel(&self, token: Token) {
        crate::runtime::cancel(token);
    }
    async fn wait(&self) {
        Timer::after_millis(20).await;
    }
}
fn ipv4(netif: &impl NetifDiag) -> Result<Option<Ipv4Addr>, MatterError> {
    let mut address = None;
    netif.netifs(&mut |info| {
        if info.operational {
            address = info.ipv4_addrs.first().copied();
        }
        Ok(())
    })?;
    Ok(address)
}
/// Errors are contained here. USB/storage/control and the other network services
/// do not depend on HTTP startup, client progress, or successful responses.
pub async fn run<S: NetStack, N: NetifDiag + NetChangeNotif>(
    stack: &S,
    netif: &N,
    buffers: &mut Buffers,
) {
    let _clear = ClearAddress;
    loop {
        set_address(None);
        let Some(address) = ipv4(netif).ok().flatten() else {
            Timer::after_secs(1).await;
            continue;
        };
        let Some(tcp) = stack.tcp_bind() else {
            Timer::after_secs(1).await;
            continue;
        };
        let Ok(Ok(acceptor)) = with_timeout(
            Duration::from_secs(1),
            tcp.bind(SocketAddr::new(IpAddr::V4(address), 80)),
        )
        .await
        else {
            Timer::after_secs(1).await;
            continue;
        };
        let mut authority = heapless::String::<16>::new();
        if write!(authority, "{address}").is_err() {
            Timer::after_secs(1).await;
            continue;
        }
        set_address(Some(address));
        let connections = async {
            loop {
                // This is the only outstanding accept/connection, leaving the
                // other TCP buffer for a TLS client. No keepalive or accept queue.
                let accepted = with_timeout(Duration::from_secs(1), acceptor.accept()).await;
                if ipv4(netif).ok().flatten() != Some(address) {
                    break;
                }
                match accepted {
                    Ok(Ok((_, socket))) => {
                        let _ =
                            crystal_shim_settings::serve(socket, &Local, &authority, buffers).await;
                    }
                    Ok(Err(_)) => Timer::after_millis(200).await,
                    Err(_) => {}
                }
            }
        };
        // Cancellation drops socket, wipes request buffers, abandons only the
        // matching command reply, and recaptures interface/authority next pass.
        let _ = select(connections, netif.wait_changed()).await;
    }
}
