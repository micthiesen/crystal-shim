# Design dossier

The 2026-09-11 setup request is the initial design brief. These documents retain
its architecture, provisional choices, caveats, and acceptance goals. Verified
manufacturer facts are linked separately from proposed design decisions.

The owner selected a one-shot build: develop and review the complete three-board
design, fabricate one final-use set, then calibrate and commission it. The
[build sequence](build.md) separates design evidence required before fabrication
from measurements performed on the final assembly.

| Document | Owns |
| --- | --- |
| [Overview](overview.md) | Purpose, scope, board split, functional diagram |
| [Electrical](electrical.md) | Power, mains switching, noise suppression, interfaces |
| [Sensor](sensor.md) | Electrodes, daughterboard, calibration, glass validation |
| [Controls](controls.md) | Local firmware contract, diagnostics, provisional timing |
| [Mechanical](mechanical.md) | Enclosure separation, installation, assembly |
| [Decisions](decisions.md) | Baseline, open inputs, release gates |
| [Build](build.md) | Development and commissioning order |
| [Sources](sources.md) | Manufacturer references and Stillair evidence |
| [Detailed design](design/README.md) | Parts, geometry, interfaces, calculations and firmware integration under review |
| [Active goal](goal.md) | Full implementation, adversarial review and delivery scope |
| [STATE](STATE.md) | Current work and next step, with pointers to durable facts |

`Proposed` means a starting choice; `open` means unspecified; `verified` requires
linked evidence. A component rating does not establish whole-product compliance.
Update the owning document, BOM, and test matrix together when a choice is resolved.
`Capture candidate` identifies an exact proposed part with source evidence; it
does not mean the layout has passed release review or that procurement is ready.
