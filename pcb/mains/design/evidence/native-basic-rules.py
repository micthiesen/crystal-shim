from pathlib import Path
import json,hashlib
import pcbnew,wx
root=Path('/Users/michael/Code/crystal-shim/pcb'); target=root/'mains/kicad'; bp=target/'mains.kicad_pcb'; pp=target/'mains.kicad_pro'
assert (root/'mains/design/handoff.lock.json').is_file()
assert not list(target.glob('~*.lck'))
app=wx.App(False);quiet=wx.LogNull();manager=pcbnew.GetSettingsManager();assert manager.LoadProject(str(pp),False)
project=manager.GetProject(str(pp));board=pcbnew.LoadBoard(str(bp));board.SetProject(project)
assert len(list(board.GetFootprints()))==26 and not list(board.GetTracks()) and len(list(board.Zones()))==4
settings=board.GetDesignSettings();assert settings.GetCopperLayerCount()==2
before=hashlib.sha256(bp.read_bytes()).hexdigest()
settings.m_MinClearance=pcbnew.FromMM(.15);settings.m_TrackMinWidth=pcbnew.FromMM(.15)
settings.m_MinThroughDrill=pcbnew.FromMM(.3);settings.m_ViasMinSize=pcbnew.FromMM(.6)
settings.m_HoleClearance=pcbnew.FromMM(.2)
net=settings.m_NetSettings
classes={'Primary':(3.2,2),'PrimaryInput':(3.2,3),'Motor':(.15,3),'LogicPower':(.15,2)}
assign={'Primary':['FILTER_LINE_L','PUMP_L_FILTERED','PUMP_N_FILTERED','PUMP_L_SW','SNUBBER_RC'],'PrimaryInput':['AC_L_FUSED','AC_N'],'Motor':['V12_RAW','V12_MOTOR','GND_ISO'],'LogicPower':['V5_PSU','COIL_DRAIN']}
def setup(n,c,w):
 n.SetClearance(pcbnew.FromMM(c));n.SetTrackWidth(pcbnew.FromMM(w));n.SetViaDiameter(pcbnew.FromMM(.6));n.SetViaDrill(pcbnew.FromMM(.3))
default=net.GetDefaultNetclass();setup(default,.15,.3);net.SetDefaultNetclass(default)
for i,(name,(clearance,width)) in enumerate(classes.items()):
 n=pcbnew.NETCLASS(name,False);n.SetPriority(i);setup(n,clearance,width);net.SetNetclass(name,n)
 for value in assign[name]:net.SetNetclassPatternAssignment(value,name)
net.ClearAllCaches();net.RecomputeEffectiveNetclasses();assert manager.SaveProject(str(pp),project)
assert hashlib.sha256(bp.read_bytes()).hexdigest()==before
saved=json.loads(pp.read_text());actual={n['name']:n for n in saved['net_settings']['classes']}
for name,(clearance,width) in classes.items():assert actual[name]['clearance']==clearance and actual[name]['track_width']==width
receipt={'kicad_version':pcbnew.GetBuildVersion(),'project_sha256':hashlib.sha256(pp.read_bytes()).hexdigest(),'board_sha256_unchanged':before,'classes':actual,'patterns':saved['net_settings']['netclass_patterns'],'scope':'Native netclasses and basic rules only; 8mm custom isolation rule still requires GUI','script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
(root/'mains/design/evidence/native-basic-rules.json').write_text(json.dumps(receipt,indent=2)+'\n')
print('Mains native netclasses and basic rules saved/read back; PCB geometry unchanged')
