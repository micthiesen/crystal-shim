#!/usr/bin/env python3
"""Read-only native routing checks supplementing KiCad's interactive DRC.

Run with: sh pcb/tools/kicad_python.sh pcb/tools/check_routing.py controller
Rail escape checks bound the complete copper path, not just its intersection with
an exception area. They do not establish current sharing, thermal performance,
or completed routing. --final additionally requires clean all-severity native DRC.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
POLICY = Path(__file__).with_name("routing-policy.json")
EPS = 1e-7


def escape_width_rule(net, label, minimum, trunk):
    """Allow a bounded neck without making that neck the router's default."""
    if not 0 < minimum <= trunk:
        raise ValueError('Escape width must be positive and no larger than trunk')
    return (f"A.NetName == '{net}' && A.enclosedByArea('{label}')",
            f'(constraint track_width (min {minimum}mm) (opt {trunk}mm))')


def interval_in_box(start, end, box):
    """Closed parameter interval of a line inside a rectangle, or None."""
    lo, hi = 0.0, 1.0
    for axis in range(2):
        delta = end[axis] - start[axis]
        if abs(delta) < EPS:
            if not box[axis] - EPS <= start[axis] <= box[axis + 2] + EPS:
                return None
        else:
            a = (box[axis] - start[axis]) / delta
            b = (box[axis + 2] - start[axis]) / delta
            lo, hi = max(lo, min(a, b)), min(hi, max(a, b))
            if lo > hi + EPS:
                return None
    return lo, hi


def segment_in_boxes(start, end, boxes):
    """Require the entire segment, including gaps, to be covered by the union."""
    intervals = sorted(i for b in boxes if (i := interval_in_box(start, end, b)))
    reached = 0.0
    for lo, hi in intervals:
        if lo > reached + EPS:
            return False
        reached = max(reached, hi)
        if reached >= 1.0 - EPS:
            return True
    return False


def box_inside(inner, outer):
    return all(inner[i] >= outer[i] - EPS for i in (0, 1)) and all(
        inner[i] <= outer[i] + EPS for i in (2, 3)
    )


def audit(board, policy, pcbnew):
    mm = pcbnew.ToMM
    point = lambda p: (mm(p.x), mm(p.y))
    rect = lambda b: (mm(b.GetX()), mm(b.GetY()), mm(b.GetRight()), mm(b.GetBottom()))
    findings = []
    pads = {}
    for footprint in board.GetFootprints():
        for pad in footprint.Pads():
            pads.setdefault((footprint.GetReference(), pad.GetNumber()), []).append(pad)
    exceptions = {}
    for net, rule in policy['nets'].items():
        exceptions[net] = []
        for escape in rule['escapes']:
            key = (escape['ref'], escape['pad'])
            matching = [p for p in pads.get(key, []) if p.GetNetname() == net]
            if not matching:
                findings.append(f"Policy endpoint {key[0]}.{key[1]} missing from {net}")
            for pad in matching:
                b = rect(pad.GetBoundingBox())
                n = escape['inflate_mm']
                exceptions[net].append((escape['minimum_width_mm'], (b[0]-n,b[1]-n,b[2]+n,b[3]+n)))
    for item in board.GetTracks():
        net = str(item.GetNetname())
        ident = item.m_Uuid.AsString()
        layer = board.GetLayerName(item.GetLayer())
        is_via = isinstance(item, pcbnew.PCB_VIA)
        if is_via:
            if net in policy['nets'] and policy.get('forbid_vias_on_rail_nets') and not policy['nets'][net].get('allow_vias', False):
                findings.append(f"{net} via {ident}: rail transitions are not approved; keep this trunk on an outer layer")
            if net in policy.get('usb_nets', []):
                findings.append(f"{net} via {ident}: USB must stay on {policy['usb_layer']}")
        else:
            if layer == policy.get('ground_reference_layer') and net != policy.get('ground_net'):
                findings.append(f"{net} track {ident}: reserved ground reference layer {layer}")
            if net in policy.get('usb_nets', []) and layer != policy['usb_layer']:
                findings.append(f"{net} track {ident}: USB must stay on {policy['usb_layer']}")
            rule = policy['nets'].get(net)
            width = mm(item.GetWidth())
            if rule and width + EPS < rule['minimum_width_mm']:
                eligible = [b for minimum,b in exceptions[net] if width + EPS >= minimum]
                if isinstance(item, pcbnew.PCB_ARC):
                    # Conservative exact enclosure: curved exceptions may not span boxes.
                    allowed = any(box_inside(rect(item.GetBoundingBox()), b) for b in eligible)
                else:
                    # Shrink by radius so the full swept copper stays in the approved union.
                    radius = width / 2
                    boxes = [(b[0]+radius,b[1]+radius,b[2]-radius,b[3]-radius) for b in eligible]
                    allowed = segment_in_boxes(point(item.GetStart()), point(item.GetEnd()), boxes)
                if not allowed:
                    findings.append(f"{net} track {ident}: {width:g} mm below {rule['minimum_width_mm']:g} mm outside approved pad escapes")
    if policy.get('sensor_field'):
        findings += sensor_geometry_findings(board, policy['sensor_field'], pcbnew)
    return findings


def sensor_geometry_findings(board, field, pcbnew):
    """Protect fixed sensor copper while leaving outward routing available."""
    mm = pcbnew.ToMM
    xy = lambda p: [mm(p.x), mm(p.y)]
    near = lambda a,b: len(a) == len(b) and all(abs(x-y) < .002 for x,y in zip(a,b))
    findings = []
    if board.GetCopperLayerCount() != 4:
        findings.append('Sensor requires four copper layers')
    electrodes = [p for f in board.GetFootprints() if f.GetReference() == 'E1' for p in f.Pads()]
    for footprint in board.GetFootprints():
        if footprint.GetReference() != 'E1' and any(p.GetLayerSet().Contains(pcbnew.B_Cu) for p in footprint.Pads()):
            findings.append('Sensor mounting face has an unrelated component pad or through hole')
    remaining = list(electrodes)
    for expected in field['fixed_electrodes']:
        matches = [p for p in remaining if p.GetNumber() == expected['number']
                   and p.GetNetname() == expected['net']
                   and p.GetShape() == pcbnew.PAD_SHAPE_RECT
                   and abs(p.GetOrientationDegrees()) < EPS
                   and [board.GetLayerName(l) for l in p.GetLayerSet().Seq()] == [expected['layer']]
                   and near(xy(p.GetPosition()), expected['center_mm'])
                   and near(xy(p.GetSize()), expected['size_mm'])]
        if len(matches) != 1:
            findings.append(f"Fixed sensor electrode {expected['number']} geometry/net/layer changed")
        else:
            remaining.remove(matches[0])
    if remaining:
        findings.append('Unexpected sensor electrode copper primitives')
    actual_vias = {t.m_Uuid.AsString():t for t in board.GetTracks() if isinstance(t,pcbnew.PCB_VIA)}
    for expected in field['prepared_vias']:
        via = actual_vias.get(expected['uuid'])
        if (via is None or via.GetNetname() != expected['net']
                or not near(xy(via.GetPosition()),expected['position_mm'])
                or abs(mm(via.GetWidth(pcbnew.F_Cu))-expected['width_mm']) > EPS
                or abs(mm(via.GetDrillValue())-expected['drill_mm']) > EPS):
            findings.append('Prepared sensor breakout via changed or missing')
    bottom = []
    for item in board.GetTracks():
        if isinstance(item, pcbnew.PCB_VIA):
            if item.m_Uuid.AsString() in {v['uuid'] for v in field['prepared_vias']}:
                continue
            x,y = xy(item.GetPosition()); r=mm(item.GetWidth(pcbnew.F_Cu))/2
            if not box_inside((x-r,y-r,x+r,y+r),field['via_gap_mm']):
                findings.append('Additional sensor via leaves the central shield gap')
        else:
            layer=board.GetLayerName(item.GetLayer())
            if layer == 'In2.Cu':
                findings.append('Fixed sensor inner shields prohibit routed tracks')
            if layer == 'B.Cu':
                bottom.append(item)
    for expected in field['bottom_tracks']:
        matches=[t for t in bottom if t.GetNetname()==expected['net']
                 and near(xy(t.GetStart()),expected['start_mm']) and near(xy(t.GetEnd()),expected['end_mm'])
                 and abs(mm(t.GetWidth())-expected['width_mm']) < EPS]
        if len(matches)!=1:
            findings.append('Prepared glass-face breakout changed or missing')
        else:
            bottom.remove(matches[0])
    if bottom:
        findings.append('Unrelated or undeclared track on sensor glass face')
    ground_layers=set()
    for zone in board.Zones():
        if zone.GetIsRuleArea():
            continue
        layers={board.GetLayerName(l) for l in zone.GetLayerSet().Seq()}
        if layers & {'B.Cu','In2.Cu'}:
            findings.append('Sensor face and driven-shield layers prohibit zone pours')
        if zone.GetNetname()=='GND':
            ground_layers |= layers
    if not set(field['ground_layers']) <= ground_layers:
        findings.append('Sensor outward ground planes missing')
    return findings


def usb_length_findings(board, policy, pcbnew):
    """Conservative total-copper mismatch check after routing is complete."""
    lengths = {net: 0.0 for net in policy.get('usb_nets', [])}
    for item in board.GetTracks():
        net = str(item.GetNetname())
        if net in lengths and not isinstance(item, pcbnew.PCB_VIA):
            lengths[net] += pcbnew.ToMM(item.GetLength())
    findings = []
    for net in lengths:
        if net.endswith('_P'):
            negative = net[:-1] + 'N'
            mismatch = abs(lengths[net] - lengths[negative])
            if mismatch > 0.5 + EPS:
                findings.append(f"USB {net}/{negative}: total routed copper mismatch {mismatch:.3f} mm exceeds 0.5 mm")
    return findings


def nonwaived_drc_findings(report, policy):
    """Only explicit item-bound intentional copper warnings can be excluded."""
    allowed=policy.get('native_drc_exclusions',[])
    findings=[]
    for item in report.get('violations',[]) + report.get('schematic_parity',[]):
        identity={k:item.get(k) for k in ('type','description','severity','items')}
        if item.get('excluded') is True and identity in allowed:
            continue
        findings.append(item)
    return findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('board', choices=('controller','mains','sensor'))
    parser.add_argument('--pcb', type=Path, help='Audit a native scratch board instead of production')
    parser.add_argument('--policy', type=Path, default=POLICY)
    parser.add_argument('--final', action='store_true', help='Also require clean native DRC including connectivity')
    args = parser.parse_args()
    import wx
    import pcbnew
    app = wx.App(False)
    quiet = wx.LogNull()
    path = (args.pcb or ROOT / 'pcb' / args.board / 'kicad' / f'{args.board}.kicad_pcb').resolve()
    data = json.loads(args.policy.read_text())
    if data['schema_version'] != 1:
        raise ValueError('Unsupported routing policy version')
    board = pcbnew.LoadBoard(str(path))
    findings = audit(board, data['boards'][args.board], pcbnew)
    if args.final:
        findings += usb_length_findings(board, data['boards'][args.board], pcbnew)
        with tempfile.TemporaryDirectory(prefix='crystal-shim-routing-drc-') as directory:
            out = Path(directory) / 'drc.json'
            result = subprocess.run(['kicad-cli','pcb','drc','--refill-zones','--schematic-parity','--severity-all','--format','json','--output',str(out),str(path)], capture_output=True, text=True)
            if result.returncode or not out.exists():
                findings.append(f"Native final DRC failed (exit {result.returncode}): {result.stdout.strip()} {result.stderr.strip()}")
            else:
                report=json.loads(out.read_text())
                failures=nonwaived_drc_findings(report,data['boards'][args.board])+report.get('unconnected_items',[])
                if failures:
                    findings.append(f"Native final DRC has {len(failures)} unwaived findings or unconnected items")
    print(json.dumps({'board':args.board,'final':args.final,'findings':findings,'passed':not findings},indent=2))
    return 1 if findings else 0


if __name__ == '__main__':
    raise SystemExit(main())
