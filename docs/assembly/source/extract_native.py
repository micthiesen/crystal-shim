"""Read-only placement geometry for the bench booklet; run with kicad_python.sh."""

import hashlib
import json
from pathlib import Path

import pcbnew
import wx

ROOT = Path(__file__).resolve().parents[3]
app = wx.App(False)
quiet = wx.LogNull()


def xy(point):
    return [round(pcbnew.ToMM(point.x), 5), round(pcbnew.ToMM(point.y), 5)]


def shape(item):
    return {
        "kind": int(item.GetShape()),
        "start": xy(item.GetStart()),
        "end": xy(item.GetEnd()),
        "center": xy(item.GetCenter()),
        "mid": xy(item.GetArcMid()) if item.GetShape() == pcbnew.SHAPE_T_ARC else None,
        "width": round(pcbnew.ToMM(item.GetWidth()), 5),
        "layer": pcbnew.LayerName(item.GetLayer()),
    }


result = {"schema_version": 1, "boards": {}}
for name in ("controller", "mains", "sensor"):
    path = ROOT / f"pcb/{name}/kicad/{name}.kicad_pcb"
    before = hashlib.sha256(path.read_bytes()).hexdigest()
    board = pcbnew.LoadBoard(str(path))
    parts = []
    for fp in board.GetFootprints():
        parts.append({
            "ref": fp.GetReference(),
            "value": fp.GetValue(),
            "position": xy(fp.GetPosition()),
            "angle": fp.GetOrientationDegrees(),
            "reference_position": xy(fp.Reference().GetPosition()),
            "pads": [{
                "number": pad.GetNumber(), "position": xy(pad.GetPosition()),
                "size": xy(pad.GetSize()), "angle": pad.GetOrientationDegrees(),
                "shape": int(pad.GetShape()), "attribute": int(pad.GetAttribute()),
                "drill": xy(pad.GetDrillSize()), "net": pad.GetNetname(),
                "layers": [board.GetLayerName(i) for i in pad.GetLayerSet().Seq()],
            } for pad in fp.Pads()],
            "shapes": [shape(g) for g in fp.GraphicalItems()
                       if isinstance(g, pcbnew.PCB_SHAPE)
                       and g.GetLayer() in (pcbnew.F_Fab, pcbnew.F_SilkS)],
        })
    result["boards"][name] = {
        "source": str(path.relative_to(ROOT)), "sha256": before,
        "components": sorted(parts, key=lambda x: x["ref"]),
        "outline": [shape(d) for d in board.GetDrawings()
                    if isinstance(d, pcbnew.PCB_SHAPE) and d.GetLayer() == pcbnew.Edge_Cuts],
    }
    assert before == hashlib.sha256(path.read_bytes()).hexdigest(), "Native board changed"

target = Path(__file__).with_name("native-geometry.json")
target.write_text(json.dumps(result, indent=2) + "\n")
print(f"Read-only geometry written: {target}")
