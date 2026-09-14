# Controller service input

The simplified service connection is for setup and calibration with household
mains disconnected. It is not an alternate motor supply. Do not live-mate the
service lead or use arbitrary simultaneous power sources.

J2 is a two-position JST S2B-XH-A right-angle header, mating XHP-2 housing
with two SXH-001T-P0.6 contacts. It is physically distinct from the two-position
Micro-Fit 12 V feed and pump ports. Pin 1 is positive regulated 5 V,
pin 2 is isolated ground. C20 (1 µF) and C21 (100 nF) bypass the input. D2
(STPS2L40U) feeds V5_LOGIC through the existing diode OR; D1 remains the mains-board
5 V input. The service supply does not feed the relay coil or 12 V motor rail.
USB remains the existing self-powered data interface, not controller power.

Use the selected GST18U05-P1J regulated 5 V adapter only through a correctly wired,
polarized service lead with a 2 A inline fuse (0215002.MXP in 01500274Z holder).
Keep the adapter's barrel positive on J2.1. The larger adapter rating does not raise the controller's 850 mA base
allocation. Verify lead polarity before connecting it. A regulated bench supply
set to 5 V with a 1 A current limit is also suitable for commissioning.

U10, D5, D6, R30–R37 and C22/C23 are removed from the controller. There is no
service eFuse, programmable UV/OV window, reverse-input resistor bank or separate
output clamp. Protection for arbitrary adapters and source combinations is not a
requirement. The known supply, external fuse, diode OR and ordinary service
procedure define the supported use.

Validate the assembled board's service startup, USB enumeration and absence of
relay/pump drive. Exceptional low-voltage faults may cause a reset and require
explicit recovery. Historical eFuse calculations and package fixtures do not
specify parts to populate on this revision. See the
[hardware provision](refill-expansion.md) and [controller basis](controller-design-basis.md).

Service rail allocation: 4.75 V adapter minimum − 0.19 V fuse maximum at 2 A
− 0.09 V harness/contact allowance − 0.45 V OR diode = 4.02 V, above the
3.9 V logic budget. The holder’s 16 AWG leads require insulated splices to the
JST XH-compatible 22 AWG lead; do not force them into smaller crimp contacts.

The [JST XH drawing](https://www.jst.com/wp-content/uploads/2025/06/eXH.pdf)
specifies S2B-XH-A, XHP-2 and SXH-001T-P0.6 (AWG 28–22). Use 22 AWG at
the service connector; its 3 A rating accommodates the retained 2 A fused lead.
Splice the holder’s 16 AWG leads to the compatible 22 AWG wire. XH uses friction
retention; it does not provide the Micro-Fit positive latch. The right-angle
header exits the existing lower service edge. Its 7.4 mm width, 11.5 mm full
depth including the rear extension and 6.1 mm height fit the service allocation.
