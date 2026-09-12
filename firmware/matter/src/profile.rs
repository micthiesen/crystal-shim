//! D-22 private controlled-load identity, with only implemented server metadata.
//! This deliberately does not claim a complete certified plug profile.
use rs_matter::dm::clusters::{
    desc::{self, ClusterHandler as _},
    groups::{self, ClusterHandler as _},
    identify,
};
use rs_matter::dm::{DeviceType, Endpoint};
use rs_matter::{clusters, devices, with};

pub const DEVICE: DeviceType = DeviceType {
    dtype: 0x010a,
    drev: 3,
};
pub const IDENTIFY: rs_matter::dm::Cluster<'static> =
    identify::CLUSTER.with_cmds(with!(identify::CommandId::Identify));
pub const ENDPOINT: Endpoint<'static> = Endpoint::new(
    crate::on_off::ENDPOINT,
    devices!(DEVICE),
    clusters!(
        desc::DescHandler::CLUSTER,
        IDENTIFY,
        groups::GroupsHandler::CLUSTER,
        crate::on_off::CLUSTER
    ),
);

#[cfg(test)]
mod tests {
    use super::*;
    use rs_matter::dm::clusters::decl::on_off::{AttributeId, CommandId};
    #[test]
    fn private_profile_never_advertises_a_scene_timer_or_startup_path() {
        assert_eq!(ENDPOINT.device_types[0].dtype, 0x010a);
        assert!(ENDPOINT.client_clusters.is_empty());
        assert_eq!(ENDPOINT.clusters.len(), 4);
        let load = ENDPOINT.cluster(crate::on_off::CLUSTER.id).unwrap();
        assert_eq!(load.feature_map, 0);
        for command in [CommandId::Off, CommandId::On, CommandId::Toggle] {
            assert!(load.command(command as _).is_some());
        }
        for command in [
            CommandId::OffWithEffect,
            CommandId::OnWithTimedOff,
            CommandId::OnWithRecallGlobalScene,
        ] {
            assert!(load.command(command as _).is_none());
        }
        assert!(load.attribute(AttributeId::StartUpOnOff as _).is_none());
        assert!(IDENTIFY
            .command(identify::CommandId::Identify as _)
            .is_some());
        assert!(IDENTIFY
            .command(identify::CommandId::TriggerEffect as _)
            .is_none());
        assert!(ENDPOINT
            .cluster(groups::GroupsHandler::CLUSTER.id)
            .is_some());
    }
}
