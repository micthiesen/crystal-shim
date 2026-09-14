#!/usr/bin/env python3
"""Regression probes against installed native rules; only temporary copies change.

Run with sh pcb/tools/kicad_python.sh pcb/tools/test_native_routing_rules.py.
Findings are matched to deliberately inserted item UUIDs and rule names. Existing
unconnected routing work does not make these negative tests pass or fail.
"""
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import pcbnew
import wx
from check_routing import escape_width_rule

ROOT = Path(__file__).resolve().parents[2]
PROBE_NETS = {}


def track(board, net, start, end, width=.3, layer=pcbnew.F_Cu):
    item = pcbnew.PCB_TRACK(board)
    item.SetStart(pcbnew.VECTOR2I(*(pcbnew.FromMM(v) for v in start)))
    item.SetEnd(pcbnew.VECTOR2I(*(pcbnew.FromMM(v) for v in end)))
    item.SetWidth(pcbnew.FromMM(width))
    item.SetLayer(layer)
    item.SetNetCode(board.FindNet(net).GetNetCode())
    board.Add(item)
    uuid = item.m_Uuid.AsString()
    PROBE_NETS[uuid] = net
    return uuid


def via(board, net, position):
    item = pcbnew.PCB_VIA(board)
    item.SetPosition(pcbnew.VECTOR2I(*(pcbnew.FromMM(v) for v in position)))
    item.SetWidth(pcbnew.FromMM(.45))
    item.SetDrill(pcbnew.FromMM(.2))
    item.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    item.SetNetCode(board.FindNet(net).GetNetCode())
    board.Add(item)
    uuid = item.m_Uuid.AsString()
    PROBE_NETS[uuid] = net
    return uuid


def require_finding(report, uuid, rule, kind=None):
    matches = [v for v in report['violations']
               if any(i.get('uuid') == uuid for i in v.get('items', []))
               and rule in v.get('description', '')
               and (kind is None or v.get('type') == kind)]
    if not matches:
        actual = [v for v in report['violations']
                  if any(i.get('uuid') == uuid for i in v.get('items', []))]
        raise AssertionError(f'Missing {rule!r}/{kind} for {uuid}: {json.dumps(actual, indent=2)}')


def run(names=("controller", "mains", "sensor")):
    app = wx.App(False)
    quiet = wx.LogNull()
    results = {}
    with tempfile.TemporaryDirectory(prefix='crystal-shim-native-rule-tests-') as tmp:
        for name in names:
            destination = Path(tmp) / name
            shutil.copytree(ROOT / 'pcb' / name / 'kicad', destination,
                            ignore=shutil.ignore_patterns('evidence', 'review-renders', '*-backups', '*.lck'))
            path = destination / f'{name}.kicad_pcb'
            board = pcbnew.LoadBoard(str(path))
            expectations = []
            accepted_widths = []
            # Net-only constraints apply outside the outline too. Put these
            # synthetic probes beyond all existing items, avoiding dependence
            # on placement, planes, or local pad escape areas.
            bounds = board.ComputeBoundingBox()
            bx = pcbnew.ToMM(bounds.GetRight()) + 20
            by = pcbnew.ToMM(bounds.GetBottom()) + 20
            pos = lambda x, y: (bx+x, by+y)
            if name == 'controller':
                pairs = []
                for stem in ('USB_D', 'USB_D_PORT', 'USB_D_SWITCH'):
                    for polarity, opposite in (('N','P'),('P','N')):
                        net = board.FindNet(f'{stem}_{polarity}')
                        coupled = board.DpCoupledNet(net)
                        assert coupled and coupled.GetNetname() == f'{stem}_{opposite}', stem
                        assert board.MatchDpSuffix(net.GetNetname(), '') != 0, stem
                        pairs.append([str(net.GetNetname()),str(coupled.GetNetname())])
                results['differential_pairs'] = pairs
                expectations = [
                    (track(board,'V12_PUMP',pos(0,0),pos(10,0)), 'V12_PUMP routing width','track_width'),
                    (track(board,'USB_D_PORT_N',pos(0,10),pos(5,10),.3), 'USB routing geometry','track_width'),
                    (track(board,'USB_D_SWITCH_P',pos(10,10),pos(15,10),.24,pcbnew.In1_Cu), 'USB outer copper only','items_not_allowed'),
                    (track(board,'USB_D_SWITCH_N',pos(10,25),pos(15,25),.24,pcbnew.In2_Cu), 'USB outer copper only','items_not_allowed'),
                    (track(board,'V3V3',pos(0,20),pos(5,20),1,pcbnew.In1_Cu), 'L2 ground reference','items_not_allowed'),
                    (via(board,'GND',pos(20,10)), 'Ordinary through vias',None),
                    (via(board,'V12_PUMP',pos(30,10)), 'V12_PUMP no single power via','items_not_allowed'),
                ]
            elif name == 'mains':
                # Use actual pad coordinates so board compaction cannot move the
                # probes away from the intended neck. The installed native rule
                # must preserve the trunk default and bound the whole segment.
                label = 'Neck V12_RAW C2.1.0'
                condition, constraint = escape_width_rule('V12_RAW', label, .3, 3)
                installed = path.with_suffix('.kicad_dru').read_text()
                expected_rule = f'(rule "{label}"\n  (condition "{condition}")\n  {constraint})'
                assert expected_rule in installed, 'Install regenerated bounded-neck rules through Board Setup first'
                pad = next(p for f in board.GetFootprints() if f.GetReference() == 'C2'
                           for p in f.Pads() if p.GetNumber() == '1')
                assert pad.GetNetname() == 'V12_RAW'
                # Probe outside the pad copper, inside its 1 mm inflated neck.
                # This cannot pass merely because the whole track is in a pad.
                x = pcbnew.ToMM(pad.GetBoundingBox().GetRight()) + .2
                y = pcbnew.ToMM(pad.GetPosition().y)
                short = track(board, 'V12_RAW', (x,y), (x+.2,y), .3)
                long = track(board, 'V12_RAW', (x,y), (x+10,y), .3)
                accepted_widths.append(short)
                # Deliberately unrelated track pairs, away from neck exception areas.
                primary = track(board,'AC_L_FUSED',pos(0,0),pos(5,0),3)
                track(board,'AC_N',pos(0,4),pos(5,4),3)
                isolated = track(board,'V12_RAW',pos(20,5),pos(25,5),3)
                track(board,'AC_N',pos(20,0),pos(25,0),3)
                expectations = [
                    (long, 'V12_RAW routing width', 'track_width'),
                    (primary,'PRIMARY_DIFFERENT_NET_3_2MM','clearance'),
                    (isolated,'PRIMARY_TO_SELV_8MM','clearance'),
                    (track(board,'V12_MOTOR',pos(40,0),pos(50,0),.3),'V12_MOTOR routing width','track_width'),
                ]
            else:
                expectations = [
                    (track(board,'GND',pos(0,0),pos(2,0),.2,pcbnew.B_Cu),
                     'Glass face only sensor copper','items_not_allowed'),
                    (track(board,'SHLD1',pos(0,5),pos(2,5),.15,pcbnew.In2_Cu),
                     'Fixed inner driven shields','items_not_allowed'),
                ]
            assert path.is_relative_to(Path(tmp))
            probe_ids = {uuid for uuid, _, _ in expectations} | set(accepted_widths)
            expected_nets = {uuid: PROBE_NETS[uuid] for uuid in probe_ids}
            pcbnew.SaveBoard(str(path),board)
            saved = pcbnew.LoadBoard(str(path))
            saved_nets = {item.m_Uuid.AsString(): str(item.GetNetname())
                          for item in saved.GetTracks() if item.m_Uuid.AsString() in probe_ids}
            assert saved_nets == expected_nets, 'Probe touched existing copper and changed net'
            output = destination / 'negative-drc.json'
            result = subprocess.run(['kicad-cli','pcb','drc','--severity-all','--format','json',
                                     '--output',str(output),str(path)],capture_output=True,text=True)
            if result.returncode:
                raise RuntimeError(result.stdout + result.stderr)
            report = json.loads(output.read_text())
            for uuid, rule, kind in expectations:
                require_finding(report,uuid,rule,kind)
            for uuid in accepted_widths:
                unexpected = [v for v in report['violations'] if v['type'] == 'track_width'
                              and any(i.get('uuid') == uuid for i in v.get('items', []))]
                assert not unexpected, f'Valid short pad escape rejected: {unexpected}'
            results[name] = {'probes':len(expectations) + len(accepted_widths),'passed':True}
    print(json.dumps(results,indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('boards',nargs='*',choices=['controller','mains','sensor'])
    args=parser.parse_args()
    run(args.boards or ('controller','mains','sensor'))
