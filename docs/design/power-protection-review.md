# Common secondary power

The current mains board uses a PCB-mounted **IRM-45-12**, fixed 12 V, followed by
an **AP63205WU-7** 5 V buck for the existing relay/controller harness. A fused
12 V branch supplies the controller's three future pump drivers. The former
IRM-10-5/TPS259470 secondary circuit is superseded and is not populated.

The base 5 V allocation remains 850 mA. Future loads share a 12 V, 2 A continuous
allocation and a 3 A brief aggregate starting target. The selected supply has a
45.6 W nameplate; the conservative base-plus-start allocation is 42.9325 W.
See the exact source, fuse, copper and input-current details in the
[mains design basis](mains-design-basis.md) and
[future hardware contract](refill-expansion.md).

The supply's overload/short-circuit protections and the fused motor feed provide
proportionate secondary protection. The motor fuse is not a precision current
limiter. A supply hiccup/reset during an exceptional short is acceptable;
uninterrupted operation of all other loads is not required. Do not add an
independent buck-failure supervisor, eFuse bank or programmable voltage window.

The existing 5 V coil suppression, controller PSU_GOOD supervisor and relay
permission gate remain. They support the actual skimmer control contract. The
5 V branch and 12 V motor branch share the isolated return, with motor current
routed directly through its own harness and controller output-bank return.

Commission actual supply startup, relay pickup, base-load peaks and enclosed
thermal behavior. Later pump selection must fit the fixed interface, including
startup/stall behavior, rather than requiring another power PCB. This calculation
and source capture do not establish measured transients or immunity to the
reported skimmer interference.
