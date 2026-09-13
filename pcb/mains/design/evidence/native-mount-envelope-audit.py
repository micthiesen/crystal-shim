from pathlib import Path
import pcbnew,wx
app=wx.App(False);quiet=wx.LogNull();b=pcbnew.LoadBoard('/Users/michael/Code/crystal-shim/pcb/mains/kicad/mains.kicad_pcb')
fps=list(b.GetFootprints());mounts=[f for f in fps if f.GetReference() in ['H1','H2','H3','H4']]
for f in fps:
 if f in mounts:continue
 shapes=[s for s in f.GraphicalItems() if s.GetLayer() in [pcbnew.F_Fab,pcbnew.F_CrtYd]]
 if not shapes:print('NO_BODY',f.GetReference());continue
 boxes=[s.GetBoundingBox() for s in shapes]
 xmin=min(pcbnew.ToMM(s.GetLeft()) for s in boxes)+(3 if f.GetReference()=='J1' else 0);xmax=max(pcbnew.ToMM(s.GetRight()) for s in boxes)+(3 if f.GetReference()=='J1' else 0)
 ymin=min(pcbnew.ToMM(s.GetTop()) for s in boxes);ymax=max(pcbnew.ToMM(s.GetBottom()) for s in boxes)
 for h in mounts:
  c=h.GetPosition();x,y=pcbnew.ToMM(c.x),pcbnew.ToMM(c.y)
  if xmin<x+4 and xmax>x-4 and ymin<y+4 and ymax>y-4:print('COLLISION',f.GetReference(),h.GetReference(),[xmin,ymin,xmax,ymax])
print('Full native Fab/courtyard envelopes audited with proposed J1 +3mm shift')
