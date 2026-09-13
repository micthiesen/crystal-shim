#!/usr/bin/env python3
"""Apply only the declared mains isolation rule area through native pcbnew."""
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('registration', HERE / 'register-mains-library.py')
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


def apply():
    stage = registration.guarded_stage()
    registration.validate_mains_manifest(registration.handoff.load_manifest(stage / 'source-manifest.normalized.json'))
    augmentation = json.loads(registration.read_regular(stage / 'kicad-augmentation.normalized.json'))
    operation = next(op for op in augmentation['operations'] if op['id'] == 'mains.augment.isolation-and-mounts')
    rectangles = [[-20,-12,-12,55],[-20,-12,46,-4],[38,-35,46,-4],[38,-35,90,-27]]
    if operation['params'].get('source_copper_free_rectangles_mm') != rectangles:
        raise ValueError('Exact source-bound mains isolation rectangles required')
    receipt = stage / 'native-isolation-areas.json'
    if receipt.exists():
        raise ValueError('Refuse repeat rule-area application')
    before = registration.tree_hashes(stage)
    project_before = json.loads((stage / 'mains.kicad_pro').read_text())
    board_path = stage / 'mains.kicad_pcb'
    import pcbnew
    import wx
    app = wx.App(False)
    quiet = wx.LogNull()
    manager = pcbnew.GetSettingsManager()
    manager.LoadProject(str(stage / "mains.kicad_pro"), False)
    project = manager.GetProject(str(stage / "mains.kicad_pro"))
    board = pcbnew.LoadBoard(str(board_path))
    board.SetProject(project)
    if not board or list(board.Zones()) or list(board.GetTracks()):
        raise ValueError('Require fresh unrouted mains with no existing zones')
    refs = {fp.GetReference(): sorted([(p.GetNumber(), p.GetPosition().x, p.GetPosition().y,
                               p.GetSize().x, p.GetSize().y, p.GetNetname(), p.GetLayerSet().FmtHex())
                              for p in fp.Pads()]) for fp in board.GetFootprints()}
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    polygons = []
    for i,(xmin,ymin,xmax,ymax) in enumerate(rectangles):
        points = [(100+xmin,100-ymin),(100+xmax,100-ymin),(100+xmax,100-ymax),(100+xmin,100-ymax)]
        polygons.append(points)
        zone = pcbnew.ZONE(board)
        zone.SetIsRuleArea(True)
        zone.SetZoneName('MAINS_ISOLATION_'+str(i+1))
        zone.SetLayerSet(layers)
        zone.SetDoNotAllowTracks(True)
        zone.SetDoNotAllowVias(True)
        zone.SetDoNotAllowZoneFills(True)
        zone.SetDoNotAllowPads(True)
        zone.SetDoNotAllowFootprints(False)
        zone.Outline().NewOutline()
        for x,y in points:
            zone.Outline().Append(pcbnew.FromMM(x),pcbnew.FromMM(y))
        board.Add(zone)
    if not pcbnew.SaveBoard(str(board_path), board):
        raise ValueError('Native SaveBoard failed')
    saved = pcbnew.LoadBoard(str(board_path))
    zones = sorted(saved.Zones(),key=lambda z:z.GetZoneName())
    if len(zones) != 4:
        raise ValueError('Saved isolation rule areas missing')
    for i,z in enumerate(zones):
        if (z.GetZoneName() != 'MAINS_ISOLATION_'+str(i+1) or not z.GetIsRuleArea()
                or not z.GetDoNotAllowTracks() or not z.GetDoNotAllowVias()
                or not z.GetDoNotAllowZoneFills() or not z.GetDoNotAllowPads()
                or z.GetDoNotAllowFootprints() or z.GetLayerSet().FmtHex()!=layers.FmtHex()):
            raise ValueError('Saved isolation rule flags changed')
        outline=z.Outline()
        contour=outline.COutline(0)
        points=sorted((contour.CPoint(j).x,contour.CPoint(j).y) for j in range(contour.PointCount()))
        expected=sorted((pcbnew.FromMM(x),pcbnew.FromMM(y)) for x,y in polygons[i])
        if outline.OutlineCount()!=1 or outline.HoleCount(0)!=0 or points!=expected:
            raise ValueError('Saved isolation polygon changed')
    after_refs = {fp.GetReference(): sorted([(p.GetNumber(),p.GetPosition().x,p.GetPosition().y,
                                     p.GetSize().x,p.GetSize().y,p.GetNetname(),p.GetLayerSet().FmtHex())
                                    for p in fp.Pads()]) for fp in saved.GetFootprints()}
    if after_refs != refs or list(saved.GetTracks()):
        raise ValueError('Native rule application changed source pads/nets or added routing')
    after = registration.tree_hashes(stage)
    project_after = json.loads((stage / 'mains.kicad_pro').read_text())
    before_sheets = project_before['schematic'].get('top_level_sheets')
    after_sheets = project_after['schematic'].get('top_level_sheets')
    if before_sheets != [] or after_sheets != [{'filename':'mains.kicad_sch','name':'mains','uuid':'00000000-0000-0000-0000-000000000000'}]:
        raise ValueError('Unexpected native project sheet discovery')
    project_after['schematic']['top_level_sheets'] = []
    if project_after != project_before:
        raise ValueError('Native save changed project settings beyond sheet discovery')
    if (set(after) - set(before)) or any(after.get(n) != before[n] for n in before if n not in ['mains.kicad_pcb','mains.kicad_pro']):
        raise ValueError('Rule application changed unrelated files')
    with receipt.open('x') as f:
        json.dump({'schema_version':1,'operation':operation['id'],'kicad_version':pcbnew.GetBuildVersion(),
                   'source_rectangles_mm':rectangles,'layers':['F.Cu','B.Cu'],
                   'tracks_vias_pads_fills_prohibited':True,'qualified_component_bodies_allowed':True,'source_pads_preserved':True,
                   'board_sha256_before':before['mains.kicad_pcb'],'board_sha256_after':after['mains.kicad_pcb'],
                   'project_sha256_before':before['mains.kicad_pro'],'project_sha256_after':after['mains.kicad_pro'],
                   'native_root_sheet_discovered':True,'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},f,indent=2)
        f.write('\n')
    assert app and quiet is not None
    return receipt

if __name__ == '__main__':
    print(apply())
