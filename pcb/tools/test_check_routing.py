"""Boundary tests for the escape check that native intersectsArea cannot enforce."""
import unittest
from check_routing import segment_in_boxes, box_inside


class EscapeTests(unittest.TestCase):
    def test_crossing_an_escape_does_not_exempt_a_long_track(self):
        self.assertFalse(segment_in_boxes((-5, 0), (5, 0), [(-1,-1,1,1)]))

    def test_touching_escape_envelopes_cover_whole_segment(self):
        self.assertTrue(segment_in_boxes((0,0),(4,0), [(-1,-1,2,1),(2,-1,5,1)]))

    def test_small_gap_between_envelopes_is_not_ignored(self):
        self.assertFalse(segment_in_boxes((0,0),(4,0), [(-1,-1,1.99,1),(2,-1,5,1)]))

    def test_endpoints_inside_different_boxes_do_not_hide_outside_middle(self):
        self.assertFalse(segment_in_boxes((0,0),(4,4), [(-1,-1,1,1),(3,3,5,5)]))

    def test_zero_length_segment_must_be_inside(self):
        self.assertTrue(segment_in_boxes((0,0),(0,0), [(-1,-1,1,1)]))
        self.assertFalse(segment_in_boxes((2,0),(2,0), [(-1,-1,1,1)]))

    def test_arc_enclosure_must_fit_complete_box(self):
        self.assertFalse(box_inside((-2,-1,2,1),(-1,-1,1,1)))
        self.assertTrue(box_inside((-1,-1,1,1),(-1,-1,1,1)))


class NativeRoutingTests(unittest.TestCase):
    """In-memory mutations only; product files are never saved."""
    @classmethod
    def setUpClass(cls):
        try:
            import pcbnew
            import wx
        except ImportError:
            raise unittest.SkipTest('Run under kicad_python.sh for native geometry tests')
        cls.pcbnew = pcbnew
        cls.app = wx.App(False)
        cls.quiet = wx.LogNull()

    def setUp(self):
        import json
        from check_routing import ROOT, POLICY
        self.board = self.pcbnew.LoadBoard(str(ROOT / 'pcb/controller/kicad/controller.kicad_pcb'))
        self.policy = json.loads(POLICY.read_text())['boards']['controller']

    def test_final_usb_length_mismatch(self):
        from check_routing import usb_length_findings
        self.add_track('USB_D_P', (90, 110), (93, 110), .24)
        self.add_track('USB_D_N', (90, 111), (92, 111), .24)
        self.assertTrue(usb_length_findings(self.board, self.policy, self.pcbnew))

    def test_final_usb_length_within_target(self):
        from check_routing import usb_length_findings
        self.add_track('USB_D_P', (90, 110), (92.4, 110), .24)
        self.add_track('USB_D_N', (90, 111), (92, 111), .24)
        self.assertFalse(usb_length_findings(self.board, self.policy, self.pcbnew))

    def add_track(self, net, start, end, width, layer=None):
        p = self.pcbnew
        item = p.PCB_TRACK(self.board)
        item.SetStart(p.VECTOR2I(*(p.FromMM(v) for v in start)))
        item.SetEnd(p.VECTOR2I(*(p.FromMM(v) for v in end)))
        item.SetWidth(p.FromMM(width))
        item.SetLayer(p.F_Cu if layer is None else layer)
        item.SetNetCode(self.board.FindNet(net).GetNetCode())
        self.board.Add(item)

    def test_undersized_motor_track_fails_but_full_width_passes(self):
        from check_routing import audit
        self.add_track('V12_PUMP',(100,130),(110,130),.3)
        self.assertTrue(any('below 2 mm' in f for f in audit(self.board,self.policy,self.pcbnew)))

    def test_full_width_motor_track_passes_width_audit(self):
        from check_routing import audit
        self.add_track('V12_PUMP',(100,130),(110,130),2)
        self.assertFalse(any('below 2 mm' in f for f in audit(self.board,self.policy,self.pcbnew)))

    def test_usb_on_bottom_is_rejected(self):
        from check_routing import audit
        self.add_track('USB_D_N',(100,100),(101,100),.24,self.pcbnew.B_Cu)
        self.assertTrue(any('USB must stay' in f for f in audit(self.board,self.policy,self.pcbnew)))


    def test_v3v3_via_allowed_but_motor_via_rejected(self):
        from check_routing import audit
        p = self.pcbnew
        for net, x in [('V3V3',100),('V12_PUMP',105)]:
            via = p.PCB_VIA(self.board)
            via.SetPosition(p.VECTOR2I(p.FromMM(x),p.FromMM(130)))
            via.SetWidth(p.FromMM(.6))
            via.SetDrill(p.FromMM(.3))
            via.SetLayerPair(p.F_Cu,p.B_Cu)
            via.SetNetCode(self.board.FindNet(net).GetNetCode())
            self.board.Add(via)
        findings = audit(self.board,self.policy,p)
        self.assertTrue(any('V12_PUMP via' in f for f in findings))
        self.assertFalse(any('V3V3 via' in f for f in findings))


if __name__ == '__main__':
    unittest.main()
