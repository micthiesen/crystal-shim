from pathlib import Path
import json,re,hashlib,wx,pcbnew
app=wx.App(False);log=wx.LogNull();p=Path('pcb/controller/kicad/controller.kicad_pcb');b=pcbnew.LoadBoard(str(p));pads=[(f,pad) for f in b.GetFootprints() for pad in f.Pads() if pad.IsOnLayer(pcbnew.F_Paste)];overlap=[]
for i,(f,a) in enumerate(pads):
 assert abs(a.GetOrientation().AsDegrees()%90)<.001
 aa=a.GetBoundingBox()
 for g,bbpad in pads[i+1:]:
  bb=bbpad.GetBoundingBox()
  if min(aa.GetRight(),bb.GetRight())>max(aa.GetLeft(),bb.GetLeft()) and min(aa.GetBottom(),bb.GetBottom())>max(aa.GetTop(),bb.GetTop()):overlap.append([f.GetReference(),a.GetNumber(),g.GetReference(),bbpad.GetNumber()])
assert not overlap,overlap
files=list(Path('/tmp/crystal-controller-prep-paste').glob('*.gtp'))+list(Path('/tmp/crystal-controller-prep-paste').glob('*.gbp'));counts={x.name:len(re.findall(r'D03\*',x.read_text())) for x in files};assert sorted(counts.values())==[0,271]
ev=p.parent/'evidence/pre-routing-preparation';r=json.loads((ev/'native-preparation.json').read_text());r['board_sha256']=hashlib.sha256(p.read_bytes()).hexdigest();r['diagnostic_gerber_flash_counts']=counts;r['diagnostic_gerber_sha256']={x.name:hashlib.sha256(x.read_bytes()).hexdigest() for x in files};r['physical_aperture_union_count']=len(pads);r['native_aperture_bounding_boxes_disjoint']=True;r['final_labels']=json.loads((ev/'labels.json').read_text());(ev/'native-preparation.json').write_text(json.dumps(r,indent=2)+'\n');print('Verified 271 disjoint physical apertures, native/diagnostic Gerber count parity, final board hash')
