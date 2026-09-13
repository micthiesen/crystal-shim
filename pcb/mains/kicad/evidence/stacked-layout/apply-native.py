from pathlib import Path
import json,sys,hashlib
sys.path.insert(0,'/Users/michael/Code/crystal-shim/pcb/tools')
import tscircuit_handoff as h
from check_routing import escape_width_rule
import pcbnew,wx
r=Path(__file__).resolve().parents[5];n=r/'pcb/mains/kicad';e=n/'evidence/stacked-layout';bp=n/'mains.kicad_pcb';pp=bp.with_suffix('.kicad_pro')
plan=json.loads((e/'plan.json').read_text());assert not plan['blocked'] and not plan['drift'];aug=json.loads((r/'pcb/mains/design/kicad-augment.json').read_text());target=h.normalize_manifest(plan['target_manifest']);assert h.digest(h.validate_augmentation(aug,target))==plan['augmentation_sha256'];before=json.loads((e/'before.json').read_text());app=wx.App(False);quiet=wx.LogNull();raw=h.extract_kicad_data(bp,[pp,bp.with_suffix('.kicad_dru')]);old=json.loads((e/'previous-lock.json').read_text())['manifest'];assert h.normalize_kicad_snapshot_data(raw,old,bool(raw['tracks'] or raw['vias']))==before
assert not list(n.glob('~*.lck')),'Mains GUI must be closed'
manager=pcbnew.GetSettingsManager();manager.LoadProject(str(pp),False);project=manager.GetProject(str(pp));b=pcbnew.LoadBoard(str(bp));b.SetProject(project);mm=pcbnew.FromMM
assert {t.m_Uuid.AsString() for t in b.GetTracks() if not isinstance(t,pcbnew.PCB_VIA)}==set(next(o for o in aug['operations'] if o['kind']=='routing_clear')['params']['track_uuids'])
footprints={f.GetReference():f for f in b.GetFootprints()};assert len(footprints)==26
pad_before={f.GetReference():{p.m_Uuid.AsString():(p.GetNumber(),p.GetNetname(),p.GetSize().x,p.GetSize().y,p.GetDrillSize().x,p.GetDrillSize().y) for p in f.Pads()} for f in b.GetFootprints()}
fp_uuids={ref:f.m_Uuid.AsString() for ref,f in footprints.items()}
for t in list(b.GetTracks()):b.RemoveNative(t)
for z in list(b.Zones()):b.RemoveNative(z)
for d in list(b.GetDrawings()):
 if d.GetLayer()==pcbnew.Edge_Cuts:b.RemoveNative(d)
def rect(owner,layer,cx,cy,w,hei,width=.1):
 points=[(cx-w/2,cy-hei/2),(cx+w/2,cy-hei/2),(cx+w/2,cy+hei/2),(cx-w/2,cy+hei/2)]
 for start,end in zip(points,points[1:]+points[:1]):
  s=pcbnew.PCB_SHAPE(owner);s.SetShape(pcbnew.SHAPE_T_SEGMENT);s.SetLayer(layer);s.SetWidth(mm(width));s.SetStart(pcbnew.VECTOR2I(mm(start[0]),mm(start[1])));s.SetEnd(pcbnew.VECTOR2I(mm(end[0]),mm(end[1])));owner.Add(s)
rect(b,pcbnew.Edge_Cuts,100,100,150,110,.05)
headers=json.loads((e/'native-geometry.json').read_text())['headers'];plugin=pcbnew.PCB_IO_KICAD_SEXPR();lib=n/'footprints/CrystalShim_Mains.pretty'
for c in target['components']:
 ref=c['ref'];f=footprints[ref]
 if ref in headers:
  f.SetOrientationDegrees(0);f.SetPosition(pcbnew.VECTOR2I(0,0))
  for d in list(f.GraphicalItems()):
   if d.GetLayer() in [pcbnew.F_Fab,pcbnew.F_CrtYd]:f.RemoveNative(d)
  g=headers[ref]['physical'];d=g['declaration'];body=g['bodyCenter'];court=g['courtyard'];rect(f,pcbnew.F_Fab,body['x'],body['y'],d['body']['width'],d['body']['height']);rect(f,pcbnew.F_CrtYd,court['center']['x'],court['center']['y'],court['width'],court['height'],.05)
  f.SetValue(c['value']);assert f.HasField('MPN');f.GetField('MPN').SetText(c['fields']['manufacturer_part_number'])
  clone=pcbnew.FOOTPRINT(f);clone.SetReference('REF**');clone.SetValue('Mains_'+ref)
  for p in clone.Pads():p.SetNetCode(0)
  plugin.FootprintSave(str(lib),clone)
  check=plugin.FootprintLoad(str(lib),'Mains_'+ref);assert check and len(list(check.Pads()))==len(list(f.Pads()))
 pose=c['placement'];f.SetOrientationDegrees(pose['rotation_deg']);f.SetPosition(pcbnew.VECTOR2I(mm(100+pose['x_mm']),mm(100-pose['y_mm'])))
ops={o['id']:o['params'] for o in aug['operations']};pre='mains.augment.';layers=pcbnew.LSET();layers.AddLayer(pcbnew.F_Cu);layers.AddLayer(pcbnew.B_Cu)
def area(name,points,pads=True,restrict=True):
 z=pcbnew.ZONE(b);z.SetZoneName(name);z.SetIsRuleArea(True);z.SetLayerSet(layers);z.SetDoNotAllowTracks(restrict);z.SetDoNotAllowVias(restrict);z.SetDoNotAllowZoneFills(restrict);z.SetDoNotAllowPads(pads and restrict);z.SetDoNotAllowFootprints(False);z.Outline().NewOutline()
 for x,y in points:z.Outline().Append(mm(x),mm(y))
 b.Add(z);return z
for i,(xmin,ymin,xmax,ymax) in enumerate(ops[pre+'isolation-and-mounts']['source_copper_free_rectangles_mm']):area('MAINS_ISOLATION_'+str(i+1),[(100+xmin,100-ymin),(100+xmax,100-ymin),(100+xmax,100-ymax),(100+xmin,100-ymax)])
for ref in ['H1','H2','H3','H4']:
 p=footprints[ref].GetPosition();x,y=pcbnew.ToMM(p.x),pcbnew.ToMM(p.y);area('MOUNT_'+ref+'_INSULATING_HARDWARE',[(x-4,y-4),(x+4,y-4),(x+4,y+4),(x-4,y+4)],False)
spec=ops[pre+'routing-guardrails-zone']['planes']
for layer in spec['layers']:
 z=pcbnew.ZONE(b);z.SetZoneName('mains GND_ISO '+layer);z.SetLayer(b.GetLayerID(layer));z.SetNet(b.FindNet('GND_ISO'));z.SetLocalClearance(mm(.15));z.SetMinThickness(mm(.2));z.SetPadConnection(pcbnew.ZONE_CONNECTION_THT_THERMAL);z.SetThermalReliefGap(mm(.3));z.SetThermalReliefSpokeWidth(mm(.5));z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS);z.Outline().NewOutline()
 for x,y in spec['outline']:z.Outline().Append(mm(x),mm(y))
 b.Add(z)
for ref in ['U1','J6']:
 for p in footprints[ref].Pads():
  if p.GetNetname()=='GND_ISO':p.SetLocalZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
for x,y,diameter,drill in spec['vias']:
 v=pcbnew.PCB_VIA(b);v.SetPosition(pcbnew.VECTOR2I(mm(x),mm(y)));v.SetWidth(mm(diameter));v.SetDrill(mm(drill));v.SetViaType(pcbnew.VIATYPE_THROUGH);v.SetLayerPair(pcbnew.F_Cu,pcbnew.B_Cu);v.SetNet(b.FindNet('GND_ISO'));v.SetFrontTentingMode(pcbnew.TENTING_MODE_TENTED);v.SetBackTentingMode(pcbnew.TENTING_MODE_TENTED);b.Add(v)
policy=json.loads((r/'pcb/tools/routing-policy.json').read_text())['boards']['mains'];rules=['(version 1)','# Generated from reviewed stacked source; install through native Board Setup.']
def rule(label,cond,con):rules.append(f'(rule "{label}"\n  (condition "{cond}")\n  {con})')
rule('Ordinary through vias',"A.Type == 'Via'",'(constraint via_diameter (min 0.6mm)) (constraint hole_size (min 0.3mm))');rule('No blind or microvias',"A.Type == 'Via'",'(constraint disallow micro_via blind_via buried_via)')
for net,pol in policy['nets'].items():
 w=pol['minimum_width_mm'];condition=f"A.NetName == '{net}'";rule(net+' routing width',condition,f'(constraint track_width (min {w}mm) (opt {w}mm))');rule(net+' no single power via',condition,'(constraint disallow via)')
 for escape in pol['escapes']:
  for i,p in enumerate(p for p in footprints[escape['ref']].Pads() if p.GetNumber()==escape['pad']):
   assert p.GetNetname()==net;box=p.GetBoundingBox();inf=mm(escape['inflate_mm']);x0,y0,x1,y1=[pcbnew.ToMM(v) for v in [box.GetLeft()-inf,box.GetTop()-inf,box.GetRight()+inf,box.GetBottom()+inf]];label=f'Neck {net} {escape["ref"]}.{escape["pad"]}.{i}';area(label,[(x0,y0),(x1,y0),(x1,y1),(x0,y1)],False,False);rule(label,*escape_width_rule(net,label,escape['minimum_width_mm'],w))
rules.append((r/'pcb/mains/design/custom-routing-rules.txt').read_text().replace('(version 1)',''))
rule('Buck switch width',"A.NetName == 'BUCK5_SW'",'(constraint track_width (min 0.3mm) (opt 1mm))');rule('Buck switch no vias',"A.NetName == 'BUCK5_SW'",'(constraint disallow via)')
settings=b.GetDesignSettings();settings.SetTrackWidthIndex(0);settings.SetViaSizeIndex(0);settings.m_UseConnectedTrackWidth=False;b.SynchronizeNetsAndNetClasses(False);b.BuildConnectivity();assert pcbnew.ZONE_FILLER(b).Fill(b.Zones())
assert {ref:f.m_Uuid.AsString() for ref,f in footprints.items()}==fp_uuids
assert {f.GetReference():{p.m_Uuid.AsString():(p.GetNumber(),p.GetNetname(),p.GetSize().x,p.GetSize().y,p.GetDrillSize().x,p.GetDrillSize().y) for p in f.Pads()} for f in b.GetFootprints()}==pad_before
scratch=Path('/tmp/crystal-shim-mains-native-candidate');scratch.mkdir(exist_ok=True);candidate=scratch/bp.name;assert pcbnew.SaveBoard(str(candidate),b);extracted=h.extract_kicad_data(candidate,[]);snap=h.normalize_kicad_snapshot_data(extracted,target,False);h.assert_parity(snap,target,h.validate_augmentation(aug,target));assert len(extracted['tracks'])==0 and len(extracted['vias'])==11
assert pcbnew.SaveBoard(str(bp),b);assert manager.SaveProject(str(pp),project)
(r/'pcb/mains/design/routing-guardrails-rules.txt').write_text('\n\n'.join(rules)+'\n')
(e/'native-application.json').write_text(json.dumps({'plan_sha256':h.digest(plan),'before_snapshot_sha256':h.digest(before),'source_parity':True,'footprint_and_pad_UUIDs_preserved':True,'pad_nets_sizes_drills_preserved':True,'old_tracks_cleared':len(raw['tracks']),'old_vias_replaced':len(raw['vias']),'new_vias':11,'zones':len(extracted['zones']),'header_graphics_native_library_saved':['J1','J2','J3','J4'],'native_kicad_version':pcbnew.GetBuildVersion(),'board_sha256':hashlib.sha256(bp.read_bytes()).hexdigest(),'rules_pending_GUI':True},indent=2)+'\n')
print('Mains native layout saved; zero tracks, 11 ground vias, source parity passed; install generated rules and update schematic fields.')
