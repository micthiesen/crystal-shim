# Low-voltage controller board

Component source capture has started. Follow [the electrical specification](../../docs/electrical.md).
The intended board contains the ESP32-C6 module, local 3.3 V rail, low-voltage
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
Full placement, physical footprint declarations, source manifest, native
augmentation, ERC/DRC and enclosure fit still need work.
Continue with [the PCB workflow](../../.agents/skills/pcb/SKILL.md).
