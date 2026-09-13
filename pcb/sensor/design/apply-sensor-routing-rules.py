#!/usr/bin/env python3
"""Apply only the declared sensor-window rule area through native pcbnew."""
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('registration', HERE / 'register-sensor-library.py')
registration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registration)


def apply():
    stage = registration.guarded_stage()
    registration.validate_sensor_manifest(registration.handoff.load_manifest(stage / 'source-manifest.normalized.json'))
    augmentation = json.loads(registration.read_regular(stage / 'kicad-augmentation.normalized.json'))
    operation = next(op for op in augmentation['operations'] if op['id'] == 'sensor.augment.sensing-window')
    if operation['params'].get('native_rectangle_mm') != [81, 79, 119, 143]:
        raise ValueError('Exact source-bound sensing-window rectangle required')
    receipt = stage / 'native-sensing-window.json'
    if receipt.exists():
        raise ValueError('Refuse repeat rule-area application')
    before = registration.tree_hashes(stage)
    board_path = stage / 'sensor.kicad_pcb'
    import pcbnew
    import wx
    app = wx.App(False)
    quiet = wx.LogNull()
    board = pcbnew.LoadBoard(str(board_path))
    if not board or list(board.Zones()) or list(board.GetTracks()):
        raise ValueError('Require fresh unrouted sensor with no existing zones')
    refs = {fp.GetReference(): sorted([(p.GetNumber(), p.GetPosition().x, p.GetPosition().y,
                               p.GetSize().x, p.GetSize().y, p.GetNetname(), p.GetLayerSet().FmtHex())
                              for p in fp.Pads()]) for fp in board.GetFootprints()}
    zone = pcbnew.ZONE(board)
    zone.SetIsRuleArea(True)
    zone.SetZoneName('SENSOR_WINDOW_NO_ROUTING')
    layers = pcbnew.LSET()
    layers.AddLayer(pcbnew.F_Cu)
    layers.AddLayer(pcbnew.B_Cu)
    zone.SetLayerSet(layers)
    zone.SetDoNotAllowTracks(False)
    zone.SetDoNotAllowVias(True)
    zone.SetDoNotAllowZoneFills(True)
    zone.SetDoNotAllowPads(False)
    zone.SetDoNotAllowFootprints(False)
    zone.Outline().NewOutline()
    for x, y in [(81,79),(119,79),(119,143),(81,143)]:
        zone.Outline().Append(pcbnew.FromMM(x), pcbnew.FromMM(y))
    board.Add(zone)
    if not pcbnew.SaveBoard(str(board_path), board):
        raise ValueError('Native SaveBoard failed')
    saved = pcbnew.LoadBoard(str(board_path))
    zones = list(saved.Zones())
    if len(zones) != 1 or zones[0].GetZoneName() != 'SENSOR_WINDOW_NO_ROUTING':
        raise ValueError('Saved rule area missing')
    z = zones[0]
    if (not z.GetIsRuleArea() or z.GetDoNotAllowTracks() or not z.GetDoNotAllowVias()
            or not z.GetDoNotAllowZoneFills() or z.GetDoNotAllowPads() or z.GetDoNotAllowFootprints()
            or z.GetLayerSet().FmtHex() != layers.FmtHex()):
        raise ValueError('Saved rule flags changed')
    outline=z.Outline()
    contour=outline.COutline(0)
    points=sorted((contour.CPoint(i).x,contour.CPoint(i).y) for i in range(contour.PointCount()))
    expected=sorted((pcbnew.FromMM(x),pcbnew.FromMM(y)) for x,y in [(81,79),(119,79),(119,143),(81,143)])
    if outline.OutlineCount()!=1 or outline.HoleCount(0)!=0 or points!=expected:
        raise ValueError('Saved sensing-window polygon changed')
    after_refs = {fp.GetReference(): sorted([(p.GetNumber(),p.GetPosition().x,p.GetPosition().y,
                                     p.GetSize().x,p.GetSize().y,p.GetNetname(),p.GetLayerSet().FmtHex())
                                    for p in fp.Pads()]) for fp in saved.GetFootprints()}
    if after_refs != refs or list(saved.GetTracks()):
        raise ValueError('Native rule application changed source pads/nets or added routing')
    after = registration.tree_hashes(stage)
    if (set(after) - set(before)) - {'sensor.kicad_pro','sensor.kicad_prl'} or any(after.get(n) != before[n] for n in before if n != 'sensor.kicad_pcb'):
        raise ValueError('Rule application changed unrelated files')
    with receipt.open('x') as f:
        json.dump({'schema_version':1,'operation':operation['id'],'kicad_version':pcbnew.GetBuildVersion(),
                   'rectangle_mm':[81,79,119,143],'layers':['F.Cu','B.Cu'],
                   'vias_fills_prohibited':True,'tracks_allowed_for_pad_entry':True,'source_pads_preserved':True,
                   'board_sha256_before':before['sensor.kicad_pcb'],'board_sha256_after':after['sensor.kicad_pcb'],
                   'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()},f,indent=2)
        f.write('\n')
    assert app and quiet is not None
    return receipt

if __name__ == '__main__':
    print(apply())
