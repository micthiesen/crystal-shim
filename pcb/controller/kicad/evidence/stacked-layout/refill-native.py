from pathlib import Path
import pcbnew,wx
app=wx.App(False);log=wx.LogNull();p=Path('/Users/michael/Code/crystal-shim/pcb/controller/kicad/controller.kicad_pcb');assert not list(p.parent.glob('*.lck'))
m=pcbnew.GetSettingsManager();pr=p.with_suffix('.kicad_pro');m.LoadProject(str(pr),False);b=pcbnew.LoadBoard(str(p));b.SetProject(m.GetProject(str(pr)));b.BuildConnectivity();assert pcbnew.ZONE_FILLER(b).Fill(b.Zones());pcbnew.SaveBoard(str(p),b);print('refilled with native project settings')
