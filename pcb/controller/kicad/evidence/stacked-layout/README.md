# Controller stacked-layout ECO

The controller source selects 150 × 110 mm, four layers and four 3.2 mm NPTH
mounts inset 7 mm from the corners. Fifteen pump-bank footprints move 20 mm right
with their nine ground vias and fifteen local neck areas. Other footprints,
all 63 nets, the antenna, and schematic files remain unchanged. The three ground
plane boundaries expand with the board. Mount exclusions retain 4 mm radii.

`previous-lock.json`, `before.json` and `plan.json` bind the reviewed source-to-native
change. `apply-native.py` records the native API operation in `native-apply.json`.
An initial fill without the attached project produced clearance findings;
`refill-native.py` attaches the native project settings before filling, resolving
those findings. This refill is necessary for the saved custom rules and design
settings to govern zone clearance. These scripts record this specific applied ECO;
the application script deliberately rejects a second application.

Final validation after GUI rule installation: strict schematic cleanup passed; DRC has zero
ordinary violations, zero schematic parity findings and 166 expected unconnected
items. Native preservation passed. Front and inner-ground SVGs were visually
inspected after the project-aware refill. All 17 schematic files outside history
and evidence are byte-identical to the session's initial native snapshot.

The generated controller rule reference changes 71 local neck rules to
`enclosedByArea`, retaining trunk width as the router optimum. The rule reference was installed through the GUI and matched byte-for-byte.
`after.json`, `schematic-cleanup.json` and `eco-receipt.json` bind final acceptance;
`handoff.lock.json` was advanced through `accept-eco`. No routes
were created. Final routed DRC, manufacturing, assembly, thermal and operating
acceptance remain separate gates.
