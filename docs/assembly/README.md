# Assembly bench guide

[Open the printable booklet](crystal-shim-assembly-bench-guide.pdf).

Seventeen Letter pages for one sensor, one controller and one mains board.
Print one copy, duplex with long-edge binding, at normal page size. The last
sheet has a blank back. The booklet covers soldering and internal combination;
firmware, commissioning and tank mounting stay in the interactive build sessions.

## Contents

| Pages | Bench task |
| --- | --- |
| 1–2 | Stencil/hot-bed sequence and SMT package identification |
| 3 | Sensor: all 14 component placements |
| 4–10 | Controller: 12 iron parts and 87 SMT placements, including USB |
| 11–14 | Mains: nine SMT and 13 iron placements; hand-solder details |
| 15 | Sensor pigtail and both internal power/relay harnesses |
| 16 | Inlet, EMI filter, pump pigtail and protective earth |
| 17 | Combining the boards around the intact separator |

## Sources and review

The maps use read-only KiCad pad coordinates and F.Fab outlines from the ordered
native boards. They are component-side views and are not mirrored. Black dots
identify native pad 1 for ICs/MOSFETs and the cathode for diodes/LEDs. Grey
neighbours give positional context. Map scale varies and is not a manufacturing
template.

[parts.json](source/parts.json) reconciles all 135 placements to the actual
[inventory](../../bom/inventory.csv), [DigiKey receipt](../../bom/purchases/101602605/README.md)
and [Mouser receipt](../../bom/purchases/40452969/README.md). It includes approved
capacitor, LED, resistor and packaging substitutions. The 63 board-specific
groups contain 50 distinct purchased MPNs. All circuits are populated; controller
mounting/probe pads and the sensor's built-in copper are not purchased parts.

Four illustrations were generated with the built-in ImageGen tool. The
[prompts and correction prompts](source/imagegen-prompts.json) are retained.
These illustrations show technique and generic package appearance, not verified
lot markings or physical pin-layout drawings. Purchased labels, the exact tables
and native placement maps take precedence. The flipped soldering view was
corrected, and the relay artwork was revised after its four native pins were
confirmed. Some far-side leads are occluded in the generic perspective drawings.

The parts/orientation review and the harness/stack review were independent.
All 17 rendered pages were visually inspected; cropped maps, crowded footers and
stack leaders were corrected. The builder checks all 135 references in both maps
and tables, every purchased MPN in extracted PDF text, native file hashes and
layout overflow. [Build receipt](source/build-receipt.json) identifies the PDF.
The native KiCad files were unchanged. This is document verification, not
assembly or electrical test evidence.

Validation on 2026-09-14: booklet build/coverage checks, `sh scripts/check.sh`,
`python3 scripts/check_docs.py` and `git diff --check` passed. The project harness
retains its existing platform-dependent skips; no physical tests were run.

Assembly details also follow [manufacturing output](../design/manufacturing-output.md),
[MOV capture](../design/mov-capture.md), [mechanical construction](../mechanical.md)
and [connector capture](../design/mains-header-capture.md). Manufacturer details
were rechecked for the [Littelfuse 215 hand-solder conditions](https://www.littelfuse.com/assetdocs/fuse-215-datasheet?assetguid=990f7193-d9a2-48e4-b760-2b43514249cf),
[TMOV lead heat sinks](https://www.littelfuse.com/assetdocs/tmov-itmov?assetguid=bd475732-1071-4352-b8aa-f78b0007eb05)
and [Phoenix 1868076 termination](https://www.phoenixcontact.com/us/products/1868076/pdf).
No universal hot-bed setting or unverified TMOV iron-temperature limit is given.

Stencil purchase, actual sensor-cable specifications and internal cut lengths
remain unrecorded. The guide preserves the sensor's 203.2 mm termination-to-crimp
limit without inventing cable colours or housing-face numbering. Parts marked
On the way are not claimed received. The service lead is outside the installed
three-harness build and remains covered in [service input](../design/service-input.md).

## Rebuild

Use Python with the [pinned rendering packages](source/requirements.txt);
Arial on macOS or DejaVu Sans on Linux.
From the repository root:

```sh
python3 docs/assembly/source/build_booklet.py
pdftoppm -scale-to 1400 -png docs/assembly/crystal-shim-assembly-bench-guide.pdf /tmp/crystal-shim-booklet-review
```

Review every resulting page before printing a changed PDF. The component mapping
is a reviewed purchase snapshot, not a live inventory lookup. Geometry can be
recaptured read-only on the KiCad host with:

```sh
sh pcb/tools/kicad_python.sh docs/assembly/source/extract_native.py
```

Do not silently recapture geometry if the ordered board revision changes. Reconcile
parts, orientation cues and the booklet's content with that revision first.

Printing status and job receipt are recorded separately after Executor submits
the reviewed PDF to the configured Brother printer.
