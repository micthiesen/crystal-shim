# Tank sensor daughterboard

The [authoritative source](design/README.md) captures and places the final-use
FDC1004 board for 5 mm freshwater aquarium glass and a 50 mm physical span below
the rim. Optional live dry RE is omitted in favour of stored dry baselines.
A future reservoir sensor may reuse the electrical interface, but its electrode
geometry is outside the present feature scope.

The accepted [native project](kicad/README.md) is 18 × 64 mm with four layers,
horizontal glass-side electrodes, inner driven shields and a left-exiting soldered
pigtail. Its power/ground copper and CIN/shield breakouts are prepared; 21 connections
remain for owner routing. See [STATE](../../docs/STATE.md) for validation and the
exact intentional inner-shield padstack exceptions.
