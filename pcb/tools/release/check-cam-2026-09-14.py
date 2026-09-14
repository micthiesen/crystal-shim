"""Read-only quantitative CAM audit. Run with gerbonara installed; --native uses KiCad Python."""
from pathlib import Path
import sys,json,hashlib,math,subprocess,zipfile,collections,warnings
ROOT=Path(__file__).resolve().parents[3]
RELEASE='2026-09-14-rev1'
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
if '--native' in sys.argv:
 import pcbnew
 result={}
 for name in ['controller','sensor','mains']:
  path=ROOT/'pcb'/name/'kicad'/f'{name}.kicad_pcb';b=pcbnew.LoadBoard(str(path));drills=[];vias=[];refs=[];paste=[];logos=[]
  def hole(p,plated):
   sz=p.GetDrillSize();x=p.GetPosition().x/1e6;y=-p.GetPosition().y/1e6;w=sz.x/1e6;h=sz.y/1e6
   if not max(w,h):return
   ang=math.radians(p.GetOrientationDegrees());dx=(w-h)/2 if w>h else 0;dy=(h-w)/2 if h>w else 0
   vx=dx*math.cos(ang)+dy*math.sin(ang);vy=dx*math.sin(ang)-dy*math.cos(ang)
   drills.append({'plated':plated,'center':[x,y],'diameter':min(w,h),'span':max(w,h)-min(w,h),'ends':[[x-vx,y-vy],[x+vx,y+vy]]})
  for f in b.GetFootprints():
   refs.append({'ref':f.GetReference(),'visible':f.Reference().IsVisible(),'layer':b.GetLayerName(f.Reference().GetLayer())})
   for p in f.Pads():
    hole(p,p.GetAttribute()!=pcbnew.PAD_ATTRIB_NPTH)
    if p.IsOnLayer(pcbnew.F_Paste):paste.append([f.GetReference(),p.GetNumber()])
  for v in b.GetTracks():
   if isinstance(v,pcbnew.PCB_VIA):
    xy=[v.GetPosition().x/1e6,-v.GetPosition().y/1e6];drills.append({'plated':True,'center':xy,'diameter':v.GetDrillValue()/1e6,'span':0});vias.append({'xy':xy,'front_tented':v.IsTented(pcbnew.F_Cu),'back_tented':v.IsTented(pcbnew.B_Cu)})
  edges=[p for d in b.GetDrawings() if d.GetLayer()==pcbnew.Edge_Cuts for p in [d.GetStart(),d.GetEnd()]]
  for d in b.GetDrawings():
   if isinstance(d,pcbnew.PCB_SHAPE) and d.GetLayer()==pcbnew.F_SilkS:logos.append({'a':[d.GetStart().x/1e6,-d.GetStart().y/1e6],'b':[d.GetEnd().x/1e6,-d.GetEnd().y/1e6],'width':d.GetWidth()/1e6})
  result[name]={'sha256':digest(path),'drills':drills,'vias':vias,'references':refs,'standalone_silk_texts':[d.GetText() for d in b.GetDrawings() if isinstance(d,pcbnew.PCB_TEXT) and d.GetLayer()==pcbnew.F_SilkS and d.IsVisible()],'paste_pads':paste,'silk_shapes':logos,'outline_size':[max(p.x for p in edges)/1e6-min(p.x for p in edges)/1e6,max(p.y for p in edges)/1e6-min(p.y for p in edges)/1e6]}
 print(json.dumps(result));sys.exit()
from gerbonara import LayerStack,GerberFile
warnings.filterwarnings('ignore',message='.*G90 header statement.*',category=SyntaxWarning)
r=subprocess.run(['sh','pcb/tools/kicad_python.sh',str(Path(__file__).resolve()),'--native'],cwd=ROOT,text=True,capture_output=True,check=True);native=json.loads(r.stdout)
report={'scope':'CAM archive identity, parsed layers/outlines/drills, tenting apertures, native visible refs and exported silk strokes; not strict DRC','boards':{}}
for name,n in native.items():
 out=ROOT/'pcb'/name/'fabrication'/RELEASE;archive=out/f'crystal-shim-{name}-rev1-jlcpcb.zip';receipt=json.loads((out/'evidence'/'export.json').read_text());assert receipt['native_sha256']==n['sha256']
 with zipfile.ZipFile(archive) as z:
  assert len(z.namelist())==len(set(z.namelist()))
  members={f:hashlib.sha256(z.read(f)).hexdigest() for f in z.namelist()};assert members==receipt['upload_members']
  assert not any('Paste' in f or f.endswith('.gbrjob') for f in members)
 stack=LayerStack.open(archive);layers={f'{a}/{b}':{'objects':len(l.objects),'bbox_mm':l.bounding_box()} for (a,b),l in stack.graphic_layers.items()}
 assert sum(k[1]=='copper' for k in stack.graphic_layers)==(2 if name=='mains' else 4)
 outline=stack.graphic_layers[('mechanical','outline')];pts=[(o.x1,o.y1) for o in outline.objects]+[(o.x2,o.y2) for o in outline.objects];size=[max(p[i] for p in pts)-min(p[i] for p in pts) for i in [0,1]];assert all(abs(x-y)<1e-5 for x,y in zip(size,n['outline_size']))
 actual=[]
 for plated,layer in [(True,stack.drill_pth),(False,stack.drill_npth)]:
  for o in layer.objects:
   if type(o).__name__=='Flash':center=[o.x,o.y];span=0
   else:center=[(o.x1+o.x2)/2,(o.y1+o.y2)/2];span=math.hypot(o.x2-o.x1,o.y2-o.y1)
   actual.append({'plated':plated,'center':center,'diameter':o.aperture.diameter,'span':span,'ends':None if not span else [[o.x1,o.y1],[o.x2,o.y2]]})
 remaining=list(actual)
 for expected in n['drills']:
  found=next((a for a in remaining if a['plated']==expected['plated'] and max(abs(x-y) for x,y in zip(a['center'],expected['center']))<=.001 and abs(a['diameter']-expected['diameter'])<.001 and abs(a['span']-expected['span'])<.001),None)
  assert found is not None,(name,'missing drill',expected)
  if expected['span']:
   assert min(max(math.dist(a,b) for a,b in zip(expected['ends'],order)) for order in [found['ends'],found['ends'][::-1]])<.001,(name,'slot orientation mismatch')
  remaining.remove(found)
 assert not remaining,(name,'extra drills',remaining)
 assert all((r['visible'] and r['layer']=='F.Silkscreen') or any(r['ref'] in text.split() for text in n['standalone_silk_texts']) for r in n['references'])
 silk=stack.graphic_layers[('top','silk')];silk_lines=[o for o in silk.objects if type(o).__name__=='Line']
 for shape in n['silk_shapes']:
  assert any(max(abs(x-y) for x,y in zip(shape['a']+shape['b'],[o.x1,o.y1,o.x2,o.y2]))<.00001 for o in silk_lines),(name,'missing silk shape',shape)
 mask_via_flashes=[]
 for side in ['top','bottom']:
  layer=stack.graphic_layers[(side,'mask')]
  for o in layer.objects:
   if type(o).__name__=='Flash':
    for v in n['vias']:
     if math.hypot(o.x-v['xy'][0],o.y-v['xy'][1])<.00001:mask_via_flashes.append({'side':side,'xy':v['xy']})
 assert not mask_via_flashes,(name,'via-centered mask flash',mask_via_flashes)
 stencil=GerberFile.open(next((out/'stencil').glob('*F_Paste.gtp')))
 assert len(stencil.objects)==len(n['paste_pads']),(name,'paste count mismatch')
 if name=='sensor':assert not stack.graphic_layers[('bottom','mask')].objects
 report['boards'][name]={'passed':True,'native_sha256':n['sha256'],'zip_sha256':digest(archive),'members':members,'dimensions_mm':size,'layers':layers,'pth_count':sum(d['plated'] for d in actual),'npth_count':sum(not d['plated'] for d in actual),'slots':[d for d in actual if d['span']>0],'drill_tools_mm':sorted(set(d['diameter'] for d in actual)),'vias':len(n['vias']),'native_tented_both':sum(v['front_tented'] and v['back_tented'] for v in n['vias']),'via_centered_mask_flashes':mask_via_flashes,'identified_reference_count':len(n['references']),'visible_reference_fields':sum(r['visible'] for r in n['references']),'standalone_reference_labels':[r['ref'] for r in n['references'] if not r['visible']],'matched_board_silk_shapes':len(n['silk_shapes']),'front_paste_objects':len(stencil.objects),'native_paste_pad_count':len(n['paste_pads'])}
report['passed']=True
print(json.dumps(report,indent=2))
