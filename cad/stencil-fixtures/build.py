"""PETG stencil trays, millimetres, pocket upward, bottom Z=0.

Run with the local locked uv project. Only generated fixture files are written.
The PCB order and released Gerbers are read-only dimensional references.
"""

import hashlib
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cadquery as cq
import trimesh

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT = HERE / "output"
ORDER = ROOT / "bom/purchases/W2026091502305469/order.json"
FLOOR = 3.0
DEPTH = 1.8
TOP = FLOOR + DEPTH
CLEARANCE = 0.6
TAB_TOP = TOP - 0.4
BEAM_LENGTH = 20.0
BEAM_WIDTH = 1.2
PRELOAD = 0.6
TRAVEL = 1.2
SHIM = 0.2


@dataclass(frozen=True)
class Board:
    name: str
    width: float
    height: float
    tray: float
    stencil: tuple[float, float]
    release: str

    @property
    def gerber(self):
        return ROOT / f"pcb/{self.name}/fabrication/{self.release}/gerbers/{self.name}-Edge_Cuts.gm1"

    @property
    def access_y(self):
        # On the narrow sensor, Y=0 crosses the upper right spring near its
        # root. Put both wells in the gap between the two right springs.
        return -10.0 if self.width <= 30 else 0.0


BOARDS = (
    Board("controller", 150, 110, 210, (170, 130), "2026-09-14-rev1"),
    Board("mains", 150, 110, 210, (170, 130), "2026-09-14-mov-bulk"),
    Board("sensor", 18, 64, 130, (40, 90), "2026-09-14-rev1"),
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def block(x0, x1, y0, y1, z0, z1):
    return cq.Solid.makeBox(x1 - x0, y1 - y0, z1 - z0, cq.Vector(x0, y0, z0))


def volume(shape):
    return sum(s.Volume() for s in shape.Solids())


def rounded_box(width, height, depth, radius):
    return cq.Workplane("XY").box(width, height, depth, centered=(True, True, False)).edges("|Z").fillet(radius).val()


def spring_local():
    """Local +X points away from the PCB; +Y runs toward the free tip.

    Entire spring starts on the print bed. Its open slot runs through the tray;
    there is no hidden floor binding the beam and no suspended bridge to print.
    """
    beam = block(1.6, 1.6 + BEAM_WIDTH, -BEAM_LENGTH - 1, 1, 0, TAB_TOP)
    # Rounded root shoulders stay outside the useful 20 mm beam length.
    root = block(0.8, 3.6, -BEAM_LENGTH - 1.5, -BEAM_LENGTH + 0.3, 0, TAB_TOP)
    root = cq.Workplane(obj=root).edges("|Z").fillet(0.4).val()
    nose = cq.Workplane("XY").polyline([
        (1.8, -3), (2.8, -3), (2.8, 2), (0.6, 2),
        (-PRELOAD, 0.8), (-PRELOAD, -0.8), (0.6, -2),
    ]).close().extrude(TAB_TOP).val()
    # Shrinking upper layers form a 45-degree insertion lead-in, no overhang.
    wedge = cq.Workplane("XZ").polyline([
        (-2, TAB_TOP - 0.6), (-PRELOAD, TAB_TOP - 0.6),
        (0, TAB_TOP), (-2, TAB_TOP),
    ]).close().extrude(10, both=True).val()
    return beam.fuse(root, nose).cut(wedge).clean()


def springs(board):
    # The two side springs face the two fixed left datum pads. The third
    # presses downward onto a fixed bottom datum. Top spring also fits sensor.
    return [("right", board.height * y) for y in (-0.27, 0.27)] + [("top", 0.0)]


def place(shape, board, side, along):
    if side == "right":
        return shape.translate((board.width / 2, along, 0))
    return shape.rotate((0, 0, 0), (0, 0, 1), 90).translate((along, board.height / 2, 0))


def make_tray(board):
    w, h = board.width, board.height
    tray = rounded_box(board.tray, board.tray, TOP, 4)
    tray = tray.cut(block(-w / 2 - CLEARANCE, w / 2 + CLEARANCE,
                          -h / 2 - CLEARANCE, h / 2 + CLEARANCE, FLOOR, TOP + 1))
    # Three flat contacts at nominal left/bottom coordinates, away from corners.
    for y in (-h * 0.27, h * 0.27):
        tray = tray.fuse(block(-w / 2 - CLEARANCE - 0.1, -w / 2,
                               y - 2, y + 2, FLOOR, TAB_TOP))
    tray = tray.fuse(block(-2, 2, -h / 2 - CLEARANCE - 0.1, -h / 2, FLOOR, TAB_TOP))
    fixed = tray
    for side, along in springs(board):
        window = block(-1.2, 5.0, -BEAM_LENGTH, 3.2, -1, TOP + 1)
        fixed = fixed.cut(place(window, board, side, along))
    tray = fixed
    for side, along in springs(board):
        tray = tray.fuse(place(spring_local(), board, side, along))
    # Small edge access wells expose the PCB underside for lifting with a
    # plastic pick after peeling back the stencil. No large support-floor hole.
    radius = 4 if w > 30 else 2.5
    for x in (-w / 2, w / 2):
        well = cq.Solid.makeCylinder(radius, TOP + 1 - 1.4, cq.Vector(x, board.access_y, 1.4))
        tray = tray.cut(well)
        fixed = fixed.cut(well)
    # Recessed text stays below the stencil plane and outside its outline.
    label = cq.Workplane("XY", origin=(0, -board.tray / 2 + 6, TOP - 0.4)).text(
        board.name.upper(), 4, 0.5, font="Arial", combine=False).val()
    return tray.cut(label).clean(), fixed.clean()


def make_shim(board):
    # 1.5 mm edge inset clears the spring windows and the smallest ordered PCB.
    shim = block(-board.width / 2 + 1.5, board.width / 2 - 1.5,
                 -board.height / 2 + 1.5, board.height / 2 - 1.5, 0, SHIM)
    radius = 4 if board.width > 30 else 2.5
    for x in (-board.width / 2, board.width / 2):
        shim = shim.cut(cq.Solid.makeCylinder(radius, 1, cq.Vector(x, board.access_y, -0.1)))
    return shim.clean()


def pcb_blank(board, dw=0, dh=0, thickness=1.6, lift=0):
    # Boards seat against the left/bottom datums; size tolerance grows the
    # right/top edges rather than symmetrically moving all four edges.
    return block(-board.width / 2, board.width / 2 + dw,
                 -board.height / 2, board.height / 2 + dh,
                 TOP - thickness + lift, TOP + lift)


def export(shape, name):
    assert shape.isValid() and len(shape.Solids()) == 1, name
    cq.exporters.export(shape, str(OUT / f"{name}.step"))
    shape.exportStl(str(OUT / f"{name}.stl"), tolerance=0.03, angularTolerance=0.08, relative=False)
    # Package the checked STL triangulation. Direct CQ 3MF tessellation can
    # leave nonmanifold seams at coincident glyph/fillet vertices.
    mesh = trimesh.load_mesh(OUT / f"{name}.stl")
    assert mesh.is_watertight and mesh.is_winding_consistent, name
    mesh.units = "mm"
    mesh.export(OUT / f"{name}.3mf")


def main():
    OUT.mkdir(exist_ok=True)
    order = {b["board"]: b for b in json.loads(ORDER.read_text())["boards"]}
    receipt = {"units": "mm", "material": "PETG", "floor": FLOOR, "pocket_depth": DEPTH,
               "top": TOP, "wall_clearance_per_side": CLEARANCE, "tab_top": TAB_TOP,
               "beam_width": BEAM_WIDTH, "beam_length": BEAM_LENGTH,
               "nominal_preload": PRELOAD, "design_travel": TRAVEL,
               "nominal_shim": SHIM, "source_sha256": sha(Path(__file__)), "boards": {}}
    for board in BOARDS:
        assert order[board.name]["dimensions_mm"] == [board.width, board.height]
        assert order[board.name]["thickness_mm"] == 1.6
        tray, _ = make_tray(board)
        export(tray, f"{board.name}-tray")
        export(make_shim(board), f"{board.name}-shim-0.2mm")
        receipt["boards"][board.name] = {
            **asdict(board), "order_thickness": order[board.name]["thickness_mm"],
            "gerber": str(board.gerber.relative_to(ROOT)), "gerber_sha256": sha(board.gerber),
            "pocket": [board.width + 2 * CLEARANCE, board.height + 2 * CLEARANCE],
            "outside_stencil_border": [(board.tray - s) / 2 for s in board.stencil],
            "volume_cm3": round(tray.Volume() / 1000, 2),
        }
        print(f"Exported {board.name}: {board.tray} square x {TOP:g} mm", flush=True)
    (OUT / "parameters.json").write_text(json.dumps(receipt, indent=2) + "\n")


if __name__ == "__main__":
    main()
