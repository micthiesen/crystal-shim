from pathlib import Path
import sys,json,subprocess,os,shutil,hashlib
sys.path.insert(0,str(Path.cwd()/'pcb/tools'))
import kicad_schematic as s
root=Path.cwd(); scratch=Path('/tmp/crystal-connectors-mains-sch');scratch.mkdir(exist_ok=True)
for f in (root/'pcb/mains/kicad').glob('*.kicad_*'):
 if f.is_file():shutil.copy2(f,scratch/f.name)
exe='/Users/michael/Documents/KiCad/10.0/3rdparty/plugins/com_github_mixelpixx_konnect/bin/konnect'
env=dict(os.environ,KICAD10_SYMBOL_DIR=str(scratch))
p=subprocess.Popen([exe],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=open(scratch/'konnect.log','w'),text=True,env=env);i=0
receipts=[]
def rpc(method,params):
 global i
 i+=1;p.stdin.write(json.dumps(dict(jsonrpc='2.0',id=i,method=method,params=params))+'\n');p.stdin.flush()
 while True:
  l=p.stdout.readline()
  if not l:raise RuntimeError('closed')
  r=json.loads(l)
  if r.get('id')==i:
   assert 'error' not in r,r
   assert not r.get('result',{}).get('isError'),r
   return r['result']
def call(name,arguments):
 r=rpc('tools/call',dict(name=name,arguments=arguments));receipts.append(dict(name=name,arguments=arguments,result=r));return r
try:
 rpc('initialize',dict(protocolVersion='2024-11-05',capabilities={},clientInfo=dict(name='connector-eco',version='1')))
 p.stdin.write(json.dumps(dict(jsonrpc='2.0',method='notifications/initialized',params={}))+'\n');p.stdin.flush()
 for n in ['library','sch_components','sch_batch','sch_wiring']:call('load_toolset',dict(name=n))
 sch=scratch/'primary.kicad_sch';before=s.parse(sch.read_bytes());symbols=s.children(before,'symbol');libs=s.children(s.children(before,'lib_symbols')[0],'symbol')
 for ref in ['J2','J3','J4']:
  inst=next(x for x in symbols if s.string(s.properties(x)['Reference'][2])==ref)
  libid=s.string(s.children(inst,'lib_id')[0][1]);lib=next(x for x in libs if s.string(x[1])==libid)
  pins=[]
  for unit in s.children(lib,'symbol'):
   for pin in s.children(unit,'pin'):
    number=s.string(s.children(pin,'number')[0][1])
    if number not in ['1','2']:continue
    at=s.children(pin,'at')[0];pins.append(dict(number=number,name=s.string(s.children(pin,'name')[0][1]),type=pin[1],x=float(at[1]),y=float(at[2]),angle=float(at[3]),length=float(s.children(pin,'length')[0][1])))
  assert len(pins)==2
  call('create_symbol',dict(library_path=str(scratch/'CrystalShim_Mains.kicad_sym'),name='Mains_'+ref+'_Terminal',reference_prefix='J',value='1868076',units=[dict(pins=pins)]))
  subprocess.run(['kicad-cli','sym','upgrade','--force',str(scratch/'CrystalShim_Mains.kicad_sym')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  call('replace_component',dict(schematic=str(sch),reference=ref,new_lib_id=libid+'_Terminal'))
 positions=[dict(x=float(x[1]),y=float(x[2])) for n in s.children(before,'no_connect') for x in s.children(n,'at')];assert len(positions)==7
 call('batch_delete',dict(schematic=str(sch),uuids=[s.string(s.children(n,'uuid')[0][1]) for n in s.children(before,'no_connect')]))
 after=s.parse(sch.read_bytes())
 # Confirm all existing geometry/instances preserved except named symbol selection and removed NCs.
 import copy
 a=copy.deepcopy(before);b=copy.deepcopy(after)
 for tree in [a,b]:
  tree[:]=[x for x in tree if not(isinstance(x,list) and x and x[0] in ['lib_symbols','no_connect'])]
  for inst in s.children(tree,'symbol'):
   if s.string(s.properties(inst)['Reference'][2]) in ['J2','J3','J4']:s.children(inst,'lib_id')[0][1]='"allowed"'
 assert a==b,'unexpected schematic changes'
 assert not s.children(after,'no_connect')
 (scratch/'receipt.json').write_text(json.dumps(receipts,indent=2))
 print('Verified scratch symbol replacement and removal of exactly seven NC flags')
finally:p.terminate();p.wait()
