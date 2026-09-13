# Sensor cable protection

Scope: short, internal, isolated low-voltage harnesses. Power off before mating or
unmating. No hot-plug, arbitrary adapter injection or IEC high-kV qualification
campaign is required for this personal device.

Keep each complete branch <= 203.2 mm and the existing 6-pin Micro-Fit pinout.
Pairs 1/4,2/5,3/6 carry 5 V/GND,SDA/GND,SCL/GND respectively. Separate tank/reservoir
I2C buses prevent their identical FDC1004 addresses conflicting. Their protected
5 V feed may be shared. A fault may stop both; local control treats missing or
invalid readings as unavailable rather than trying to preserve accessory uptime.

The controller feed provides current limiting and the power-line clamp. Do not
fit a duplicate bulky SMBJ on the sensor. Sensor TPS7A2433DBVR accepts up to 18 V
recommended input, while the normal feed is 5 V. Retain ESDS312DBVR at each sensor
signal entry, with 22 ohm series resistors between its cable taps and local FDC
pins. The local 2.7 kohm pullups use the local 3.3 V rail only. Controller buffers
and released open-drain outputs handle ordinary start/stop without back-powering
an unpowered ESP or sensor. The Schottky from 3.3 V output to 5 V input protects
the LDO during input collapse; it is not a second supply arrangement.

Route signal-clamp ground directly into the connector-return area. Keep motor
current and switching paths away from the sensor feed and signal returns. The
CrystalSkim filter and mains switching suppression remain separate, required
provisions addressing the owner's observed PC wakeups. Local sensor ESD devices
do not prove that mains interference has been fixed.

Verification is proportionate: inspect cable pin-to-pin continuity, power-up/down,
sensor removal with power disconnected, reconnect/recovery, current limiting and
repeated skimmer switching with the actual installation. Keep the PC asleep and
observe controller/sensor stability. Do not claim laboratory immunity certification.
See [sensor basis](sensor-design-basis.md), [power calculation](sensor-power-refinement.md)
and [harness](sensor-harness.md).
