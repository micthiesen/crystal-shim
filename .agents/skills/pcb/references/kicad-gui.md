# KiCad GUI after handoff

Use the supported computer-control tool for the actual visible UI. Read its
current state before changing settings, and re-query after each state change.

Open the target `.kicad_pro`, then open its Schematic Editor or PCB Editor from
the project manager. Avoid stand-alone/untitled editors and verify the target
project before writes. Do not close another task's editor or discard a save prompt.

The staged tscircuit seed owns schematic/netlist, outline, holes and placement.
Use Board Setup or Schematic Setup only for declared `kicad-augment.json` items.
Stillair's KiCad 10 workflow avoids Konnect's `add_layer`, `set_design_rules`,
`create_netclass` and `assign_net_to_class`; prefer visible settings and verify
saved results rather than assuming those operations are supported.

After routes exist, use the handoff ECO plan. Snapshot routes, vias, zones,
graphics, rules and UUIDs before applying changes and prove unrelated state was
preserved. Never text-edit protected KiCad files.

Save both editors, run ERC and headless DRC, verify source parity and declared
augmentations, then inspect fresh renders. An initial unrouted seed can have
explicitly accounted-for unconnected findings. Parse, outline, footprint and
courtyard findings require investigation. Reopen Board Setup to confirm visible
layer, stackup, copper, minimum and net-class settings.
