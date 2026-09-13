from pathlib import Path
import json,hashlib
import pcbnew,wx
root=Path('/Users/michael/Code/crystal-shim/pcb');plan=json.loads((root/'mains/design/evidence/native-completion-plan.json').read_text());assert not plan['blocked'] and not plan['drift']
changes=[c for c in plan['changes'] if c['kind']=='placement'];assert len(changes)==1 and changes[0]['target']=='mains.component.j1' and changes[0]['after']['x_mm']==-73
p=root/'mains/kicad/mains.kicad_pcb';assert not list(p.parent.glob('~*.lck'))
app=wx.App(False);quiet=wx.LogNull();m=pcbnew.GetSettingsManager();m.LoadProject(str(p.with_suffix('.kicad_pro')),False);b=pcbnew.LoadBoard(str(p));b.SetProject(m.GetProject(str(p.with_suffix('.kicad_pro'))));assert not list(b.GetTracks())
f=next(x for x in b.GetFootprints() if x.GetReference()=='J1');old=f.GetPosition();assert (old.x,old.y)==(pcbnew.FromMM(24),pcbnew.FromMM(142))
def pads(board):return {f.GetReference():[(p.GetNumber(),p.GetPosition().x,p.GetPosition().y,p.GetNetname(),p.GetSize().x,p.GetSize().y) for p in f.Pads()] for f in board.GetFootprints()}
before=pads(b);h=hashlib.sha256(p.read_bytes()).hexdigest();f.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(27),old.y));assert pcbnew.SaveBoard(str(p),b);saved=pcbnew.LoadBoard(str(p));after=pads(saved)
expected=dict(before);expected['J1']=[(n,x+pcbnew.FromMM(3),y,net,w,h) for n,x,y,net,w,h in before['J1']];assert after==expected
(root/'mains/design/evidence/native-j1-move.json').write_text(json.dumps({'before_sha256':h,'after_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'only_J1_moved_mm':[3,0],'all_other_pads_nets_sizes_preserved':True,'plan_sha256':hashlib.sha256((root/'mains/design/evidence/native-completion-plan.json').read_bytes()).hexdigest()},indent=2)+'\n')
print('J1 moved +3mm X through native API; all other pads/nets unchanged')
