#!/usr/bin/env python3
"""Exact support envelope screen; stock FR4/nylon assembly, not structural certification."""
import json,tempfile,zipfile,hashlib
from pathlib import Path
import cadquery as cq
from check_fit import HERE,SOURCE,TRANSLATION,BOUNDS,ANTENNA,MOUNT_CENTRES,box,comparison
POSTS=[(90,55),(260,55),(90,185),(260,185)]
PE_FIXINGS=[(275,195),(305,195)]
def cyl(x,y,z0,z1,r):return cq.Workplane('XY').circle(r).extrude(z1-z0).translate((x,y,z0)).val()
def run():
 with tempfile.TemporaryDirectory(prefix='crystal-supports-') as td:
  with zipfile.ZipFile(SOURCE/'1590ZGRP243.zip') as z:data=z.read('1590ZGRP243.stp')
  f=Path(td)/'source.step';f.write_bytes(data);raw=cq.importers.importStep(str(f)).solids().vals()
 enclosure=cq.Compound.makeCompound([s.translate(TRANSLATION) for i,s in enumerate(raw) if i!=1])
 objects={'carrier':box([84,266,48,192,5,8]),'pe_bracket':box([270,310,180,210,10,13]),'pe_cover_reserve':box([270,310,180,210,13,33])}
 # Four explicitly selected 4.4mm base holes are later drilled for continuous nylon rods.
 original_enclosure=enclosure
 for x,y in POSTS+PE_FIXINGS:enclosure=enclosure.cut(cyl(x,y,-10,14,2.2))
 for x,y in POSTS:objects['carrier']=objects['carrier'].cut(cyl(x,y,4,9,2.2))
 for x,y in MOUNT_CENTRES:objects['carrier']=objects['carrier'].cut(cyl(x,y,4,9,1.6))
 for i,(x,y) in enumerate(PE_FIXINGS):
  objects['pe_bracket']=objects['pe_bracket'].cut(cyl(x,y,9,14,2.2))
  objects[f'pe_foot_{i}']=cyl(x,y,1.8,10,4).cut(cyl(x,y,1,11,2.2))
 # H-shaped rails: crossmember through PCB mount centres, with outside support arms.
 for tag,y0,y1,ya,yb in [('north',68,76,49,81),('south',164,172,159,191)]:
  rail=box([85,265,y0,y1,55.6,58.6]).fuse(box([85,115,ya,yb,55.6,58.6])).fuse(box([235,265,ya,yb,55.6,58.6]))
  for x,y in POSTS:rail=rail.cut(cyl(x,y,55,59,2.2))
  for x,y in MOUNT_CENTRES:rail=rail.cut(cyl(x,y,55,59,1.6))
  objects[tag+'_rail']=rail
 for i,(x,y) in enumerate(POSTS):
  objects[f'frame_rod_{i}']=cyl(x,y,-9,62,2)
  objects[f'frame_nut_envelope_{i}']=cyl(x,y,54.1,61.6,4)
  objects[f'floor_foot_{i}']=cyl(x,y,1.8,5,4)
  objects[f'exterior_nut_{i}']=cyl(x,y,-9,-4,4)
  # Matching tabs grip separator corner, with two M3 insulating stop fasteners outside panel.
  xx=[84,104] if x==90 else [246,266]; yy=[49,69] if y==55 else [171,191]
  for side,zz in [('lower',[48.1,50.1]),('upper',[52.1,54.1])]:
   tab=box([*xx,*yy,*zz]).cut(cyl(x,y,47,55,2.2));objects[f'tab_{i}_{side}']=tab
 for i,(x,y) in enumerate([(94.5,63),(98,59.5),(255.5,63),(252,59.5),(94.5,177),(98,180.5),(255.5,177),(252,180.5)]):
  objects[f'corner_stop_{i}']=cyl(x,y,48.1,54.1,1.5)
  objects[f'corner_stop_nut_{i}']=cyl(x,y,45.7,48.1,3)
 for i,(x,y) in enumerate(MOUNT_CENTRES):
  objects[f'lower_pcb_support_{i}']=cyl(x,y,8,15,3)
  objects[f'upper_pcb_support_{i}']=cyl(x,y,58.6,61.6,3)
 obstacles={n:box(v) for n,v in BOUNDS.items() if not n.endswith('_pcb')}
 # Existing 8mm hardware reserves in board assemblies are genuine PCB allocation.
 for n in ['mains_assembly_reserve','controller_assembly_and_access_reserve']:
  for x,y in MOUNT_CENTRES:obstacles[n]=obstacles[n].cut(cyl(x,y,0,90,4))
 findings={}
 for n,obj in objects.items():
  for on,obs in {'enclosure':enclosure,**obstacles}.items():
   v=obj.intersect(obs).Volume()
   if v>1e-6:findings[n+'/'+on]=v
  assert obj.isValid(),n
 # Tabs intentionally touch separator surfaces but do not penetrate its solid.
 assert not findings,findings
 # Four chosen base fixings have a solid 5mm enclosure floor underneath and clear interior above.
 base=raw[0].translate(TRANSLATION);floor={}
 for x,y in POSTS+PE_FIXINGS:
  test=cyl(x,y,-4,1.8,2.2);floor[str((x,y))]={'material_volume_mm3':test.intersect(base).Volume(),'full_cylinder_mm3':test.Volume(),'above_floor_clearance_mm3':cyl(x,y,1.81,5,4).intersect(base).Volume()}
  assert abs(floor[str((x,y))]['material_volume_mm3']-test.Volume())<1e-4
  assert floor[str((x,y))]['above_floor_clearance_mm3']<1e-6
 controls={'uncut_base_rejects_frame_rods_mm3':objects['frame_rod_0'].intersect(original_enclosure).Volume(),'lowered_rail_hits_separator_mm3':objects['north_rail'].translate((0,0,-5)).intersect(box(BOUNDS['separator'])).Volume()}
 assert all(v>1 for v in controls.values()),controls
 # Floor holes are deliberately later drilled; neither source solid nor enclosure STEP is modified.
 result={'passed':True,'scope':'Stock-material support geometry against manufacturer enclosure and allocated component/harness volumes. Not load, torque, insulation, vibration or ingress testing.','negative_controls':controls,'pe_base_fixings_xy_mm':PE_FIXINGS,'base_fixings_xy_mm':POSTS,'base_hole_diameter_mm':4.4,'frame_rod_stock_min_mm':80,'pe_bracket_bounds_mm':[270,310,180,210,10,13],'base_wall_thickness_mm':5.8,'actual_inner_floor_z_mm':1.8,'floor_foot_height_mm':3.2,'carrier_bounds_mm':[84,266,48,192,5,8],'separator_unchanged':BOUNDS['separator'],'upper_rails_z_mm':[55.6,58.6],'floor_material_checks':floor,'interference_findings':findings,'antenna_to_supports_min_mm':min(obj.distance(box(ANTENNA)) for obj in objects.values()),'note':'New supports are all dielectric; closest is upper rail. Physical RF effect unmeasured.','source_sha256':hashlib.sha256(data).hexdigest(),'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
 cq.exporters.export(cq.Compound.makeCompound([enclosure,*objects.values(),box(BOUNDS['separator'])]),str(HERE/'support-fit.step'))
 result['step_sha256']=hashlib.sha256((HERE/'support-fit.step').read_bytes()).hexdigest();(HERE/'support-fit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':run()
