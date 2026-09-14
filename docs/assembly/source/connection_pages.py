"""Focused harness, mains interconnection and board-stack booklet pages."""


def build_connection_pages(api):
    """Append three pages using the composing module's drawing helpers."""
    _harness_page(api)
    _mains_page(api)
    _stack_page(api)


def _harness_page(api):
    page, para, table, arrow, box, label, note = (
        api[key] for key in ("page", "para", "table", "arrow", "box", "label", "note")
    )
    c, h, margin, width = (api[key] for key in ("C", "H", "M", "CW"))
    page(
        "Wire the three connections",
        "One sensor lead and two internal harnesses. Circuit maps below are symbolic, not housing-face views.",
    )
    para("INTERNAL BOARD-TO-BOARD HARNESSES", margin, 111, width, 10.5, True)
    box("MAINS J5", 36, 135, 88, 35)
    box("CONTROLLER J1", 172, 135, 115, 35)
    arrow(126, 152, 170, 152)
    box("MAINS J6", 313, 135, 88, 35)
    box("CONTROLLER J6", 449, 135, 127, 35)
    arrow(403, 152, 447, 152)
    top = table(
        ["HARNESS", "SAME CIRCUIT AT BOTH ENDS", "WIRE", "EXACT BAG / FITTED SET"],
        [
            [
                "Mains J5<br/>to controller J1",
                "1 → 1: +5 V<br/>2 → 2: GND<br/>3 → 3: COIL_DRAIN",
                "22 AWG<br/>Red / black / blue",
                "2 × 0436450300 housings<br/>6 × 0430300007 contacts<br/>(Molex 43645-0300 / 43030-0007)",
            ],
            [
                "Mains J6<br/>to controller J6",
                "1 → 1: +12 V<br/>2 → 2: GND",
                "20 AWG<br/>Red / black",
                "2 × 0430250200 housings<br/>4 × 0430300007 contacts<br/>(Molex 43025-0200 / 43030-0007)",
            ],
        ],
        188,
        [100, 131, 85, 224],
        8.9,
    )
    para(
        "Keep the 12 V pair together through its own harness. J7–J9 on the controller are "
        "future pump outputs; their pin 2 is a switched return. Feed the controller at <b>J6</b>.",
        margin, top + 11, width, 9.4,
    )

    sensor_top = 362
    para("SENSOR J1 → CONTROLLER J3", margin, sensor_top, width, 10.5, True)
    para(
        "Fit <b>1 × 0430250600</b> housing and <b>6 × 0430300007</b> contacts at the controller "
        "end (Molex 43025-0600 / 43030-0007). The sensor end solders directly to J1.",
        margin, sensor_top + 21, width, 9.4,
    )

    # Numbered solder-land symbol. This intentionally does not depict a housing.
    c.saveState()
    c.setStrokeGray(0)
    c.setFillGray(1)
    c.setLineWidth(.75)
    c.rect(103, h - 580, 48, 151, fill=0, stroke=1)
    label("OUTWARD FACE", 36, 420, 8, True)
    label("Sensor J1", 105, 565, 8, True)
    for index in range(6):
        top = 439 + index * 19
        c.rect(107, h - top - 8, 14, 8, fill=0, stroke=1)
        label(str(index + 1), 128, top - 1, 9, True)
        c.line(61, h - top - 4, 107, h - top - 4)
    arrow(94, 567, 45, 567)
    label("Exit left", 39, 581, 8.5, True)
    para("Land 1 is at the top.<br/>Solder only on this face.", 36, 609, 118, 8.8)
    c.restoreState()

    end = table(
        ["SENSOR LAND → J3", "FUNCTION", "TWISTED PAIR"],
        [
            ["1 → 1", "+5 V sensor supply", "1 + 4"],
            ["2 → 2", "SDA", "2 + 5"],
            ["3 → 3", "SCL", "3 + 6"],
            ["4 → 4", "Power ground return", "1 + 4"],
            ["5 → 5", "SDA ground return", "2 + 5"],
            ["6 → 6", "SCL ground return", "3 + 6"],
        ],
        428,
        [115, 165, 115],
        9,
        181,
    )
    para(
        "Use <b>24 AWG, three twisted pairs</b>. Identify the actual cable pairs and label both ends "
        "1–6 before separating them. Keep all three ground returns. Cut back and insulate any overall "
        "foil or drain at both ends.",
        181, end + 12, 395, 9.2,
    )
    note(
        "203.2 mm maximum, including the ends",
        "Measure from sensor solder termination to controller crimp, including internal routing and "
        "strain relief. Cut to the installed route. The ordered cable's model and specifications are "
        "unrecorded; identify its pairs and confirm contact fit before termination. Match circuit numbers, "
        "not an assumed left-to-right cavity order.",
        649,
    )


def _mains_page(api):
    page, para, table, arrow, box, label, note = (
        api[key] for key in ("page", "para", "table", "arrow", "box", "label", "note")
    )
    c, h, margin, width = (api[key] for key in ("C", "H", "M", "CW"))
    page(
        "Connect mains, filter and PE",
        "Keep every power source disconnected. This is a connection map, not a literal wire route.",
    )
    c.saveState()
    c.setStrokeGray(0)
    c.setLineWidth(.75)
    c.rect(222, h - 282, 160, 169, fill=0, stroke=1)
    label("MAINS BOARD", 236, 116, 8, True)
    for text, top in (("J1  INPUT", 138), ("J2  FILTER IN", 178),
                      ("J3  FILTER OUT", 218), ("J4  PUMP", 258)):
        label(text, 239, top - 6, 10, True)
    box("Fused IEC inlet", 36, 120, 143, 36)
    arrow(181, 138, 220, 138)
    c.rect(422, h - 238, 154, 93, fill=0, stroke=1)
    label("FN2090A-1-06", 435, 153, 10, True)
    label("LINE", 435, 173, 9, True)
    label("LOAD", 435, 213, 9, True)
    arrow(382, 178, 422, 178)
    arrow(422, 218, 382, 218)
    box("Pump pigtail", 422, 248, 154, 34)
    arrow(382, 258, 422, 258)
    para("Each arrow carries<br/>hot + neutral.", 36, 186, 143, 9.2)
    para("PE takes its own<br/>separate path below.", 36, 228, 143, 9.2)
    c.restoreState()

    end = table(
        ["MAINS BLOCK", "PIN 1 · HOT (L)", "PIN 2 · NEUTRAL (N)"],
        [
            ["J1 · INPUT", "From inlet fused L output", "From inlet N"],
            ["J2 · FILTER IN", "To filter LINE L", "To filter LINE N"],
            ["J3 · FILTER OUT", "From filter LOAD L", "From filter LOAD N"],
            ["J4 · PUMP", "To output-pigtail hot", "To output-pigtail neutral"],
        ],
        300,
        [112, 214, 214],
        9.2,
    )
    para(
        "<b>PE bypasses the boards.</b> Three separate branches meet at one covered M4 metal junction. "
        "Keep PE separate from neutral; neither PE nor neutral is switched.",
        margin, end + 15, width, 9.4,
    )
    pe_end = table(
        ["PE BRANCH", "EQUIPMENT END", "M4 JUNCTION END"],
        [
            ["Inlet PE", "TE 2-520184-2 FASTON", "TE 31886 ring"],
            ["Filter PE blade", "TE 2-520184-2 FASTON", "TE 31886 ring"],
            ["Output pigtail PE", "Existing pigtail conductor", "TE 320551 ring"],
        ],
        465,
        [132, 228, 180],
        9.2,
    )
    para(
        "<b>Offboard parts:</b> Schurter <b>6200.23</b> inlet; Littelfuse <b>0215002.MXP</b> "
        "2 A fuse; <b>3-125-661 (RC320)</b> rear cover; <b>FN2090A-1-06</b> filter; "
        "<b>1112.048.005350</b> output pigtail; <b>M3231</b> gland and <b>8463</b> locknut.",
        margin, pe_end + 14, width, 9.3,
    )
    para(
        "Fit <b>8 × TE 2-520184-2</b> insulated 6.35 mm receptacles: inlet L/N/PE (3), "
        "filter LINE/LOAD L/N (4), filter PE (1). Use <b>18 AWG, 600 V, 105 °C</b> mains/PE wire. "
        "The four <b>Phoenix Contact 1868076</b> PCB blocks take wire directly.",
        margin, 612, width, 9.3,
    )
    note(
        "Finish the lower wiring before fitting the separator",
        "Strip <b>8 mm</b>; tighten to <b>0.5–0.6 N·m</b>, supporting the terminal body. Keep filter "
        "LINE/LOAD apart and <b>8 mm</b> between primary wiring and SELV. Clamp PE rings metal-to-metal "
        "on separate insulating support; exclude plastic from the electrical clamp. Fit both covers.",
        656,
    )


def _stack_page(api):
    page, para, table, arrow, label = (
        api[key] for key in ("page", "para", "table", "arrow", "label")
    )
    c, h, margin, width = (api[key] for key in ("C", "H", "M", "CW"))
    page(
        "Combine the finished boards",
        "Controller above mains, both component sides up. Fit all primary wiring before closing the stack.",
    )

    # Vertical positions follow the installed Z values at 5 points per mm.
    # Widths are simplified side projections, not a drilling or cutting plan.
    scale = 5
    datum_top = 459

    def level(z):
        return datum_top - z * scale

    def slab(x, w, z_bottom, thickness, fill=.96):
        top = level(z_bottom + thickness)
        c.setFillGray(fill)
        c.rect(x, h - level(z_bottom), w, thickness * scale, fill=1, stroke=1)
        return top

    def leader(z, text, start, top):
        t = level(z)
        end = para(text, 385, top, 191, 9.1)
        label_midpoint = (top + end) / 2
        c.setLineWidth(.45)
        c.line(start, h - t, 360, h - t)
        c.line(360, h - t, 374, h - label_midpoint)

    c.saveState()
    c.setStrokeGray(0)
    c.setLineWidth(.65)
    label("SIDE PROJECTION · WIDTHS SIMPLIFIED", 89, 111, 8, True)
    # External insulating frame columns; the nearer pair represents all four rods.
    for x in (86, 340):
        c.setLineWidth(.6)
        c.line(x - 2, h - 128, x - 2, h - 438)
        c.line(x + 2, h - 128, x + 2, h - 438)
    slab(101, 224, 61.6, 1.6, .15)  # Upper controller PCB.
    slab(71, 280, 55.6, 3)         # Two H rails, overlaid in side projection.
    slab(80, 262, 50.1, 2, 1)      # Intact, separate separator.
    slab(101, 224, 15, 1.6, .15)   # Lower mains PCB.
    slab(65, 288, 5, 3)           # Carrier.
    for x in (109, 307):
        slab(x, 9, 58.6, 3, 1)    # Plain upper spacers.
        slab(x, 9, 8, 7, 1)       # Plain lower spacers.
    # Separator corner clamps sit on external rods, not through separator holes.
    for x in (76, 330):
        slab(x, 20, 48.1, 2)
        slab(x, 20, 52.1, 2)

    # Use an allocated supply envelope, explicitly marked, instead of invented parts.
    c.setDash(3, 2)
    c.setFillGray(1)
    c.rect(143, h - level(16.6), 134, 30.5 * scale, fill=0, stroke=1)
    c.setDash()
    para("SUPPLY HEIGHT<br/>ENVELOPE<br/>30.5 mm max.", 155, 296, 111, 9.2, True)
    arrow(189, 366, 189, 342)
    para("Components up", 203, 349, 99, 8.1)
    arrow(209, 141, 209, 123)

    upper_face = level(61.6)
    lower_face = level(16.6)
    c.setLineWidth(.5)
    c.line(49, h - upper_face, 101, h - upper_face)
    c.line(49, h - lower_face, 101, h - lower_face)
    arrow(49, upper_face, 49, lower_face)
    arrow(49, lower_face, 49, upper_face)
    c.setFillGray(1)
    c.rect(34, h - 280, 34, 38, fill=1, stroke=0)
    para("45<br/>mm", 38, 246, 28, 10.5, True)

    leader(62.4, "<b>CONTROLLER</b><br/>150 × 110 mm; components up", 325, 136)
    leader(60.1, "Plain <b>3 mm</b> spacers", 316, 166)
    leader(57.1, "Two FR-4 <b>H-shaped rails</b>", 351, 187)
    leader(51.1, "<b>Intact 2 mm separator</b><br/>158 × 118 mm; edge-clamped", 342, 214)
    para("Four external <b>M4 nylon rods</b> support the rails and separator tabs.",
         385, 264, 191, 9.1)
    para("45 mm is measured from the <b>mains top face</b> to the <b>controller underside</b>.",
         385, 307, 191, 9.1)
    leader(15.8, "<b>MAINS BOARD</b><br/>150 × 110 mm; components up", 325, 367)
    leader(11.5, "Plain <b>7 mm</b> spacers", 316, 400)
    leader(6.5, "<b>3 mm FR-4 carrier</b>", 353, 426)
    c.restoreState()

    para("COMBINE IN THIS ORDER", margin, 471, width, 10.5, True)
    end = table(
        ["STEP", "ACTION"],
        [
            ["1", "Finish mains J1–J4 wiring and all three PE branches. Fit the inlet and PE covers "
             "while the terminal screws remain accessible."],
            ["2", "Mate both internal harnesses at mains J5 and J6. Carry them around the isolated "
             "edge, clear of primary wiring and the antenna reserve."],
            ["3", "Capture the intact separator between its corner tabs. Fit the H rails, plain "
             "3 mm spacers and controller using insulating through-bolts."],
            ["4", "Mate controller J1 (5 V/coil), J6 (12 V) and J3 (sensor). Leave future "
             "reservoir J5 and pump outputs J7–J9 empty."],
        ],
        495,
        [46, 494],
        9.4,
    )
    para(
        "Use the four aligned M3 PCB positions. Keep the separator intact, with no holes or antenna "
        "notch. Use single through-bolts through plain spacers; include washers in the effective spacing. "
        "The 45 mm face gap is <b>not</b> a 45 mm spacer length.",
        margin, end + 15, width, 9.4,
    )
