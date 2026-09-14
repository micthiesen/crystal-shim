"""Validate exported print geometry, tolerance envelopes and support direction.

This is a geometric review. It does not measure print fit, PETG spring force,
warping, surface flatness or the delivered PCB/stencil.
"""

import itertools
import json
import re
from pathlib import Path

import cadquery as cq
import numpy as np
import trimesh

from build import (
    BEAM_LENGTH, BEAM_WIDTH, BOARDS, CLEARANCE, DEPTH, FLOOR, OUT, PRELOAD,
    ROOT, SHIM, TAB_TOP, TOP, TRAVEL, block, make_shim, make_tray, pcb_blank,
    place, sha, spring_local, springs, volume,
)


def released_outline(board):
    """These releases use only four straight lines, format 4.6 in mm.

    Fail closed if a future outline changes instead of fitting only its bbox.
    """
    text = board.gerber.read_text()
    assert "%FSLAX46Y46*%" in text and "%MOMM*%" in text
    assert "G02" not in text and "G03" not in text
    points = re.findall(r"X(-?\d+)Y(-?\d+)D0([12])\*", text)
    assert len(points) == 8 and [p[2] for p in points] == ["2", "1"] * 4
    coords = np.array([[int(x), int(y)] for x, y, _ in points]) / 1e6
    assert np.allclose(np.ptp(coords, axis=0), [board.width, board.height])
    corners, counts = np.unique(coords, axis=0, return_counts=True)
    assert len(corners) == 4 and np.all(counts == 2)
    assert all(np.count_nonzero(np.abs(b - a) > 1e-6) == 1 for a, b in zip(coords[::2], coords[1::2]))
    edges = {frozenset((tuple(a), tuple(b))) for a, b in zip(coords[::2], coords[1::2])}
    assert len(edges) == 4
    return {"rectangle_mm": [board.width, board.height], "sha256": sha(board.gerber)}


def check_export(name, expected):
    part = cq.importers.importStep(str(OUT / f"{name}.step")).val()
    assert part.isValid() and len(part.Solids()) == 1, name
    assert abs(part.Volume() - expected.Volume()) < 1e-4, name
    assert volume(part.cut(expected)) + volume(expected.cut(part)) < 1e-4, name
    bb = part.BoundingBox()
    assert abs(bb.zmin) < 1e-6
    assert bb.xlen < 235.5 and bb.ylen < 256 and bb.zlen < 256
    meshes = {}
    for suffix in ("stl", "3mf"):
        mesh = trimesh.load_mesh(OUT / f"{name}.{suffix}")
        assert mesh.is_watertight and mesh.is_winding_consistent, (name, suffix)
        assert len(mesh.split()) == 1, (name, suffix, "mesh islands")
        assert abs(mesh.volume - part.Volume()) / part.Volume() < 0.001
        meshes[suffix] = mesh
    assert np.allclose(meshes["stl"].bounds, meshes["3mf"].bounds, atol=0.01)
    return part, {"valid_single_solid": True, "watertight_stl_and_3mf": True,
                  "print_bounds_mm": [round(bb.xlen, 4), round(bb.ylen, 4), round(bb.zlen, 4)],
                  "files_sha256": {ext: sha(OUT / f"{name}.{ext}") for ext in ("step", "stl", "3mf")}}


def support_sections(tray, board):
    # Compare each upper layer footprint to the preceding one. Cross sections
    # shrink or remain constant, including the springs and lead-ins. This proves
    # no model-generated overhang/bridge at the specified 0.2 mm layer height.
    previous = None
    worst = 0
    for z in np.arange(0.1, TOP, 0.2):
        slab = tray.intersect(block(-board.tray, board.tray, -board.tray, board.tray, z, z + 0.01))
        slab = slab.translate((0, 0, -float(z)))
        if previous is not None:
            overhang = volume(slab.cut(previous)) / 0.01
            assert overhang < 0.001, (board.name, z, overhang)
            worst = max(worst, overhang)
        previous = slab
    return round(worst, 7)


def fit(board, tray, fixed):
    for side, along in springs(board):
        # Access wells and later details must not nick the intended beam.
        designed_spring = place(spring_local(), board, side, along)
        assert volume(designed_spring.cut(tray)) < 1e-6, (board.name, side, along, "damaged spring")
    # +/-0.2 board outline and 1.44..1.76 thickness; each PCB is shimmed flush.
    cases = []
    for dw, dh, t in itertools.product((-0.2, 0, 0.2), (-0.2, 0, 0.2), (1.44, 1.6, 1.76)):
        pcb = pcb_blank(board, dw, dh, t)
        collision = volume(fixed.intersect(pcb))
        assert collision < 1e-6, (board.name, dw, dh, t, collision)
        assert 0 < DEPTH - t < 0.4
        for side, along in springs(board):
            # This rigid translation tests available space for the free portion;
            # it is deliberately not claimed to be an elastic deformation model.
            delta = PRELOAD + (dw if side == "right" else dh)
            assert 0 < delta < TRAVEL
            spring = spring_local().intersect(block(-2, 6, -BEAM_LENGTH + 0.6, 4, 0, TAB_TOP))
            contact = place(spring, board, side, along)
            assert volume(contact.intersect(pcb)) > 0.01, "Missing preload negative control"
            displaced = place(spring.translate((delta, 0, 0)), board, side, along)
            assert volume(displaced.intersect(pcb)) < 1e-6
        cases.append({"dw": dw, "dh": dh, "pcb_thickness": t, "shim": round(DEPTH - t, 2)})
    for side, along in springs(board):
        free = spring_local().intersect(block(-2, 6, -BEAM_LENGTH + 0.6, 4, 0, TAB_TOP))
        # Extra 0.4 mm beyond max ordered displacement leaves a combined XY
        # print-error budget; physical print accuracy remains unmeasured.
        for delta in (0, 0.4, 0.8, TRAVEL):
            displaced = place(free.translate((delta, 0, 0)), board, side, along)
            assert volume(displaced.intersect(fixed)) < 1e-6, (board.name, side, delta)
    # The broad shim must clear all fixed floor/edge features when seated.
    shim = make_shim(board).translate((0, 0, FLOOR))
    assert volume(shim.intersect(tray)) < 1e-6
    assert abs(pcb_blank(board).BoundingBox().zmax - TOP) < 1e-6
    # A board that is too wide must fail the hard-wall test.
    assert volume(fixed.intersect(pcb_blank(board, dw=2))) > 0.1
    # Raising the blank does not introduce a hidden retaining lip.
    assert all(volume(fixed.intersect(pcb_blank(board, lift=z))) < 1e-6 for z in (0.2, 1, 3))
    # All dimensions represent clear sheet-edge tape land, not a stencil nest.
    border = [(board.tray - s) / 2 for s in board.stencil]
    assert min(border) >= 20
    return {"cases": cases, "fixed_collisions_mm3": 0,
            "free_spring_translation_clear_to_mm": TRAVEL,
            "negative_controls": ["oversize PCB hits wall", "unflexed tabs intersect PCB"],
            "outside_stencil_border_mm": border,
            "remaining_hard_wall_gap_at_max_board_mm": CLEARANCE - 0.2}


def main():
    report = {"scope": "Digital geometry only; no physical print, force or paste test",
              "source_sha256": {name: sha(Path(__file__).parent / name) for name in ("build.py", "validate.py", "uv.lock")},
              "parts": {}, "boards": {}, "beam_estimate": {
                  "model": "Small-deflection cantilever screening only, epsilon=3*t*delta/(2*L^2)",
                  "max_outer_fiber_strain": 3 * BEAM_WIDTH * TRAVEL / (2 * BEAM_LENGTH ** 2),
                  "not_proven": "Material fatigue, root stress concentration, printed stiffness or retention force"}}
    for board in BOARDS:
        expected, fixed = make_tray(board)
        tray, report["parts"][f"{board.name}-tray"] = check_export(f"{board.name}-tray", expected)
        _, report["parts"][f"{board.name}-shim-0.2mm"] = check_export(f"{board.name}-shim-0.2mm", make_shim(board))
        report["boards"][board.name] = {
            "release": released_outline(board), "fit": fit(board, tray, fixed),
            "unsupported_upper_layer_area_mm2": support_sections(tray, board),
        }
        print(f"PASS {board.name}: STEP/meshes, 27 fits, tabs, tape border, support-free layers", flush=True)
    (OUT / "validation.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
