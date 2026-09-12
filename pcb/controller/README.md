# Low-voltage controller board

Component source capture has started. Follow [the electrical specification](../../docs/electrical.md).
The intended board contains the ESP32-C6 module, local 3.3 V rail, low-voltage
relay driver, sensor interface, USB programming/power handling, status LED and
maintenance/off button. It occupies the low-voltage enclosure section.

The [controller basis](../../docs/design/controller-design-basis.md) selects GPIOs,
connector numbering, protected/service power topology and a provisional outline.
[Source component models](design/README.md) now bind checked copper lands and pin
maps to exact parts. The complete schematic, placement, service-input protection,
remaining footprints and enclosure fit still need implementation and review.
Continue with [the PCB workflow](../../.agents/skills/pcb/SKILL.md).
