"""Keep native thickness consistent with its stack; never serialize KiCad text."""
import hashlib
import json
import re
from pathlib import Path
import pcbnew
import wx

repo = Path('/Users/michael/Code/crystal-shim')
target = repo / 'pcb/controller/kicad'
board_path = target / 'controller.kicad_pcb'
project_path = target / 'controller.kicad_pro'
out = Path('/tmp/crystal-shim-controller-stackup-applied')
out.mkdir(exist_ok=True)
assert not (out / 'native-thickness-consistency.json').exists()
assert not list(target.glob('~*.lck'))
assert target.resolve() == target
assert (repo / 'pcb/controller/design/handoff.lock.json').is_file()
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

def read_tree(path):
    # Read-only: the installed native wrapper cannot expose detailed stack layers.
    tokens = re.findall(r'"(?:\\.|[^"\\])*"|[()]|[^\s()]+', path.read_text())
    stack, root = [], None
    for token in tokens:
        if token == '(':
            value = []
            if stack:
                stack[-1].append(value)
            else:
                assert root is None
                root = value
            stack.append(value)
        elif token == ')':
            assert stack
            stack.pop()
        else:
            assert stack
            stack[-1].append(token)
    assert not stack and root and root[0] == 'kicad_pcb'
    return root

def item(tree, key):
    found = [v for v in tree if isinstance(v, list) and v[0] == key]
    assert len(found) == 1, (key, len(found))
    return found[0]

before_tree = read_tree(board_path)
before_stack = item(item(before_tree, 'setup'), 'stackup')
assert item(item(before_tree, 'general'), 'thickness') == ['thickness', '1.6']
(out / 'before-consistency.kicad_pcb').write_bytes(board_path.read_bytes())
project_sha = sha(project_path)
before_sha = sha(board_path)
app = wx.App(False)
log = wx.LogNull()
manager = pcbnew.GetSettingsManager()
assert manager.LoadProject(str(project_path), False)
project = manager.GetProject(str(project_path))
board = pcbnew.LoadBoard(str(board_path))
board.SetProject(project)
assert len(list(board.GetFootprints())) == 99
assert not list(board.GetTracks()) and not list(board.Zones())
settings = board.GetDesignSettings()
assert settings.GetBoardThickness() == pcbnew.FromMM(1.6)
settings.SetBoardThickness(pcbnew.FromMM(1.6062))
assert pcbnew.SaveBoard(str(board_path), board)
after_tree = read_tree(board_path)
after_stack = item(item(after_tree, 'setup'), 'stackup')
assert before_stack == after_stack, 'Detailed native stack changed'
assert item(item(after_tree, 'general'), 'thickness') == ['thickness', '1.6062']
item(item(before_tree, 'general'), 'thickness')[1] = '1.6062'
assert before_tree == after_tree, 'Unrelated serialized semantics changed'
assert sha(project_path) == project_sha
reloaded = pcbnew.LoadBoard(str(board_path))
assert reloaded.GetDesignSettings().GetBoardThickness() == pcbnew.FromMM(1.6062)
record = {
    'scope': 'Keep native thickness consistent with the saved stack using SetBoardThickness and SaveBoard; source 1.6 mm remains nominal ordering data',
    'kicad_version': pcbnew.GetBuildVersion(),
    'board_before_sha256': before_sha, 'board_after_sha256': sha(board_path),
    'unchanged_project_sha256': project_sha, 'script_sha256': sha(Path(__file__)),
    'native_reload_thickness_mm': 1.6062,
    'source_nominal_ordering_thickness_mm': 1.6,
    'only_changed_serialized_semantics': ['general.thickness'],
    'detailed_stack_preserved': True, 'saved_stack_tree': after_stack,
    'known_vendor_layer_sum_mm': 1.5862,
    'unverified_kicad_defaults': {'mask_thickness_each_mm': 0.01, 'dielectric_loss_tangent': 0.02},
    'limits': ['Mask thickness and loss tangent are not manufacturer requirements.',
               'Dielectric constraints remain disabled; no fabrication job is released.',
               'A later GUI stack edit can recalculate the native header; recheck both the stack and header.'],
}
(out / 'native-thickness-consistency.json').write_text(json.dumps(record, indent=2) + '\n')
print('Native save/reload passed; header and saved stack both 1.6062 mm, detailed stack and all other board semantics preserved')
