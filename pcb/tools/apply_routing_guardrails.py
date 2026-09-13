"""Apply declared routing copper with KiCad's native API; never export a seed.

Requires a reviewed routing-guardrails ECO plan bound to the current augmentation.
Initial application requires its unchanged before snapshot. --refresh adds missing
declared geometry while preserving every existing track, via and zone identity.
Source-owned geometry must still match the before snapshot. The project must be
closed in the GUI; install regenerated rules text through native Board Setup.
"""
from pathlib import Path
import argparse
import json
import tempfile
import tscircuit_handoff as handoff
from check_routing import escape_width_rule
import wx
import pcbnew

parser = argparse.ArgumentParser()
parser.add_argument('board', choices=['controller', 'mains', 'sensor'])
parser.add_argument('--refresh', action='store_true')
args = parser.parse_args()
if args.board == 'sensor':
    parser.error('Sensor four-layer geometry is already prepared. This legacy generator cannot refresh it; use a reviewed native ECO for changes.')
root = Path(__file__).resolve().parents[2]
name = args.board
folder = root / 'pcb' / name
native = folder / 'kicad'
evidence = native / 'evidence/routing-guardrails'
plan = json.loads((evidence / 'plan.json').read_text())
assert not plan.get('blocked'), 'ECO plan is blocked'
app = wx.App(False)
log = wx.LogNull()
manager = pcbnew.GetSettingsManager()
project_path = native / f'{name}.kicad_pro'
manager.LoadProject(str(project_path), False)
project = manager.GetProject(str(project_path))
board_path = native / f'{name}.kicad_pcb'
b = pcbnew.LoadBoard(str(board_path))
b.SetProject(project)
augmentation = json.loads((folder / 'design/kicad-augment.json').read_text())
manifest = handoff.normalize_manifest(plan['target_manifest'])
normalized_augmentation = handoff.validate_augmentation(augmentation, manifest)
assert handoff.digest(normalized_augmentation) == plan['augmentation_sha256'], 'Augmentation differs from approved plan'
assert normalized_augmentation == plan['target_augmentation'], 'Plan target augmentation mismatch'
before = json.loads((evidence / 'before.json').read_text())
rule_paths = [p for p in (project_path, board_path.with_suffix('.kicad_dru')) if p.exists()]
initial = handoff.extract_kicad_data(board_path, rule_paths)
current = handoff.normalize_kicad_snapshot_data(initial, manifest, bool(initial['tracks'] or initial['vias']))
assert current['source_owned'] == before['source_owned'], 'Source-owned board drift since before snapshot'
if not args.refresh:
    assert current['kicad_owned'] == before['kicad_owned'], 'Native geometry/rules changed; review before --refresh'
spec = next(o['params']['planes'] for o in augmentation['operations'] if o['id'] == f'{name}.augment.routing-guardrails-zone')
policy = json.loads((root / 'pcb/tools/routing-policy.json').read_text())['boards'][name]
policy_operation = next(o for o in augmentation['operations'] if o['id'] == f'{name}.augment.routing-guardrails-custom_rule')
assert handoff.digest(policy) == policy_operation['params']['policy_sha256'], 'Routing policy differs from approved augmentation'
mm = pcbnew.FromMM

def zone(label, points, layer, rule=False):
    existing = [z for z in b.Zones() if z.GetZoneName() == label]
    assert len(existing) <= 1, f'Duplicate named zone: {label}'
    if existing:
        z = existing[0]
        expected_layers = {pcbnew.F_Cu, pcbnew.B_Cu} if rule else {layer}
        assert z.GetIsRuleArea() == rule and set(z.GetLayerSet().Seq()) == expected_layers, f'Existing zone type/layers differ: {label}'
        expected_outline = [[[pcbnew.ToMM(mm(x)), pcbnew.ToMM(mm(y))] for x,y in points]]
        assert handoff._zone_outline_mm(pcbnew, z) == expected_outline, f'Existing zone outline differs: {label}'
        assert rule or z.GetNetname() == spec['net'], f'Existing zone net differs: {label}'
        return z
    z = pcbnew.ZONE(b)
    z.SetZoneName(label)
    z.SetIsRuleArea(rule)
    z.SetLayer(layer)
    z.Outline().NewOutline()
    for x, y in points:
        z.Outline().Append(mm(x), mm(y))
    if rule:
        layers = pcbnew.LSET()
        for layer_id in [pcbnew.F_Cu, pcbnew.B_Cu]:
            layers.AddLayer(layer_id)
        z.SetLayerSet(layers)
        for method in ['SetDoNotAllowTracks', 'SetDoNotAllowVias', 'SetDoNotAllowPads', 'SetDoNotAllowFootprints', 'SetDoNotAllowZoneFills']:
            getattr(z, method)(False)
    else:
        z.SetNet(b.FindNet(spec['net']))
        z.SetLocalClearance(mm(.2 if name == 'sensor' else .15))
        z.SetMinThickness(mm(.2))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THT_THERMAL)
        z.SetThermalReliefGap(mm(.3))
        z.SetThermalReliefSpokeWidth(mm(.5))
        z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    b.Add(z)
    return z

for layer in spec['layers']:
    zone(f'{name} {spec["net"]} {layer}', spec['outline'], b.GetLayerID(layer))
# Motor-return connector pads are solid so their paths do not depend on thin spokes.
solid = {'controller': ['J6'], 'mains': ['U1', 'J6'], 'sensor': []}[name]
for fp in b.GetFootprints():
    if fp.GetReference() in solid:
        for p in fp.Pads():
            if p.GetNetname() == spec['net']:
                p.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
for x, y, diameter, drill in spec['vias']:
    existing = [v for v in b.GetTracks() if isinstance(v, pcbnew.PCB_VIA)
                and v.GetPosition().x == mm(x) and v.GetPosition().y == mm(y)]
    if existing:
        assert len(existing) == 1, f'Duplicate via at {x}, {y}'
        v = existing[0]
        assert (v.GetNetname() == spec['net'] and v.GetWidth(v.TopLayer()) == mm(diameter)
                and v.GetDrillValue() == mm(drill) and v.TopLayer() == pcbnew.F_Cu
                and v.BottomLayer() == pcbnew.B_Cu), f'Existing via differs at {x}, {y}'
        continue
    via = pcbnew.PCB_VIA(b)
    via.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
    via.SetWidth(mm(diameter))
    via.SetDrill(mm(drill))
    via.SetViaType(pcbnew.VIATYPE_THROUGH)
    via.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    via.SetNet(b.FindNet(spec['net']))
    via.SetFrontTentingMode(pcbnew.TENTING_MODE_TENTED)
    via.SetBackTentingMode(pcbnew.TENTING_MODE_TENTED)
    b.Add(via)

rules = ['(version 1)', '# Generated reference; install through KiCad Board Setup > Custom Rules.']
def rule(label, condition, constraint, layer=None):
    rules.append(f'(rule "{label}"\n  (condition "{condition}")\n' + (f'  (layer "{layer}")\n' if layer else '') + f'  {constraint})')
rule('Ordinary through vias', "A.Type == 'Via'", '(constraint via_diameter (min 0.6mm)) (constraint hole_size (min 0.3mm))')
rule('No blind or microvias', "A.Type == 'Via'", '(constraint disallow micro_via blind_via buried_via)')
# Fabrication baseline permits local fine-pitch escapes; class opt controls defaults.
for net, net_policy in policy['nets'].items():
    width = net_policy['minimum_width_mm']
    condition = f"A.NetName == '{net}'"
    rule(f'{net} routing width', condition, f'(constraint track_width (min {width}mm) (opt {width}mm))')
    if not net_policy.get('allow_vias', False):
        rule(f'{net} outer copper only', condition + " && A.Layer == 'In*.Cu'", '(constraint disallow track via)')
        rule(f'{net} no single power via', condition, '(constraint disallow via)')
    for e in net_policy['escapes']:
        for i, p in enumerate(p for fp in b.GetFootprints() if fp.GetReference() == e['ref'] for p in fp.Pads() if p.GetNumber() == e['pad']):
            assert p.GetNetname() == net
            box = p.GetBoundingBox()
            inf = mm(e['inflate_mm'])
            x0, y0, x1, y1 = [pcbnew.ToMM(v) for v in [box.GetLeft()-inf, box.GetTop()-inf, box.GetRight()+inf, box.GetBottom()+inf]]
            label = f'Neck {net} {e["ref"]}.{e["pad"]}.{i}'
            zone(label, [[x0,y0],[x1,y0],[x1,y1],[x0,y1]], pcbnew.F_Cu, True)
            rule(label, *escape_width_rule(net, label, e['minimum_width_mm'], width))

if name == 'controller':
    rule('L2 ground reference', "A.NetName != 'GND'", '(constraint disallow track zone)', 'In1.Cu')
    usb = "A.NetName == 'USB_D_*'"
    rule('USB routing geometry', usb, '(constraint track_width (min 0.24mm) (opt 0.24mm) (max 0.24mm)) (constraint diff_pair_gap (min 0.15mm) (opt 0.15mm) (max 0.15mm))')
    rule('USB no vias', usb, '(constraint disallow via)')
    rule('USB front only', usb + " && A.Layer != 'F.Cu'", '(constraint disallow track)')
    rule('USB side ground spacing', "A.Type != 'Pad' && B.Type != 'Pad' && ((A.NetName == 'USB_D_*' && B.NetName == 'GND') || (B.NetName == 'USB_D_*' && A.NetName == 'GND'))", '(constraint clearance (min 0.5mm))', 'F.Cu')
    # Module vias occupy only the four declared interstitial ground locations.
    for x,y,diameter,drill in spec['vias']:
        if diameter < .6:
            rule(f'Module ground via {x} {y}', f"A.Type == 'Via' && A.NetName == 'GND' && A.Position_X == {x}mm && A.Position_Y == {y}mm", '(constraint via_diameter (min 0.45mm)) (constraint hole_size (min 0.2mm))')
if name == 'sensor':
    field = next(z.GetZoneName() for z in b.Zones() if z.GetIsRuleArea() and 'Neck' not in z.GetZoneName())
    rule('Sensing field only electrodes', f"A.NetName != 'CIN_LEVEL' && A.NetName != 'CIN_RL' && A.NetName != 'SHLD1' && A.NetName != 'SHLD2' && A.intersectsArea('{field}')", '(constraint disallow track)')
if name == 'mains':
    # Preserve native, already validated primary rules last. They override no clearance.
    existing = (evidence / 'previous-rules.txt').read_text()
    rules.append(existing.replace('(version 1)', ''))
    ns = b.GetDesignSettings().m_NetSettings
    c = pcbnew.NETCLASS('Coil')
    c.SetTrackWidth(mm(.3)); c.SetClearance(mm(.15)); c.SetViaDiameter(mm(.6)); c.SetViaDrill(mm(.3))
    ns.SetNetclass('Coil',c); ns.SetNetclassPatternAssignment('COIL_DRAIN','Coil')
ns = b.GetDesignSettings().m_NetSettings
def net_class(label, net, width):
    c = pcbnew.NETCLASS(label)
    c.SetTrackWidth(mm(width)); c.SetClearance(mm(.15))
    c.SetViaDiameter(mm(.6)); c.SetViaDrill(mm(.3))
    ns.SetNetclass(label, c); ns.SetNetclassPatternAssignment(net, label)
if name == 'controller':
    net_class('Logic3V3', 'V3V3', 1)
if name in ('controller', 'mains'):
    switch = 'BUCK_SW' if name == 'controller' else 'BUCK5_SW'
    net_class('BuckSwitch', switch, 1)
    rule('Buck switch width', f"A.NetName == '{switch}'", '(constraint track_width (min 0.3mm) (opt 1mm))')
    rule('Buck switch no vias', f"A.NetName == '{switch}'", '(constraint disallow via)')
settings = b.GetDesignSettings()
settings.SetTrackWidthIndex(0)
settings.SetViaSizeIndex(0)
settings.m_UseConnectedTrackWidth = False
b.SynchronizeNetsAndNetClasses(False)
b.BuildConnectivity()
assert pcbnew.ZONE_FILLER(b).Fill(b.Zones()), 'Native zone fill failed'
# Validate a native-saved scratch candidate before changing the production board.
with tempfile.TemporaryDirectory(prefix='crystal-shim-routing-guardrails-') as scratch:
    candidate = Path(scratch) / board_path.name
    pcbnew.SaveBoard(str(candidate), b)
    extracted = handoff.extract_kicad_data(candidate, [])
    candidate_snapshot = handoff.normalize_kicad_snapshot_data(extracted, manifest, bool(extracted['tracks'] or extracted['vias']))
    assert candidate_snapshot['source_owned'] == before['source_owned'], 'Guardrail operation changed source-owned geometry'
    for category in ('tracks', 'vias', 'zones', 'graphics'):
        original_items = {item['uuid']: item for item in initial[category]}
        candidate_items = {item['uuid']: item for item in extracted[category]}
        assert all(candidate_items.get(uid) == item for uid,item in original_items.items()), f'Existing {category} changed'
    assert len(extracted['tracks']) == len(initial['tracks']), 'Guardrails must not add routes'
pcbnew.SaveBoard(str(board_path), b)
assert manager.SaveProject(str(project_path), project), 'Native project save failed'
(folder / 'design/routing-guardrails-rules.txt').write_text('\n\n'.join(rules)+'\n')
print(name, 'saved zones/vias; install rules through GUI then refill again')
