# Sensor visual design target

Accepted visual direction: 2026-09-13. This document and its image define the
owner's target for the next sensor layout. They supersede the earlier above-rim
head and removable clip requirements for future design work. The existing source
and native boards still describe the previous implementation.

![Sensor visual design target](sensor-visual-target.png)

## Locked visual and mounting decisions

- Slim, tall PCB with a compact rounded outline. Aim for 18 × 64 mm, subject to
  component, electrode and routing verification before fixing final dimensions.
- Entire board below the tank rim, outside the existing 5 mm freshwater glass.
  The image targets a top edge 2 mm below the rim; that offset is illustrative.
  Water is always at least 10 mm below the rim, per the owner.
- Repeated horizontal sensing-pad segments on the glass-facing side, with a
  separate lower reference region as the visual target. Copper stays covered
  by soldermask. Pad count, pitch, connections and shield geometry remain to be
  engineered; the image does not define independent measurement channels.
- Adhere the sensing face to the glass with thin, uniform mounting tape or
  adhesive transfer film. No separate clip, bracket, retention rails or mounting
  plate between PCB and glass. Avoid foam thickness and trapped air. The owner
  will obtain tape; its material and thickness remain to be selected and included
  in final calibration.
- Cable exits the left side when viewed from outside the aquarium looking at
  the electronics, then runs left below the rim. Electronics face outward.
  Connector choice, attachment and strain relief remain engineering details.
- Preserve the small, unobtrusive appearance in the image. Component shapes and
  positions in the rendering are illustrative, not a placement specification.

## Engineering scope and sequence

Discuss visual targets for the controller and mains boards before resizing or
moving components on any board. Intended sensor redesign scope is electrode/pad
changes plus compact placement and outline. Intended controller and mains scope
is compaction and component movement with their circuits and interfaces retained.
Verify these scope assumptions before implementation; do not assume a segmented
sensor works with the present channel allocation merely because it is rendered.

Retain the 50 mm physical sensing-span requirement unless explicitly revised.
Reconcile that span with the below-rim offset, reference region and compact head.
The 10 mm water clearance permits assessing a dry reference but does not establish
that one fits or is reliable through fringe fields. No live dry-reference channel
is selected by this visual decision. Confirm signal margins through 5 mm glass,
adhesive effects, shields, connectivity, connector fit and mounting durability.

This is a visual reference target, not an electrically validated layout or
fabrication release. No PCB source, native geometry, firmware or parts selection
was changed to implement it. Existing handoff evidence applies to the old geometry;
the later redesign needs the normal source/ECO, review and validation gates.

## Image provenance

Generated with the built-in image generation tool by editing the initial slim
sensor concept. Final edit prompt:

> Edit this sensor concept sheet preserving its elegant styling, slim 18 x 64 mm target proportions, horizontal mask-covered sensing bars, dark teal PCB, two views, below-rim placement and water gap. Required changes: remove ALL mounting clips, brackets, rails, black holder and standoffs. Bare PCB adheres directly to OUTSIDE glass using a very thin uniform translucent adhesive transfer film sandwiched between glass and PCB, no foam and no visible air gap. Label 'Thin adhesive film, no bracket'. Cable must exit the LEFT edge of the board as seen from outside the aquarium looking at the electronics, opposite the original right-hand cable exit. Cable runs LEFT horizontally below rim. Absolutely no cable exiting right. Reposition installed view if needed for space to show left-going cable. Electronics face outward, sensing copper on glass-facing reverse; do not show sensing bars on outward electronics face, use unobtrusive plain soldermask lower face there. Left standalone glass-facing view retains horizontal bars and lower reference patch. Title 'Sensor design target'. Retain labels '18 × 64 mm target', 'Glass-facing side', 'Outside glass', 'Tank rim', 'Board top 2 mm below rim', 'Water at least 10 mm below rim'. Bottom caption 'Visual reference target • electrical layout pending'. No part above rim. No changes to overall narrow tall silhouette. High quality industrial design rendering.
