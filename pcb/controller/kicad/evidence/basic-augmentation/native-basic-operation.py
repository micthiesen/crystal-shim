"""Apply/read exactly the declared basic rules; KiCad owns serialization."""
import argparse
import hashlib
import json
from pathlib import Path
import pcbnew
import wx

repo = Path('/Users/michael/Code/crystal-shim')
target = repo / 'pcb/controller/kicad'
board_path = target / 'controller.kicad_pcb'
project_path = target / 'controller.kicad_pro'
output = Path('/tmp/crystal-shim-controller-basic-settings')
output.mkdir(exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
assert target.resolve() == target and target.is_dir()
assert (repo / 'pcb/controller/design/handoff.lock.json').is_file()
assert not list(target.glob('~*.lck')), 'close the project before native work'
augment_path = repo / 'pcb/controller/design/kicad-augment.json'
augment = json.loads(augment_path.read_text())
ops = {item['id']: item['params'] for item in augment['operations']}
fab = ops['controller.augment.fabrication-rules']
usb = ops['controller.augment.usb-impedance']
assert fab['minimum_via_diameter_mm'] == 0.35
assert fab['ordinary_net_class'] == 'Default' and usb['net_class'] == 'USB90'
fields = {
    'm_MinClearance': fab['minimum_clearance_mm'],
    'm_TrackMinWidth': fab['minimum_trace_width_mm'],
    'm_MinThroughDrill': fab['minimum_via_drill_mm'],
    'm_ViasMinSize': fab['minimum_via_diameter_mm'],
    'm_ViasMinAnnularWidth': fab['minimum_via_annulus_mm'],
    'm_HoleClearance': ops['controller.augment.npth-clearance']['minimum_hole_to_copper_mm'],
    'm_SolderMaskMinWidth': fab['minimum_mask_web_mm'],
    'm_SolderMaskToCopperClearance': fab['minimum_mask_opening_to_other_copper_mm'],
}
getters = ['GetClearance', 'GetTrackWidth', 'GetViaDiameter', 'GetViaDrill', 'GetDiffPairWidth', 'GetDiffPairGap']
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def native_hashes():
    return {str(p.relative_to(target)): sha(p) for p in target.rglob('*')
            if p.is_file() and (p.suffix in ['.kicad_sch', '.kicad_pcb', '.kicad_pro', '.kicad_mod', '.kicad_sym'] or p.name in ['fp-lib-table', 'sym-lib-table'])}
app = wx.App(False)
log = wx.LogNull()
manager = pcbnew.GetSettingsManager()
assert manager.LoadProject(str(project_path), False)
project = manager.GetProject(str(project_path))
board = pcbnew.LoadBoard(str(board_path))
assert project is not None and board is not None
board.SetProject(project)
settings = board.GetDesignSettings()
assert settings.GetCopperLayerCount() == 4
assert not list(board.GetTracks()) and not list(board.Zones())
assert len(list(board.GetFootprints())) == 99
net = settings.m_NetSettings
names = sorted(str(name) for name in board.GetNetsByName().keys() if str(name))
assert len(names) == 51 and set(usb['nets']) <= set(names)
def read():
    return {'fields_mm': {key: pcbnew.ToMM(getattr(settings, key)) for key in fields},
            'nets': {name: {method: pcbnew.ToMM(getattr(net.GetEffectiveNetClass(name), method)()) for method in getters} for name in names}}
before = read()
if args.apply:
    assert not (output / 'application.json').exists()
    stored = json.loads(project_path.read_text())
    assert [item['name'] for item in stored['net_settings']['classes']] == ['Default']
    assert stored['net_settings']['netclass_patterns'] == []
    assert not stored['net_settings']['netclass_assignments']
    saved_hashes = native_hashes()
    (output / 'before-project.json').write_text(json.dumps(stored, indent=2) + '\n')
    for attr, mm in fields.items():
        setattr(settings, attr, pcbnew.FromMM(mm))
    default = net.GetDefaultNetclass()
    for setter, value in [('SetClearance', fab['minimum_clearance_mm']), ('SetTrackWidth', fab['ordinary_signal_width_mm']), ('SetViaDiameter', fab['ordinary_via_drill_pad_mm'][1]), ('SetViaDrill', fab['ordinary_via_drill_pad_mm'][0])]:
        getattr(default, setter)(pcbnew.FromMM(value))
    net.SetDefaultNetclass(default)
    usb_class = pcbnew.NETCLASS(usb['net_class'], False)
    usb_class.SetPriority(0)
    usb_class.SetTrackWidth(pcbnew.FromMM(usb['trace_width_mm']))
    usb_class.SetDiffPairWidth(pcbnew.FromMM(usb['trace_width_mm']))
    usb_class.SetDiffPairGap(pcbnew.FromMM(usb['pair_gap_mm']))
    net.SetNetclass(usb['net_class'], usb_class)
    for name in usb['nets']:
        net.SetNetclassPatternAssignment(name, usb['net_class'])
    net.ClearAllCaches()
    net.RecomputeEffectiveNetclasses()
    assert manager.SaveProject(str(project_path), project)
    after_hashes = native_hashes()
    changes = [name for name in saved_hashes if saved_hashes[name] != after_hashes[name]]
    assert changes == ['controller.kicad_pro'], changes
    (output / 'application.json').write_text(json.dumps({
        'scope': 'native basic fabrication rules and Default/USB90 routing preferences only',
        'kicad_version': pcbnew.GetBuildVersion(), 'before': before, 'in_memory_after': read(),
        'before_native_hashes': saved_hashes, 'after_native_hashes': after_hashes,
        'changed_native_files': changes, 'augmentation_sha256': sha(augment_path),
        'script_sha256': sha(Path(__file__)),
    }, indent=2) + '\n')
    print('native project saved; independent reload still required')
else:
    actual = read()
    assert actual['fields_mm'] == fields, actual['fields_mm']
    for name, values in actual['nets'].items():
        assert values['GetClearance'] == 0.15
        assert values['GetViaDiameter'] == 0.6 and values['GetViaDrill'] == 0.3
        assert values['GetTrackWidth'] == (0.24 if name in usb['nets'] else 0.25)
        if name in usb['nets']:
            assert values['GetDiffPairWidth'] == 0.24 and values['GetDiffPairGap'] == 0.15
    (output / 'reload.json').write_text(json.dumps({
        'readback': actual, 'kicad_version': pcbnew.GetBuildVersion(),
        'project_sha256': sha(project_path), 'board_sha256': sha(board_path),
        'augmentation_sha256': sha(augment_path), 'script_sha256': sha(Path(__file__)),
    }, indent=2) + '\n')
    print('fresh native reload passed: 8 rule fields, 6 USB and 45 Default net assignments')
assert app and log is not None
