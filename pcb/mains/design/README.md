# Mains component source

`mains-headers.tsx` captures the four exact vertical Sabre headers, preserving two
same-number solder tails per blade and all unused physical contacts. J2 uses the
same fused-line/neutral nets as J1; PE bypasses the PCB headers. See the
[header capture basis](../../../docs/design/mains-header-capture.md) for source
drawings, copper/tolerance calculations and the unresolved body/housing fit.
Run `bun run render:mains-headers` from `pcb` for inspected component-review
renders. These are provisional positions, not a complete mains placement.

`power-components.tsx` captures the selected IRM-10-5 isolated supply and exact
G5RL-1A-TV8 DC5 relay. `secondary-power.tsx` captures the 13-part isolated
eFuse circuit and J5 harness interface; `suppression.tsx` captures the coil
flyback and the series RC across the switched pump output. These are parts
of the final mains board. MOV capture, inlet-fuse wiring, complete schematic
integration, board placement and native handoff remain work. Review canvases
are not product board outlines or isolation layouts.

The [complete placement proposal](../../../docs/design/mains-placement.md)
fits the planned 135 x 75 mm allocation in a conditional 2D screen. It preserves
opposite filter connectors and the isolation space while reserving room for RV1.
Its coordinates are available for integration; MOV datum, connector mating,
enclosure access and routed tolerance checks remain open.

The relay's contact pins are staggered by 3.5 mm. The original design-basis table
incorrectly aligned them. Source and regression checks now follow the actual
manufacturer bottom-view hole drawing, mirrored into the component-side view.
The separate 20 and 3.5 mm dimensions compose the 23.5 mm coil-to-pin-3 span.
Supply pin numbers preserve the native IRM symbol convention, with its bottom
view mirrored once. Exact drawing hashes and physical datums accompany both parts.

The source includes copper, drills, body/courtyard bounds and mask declarations.
The relay's 2.8 mm lands are a project choice with 0.75 mm nominal annuli, not
an Omron copper recommendation. Its transverse body centring remains a drawing
inference for final package-fit review. The supply's full placement reserve is
47.7 x 27.4 mm, wider than its ordinary calculated courtyard.

The shared THT renderer accepts each board's explicit physical declaration;
controller callers retain their existing default declarations. Tests compare
compiled and initial native pad geometry at four rotations and preserve all
eight separate nets. The converter's recentered component origins, PTH mask
margin and unwanted automatic paste still require board-specific initial/native
adapters before a mains handoff. No raw review seed is accepted. Neither THT
part gets stencil paste; both are hand-soldered after reflow.

The secondary has eight named nets and 35 pins, including exactly three unused
eFuse pins (3, 4, 10). Its UV/OV dividers use `V5_RAW`; the negative clamp,
bleeder, output capacitor and J5 use `V5_PSU`. The controller's different
reverse-input circuit is not copied here. RPW anchor/paste/thermal operations
and J5 native geometry remain required before handoff.

Suppression uses the exact 1N4007-E3/54, PR02FS0201000KA100 and
B32921C3473K000. D1 pin 1 is the cathode on `V5_PSU`, with the anode on
`COIL_DRAIN`. R1 and C1 join only `PUMP_L_SW` through `SNUBBER_RC` to
`PUMP_N_FILTERED`, leaving no powered path across the open relay. Native
serialization checks preserve those nets and all drill centres. The PR02-FS
model includes its 12 mm coating extent, and the X2 holes allow lead-pitch
tolerance. Exact drawing hashes, project forming choices and remaining
standoff/thermal obligations live in `suppression-components.tsx`.

Run `bun test mains/design`, `bun run render:mains-power-parts`,
`bun run render:mains-secondary` and `bun run render:mains-suppression` from `pcb/`.
They write source JSON and SVGs under ignored `dist/mains/` review directories.
PCB lint, format, TypeScript and normal test gates include this directory.
Use [the mains design basis](../../../docs/design/mains-design-basis.md) for
power domains, exact interfaces and the independent insulation boundary.
