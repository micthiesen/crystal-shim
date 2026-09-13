from pathlib import Path
import hashlib,json,sys,math
import wx,pcbnew
sys.path.insert(0,'/Users/michael/Code/crystal-shim/pcb/tools')
import tscircuit_handoff as h
root=Path('/Users/michael/Code/crystal-shim');native=root/'pcb/controller/kicad';ev=native/'evidence/pre-routing-preparation';path=native/'controller.kicad_pcb'
assert not list(native.glob('*.lck'))
plan=json.loads((ev/'plan.json').read_text());before=json.loads((ev/'before.json').read_text());old=json.loads((ev/'previous-manifest.json').read_text());target=plan['target_manifest'];aug=json.loads((root/'pcb/controller/design/kicad-augment.json').read_text());assert not plan['blocked'];assert h.digest(h.validate_augmentation(aug,target))==plan['augmentation_sha256']
app=wx.App(False);log=wx.LogNull();m=pcbnew.GetSettingsManager();pro=path.with_suffix('.kicad_pro');m.LoadProject(str(pro),False);b=pcbnew.LoadBoard(str(path));b.SetProject(m.GetProject(str(pro)))
initial=h.extract_kicad_data(path,[pro,path.with_suffix('.kicad_dru')]);current=h.normalize_kicad_snapshot_data(initial,old,True);assert current['source_owned']==before['source_owned'];assert current['kicad_owned']==before['kicad_owned']
def copper(p):
 return [p.m_Uuid.AsString(),p.GetNumber(),p.GetNetname(),p.GetPosition().x,p.GetPosition().y,p.GetSize().x,p.GetSize().y,p.GetShape(),p.GetRoundRectCornerRadius(),p.GetOrientation().AsDegrees(),[l for l in p.GetLayerSet().Seq() if l not in (pcbnew.F_Paste,pcbnew.B_Paste)],p.GetDrillSize().x,p.GetDrillSize().y]
prior={p.m_Uuid.AsString():copper(p) for f in b.GetFootprints() for p in f.Pads()};changes=[]
for f in b.GetFootprints():
 for p in f.Pads():
  if f.GetReference()=='J4' and p.GetNumber() in ['SH','B1','B4','B9','B12']:
   layers=p.GetLayerSet();oldlayers=list(layers.Seq());layers.RemoveLayer(pcbnew.F_Paste);layers.RemoveLayer(pcbnew.B_Paste);p.SetLayerSet(layers);changes.append({'uuid':p.m_Uuid.AsString(),'pad':p.GetNumber(),'before_layers':oldlayers,'after_layers':list(layers.Seq())})
  if p.IsOnLayer(pcbnew.F_Paste):p.SetLocalSolderPasteMargin(0);p.SetLocalSolderPasteMarginRatio(0.0)
assert len(changes)==8
note=pcbnew.PCB_TEXT(b);note.SetText('FABRICATION REQUIREMENTS\nJLC04161H-7628 / nominal 1.6 mm / ENIG / green mask\nUSB differential impedance acceptance: 81-99 ohm\nStencil: 0.100 mm laser cut; J4 shells hand soldered\nU1 ground vias: top and bottom tented, no extra apertures\nNative 0.010 mm mask and Df 0.02 are visualization defaults only.\nDo not use native/Gerber-job default stack metadata as order constraints.\nUse reviewed vendor stack and separate recorded USB solver mask model.');note.SetLayer(pcbnew.Cmts_User);note.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(100),pcbnew.FromMM(172)));note.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(1),pcbnew.FromMM(1)));b.Add(note)
assert prior=={p.m_Uuid.AsString():copper(p) for f in b.GetFootprints() for p in f.Pads()}
b.BuildConnectivity();assert pcbnew.ZONE_FILLER(b).Fill(b.Zones());pcbnew.SaveBoard(str(path),b)
after=h.extract_kicad_data(path,[pro,path.with_suffix('.kicad_dru')])
for cat in ['tracks','vias','zones']:assert initial[cat]==after[cat],cat
rows=[]
for f in b.GetFootprints():
 for p in f.Pads():
  assert not p.IsOnLayer(pcbnew.B_Paste)
  if not p.IsOnLayer(pcbnew.F_Paste):continue
  w=pcbnew.ToMM(p.GetSize().x);length=pcbnew.ToMM(p.GetSize().y);r=pcbnew.ToMM(p.GetRoundRectCornerRadius()) if p.GetShape()==pcbnew.PAD_SHAPE_ROUNDRECT else 0
  assert p.GetShape() in [pcbnew.PAD_SHAPE_RECT,pcbnew.PAD_SHAPE_ROUNDRECT]
  area=w*length-(4-math.pi)*r*r;perimeter=2*(w+length)-(8-2*math.pi)*r
  rows.append({'ref':f.GetReference(),'pad':p.GetNumber(),'uuid':p.m_Uuid.AsString(),'size_mm':[w,length],'corner_radius_mm':r,'area_mm2':area,'perimeter_mm':perimeter,'area_ratio_at_0_100mm':area/(perimeter*0.1),'paste_margin_mm':pcbnew.ToMM(p.GetLocalSolderPasteMargin() or 0),'paste_ratio':p.GetLocalSolderPasteMarginRatio() or 0})
assert len(rows)==271;assert min(r['area_ratio_at_0_100mm'] for r in rows)>=0.66
assert len([r for r in rows if r['ref']=='U1' and r['pad']=='29'])==9
receipt={'shell_and_duplicate_paste_changes':changes,'copper_mask_drill_net_pad_uuid_preserved':True,'tracks_vias_zones_preserved':True,'paste_apertures':len(rows),'back_paste_apertures':0,'minimum_area_ratio':min(r['area_ratio_at_0_100mm'] for r in rows),'stencil_thickness_mm':0.1,'apertures':rows,'fabrication_note_uuid':note.m_Uuid.AsString(),'board_sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
(ev/'native-preparation.json').write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps({k:v for k,v in receipt.items() if k!='apertures'}))
