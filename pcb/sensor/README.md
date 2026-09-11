# Sensor daughterboard

Requirements only. Follow [the sensor specification](../../docs/sensor.md).
The intended architecture uses one FDC1004, local regulation, continuous level
and wet/dry reference electrodes, and a short digital harness to the controller.

Glass is 5 mm thick; the requested sensing range extends 50 mm downward from the
top of the tank rim. Padding above/below the sensing area is allowed, and the
PCB stays against the outside glass of a freshwater tank. Keep it reasonably
compact; ample width is available. The owner will model an out-of-scope printed
clip over the glass, retained by gravity/friction. Provide the PCB's attachment
features and dimensioned interface so that clip can hold it snug without requiring
adhesive. These inputs constrain later electrode design;
they do not establish the electrode dimensions or finished board outline.

Do not fix the electrode geometry, connector pin numbers or exact parts before
the TI reference geometry and connector mates have been checked. Add authoritative
tscircuit files under `design/` when authoring starts using
[the PCB workflow](../../.agents/skills/pcb/SKILL.md).
