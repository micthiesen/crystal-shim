from pathlib import Path
import sys,json
sys.path.insert(0,'pcb/tools');import pcb_workflow as w
f=w.Workflow(Path.cwd(),'pcb/workflow.json','mains');e=f.evidence('docs/design/evidence/connector-eco/mains');d=e.index()
assert d['stage']=='failed' and d['baseline_lock_sha256']==w.sha(f.path('lock'))
# Extend the original baseline plan after its preparation audit identifies connector escape cleanup.
# Never manufacture a new baseline or restore production state.
before=w.native_hashes(f.native);m=w.handoff.load_manifest(f.path('manifest'));a=w.handoff.load_augmentation(f.path('augmentation'),m)
p=w.handoff.build_plan(m,a,w.handoff.read_json(f.path('lock')),e.get(d['before_snapshot']),True,True)
assert not p['blocked'] and not p['drift'];prior=d['plan'];d['plan']=e.put(p);d['supplemental_plan']=e.put({'reason':'Complete native preparation identified old connector tail escape regions. Extend declared zone augmentation while retaining original baseline and all source changes.','previous_plan':prior,'new_plan':d['plan'],'current_native':before});d.update(stage='planned',target_inputs=f.fingerprints());d.pop('validation',None);d.pop('review',None)
assert before==w.native_hashes(f.native);e.write_index(d);print('Supplemental source/ECO plan bound to original baseline')
