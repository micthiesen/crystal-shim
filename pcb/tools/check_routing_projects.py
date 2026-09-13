"""Run native copper DRC and project routing checks, allowing unfinished routes."""
from pathlib import Path
import argparse
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('board', nargs='?', choices=['controller', 'mains', 'sensor'])
parser.add_argument('--final', action='store_true', help='also require zero unconnected items')
args = parser.parse_args()
failed = False
for name in [args.board] if args.board else ['controller', 'mains', 'sensor']:
    board = ROOT / f'pcb/{name}/kicad/{name}.kicad_pcb'
    with tempfile.TemporaryDirectory(prefix='crystal-shim-routing-check-') as scratch:
        report = Path(scratch) / 'drc.json'
        run = subprocess.run(['kicad-cli', 'pcb', 'drc', '--refill-zones', '--schematic-parity', '--severity-all', '--format', 'json', '-o', str(report), str(board)], capture_output=True, text=True)
        if run.returncode or not report.exists():
            raise SystemExit(run.stdout + run.stderr)
        data = json.loads(report.read_text())
        findings = data['violations'] + data['schematic_parity']
        if args.final:
            findings += data['unconnected_items']
        print(f"{name}: {len(findings)} DRC/parity findings; {len(data['unconnected_items'])} unconnected")
        if findings:
            print(json.dumps(findings, indent=2))
            failed = True
    audit = subprocess.run(['sh', str(ROOT/'pcb/tools/kicad_python.sh'), str(ROOT/'pcb/tools/check_routing.py'), name, *(['--final'] if args.final else [])])
    failed |= audit.returncode != 0
raise SystemExit(1 if failed else 0)
