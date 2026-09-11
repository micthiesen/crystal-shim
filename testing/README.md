# Commissioning evidence

[test-matrix.csv](test-matrix.csv) holds the planned design reviews and hardware
acceptance tests.
Every row starts `Not run`, with blank evidence, owner and date. Do not turn host
tests or generated reports into physical test passes. Record board/firmware
revision, apparatus, observations and linked evidence when a test is performed.

Physical checks use the final boards and installed unit after the single
fabrication/assembly cycle. They do not require a separate prototype or
sensor-only board order. G-02/G-03/G-04 cover design and fabrication review;
G-01/G-05/G-06 cover the assembled hardware, and G-07 covers unattended use.
Gate IDs are not chronological. Low-voltage checks use the final hardware with
mains disconnected before the completed mains assembly is commissioned.

The matrix defines proposed methods and acceptance intent. Where numerical limits
or an observation duration are open, establish them before claiming that gate
passed. Prefixes: `SEN` sensor, `PWR` supply/USB, `CTL` control, `MAI` mains,
`EMI` interference, `INS` installation, `NOT` water-transition notifications.

The development gate is `sh scripts/check.sh`. Its host simulation and tool tests
are software evidence only. Physical work follows [docs/build.md](../docs/build.md)
and the review gates in [docs/decisions.md](../docs/decisions.md).
