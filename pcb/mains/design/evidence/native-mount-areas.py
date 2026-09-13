from pathlib import Path
import json,hashlib
import pcbnew,wx
p=Path('/Users/michael/Code/crystal-shim/pcb/mains/kicad/mains.kicad_pcb');app=wx.App(False);quiet=wx.LogNull();manager=pcbnew.GetSettingsManager();manager.LoadProject(str(p.with_suffix('.kicad_pro')),False);b=pcbnew.LoadBoard(str(p));b.SetProject(manager.GetProject(str(p.with_suffix('.kicad_pro'))))
assert len(list(b.Zones()))==4 and not list(b.GetTracks())
l=pcbnew.LSET();l.AddLayer(pcbnew.F_Cu);l.AddLayer(pcbnew.B_Cu)
for ref in ['H1','H2','H3','H4']:
 f=next(x for x in b.GetFootprints() if x.GetReference()==ref);c=f.GetPosition();x,y=pcbnew.ToMM(c.x),pcbnew.ToMM(c.y)
 z=pcbnew.ZONE(b);z.SetIsRuleArea(True);z.SetZoneName('MOUNT_'+ref+'_INSULATING_HARDWARE');z.SetLayerSet(l)
 z.SetDoNotAllowTracks(True);z.SetDoNotAllowVias(True);z.SetDoNotAllowZoneFills(True);z.SetDoNotAllowPads(True);z.SetDoNotAllowFootprints(False);z.Outline().NewOutline()
 for a,d in [(x-4,y-4),(x+4,y-4),(x+4,y+4),(x-4,y+4)]:z.Outline().Append(pcbnew.FromMM(a),pcbnew.FromMM(d))
 b.Add(z)
assert pcbnew.SaveBoard(str(p),b)
s=pcbnew.LoadBoard(str(p));assert len(list(s.Zones()))==8
print('Eight native areas saved: four isolation plus four 8mm-square insulating-mount reservations')
