# Secondary protection review

Status: research checkpoint, not an adopted circuit or BOM change. Keep the
current capture documents provisional until the preferred candidate's complete
network is resolved. The objective is one protected PSU secondary feeding both
the relay coil and controller, while retaining a separate service-only logic path.

The coil-only TPS7A24 proposal is not preferred: its lower regulated setting
does not establish hot pickup, and its higher setting operates in dropout at the
minimum PSU voltage. The TPS259630 cutoff was then examined but rejected for a
direct downstream connection: its OUT limit depends on IN and it lacks reverse
blocking. Stored output energy during input collapse needs a separate path.
Do not treat the flyback diode as a supply overvoltage protector.
[TPS7A24](https://www.ti.com/lit/ds/symlink/tps7a24.pdf),
[TPS2596 absolute/recommended OUT limits](https://www.ti.com/lit/ds/symlink/tps2596.pdf).

The preferred candidate for closure is **TPS259470ARPWR**, with true reverse
blocking, ahead of both secondary branches. It accepts 2.7-23 V and specifies
45 milliohms maximum over temperature at its 3 A test point. At the existing
850 mA allocation, use 38.25 mV in the initial loss calculation. The RPW package
is a small leadless part; review its exact land pattern and assembly process.
[TPS25947 Rev C, May 2026](https://www.ti.com/lit/ds/symlink/tps25947.pdf).

Its rising OVLO threshold is 1.183-1.223 V with +/-0.1 uA pin leakage. A
38.3 kohm/10 kohm 0.1% divider is a starting calculation, about 5.8 V nominal.
The earlier proposed 48.7 kohm/10 kohm divider would be about 7.04 V nominal
and is rejected. Resolve exact threshold corners, UVLO, current limit, blanking,
output ramp, fault/retry behavior, local capacitance and transient limits together.
Do not copy TPS2596 divider or timing values into this different device.
The 3.32 kohm ILM table example allows a minimum threshold of 850 mA, leaving
no margin over the allocation. Moving directly to the 1.65 kohm, roughly 2 A
example is not a closed solution for a 1 A PSU. Derive a suitable current/ramp
network and check the supply's overload behavior before adopting it.

For the controller OR path, **STPS2L40U** in SMB is a simpler candidate than an
active ideal-diode circuit. Its stated maximum forward drop is 0.39 V at 1 A and
25 C. A 0.45 V allowance over 0-50 C is an engineering allocation, not a published
full-temperature guarantee. With the eFuse estimate, 50 mV wiring allowance and
that diode allocation, the logic rail floor is about **4.099 V**, preserving the
3.9 V buck budget. Verify cold/hot loss and reverse leakage on the final assembly.
[STPS2L40 electrical table](https://www.st.com/resource/en/datasheet/cd00002299.pdf).

Required propagation after circuit closure: raw IRM output gets a distinct input
net; protected output feeds coil, flyback cathode and controller harness. PSU_GOOD
senses that protected rail. The selected parts, pad mappings, startup/current/
thermal calculations and shutdown/recovery behavior must agree across both board
sources, BOM, harness drawings and commissioning matrix. No hardware acceptance
or ordering readiness follows from this research note.
