# Commissioning evidence

[test-matrix.csv](test-matrix.csv) holds the planned hardware acceptance tests.
Every row starts `Not run`, with blank evidence, owner and date. Do not turn host
tests or generated reports into physical test passes. Record board/firmware
revision, apparatus, observations and linked evidence when a test is performed.

The matrix defines proposed methods and acceptance intent. Where numerical limits
or an observation duration are open, establish them before claiming that gate
passed. Prefixes: `SEN` sensor, `PWR` supply/USB, `CTL` control, `MAI` mains,
`EMI` interference, `INS` installation, `NOT` water-transition notifications.

The development gate is `sh scripts/check.sh`. Its host simulation and tool tests
are software evidence only. Physical work follows [docs/build.md](../docs/build.md)
and the review gates in [docs/decisions.md](../docs/decisions.md).
