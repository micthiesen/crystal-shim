"""KiCad stores minimum mask width on the board, not in SaveProject output."""
from pathlib import Path
import hashlib
import json
import pcbnew
import wx

target = Path('/Users/michael/Code/crystal-shim/pcb/controller/kicad')
output = Path('/tmp/crystal-shim-controller-basic-settings/mask-application.json')
assert not output.exists() and not list(target.glob('~*.lck'))
project_path = target / 'controller.kicad_pro'
board_path = target / 'controller.kicad_pcb'
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
before_project, before_board = sha(project_path), sha(board_path)
app = wx.App(False)
log = wx.LogNull()
manager = pcbnew.GetSettingsManager()
assert manager.LoadProject(str(project_path), False)
project = manager.GetProject(str(project_path))
board = pcbnew.LoadBoard(str(board_path))
board.SetProject(project)
assert not list(board.GetTracks()) and not list(board.Zones())
assert len(list(board.GetFootprints())) == 99
settings = board.GetDesignSettings()
assert settings.m_SolderMaskMinWidth == 0
settings.m_SolderMaskMinWidth = pcbnew.FromMM(0.1)
assert pcbnew.SaveBoard(str(board_path), board)
assert sha(project_path) == before_project
output.write_text(json.dumps({
    'operation': 'native SaveBoard for declared 0.10 mm mask aperture merge threshold only',
    'before_board_sha256': before_board, 'after_board_sha256': sha(board_path),
    'preserved_project_sha256': before_project,
    'script_sha256': sha(Path(__file__)), 'kicad_version': pcbnew.GetBuildVersion(),
}, indent=2) + '\n')
print('mask threshold saved natively; geometry parity and fresh reload still required')
assert app and log is not None
