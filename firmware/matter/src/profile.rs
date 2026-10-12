//! D-22 private controlled-load identity, with only implemented server metadata.
//! This deliberately does not claim a complete certified plug profile.
use rs_matter::dm::clusters::identify;
use rs_matter::dm::{DeviceType, Endpoint};
use rs_matter::with;

pub const DEVICE: DeviceType = DeviceType {
    dtype: 0x010a,
    drev: 3,
};
pub const IDENTIFY: rs_matter::dm::Cluster<'static> =
    identify::CLUSTER.with_cmds(with!(identify::CommandId::Identify));
pub const ENDPOINT: Endpoint<'static> = crate::load_endpoint!();

/// The controlled-load endpoint with the profile's clusters, followed by any
/// app-owned manufacturer clusters (the app adds esp-lan-ota's update cluster).
/// Keeps one source for the profile's server list.
#[macro_export]
macro_rules! load_endpoint {
    ($($extra:expr),* $(,)?) => {
        $crate::sdk::dm::Endpoint::new(
            $crate::on_off::ENDPOINT,
            $crate::sdk::devices!($crate::profile::DEVICE),
            $crate::sdk::clusters!(
                <$crate::sdk::dm::clusters::desc::DescHandler as $crate::sdk::dm::clusters::desc::ClusterHandler>::CLUSTER,
                $crate::profile::IDENTIFY,
                <$crate::sdk::dm::clusters::groups::GroupsHandler as $crate::sdk::dm::clusters::groups::ClusterHandler>::CLUSTER,
                $crate::on_off::CLUSTER
                $(, $extra)*
            ),
        )
    };
}

#[cfg(test)]
mod tests {
    use super::*;
    use rs_matter::dm::clusters::decl::on_off::{AttributeId, CommandId};
    use rs_matter::dm::clusters::groups::{self, ClusterHandler as _};
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

    #[test]
    fn app_clusters_extend_the_unchanged_profile_list() {
        use rs_matter::dm::{Access, Cluster, Command};
        use rs_matter::{attributes, commands};
        const MANUFACTURER: Cluster<'static> = Cluster::new(
            0xFFF1_FC70,
            1,
            0,
            attributes!(),
            commands!(Command::new(0, None, Access::WA)),
            &[],
            with!(all),
            with!(all),
            with!(all),
        );
        const EXTENDED: Endpoint<'static> = crate::load_endpoint!(MANUFACTURER);
        assert_eq!(EXTENDED.id, ENDPOINT.id);
        assert_eq!(EXTENDED.device_types[0].dtype, DEVICE.dtype);
        assert_eq!(EXTENDED.clusters.len(), ENDPOINT.clusters.len() + 1);
        for (extended, profile) in EXTENDED.clusters.iter().zip(ENDPOINT.clusters) {
            assert_eq!(extended.id, profile.id);
        }
        assert!(EXTENDED.cluster(0xFFF1_FC70).is_some());
    }
}
