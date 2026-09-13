from pathlib import Path
import pcbnew,wx
p=Path('/Users/michael/Code/crystal-shim/pcb/controller/kicad/controller.kicad_pcb');assert not list(p.parent.glob('*.lck'));app=wx.App(False);log=wx.LogNull();b=pcbnew.LoadBoard(str(p))
for d in b.GetDrawings():
 if isinstance(d,pcbnew.PCB_TEXT) and d.GetText()=='1 +5V' and d.GetPosition().x==pcbnew.FromMM(83):d.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(97),pcbnew.FromMM(59)))
pcbnew.SaveBoard(str(p),b)
lib=p.parent/'expansion-source/footprints/CrystalShim_Controller.pretty';f=pcbnew.FootprintLoad(str(lib),'Controller_J4');assert f
for pad in f.Pads():
 if pad.GetNumber() in ['SH','B1','B4','B9','B12']:
  layers=pad.GetLayerSet();layers.RemoveLayer(pcbnew.F_Paste);layers.RemoveLayer(pcbnew.B_Paste);pad.SetLayerSet(layers)
 if pad.IsOnLayer(pcbnew.F_Paste):pad.SetLocalSolderPasteMargin(0);pad.SetLocalSolderPasteMarginRatio(0.0)
pcbnew.PCB_IO_KICAD_SEXPR().FootprintSave(str(lib),f)
