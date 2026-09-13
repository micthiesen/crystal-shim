# Active sensor daughterboard

The next design follows the accepted [visual target](design/sensor-visual-target.md)
for a slim, adhesive-mounted, entirely below-rim board with a left-exiting cable.
The description below records the existing implementation pending redesign;
its above-rim head and clip requirements are superseded by that target.

The final tank board uses one FDC1004DGSR, a fixed 3.3 V TPS7A2433DBVR regulator,
one continuous 50 mm level electrode and one wet/liquid reference. Its local
converter communicates with the ESP over the existing short 6-pin5 V/I2C harness.
There is no sensor processor. See the [complete design basis](design/sensor-design-basis.md)
and [source/placement](../pcb/sensor/design/README.md).

The board is38 x86 mm, with a 22 mm electronics head above the tank rim and a
50 mm physical sensing span down from that rim. It remains flat outside 5 mm
freshwater aquarium glass. The owner supplies a separate gravity/friction clip;
side retention rails and a fixed rim datum support that clip without adhesive.
The wet reference sits below the sensing span. All contact-face copper is
mask-covered and has no components or vias in the sensing window.

The optional live dry/environment reference is omitted. Stored dry baselines and
measured calibration endpoints replace it, removing the earlier 11 mm high-water
exclusion and the pending normal-full rim measurement. This does not guarantee
useful resolution right at the rim: final-unit calibration sets operating margins
and confirms performance through actual glass, wet film and mounting conditions.
No independent dry-reference witness or environmental compensation is claimed.

Keep the harness at most 203.2 mm complete, initially 100 kHz I2C, with local 3.3 V
pullups and the existing numbered Micro-Fit mates. The future reservoir board can
use an independently addressed controller bus and the shared sensor power feed;
its reservoir geometry remains future work. Motor drivers are on the present
controller board, not another future expansion-control PCB.

Commission the final board after the one fabrication cycle. Retain raw LEVEL/RL
readings, stored dry values, calibration limits/revision and observed water
positions. Test rising/falling water, receding film/deposits, temperature, clip
pressure and reseating, hands, cable motion and skimmer switching. Set a stable
stop/restart margin before unattended use. Simulation and source checks cannot
pass those commissioning rows. There is no separate prototype or planned respin.
