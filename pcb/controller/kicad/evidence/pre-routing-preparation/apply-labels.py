from pathlib import Path
import json,wx,pcbnew
root=Path('/Users/michael/Code/crystal-shim');path=root/'pcb/controller/kicad/controller.kicad_pcb';ev=path.parent/'evidence/pre-routing-preparation';assert not list(path.parent.glob('*.lck'));app=wx.App(False);log=wx.LogNull();b=pcbnew.LoadBoard(str(path))
labels=[('J5 RESERVOIR',59,48.5),('J1 PSU/RELAY',74,48.5),('J3 SENSOR',89,48.5),('J6 12V IN',56,152),('J2 SERVICE 5V',79,152),('J9 DECHLOR',164,106),('J8 CHLORINE',164,124),('J7 TRANSFER',164,142),('RESET',140,104.25),('BOOT',140,116.25),('MAINTENANCE',140,128.25),('USB',122,151),('1 +5V',49.5,59),('1 +5V',68,64.5),('1 +5V',83,64.5),('1 +12V',49.5,141),('1 +5V',72.5,141),('1 +12V',164,93),('1 +12V',164,111),('1 +12V',164,129)]
for text,x,y in labels:
 d=pcbnew.PCB_TEXT(b);d.SetText(text);d.SetLayer(pcbnew.F_SilkS);d.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x),pcbnew.FromMM(y)));d.SetTextSize(pcbnew.VECTOR2I(pcbnew.FromMM(1),pcbnew.FromMM(1)));d.SetTextThickness(pcbnew.FromMM(.15));b.Add(d)
pcbnew.SaveBoard(str(path),b);(ev/'labels.json').write_text(json.dumps(labels,indent=2)+'\n')
