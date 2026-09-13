#!/usr/bin/env python3
"""Regression probes against installed native rules; only temporary copies change.

Run with sh pcb/tools/kicad_python.sh pcb/tools/test_native_routing_rules.py.
Findings are matched to deliberately inserted item UUIDs and rule names. Existing
unconnected routing work does not make these negative tests pass or fail.
"""
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import pcbnew
import wx

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


def run():
    app = wx.App(False)
    quiet = wx.LogNull()
    results = {}
    with tempfile.TemporaryDirectory(prefix='crystal-shim-native-rule-tests-') as tmp:
        for name in ('controller', 'mains', 'sensor'):
            destination = Path(tmp) / name
            shutil.copytree(ROOT / 'pcb' / name / 'kicad', destination,
                            ignore=shutil.ignore_patterns('evidence', 'review-renders', '*-backups', '*.lck'))
            path = destination / f'{name}.kicad_pcb'
            board = pcbnew.LoadBoard(str(path))
            expectations = []
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
                    (track(board,'V12_PUMP',(95,130),(105,130)), 'V12_PUMP routing width','track_width'),
                    (track(board,'USB_D_PORT_N',(95,135),(100,135),.3), 'USB routing geometry','track_width'),
                    (track(board,'USB_D_SWITCH_P',(105,135),(110,135),.24,pcbnew.B_Cu), 'USB front only','items_not_allowed'),
                    (via(board,'GND',(115,135)), 'Ordinary through vias',None),
                ]
            elif name == 'mains':
                # Deliberately unrelated track pairs, away from neck exception areas.
                primary = track(board,'AC_L_FUSED',(40,65),(45,65),3)
                track(board,'AC_N',(40,69),(45,69),3)
                isolated = track(board,'V12_RAW',(55,70),(60,70),3)
                track(board,'AC_N',(55,65),(60,65),3)
                expectations = [
                    (primary,'PRIMARY_DIFFERENT_NET_3_2MM','clearance'),
                    (isolated,'PRIMARY_TO_SELV_8MM','clearance'),
                    (track(board,'V12_MOTOR',(160,55),(170,55),.3),'V12_MOTOR routing width','track_width'),
                ]
            else:
                expectations = [(track(board,'GND',(90.5,100),(90.5,105),.2), 'Sensing field only electrodes', 'items_not_allowed')]
            assert path.is_relative_to(Path(tmp))
            probe_ids = {uuid for uuid, _, _ in expectations}
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
            results[name] = {'probes':len(expectations),'passed':True}
    print(json.dumps(results,indent=2))


if __name__ == '__main__':
    run()
