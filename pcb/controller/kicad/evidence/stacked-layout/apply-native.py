from pathlib import Path
import hashlib,json,sys
import wx,pcbnew
sys.path.insert(0,'/Users/michael/Code/crystal-shim/pcb/tools')
import tscircuit_handoff as h
root=Path('/Users/michael/Code/crystal-shim'); native=root/'pcb/controller/kicad'; ev=native/'evidence/stacked-layout'; path=native/'controller.kicad_pcb'
assert not list(native.glob('~*.lck')) and not list(native.glob('*.lck'))
plan=json.loads((ev/'plan.json').read_text());before=json.loads((ev/'before.json').read_text());assert not plan['blocked']
old=json.loads((ev/'previous-manifest.json').read_text());target=plan['target_manifest'];aug=json.loads((root/'pcb/controller/design/kicad-augment.json').read_text());assert h.digest(h.validate_augmentation(aug,target))==plan['augmentation_sha256']
app=wx.App(False);log=wx.LogNull(); b=pcbnew.LoadBoard(str(path));mm=pcbnew.FromMM
initial=h.extract_kicad_data(path,[path.with_suffix('.kicad_pro'),path.with_suffix('.kicad_dru')]);current=h.normalize_kicad_snapshot_data(initial,old,True)
assert current['source_owned']==before['source_owned'];assert current['kicad_owned']==before['kicad_owned'];assert len(list(b.GetFootprints()))==117 and all(isinstance(t,pcbnew.PCB_VIA) for t in b.GetTracks())
oldparts={c['ref']:c for c in old['components']};targetparts={c['ref']:c for c in target['components']};fps={f.GetReference():f for f in b.GetFootprints()};assert oldparts.keys()==targetparts.keys()==fps.keys()
moves={}
for r,c in targetparts.items():
 p=c['placement'];o=oldparts[r]['placement'];assert p['rotation_deg']==o['rotation_deg'] and p['side']==o['side']
 if p!=o:moves[r]=(p['x_mm']-o['x_mm'],-p['y_mm']+o['y_mm'])
assert set(moves)=={'H1','H2','H3','H4','J7','J8','J9','Q2','Q3','Q4','D9','D10','D11','R80','R81','R82','R83','R84','R85'}
for r,(dx,dy) in moves.items():fps[r].Move(pcbnew.VECTOR2I(mm(dx),mm(dy)))
# Preserve the four edge segment identities and change only their outer X.
for d in b.GetDrawings():
 if d.GetLayer()!=pcbnew.Edge_Cuts:continue
 assert d.GetShape()==pcbnew.SHAPE_T_SEGMENT
 for getter,setter in [(d.GetStart,d.SetStart),(d.GetEnd,d.SetEnd)]:
  p=getter();x=pcbnew.ToMM(p.x);assert x in (45,155);setter(pcbnew.VECTOR2I(mm(25 if x==45 else 175),p.y))
zone_changes=[]
for z in b.Zones():
 n=z.GetZoneName()
 if n in ['controller GND F.Cu','controller GND In1.Cu','controller GND B.Cu']:
  outline=z.Outline();outline.RemoveAllContours();outline.NewOutline()
  for x,y in [(25,45),(175,45),(175,155),(25,155)]:outline.Append(mm(x),mm(y))
  zone_changes.append(n)
 elif n.endswith(' mounting copper reserve'):
  r=n.split()[0];dx,dy=moves[r];z.Move(pcbnew.VECTOR2I(mm(dx),mm(dy)));zone_changes.append(n)
 elif n.startswith('Neck '):
  ref=n.split()[2].split('.')[0]
  if ref in moves:
   dx,dy=moves[ref];z.Move(pcbnew.VECTOR2I(mm(dx),mm(dy)));zone_changes.append(n)
count=0
for v in b.GetTracks():
 if v.GetPosition().x==mm(137):v.Move(pcbnew.VECTOR2I(mm(20),0));count+=1
assert count==9
b.BuildConnectivity();assert pcbnew.ZONE_FILLER(b).Fill(b.Zones())
candidate=Path('/tmp/crystal-controller-stack-candidate.kicad_pcb');pcbnew.SaveBoard(str(candidate),b)
actual=h.extract_kicad_data(candidate,[]); snap=h.normalize_kicad_snapshot_data(actual,target,True)
# Geometry and pad semantic parity are enforced by the same production snapshot machinery.
assert len(actual['vias'])==len(initial['vias']) and len(actual['tracks'])==len(initial['tracks'])
for category in ['tracks','vias','zones','graphics']:
 assert {x['uuid'] for x in actual[category]}=={x['uuid'] for x in initial[category]},category
# Reference count, logical nets and absolute target pad positions are checked by snapshot/parity after native save.
pcbnew.SaveBoard(str(path),b)
receipt={'operation':'pcbnew stacked controller placement ECO','script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'plan_sha256':hashlib.sha256((ev/'plan.json').read_bytes()).hexdigest(),'board_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'moves_native_mm':moves,'via_moves':count,'zones_changed':zone_changes,'preserved_native_geometry_uuid_sets':True,'schematic_files_changed':False}
(ev/'native-apply.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
