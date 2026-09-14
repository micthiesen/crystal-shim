# Physical component capture audit

The current authoritative source captures 113 controller components, 22 mains
components and 16 sensor components. Counts include 14 controller test pads and
the sensor electrode copper structure. Exact purchased MPNs and board-qualified
reference designators are grouped in the [BOM](../../bom/bom.csv). Current native
adoption and routing status are recorded in [STATE](../STATE.md); this source audit
does not declare fabrication or routing readiness.

This revision supersedes the earlier TPS259470 and LT3042 footprint selections.
Neither eFuse, its threshold network, the LT3042 exposed-pad/SET/PGFB network nor
the live RE/OoP_RE electrodes are populated. Their historical source receipts do
not authorize adding them back. Ordinary logic pullups, pulldowns and series
resistors use 1% ERJ parts; the PSU supervisor divider retains precision ERA parts.

## Controller

- ESP32-C6-WROOM-1-N8 follows the manufacturer's numbered module pads and antenna
  exclusion. The native footprint origin is 3 mm below the body centre. Retain
  nine separate exposed-ground lands and their paste apertures.
- AP63203WU-7 uses its TSOT26 manufacturer mapping and SRP5030TA-4R7M inductor.
  It has no exposed ground pad. Regulator bypass placement and quiet feedback
  remain routing obligations.
- GCT USB4105-GF-A uses the manufacturer's body datum and alphanumeric contacts.
  Compiler indices 1–17 are not physical contact numbers. Restore contact names
  and normalize the adapter bounds-centre to the GCT body origin before native
  conversion. Shared shell/ground contacts remain grounded.
- The USB ground-pad R0.25 corner adaptation preserves pad centres and overall
  bounds while clearing the locator holes. Its geometry, stack and impedance
  evidence remain in [controller stackup](controller-stackup.md).
- AO3400A uses gate/source/drain pads 1/2/3. Q1 switches the relay coil; Q2–Q4
  switch future motors. STPS2L40U uses cathode pad 1 and anode pad 2. D9–D11
  connect cathode to 12 V and anode to each motor drain.
- TCA9517ADGKR and ESDS312DBVR are captured for each of the two sensor ports.
  Both buffer supplies are 3.3 V, cable on A and ESP on B. Shared sensor power
  retains TPS2553DBVR, with separate passive branch filtering.
- Molex 43045-0200 headers serve the 12 V feed and motor outputs. Controller
  service J2 uses JST S2B-XH-A with XHP-2 housing and SXH-001T-P0.6 contacts,
  making the 5 V interface physically distinct. Both service pins are used.
  Assembly labels and pin-1 polarity must match the wiring drawing.
  Two 43045-0600 headers on the controller share one electrical sensor pinout;
  the tank sensor uses six numbered solder lands for its pigtail instead of a
  header. 43650-0300 carries the 5 V/return/coil harness.
- TP1–TP14 are PCB copper, not purchased components. TP12/TP13 expose GPIO4/5,
  and TP14 provides their nearby return; TP11 remains the UART service ground.

## Mains

IRM-45-12 uses its manufacturer 87 × 52 mm body and numbered primary/secondary
pins. AP63205WU-7 generates the 5 V base rail using the same buck package family
as the controller. The 3 A motor-branch fuse is 0451003.MRL; the 1 A filter branch
uses axial 0215001.MXEP. The separate inlet F1 is a 2 A 0215002.MXP cartridge,
not a PCB placement.

G5RL-1A-TV8 DC5 retains the manufacturer coil/contact mapping and contact stagger.
TMOV14RP175E uses the bulk straight-lead part and the existing installed envelope.
The enlarged 4.5 x 1.3 mm slot captures the full published lead spacing without
forming; see the [MOV capture](mov-capture.md) and current ECO evidence.
B32921C3473K000 is the 47 nF X2 snubber capacitor; PR02FS0201000KA100 is its
100 ohm flameproof resistor. Formed leads and installed bodies must fit the
captured assembly envelope. 1N4007-E3/54 is the relay-coil flyback diode.

J1–J4 each use a Phoenix Contact 1868076 fixed side-entry screw terminal block.
Each has two used pins at 7.62 mm pitch, with 1.3 mm holes and 3.5 mm copper
lands. There are no unused contacts or cable housings. The body is
15.24 × 12.5 × 21.5 mm. Refer to the
[mains design basis](mains-design-basis.md) and actual manufacturer drawings.

## Sensor

FDC1004DGSR uses the DGS VSSOP-10 mapping. CIN1 receives LEVEL, CIN2 wet RL;
CIN3 and CIN4 are open and CIN4 is the differential negative input. The E1
structure contains LEVEL/RL and their opposite-phase shields, without live RE.
The [sensor design basis](sensor-design-basis.md) owns electrode dimensions and
layer assignments.

TPS7A2433DBVR is the fixed 3.3 V SOT23-5 regulator. STPS2L40U connects output
anode to input cathode for source collapse. Exact 10 µF input/output, FDC bypass,
bleeders, signal resistors and ESDS312 protection remain source-populated; no
LT3042 pinout or PGFB diode applies to this board.

## Geometry and downstream verification

Manufacturer drawings commonly use positive Y down; source uses positive Y up.
Convert once. Preserve physical pad names, body datums and source identities
through export. Current physical declarations include F.Fab bodies, closed
courtyards and explicit mask/paste geometry. The project courtyard starts 0.5 mm
outside the combined copper, NPTH and package envelope, rounded outward to
0.05 mm. A courtyard is an assembly planning envelope, not an electrical spacing
waiver. Default NSMD expansion is 0.05 mm unless the exact package declares a
different reviewed geometry.

Before native acceptance, compare source/exported pad numbers, positions, shapes,
holes, polarity and net connectivity; inspect schematic and physical renders,
then run strict schematic ERC and pre-route DRC. Check connector mating and wire
access against the [current enclosure](../mechanical.md). Routing must preserve
mains separation, sensor shields, USB reference and compact motor return paths.
Source tests and static fit checks cannot measure actual interference, thermal
behavior or sensor performance. No fabricated or energized evidence is claimed.
