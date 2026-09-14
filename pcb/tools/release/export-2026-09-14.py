"""Read-only KiCad release export; never modifies native designs."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[3]
RELEASE='2026-09-14-rev1'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def run(args,log):
 r=subprocess.run(args,cwd=ROOT,text=True,capture_output=True)
 log.append({'argv':args,'exit_code':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
 if r.returncode:raise RuntimeError(r.stdout+r.stderr)
for board in ['controller','mains','sensor']:
 native=ROOT/'pcb'/board/'kicad'/f'{board}.kicad_pcb';out=ROOT/'pcb'/board/'fabrication'/RELEASE
 for folder in ['gerbers','drills','assembly','evidence','stencil']: (out/folder).mkdir(parents=True,exist_ok=True)
 before=digest(native);log=[]
 copper='F.Cu,In1.Cu,In2.Cu,B.Cu' if board!='mains' else 'F.Cu,B.Cu'
 run(['kicad-cli','pcb','export','gerbers','--check-zones','--layers',copper+',F.Mask,B.Mask,F.Silkscreen,B.Silkscreen,Edge.Cuts','--output',str(out/'gerbers')+'/',str(native)],log)
 run(['kicad-cli','pcb','export','gerbers','--check-zones','--layers','F.Paste','--output',str(out/'stencil')+'/',str(native)],log)
 run(['kicad-cli','pcb','export','drill','--format','excellon','--excellon-units','mm','--drill-origin','absolute','--excellon-separate-th','--excellon-oval-format','route','--generate-map','--map-format','pdf','--generate-report','--output',str(out/'drills')+'/',str(native)],log)
 run(['kicad-cli','sch','export','pdf','--output',str(out/'assembly'/'schematic.pdf'),str(native.with_suffix('.kicad_sch'))],log)
 run(['kicad-cli','pcb','export','svg','--layers','F.Fab,F.Silkscreen,F.Mask','--common-layers','Edge.Cuts','--mode-multi','--page-size-mode','2','--exclude-drawing-sheet','--output',str(out/'assembly')+'/',str(native)],log)
 assert digest(native)==before,'Native changed during export'
 files=list((out/'gerbers').glob('*'))+list((out/'drills').glob('*.drl'))
 files=[p for p in files if p.suffix!='.gbrjob']
 with zipfile.ZipFile(out/f'crystal-shim-{board}-rev1-jlcpcb.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted(files):z.write(p,p.name)
 with zipfile.ZipFile(out/f'crystal-shim-{board}-rev1-top-stencil.zip','w',zipfile.ZIP_DEFLATED) as z:
  for p in [out/'stencil'/f'{board}-F_Paste.gtp',out/'gerbers'/f'{board}-Edge_Cuts.gm1']:z.write(p,p.name)
 (out/'evidence'/'export.json').write_text(json.dumps({'native_sha256':before,'commands':log,'upload_members':{p.name:digest(p) for p in files},'status':'exported; CAM review and release acceptance recorded separately'},indent=2)+'\n')
 print(board,'exported',len(files),'upload files',flush=True)
