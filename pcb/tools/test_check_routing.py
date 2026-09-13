"""Boundary tests for bounded escape copper and native rule generation."""
import unittest
from check_routing import segment_in_boxes, box_inside, escape_width_rule


class EscapeTests(unittest.TestCase):
    def test_small_pad_keeps_trunk_router_default(self):
        condition, constraint = escape_width_rule('V12_RAW', 'Neck V12_RAW C2.1.0', .3, 3)
        self.assertEqual(condition, "A.NetName == 'V12_RAW' && A.enclosedByArea('Neck V12_RAW C2.1.0')")
        self.assertEqual(constraint, '(constraint track_width (min 0.3mm) (opt 3mm))')

    def test_invalid_escape_width_rejected(self):
        for minimum in (0, -1, 4):
            with self.assertRaises(ValueError):
                escape_width_rule('V12_RAW', 'Neck', minimum, 3)

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

class SensorWaiverTests(unittest.TestCase):
    def test_only_exact_item_bound_excluded_warning_is_allowed(self):
        from check_routing import nonwaived_drc_findings
        identity={'type':'padstack','description':'intentional internal copper','severity':'warning','items':[{'uuid':'fixed-pad'}]}
        policy={'native_drc_exclusions':[identity]}
        self.assertEqual(nonwaived_drc_findings({'violations':[dict(identity,excluded=True)]},policy),[])
        for changed in [dict(identity,excluded=False),dict(identity,excluded=True,type='clearance'),dict(identity,excluded=True,items=[{'uuid':'another-pad'}])]:
            self.assertEqual(len(nonwaived_drc_findings({'violations':[changed]},policy)),1)


class SensorNativeTests(unittest.TestCase):
    setUpClass = NativeRoutingTests.__dict__["setUpClass"]
    add_track = NativeRoutingTests.add_track
    def setUp(self):
        import json
        from check_routing import ROOT, POLICY
        self.board=self.pcbnew.LoadBoard(str(ROOT/'pcb/sensor/kicad/sensor.kicad_pcb'))
        self.policy=json.loads(POLICY.read_text())['boards']['sensor']

    # Keep this class's coverage focused; do not inherit controller probes.
    def test_baseline_sensor_copper(self):
        from check_routing import audit
        self.assertEqual(audit(self.board,self.policy,self.pcbnew),[])

    def test_missing_bar_fails_despite_same_logical_pad_remaining(self):
        from check_routing import audit
        e=next(f for f in self.board.GetFootprints() if f.GetReference()=='E1')
        pad=next(p for p in e.Pads() if p.GetNumber()=='2')
        e.Remove(pad)
        self.assertTrue(any('electrode' in f for f in audit(self.board,self.policy,self.pcbnew)))

    def test_electrode_layer_change_is_rejected(self):
        from check_routing import audit
        pad=next(p for f in self.board.GetFootprints() if f.GetReference()=='E1' for p in f.Pads() if p.GetNumber()=='8')
        layers=self.pcbnew.LSET();layers.AddLayer(self.pcbnew.F_Cu);pad.SetLayerSet(layers)
        self.assertTrue(any('electrode' in f for f in audit(self.board,self.policy,self.pcbnew)))

    def test_unrelated_bottom_track_rejected_outward_routing_allowed(self):
        from check_routing import audit
        self.add_track('I2C_SDA',(105,110),(106,110),.2,self.pcbnew.F_Cu)
        self.assertEqual(audit(self.board,self.policy,self.pcbnew),[])
        self.add_track('I2C_SDA',(105,111),(106,111),.2,self.pcbnew.B_Cu)
        self.assertTrue(any('glass face' in f for f in audit(self.board,self.policy,self.pcbnew)))


if __name__ == '__main__':
    unittest.main()
