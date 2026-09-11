# Low-voltage controller board

Requirements only. Follow [the electrical specification](../../docs/electrical.md).
The intended board contains the ESP32-C6 module, local 3.3 V rail, low-voltage
relay driver, sensor interface, USB programming/power handling, status LED and
maintenance/off button. It occupies the low-voltage enclosure section.

GPIOs, connector pin numbering, power-mux topology and the board outline remain
unassigned. Add authoritative tscircuit files under `design/` when authoring
starts using [the PCB workflow](../../.agents/skills/pcb/SKILL.md).
