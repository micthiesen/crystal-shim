# Low-voltage controller board

The complete controller schematic and source placement are captured and adopted
in [the native KiCad project](kicad/), with [the handoff lock](design/handoff.lock.json).
Follow [the electrical specification](../../docs/electrical.md).
The board contains the ESP32-C6 module, local 3.3 V rail, low-voltage
relay driver, sensor interface, USB programming/power handling, status LED and
maintenance/off button. It occupies the low-voltage enclosure section.

The [controller basis](../../docs/design/controller-design-basis.md) selects GPIOs,
connector numbering, protected/service power topology and a provisional outline.
[Source component models](design/README.md) now bind checked copper lands and pin
maps to exact parts. All seven sections now form one 95-component controller
schematic, including sensor protection and test pads. Netlist/drawn-connectivity
tests and combined native pin readback check the electrical boundaries. The
[service circuit](../../docs/design/service-input.md) has exact adapter, harness
and protection selections. USB, eFuse and input TVS
source models now have tested initial-export corrections for native pins and copper.
[Placement](../../docs/design/controller-placement.md) now includes all 95 parts,
four mounting holes and a four-layer, 1.6 mm board. Compiled courtyards, mounting
reserves and actual native positions pass. Physical declarations cover all 27
purchased-part models. Adoption verified all 113 copied native files before
creating the lock. Repository-local symbol and footprint libraries are saved with
`${KIPRJMOD}` paths. All eight schematic sheets pass strict cleanup with no ignored
checks; basic fabrication rules and all 51 net-class preferences pass native
readback. The board has 216 unrouted items and zero DRC violations.

The [native record](../../docs/design/controller-grid.md) separates this adopted
unrouted baseline from the remaining work. Known vendor stack layers have been
entered through the GUI; nominal thickness correction and final stack readback
remain in progress. Native thermal/paste/other augmentation, complete design
review, routing, fabrication and final enclosure mating/support remain open.
Continue with [the PCB workflow](../../.agents/skills/pcb/SKILL.md).
