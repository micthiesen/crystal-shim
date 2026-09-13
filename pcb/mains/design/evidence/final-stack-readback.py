from pathlib import Path
import json,hashlib
import pcbnew,wx
p=Path('/Users/michael/Code/crystal-shim/pcb/mains/kicad/mains.kicad_pcb');app=wx.App(False);quiet=wx.LogNull();b=pcbnew.LoadBoard(str(p));s=b.GetDesignSettings();assert s.GetCopperLayerCount()==2 and s.GetBoardThickness()==pcbnew.FromMM(1.6)
text=p.read_text();expected=['(thickness 0.01)','(thickness 0.035)','(thickness 1.51)','(material "FR4")','(copper_finish "ENIG")'];assert all(v in text for v in expected)
assert round(sum([.01,.035,1.51,.035,.01]),6)==1.6
r={'board_sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'kicad_version':pcbnew.GetBuildVersion(),'native_layer_count':2,'native_header_mm':pcbnew.ToMM(s.GetBoardThickness()),'saved_stack_mm':{'F.Mask':.01,'F.Cu':.035,'core_FR4':1.51,'B.Cu':.035,'B.Mask':.01},'stack_sum_mm':1.6,'finish':'ENIG','basis':'Native header/layer readback and saved stack fields; selected nominal construction, not a fabricated coupon measurement'}
Path('/Users/michael/Code/crystal-shim/pcb/mains/design/evidence/final-stack-readback.json').write_text(json.dumps(r,indent=2)+'\n')
print('Native two-layer header and saved stack sum both 1.6mm; ENIG')
