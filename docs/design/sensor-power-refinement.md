# Sensor power refinement

The fixed sensor capture replaces LT3042 with TPS7A2433DBVR. This document
supersedes the earlier service-adapter stack, SET/ILIM calculations and independent
sensor limiter assumptions. See [the source basis](sensor-design-basis.md).

One shared controller TPS2553 feed supplies the tank sensor and future reservoir
sensor through separate short six-pin harnesses. Allocate 30 mA normal total;
each sensor receives a 10 mA design allowance. A short may shut down both sensors
and consequently the skimmer. Safe shutdown/manual recovery is acceptable.
Independent fault containment between the two accessory branches is not required.

The local TPS7A24 has 18 V recommended maximum input and 3.3 V fixed output.
For a deliberately conservative rail envelope add its 1.25% accuracy,0.25% line
and 0.5% load limits: **3.234..3.366 V**. Feed it at **at least 3.8 V** so the
nominal-plus0.5 V accuracy test condition is met. This is more restrictive than
merely subtracting its 250 mV maximum full-load dropout. Parent 5 V rail and cable
calculations must preserve that input floor at the 20 mA two-board normal load.
Use **5.5 V** as the normal maximum delivered sensor input. A retained upstream
clamp is transient suppression, not another independent regulator.

The normal per-board arithmetic is retained in
[the executable calculation](calculations/sensor-power.py): FDC 0.95 mA,
both 2.7 kohm pullups held low 2.52 mA,3.01 kohm bleeder 1.13 mA and10 kohm input
bleeder 0.56 mA. Reserve 0.5 mA for regulator ground current and 1 mA for aggregate
protection leakage: below 6.7 mA, inside the 10 mA allocation. Those leakage
reserves are engineering allowances, verified on assembled hardware.

C1/C2 are existing 25 V10 uF X7R1206 parts; retain a conservative4.7 uF minimum
effective capacitance, comfortably above the TPS7A24 minimum requirement.
C3/C4 add 100 nF and 1 uF at the FDC. C1 maximum 12.65 uF and complete output
maximum 14.05 uF per board follow  +10% initial and  +15% temperature allowances.
Budget **50 uF** total upstream sensor-feed capacitance, including two inputs,
controller bypassing and harness. Each output stays below **20 uF**.

Retain 200 ms powered settling and 2 s power-off recovery, with both bus buffers
disabled. Using only one 10 kohm discharge resistor for the whole50 uF input
budget gives about 1.47 s from 5.5 V to0.3 V. Each 20 uF output then needs about
0.147 s through its3.01 kohm bleeder. Even this sequential bound fits 2 s.
D2 is a simple output-to-input Schottky path matching TI's reverse-current
application example; it avoids forcing the LDO's intrinsic body diode to discharge
stored output energy during abrupt input collapse. No externally powered sensor
output, powered connector mating or external source injection is supported.

For 10 mA at 5.5 V, estimated LDO dissipation is under 26 mW including the ground
current allowance. The data-sheet 167.8 C/W package metric predicts under 5 C
rise on its reference board. Check final temperature and rails when commissioning;
this arithmetic is not measured PCB thermal evidence.
