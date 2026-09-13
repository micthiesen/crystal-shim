from pathlib import Path
import pcbnew,wx
p=Path('/Users/michael/Code/crystal-shim/pcb/mains/kicad/mains.kicad_pcb');app=wx.App(False);quiet=wx.LogNull();m=pcbnew.GetSettingsManager();m.LoadProject(str(p.with_suffix('.kicad_pro')),False);b=pcbnew.LoadBoard(str(p));b.SetProject(m.GetProject(str(p.with_suffix('.kicad_pro'))))
zs=[z for z in b.Zones() if z.GetZoneName().startswith('MOUNT_H')];assert len(zs)==4
for z in zs:z.SetDoNotAllowPads(False)
assert pcbnew.SaveBoard(str(p),b)
print('Mechanical NPTH pads allowed in mount areas; tracks/vias/fills remain prohibited')
