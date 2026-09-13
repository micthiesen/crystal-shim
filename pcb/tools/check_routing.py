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
        field = policy.get('sensor_field')
        if field and (is_via or net not in field['allowed_nets']):
            b = rect(item.GetBoundingBox())
            f = field['rectangle_mm']
            if b[0] <= f[2] and b[2] >= f[0] and b[1] <= f[3] and b[3] >= f[1]:
                findings.append(f"{net} item {ident}: prohibited copper or via in sensor field")
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
            result = subprocess.run(['kicad-cli','pcb','drc','--exit-code-violations','--refill-zones','--schematic-parity','--severity-all','--format','json','--output',str(out),str(path)], capture_output=True, text=True)
            if result.returncode:
                findings.append(f"Native final DRC failed (exit {result.returncode}): {result.stdout.strip()} {result.stderr.strip()}")
    print(json.dumps({'board':args.board,'final':args.final,'findings':findings,'passed':not findings},indent=2))
    return 1 if findings else 0


if __name__ == '__main__':
    raise SystemExit(main())
