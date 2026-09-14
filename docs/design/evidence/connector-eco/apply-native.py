"""Source-bound connector-only ECO, native KiCad save on isolated candidates."""
from pathlib import Path
import json,sys,hashlib
import pcbnew,wx
root=Path.cwd();sys.path.insert(0,str(root/'pcb/tools'))
import tscircuit_handoff as h
from pcb_workflow import native_hashes
app=wx.App(False);quiet=wx.LogNull();ev=root/'docs/design/evidence/connector-eco';geometry=json.loads((ev/'geometry.json').read_text());mm=pcbnew.FromMM

def rect(f,layer,cx,cy,w,hei):
 pts=[(cx-w/2,cy-hei/2),(cx+w/2,cy-hei/2),(cx+w/2,cy+hei/2),(cx-w/2,cy+hei/2)]
 for a,b in zip(pts,pts[1:]+pts[:1]):
  d=pcbnew.PCB_SHAPE(f);d.SetShape(pcbnew.SHAPE_T_SEGMENT);d.SetLayer(layer);d.SetWidth(mm(.05 if layer==pcbnew.F_CrtYd else .1));d.SetStart(pcbnew.VECTOR2I(mm(a[0]),mm(a[1])));d.SetEnd(pcbnew.VECTOR2I(mm(b[0]),mm(b[1])));f.Add(d)

for name in ['controller','mains']:
 e=ev/name;run=json.loads((e/'run.json').read_text());plan=json.loads((e/'objects'/(run['plan']+'.json')).read_text());assert not plan['blocked'] and not plan['drift'];target=plan['target_manifest'];native=root/'pcb'/name/'kicad';assert native_hashes(native)==run['before_native'],'concurrent native change'
 candidate=Path('/tmp/crystal-connectors-native')/name;bp=candidate/(name+'.kicad_pcb');pp=bp.with_suffix('.kicad_pro');manager=pcbnew.GetSettingsManager();manager.LoadProject(str(pp),False);project=manager.GetProject(str(pp));b=pcbnew.LoadBoard(str(bp));b.SetProject(project)
 initial=h.extract_kicad_data(bp,[pp,bp.with_suffix('.kicad_dru')]);refs=['J2'] if name=='controller' else ['J1','J2','J3','J4'];fps={f.GetReference():f for f in b.GetFootprints()};old_fp={r:f.m_Uuid.AsString() for r,f in fps.items()};retained={};removed=[]
 g=geometry[name];pattern=g['pattern'];phy=g['physical'];plugin=pcbnew.PCB_IO_KICAD_SEXPR();library=(candidate/'expansion-source' if name=='controller' else candidate)/'footprints'/('CrystalShim_'+name.title()+'.pretty')
 for ref in refs:
  f=fps[ref];c=next(c for c in target['components'] if c['ref']==ref);f.SetOrientationDegrees(0);f.SetPosition(pcbnew.VECTOR2I(0,0))
  # Retain one existing pad UUID per connected pin; old extra tails and unused pins leave with this footprint ECO.
  keep={}
  for p in list(f.Pads()):
   number=p.GetNumber()
   if number in ['1','2'] and number not in keep:
    keep[number]=p;retained[ref+'.'+number]=p.m_Uuid.AsString()
   else:removed.append(p.m_Uuid.AsString());f.RemoveNative(p)
  assert set(keep)=={'1','2'}
  for spec in pattern['pads']:
   p=keep[spec['number']];p.SetPosition(pcbnew.VECTOR2I(mm(spec['x']),mm(spec['y'])));p.SetOrientationDegrees(0);p.SetSize(pcbnew.VECTOR2I(mm(spec['width']),mm(spec['height'])));p.SetDrillSize(pcbnew.VECTOR2I(mm(spec['drill']),mm(spec['drill'])));p.SetShape({'circle':pcbnew.PAD_SHAPE_CIRCLE,'oval':pcbnew.PAD_SHAPE_OVAL,'roundrect':pcbnew.PAD_SHAPE_ROUNDRECT}[spec['shape']]);p.SetLocalSolderMaskMargin(mm(.05))
   if spec['shape']=='roundrect':p.SetRoundRectCornerRadius(mm(.25))
  for d in list(f.GraphicalItems()):
   if d.GetLayer() in [pcbnew.F_Fab,pcbnew.F_CrtYd]:f.RemoveNative(d)
  center=phy['bodyCenter'];body=phy['declaration']['body'];court=phy['courtyard'];rect(f,pcbnew.F_Fab,center['x'],center['y'],body['width'],body['height']);rect(f,pcbnew.F_CrtYd,court['center']['x'],court['center']['y'],court['width'],court['height'])
  f.SetValue(c['value']);f.GetField('MPN').SetText(c['fields']['manufacturer_part_number']);f.GetField('Datasheet').SetText(c['fields']['datasheet_url'])
  # Save the same source-owned native library ID through KiCad itself.
  clone=pcbnew.FOOTPRINT(f);clone.SetReference('REF**');clone.SetValue(c['footprint']['kicad'].split(':')[1])
  for p in clone.Pads():p.SetNetCode(0)
  plugin.FootprintSave(str(library),clone)
  reread=plugin.FootprintLoad(str(library),c['footprint']['kicad'].split(':')[1]);assert reread and len(list(reread.Pads()))==2
  pose=c['placement'];f.SetOrientationDegrees(pose['rotation_deg']);f.SetPosition(pcbnew.VECTOR2I(mm(100+pose['x_mm']),mm(100-pose['y_mm'])))
 changed_zones=[]
 if name=='controller':
  matches=[z for z in b.Zones() if z.GetZoneName()=='Neck V5_SERVICE J2.1.0'];assert len(matches)==1;z=matches[0];p=next(p for p in fps['J2'].Pads() if p.GetNumber()=='1');box=p.GetBoundingBox();inf=mm(1);pts=[(box.GetLeft()-inf,box.GetTop()-inf),(box.GetRight()+inf,box.GetTop()-inf),(box.GetRight()+inf,box.GetBottom()+inf),(box.GetLeft()-inf,box.GetBottom()+inf)];z.Outline().RemoveAllContours();z.Outline().NewOutline()
  for x,y in pts:z.Outline().Append(x,y)
  changed_zones.append(z.m_Uuid.AsString())
 b.SynchronizeNetsAndNetClasses(False);b.BuildConnectivity();assert pcbnew.ZONE_FILLER(b).Fill(b.Zones());assert pcbnew.SaveBoard(str(bp),b)
 after=h.extract_kicad_data(bp,[pp,bp.with_suffix('.kicad_dru')]);assert initial['tracks']==after['tracks'];assert initial['vias']==after['vias'];assert old_fp=={f.GetReference():f.m_Uuid.AsString() for f in b.GetFootprints()}
 for category in ['graphics','zones']:
  old={x['uuid']:x for x in initial[category]};new={x['uuid']:x for x in after[category]};assert old.keys()==new.keys(),category
  assert all(old[k]==new[k] for k in old if k not in changed_zones),(name,category)
 # Check source net/pose/pad parity against current target and exact live rules.
 snap=h.normalize_kicad_snapshot_data(after,target,bool(after['tracks'] or after['vias']));h.assert_parity(snap,target,h.validate_augmentation(plan['target_augmentation'],target))
 (e/'native-application.json').write_text(json.dumps(dict(tool='KiCad pcbnew',version=pcbnew.GetBuildVersion(),candidate=str(candidate),plan_sha256=h.digest(plan),retained_pad_uuids=retained,removed_footprint_pad_uuids=removed,changed_zone_uuids=changed_zones,tracks_preserved=len(after['tracks']),vias_preserved=len(after['vias']),source_parity=True,script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()),indent=2)+'\n');print(name,'candidate saved; source parity and unrelated native preservation passed')
