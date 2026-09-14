"""Compose the reviewed Letter bench guide from purchased parts and native geometry.

Run in a Python environment with reportlab and pypdf. No KiCad mutation occurs.
"""

import hashlib
import json
import math
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, Table, TableStyle

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUT = HERE.parent / "crystal-shim-assembly-bench-guide.pdf"
GEO = json.loads((HERE / "native-geometry.json").read_text())["boards"]
PARTS = {b["id"]: b for b in json.loads((HERE / "parts.json").read_text())["boards"]}
W, H, M = 612, 792, 36
CW = W - 2 * M
FONT_PATH = Path("/System/Library/Fonts/Supplemental")
if (FONT_PATH / "Arial.ttf").exists():
    pdfmetrics.registerFont(TTFont("Bench", str(FONT_PATH / "Arial.ttf")))
    pdfmetrics.registerFont(TTFont("BenchBold", str(FONT_PATH / "Arial Bold.ttf")))
else:
    font_root = Path("/usr/share/fonts/truetype/dejavu")
    pdfmetrics.registerFont(TTFont("Bench", str(font_root / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont("BenchBold", str(font_root / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily("Bench", normal="Bench", bold="BenchBold", italic="Bench", boldItalic="BenchBold")
C = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1, invariant=1)
C.setTitle("Crystal Shim | Assembly bench guide")
C.setAuthor("Crystal Shim project")
PAGE = 0
COVERAGE = {b: set() for b in GEO}
MAP_COVERAGE = {b: set() for b in GEO}
PAGE_LOG = []
LAYOUT_WARNINGS = []


def para(text, x, top, width, size=10, bold=False, leading=None):
    style = ParagraphStyle("p", fontName="BenchBold" if bold else "Bench", fontSize=size,
                           leading=leading or size * 1.27, textColor=colors.black)
    p = Paragraph(text, style)
    _, h = p.wrap(width, H)
    if top + h > 752:
        LAYOUT_WARNINGS.append(f"Page {PAGE}: text ends at {top+h:.1f}: {text[:50]}")
    p.drawOn(C, x, H - top - h)
    return top + h


def label(text, x, top, size=9, bold=False):
    C.setFillColor(colors.black)
    C.setFont("BenchBold" if bold else "Bench", size)
    C.drawString(x, H-top-size, text)


def page(title, subtitle):
    global PAGE
    if PAGE:
        C.showPage()
    PAGE += 1
    PAGE_LOG.append({"page": PAGE, "title": title})
    label("CRYSTAL SHIM  /  ASSEMBLY", M, 20, 8, True)
    label(title, M, 43, 22, True)
    para(subtitle, M, 75, CW, 9.5)
    C.setStrokeColor(colors.black)
    C.setLineWidth(.65)
    C.line(M, 45, W-M, 45)
    label("REV 1  •  ONE SET  •  14 SEP 2026", M, 754, 7.5)
    C.setFont("BenchBold", 9)
    C.drawRightString(W-M, 29, f"{PAGE:02d}")


def note(title, text, top, x=M, width=CW):
    end = para(title, x+10, top+8, width-20, 10, True)
    end = para(text, x+10, end+4, width-20, 9.4)
    C.setStrokeColor(colors.black)
    C.setLineWidth(.55)
    C.rect(x, H-end-9, width, end-top+9, fill=0, stroke=1)
    return end + 19


def image(name, x, top, width, height):
    C.drawImage(str(HERE.parent / "assets" / name), x, H-top-height, width, height,
                preserveAspectRatio=True, anchor="c", mask="auto")


def table(headers, rows, top, widths=None, size=9, x=M):
    widths = widths or [CW/len(headers)] * len(headers)
    def cell(t, bold=False):
        return Paragraph(str(t), ParagraphStyle("cell", fontName="BenchBold" if bold else "Bench",
                         fontSize=size, leading=size*1.2))
    data = [[cell(h, True) for h in headers]] + [[cell(v) for v in row] for row in rows]
    t = Table(data, colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BACKGROUND", (0,0), (-1,0), colors.Color(.9,.9,.9)),
        ("LINEBELOW", (0,0), (-1,0), .6, colors.black),
        ("LINEBELOW", (0,1), (-1,-1), .25, colors.Color(.72,.72,.72)),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
        ("TOPPADDING", (0,0), (-1,-1), 5), ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    _, height = t.wrap(sum(widths), H)
    if top+height > 746:
        LAYOUT_WARNINGS.append(f"Page {PAGE}: table ends at {top+height:.1f}")
    t.drawOn(C, x, H-top-height)
    return top+height


def natural(s):
    return [int(c) if c.isdigit() else c for c in re.split(r"(\d+)", s)]


def physical(board):
    return {r for g in PARTS[board]["groups"] for r in g["refs"]}


def part_table(board, refs, top, width=CW, x=M, size=9):
    rows = []
    for group in PARTS[board]["groups"]:
        selected = sorted(set(group["refs"]) & set(refs), key=natural)
        if not selected:
            continue
        method = "IRON" if group["method"] == "iron" else "SMT*" if group["method"] == "mixed" else "SMT"
        value = escape(group["value"])
        if group["purchased_mpn"] == "HLMP-1790":
            value = "Green LED"
        pkg = escape(group["package"])
        detail = pkg if group["value"] in (group["purchased_mpn"], group["design_mpn"]) else f"{value} · {pkg}"
        rows.append([", ".join(selected), escape(group["purchased_mpn"]), detail, f"{len(selected)} {method}"])
        COVERAGE[board].update(selected)
    return table(["PLACE AT", "EXACT BAG / PART NUMBER", "VALUE / BODY", "QTY"], rows, top,
                 [width*.205, width*.37, width*.425-52, 52], size, x)


def intersects(a, b, gap=0):
    return a[0] < b[2]+gap and a[2]+gap > b[0] and a[1] < b[3]+gap and a[3]+gap > b[1]


def board_map(board, box, region=None, refs=None, labels=True, fontsize=8.5, overview=False):
    """Draw native pads/F.Fab segments with non-mirrored component-side coordinates."""
    data = GEO[board]
    region = region or ((91, 68, 109, 132) if board == "sensor" else (25,45,175,155))
    x0,y0,x1,y1 = region
    bx,bt,bw,bh = box
    scale = min((bw-8)/(x1-x0),(bh-8)/(y1-y0))
    ox = bx+(bw-(x1-x0)*scale)/2
    oy = H-bt-(bh-(y1-y0)*scale)/2
    def pt(v): return (ox+(v[0]-x0)*scale,oy-(v[1]-y0)*scale)
    wanted = set(refs) if refs is not None else physical(board)
    C.saveState()
    clip = C.beginPath(); clip.rect(bx,H-bt-bh,bw,bh); C.clipPath(clip,stroke=0)
    C.setLineWidth(.8); C.setStrokeColor(colors.Color(.4,.4,.4))
    for sh in data["outline"]:
        if sh["kind"] == 0:
            C.line(*pt(sh["start"]),*pt(sh["end"]))
    bodies, centers, part_boxes = [], {}, {}
    for f in data["components"]:
        ref=f["ref"]
        if ref == "E1" or ref.startswith("TP"):
            continue
        visible = ref in wanted
        points=[]
        fab=[s for s in f["shapes"] if s["layer"] == "F.Fab"]
        C.setStrokeColor(colors.Color(*((.14,)*3 if visible else (.72,)*3)))
        C.setLineWidth(.55 if visible else .35)
        for sh in fab:
            if sh["kind"] == 0:
                C.line(*pt(sh["start"]),*pt(sh["end"]))
                points.extend([pt(sh["start"]),pt(sh["end"])])
        for p in f["pads"]:
            if "F.Cu" not in p["layers"] and p["drill"] == [0,0]:
                continue
            px,py=pt(p["position"])
            ww,hh=[a*scale for a in p["size"]]
            C.saveState(); C.translate(px,py); C.rotate(p["angle"])
            C.setFillColor(colors.Color(*((.87,)*3 if visible else (.96,)*3)))
            C.setStrokeColor(colors.Color(*((.18,)*3 if visible else (.76,)*3)))
            C.setLineWidth(.4 if visible else .25)
            if p["shape"]==0:
                C.ellipse(-ww/2,-hh/2,ww/2,hh/2,fill=1,stroke=1)
            else:
                C.roundRect(-ww/2,-hh/2,ww,hh,min(ww,hh)*.16,fill=1,stroke=1)
            dw,dh=[a*scale for a in p["drill"]]
            if dw and dh:
                C.setFillColor(colors.white)
                C.roundRect(-dw/2,-dh/2,dw,dh,min(dw,dh)/2,fill=1,stroke=1)
            C.restoreState()
            theta=math.radians(p["angle"])
            pw=abs(ww*math.cos(theta))+abs(hh*math.sin(theta))
            ph=abs(ww*math.sin(theta))+abs(hh*math.cos(theta))
            points.extend([(px-pw/2,py-ph/2),(px+pw/2,py+ph/2)])
        if not points:
            continue
        bb=(min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points))
        bodies.append(bb)
        part_boxes[ref]=bb
        centers[ref]=((bb[0]+bb[2])/2,(bb[1]+bb[3])/2)
        # Board-specific pin 1 / cathode at the actual copper centre.
        if visible and ref[0] in "UQD" and not overview:
            p1=next((p for p in f["pads"] if p["number"]=="1"),None)
            if p1:
                px,py=pt(p1["position"])
                C.setFillColor(colors.black); C.circle(px,py,1.7,fill=1,stroke=0)
        if visible and ref.startswith("J") and not overview:
            for p in f["pads"]:
                if p["number"] in ("1","2","3","4","5","6") and not (board=="controller" and ref=="J4") and p["drill"]!=[0,0]:
                    px,py=pt(p["position"])
                    C.setFont("BenchBold",max(5.5,min(8,scale*1.2)))
                    C.setFillColor(colors.black)
                    C.drawCentredString(px,py-2,p["number"])
    placed=[]
    if labels:
        ordered=sorted(wanted, key=lambda r:(-(part_boxes.get(r,(0,0,0,0))[2]-part_boxes.get(r,(0,0,0,0))[0]),natural(r)))
        for ref in ordered:
            if ref not in centers: continue
            cx,cy=centers[ref]
            if not bx<cx<bx+bw or not H-bt-bh<cy<H-bt: continue
            bwref=pdfmetrics.stringWidth(ref,"BenchBold",fontsize)+5
            hh=fontsize+4
            bb=part_boxes[ref]
            candidates=[]
            if bb[2]-bb[0] > bwref+5 and bb[3]-bb[1] > hh+4:
                candidates.append((cx,cy,True))
            for dist in (4,12,22,34,48,64):
                candidates.extend([(cx,bb[3]+dist+hh/2,False),(cx,bb[1]-dist-hh/2,False),
                                   (bb[0]-dist-bwref/2,cy,False),(bb[2]+dist+bwref/2,cy,False),
                                   (cx+bwref/2+dist,bb[3]+hh/2+dist,False),
                                   (cx-bwref/2-dist,bb[1]-hh/2-dist,False)])
            best=None
            for xx,yy,inside in candidates:
                rect=(xx-bwref/2,yy-hh/2,xx+bwref/2,yy+hh/2)
                if rect[0]<bx+2 or rect[2]>bx+bw-2 or rect[1]<H-bt-bh+2 or rect[3]>H-bt-2:continue
                clashes=sum(intersects(rect,p,1) for p in placed)
                bodyhits=sum(intersects(rect,b,1) for b in bodies if not(inside and b==bb))
                cost=clashes*10000+bodyhits*500+math.hypot(xx-cx,yy-cy)
                if best is None or cost<best[0]: best=(cost,xx,yy,rect,inside)
            if best is None: continue
            _,xx,yy,rect,inside=best
            if any(intersects(rect,p) for p in placed):
                LAYOUT_WARNINGS.append(f"Page {PAGE}: map label overlap {board}/{ref}")
            if not inside:
                C.setStrokeColor(colors.Color(.35,.35,.35));C.setLineWidth(.4)
                C.line(cx,cy,xx,yy)
            C.setFillColor(colors.white);C.rect(rect[0],rect[1],bwref,hh,fill=1,stroke=0)
            C.setFillColor(colors.black);C.setFont("BenchBold",fontsize)
            C.drawCentredString(xx,yy-fontsize*.34,ref)
            placed.append(rect)
            MAP_COVERAGE[board].add(ref)
    C.restoreState()
    return pt


def arrow(x1,t1,x2,t2,label_text=None):
    y1,y2=H-t1,H-t2
    C.setStrokeColor(colors.black);C.setFillColor(colors.black);C.setLineWidth(1)
    C.line(x1,y1,x2,y2)
    a=math.atan2(y2-y1,x2-x1)
    p=C.beginPath();p.moveTo(x2,y2)
    p.lineTo(x2-7*math.cos(a-.45),y2-7*math.sin(a-.45))
    p.lineTo(x2-7*math.cos(a+.45),y2-7*math.sin(a+.45));p.close();C.drawPath(p,fill=1,stroke=0)
    if label_text: label(label_text,(x1+x2)/2+5,(t1+t2)/2-12,9,True)


def box(text, x, top, width, height=36):
    C.setStrokeColor(colors.black);C.setLineWidth(.7)
    C.rect(x,H-top-height,width,height,fill=0,stroke=1)
    para(text,x+8,top+8,width-16,10,True)


def controller_regions():
    regions={a:[] for a in ("A","B","C","D","E")}
    for f in GEO["controller"]["components"]:
        if f["ref"] not in physical("controller"):continue
        x,y=f["position"]
        region = "E" if x>140 else ("A" if x<80 else "B") if y<92 else "C" if x<99 else "D"
        regions[region].append(f["ref"])
    return regions


def build():
    # One pass per board, all on the component face. Printed art is conceptual;
    # every placement map and polarity location is sourced from native KiCad.
    page("Start with the flat parts", "Stencil + hot bed first. Iron after cooling. Build one sensor, one controller and one mains board.")
    image("stencil-workflow.png",M,105,CW,350)
    table(["1  ALIGN", "2  PASTE", "3  PLACE", "4  REFLOW + COOL"], [[
        "Support the bare board level. Tape the 0.10 mm top stencil as a hinge; align every opening with its pad.",
        "Pull one thin, even print. Lift vertically. Correct a smeared print before placing components.",
        "Use labelled bags and the placement maps. Small ICs and passives first, then larger SMT parts.",
        "Use the paste maker’s temperature profile. Measure board temperature. Let solder solidify before moving."
    ]],464,size=9)
    y=note("The order for this build", "Sensor SMT → controller SMT → mains SMT → all iron work → harnesses → lower board wiring → separator → controller. Each board is a separate hot-bed run.",590)
    note("Keep this beside the bench", "All assembly is unpowered. Leave firmware, power-up, testing and tank mounting for our interactive sessions. Quantities here make <b>one set</b>, even though five bare boards of each type were ordered.",y)

    page("Recognize the SMT packages", "Drawings identify package families. The bag’s exact MPN determines the part; similar-looking parts are not interchangeable.")
    image("smt-identification.png",M,112,CW,360)
    table(["PICTURE", "WHAT YOU WILL SEE", "USE THE MAP FOR…"],[
        ["1  Chip passives", "Resistors; unmarked ceramic capacitors. All are nonpolar.", "Exact value and size. 0603, 0805, 1206 and 1210 are different bodies."],
        ["2  Diode", "STPS2L40U and SMBJ7.0A have a cathode band.", "Band at the black dot on D references."],
        ["3  Three leads", "AO3400A transistors Q1–Q4 on the controller.", "Two-leg side down, lone leg up in the top-view maps."],
        ["4  Small IC", "Five- and six-lead ICs share this general outline.", "Exact MPN and manufacturer’s pin-1 identifier."],
        ["5  Fine-pitch IC", "FDC1004 and FSUSB42 are ten-lead parts; TCA9517 has eight.", "Pin 1. Do not use body text direction as the orientation cue."],
        ["6  Inductor", "SRP5030TA-4R7M, one on each large board; nonpolar.", "Controller L1 and mains L1."]
    ],484,[90,224,226],8.8)
    note("Map key", "All maps look down at the component side and are <b>never mirrored</b>. A black dot marks IC/MOSFET <b>pin 1</b> or diode/LED <b>cathode</b>. Pale outlines are neighbouring parts. Drawings are enlarged, not solder stencils.",679)

    page("Sensor  /  all 14 parts reflow", "Electronics face toward you, RIM edge at the top. The six left-hand lands get wires later, with the iron.")
    board_map("sensor",(M,117,210,340),region=(90,67,111,96),fontsize=9.5)
    note("Orientation", "U1, U2 and U3: pin 1 is upper left.<br/>D2: cathode band goes left.<br/><br/>C1/C2 are the purchased <b>CL31B106KLHNNNE</b> capacitors.",125,x=264,width=312)
    note("Leave these flat", "J1 is six wire lands, not a header. E1 is built-in sensing copper on the back. Put no paste, tin or components on the sensing face.",260,x=264,width=312)
    label("ENLARGED ELECTRONICS AREA  /  TOP OF THE 18 × 64 mm BOARD",M,468,8,True)
    y=part_table("sensor",physical("sensor"),490,size=8.5)

    regions=controller_regions()
    ctrl_iron={r for g in PARTS["controller"]["groups"] if g["method"]=="iron" for r in g["refs"]}
    regions={code:[r for r in refs if r not in ctrl_iron] for code,refs in regions.items()}
    splitB={"B1":[],"B2":[]}
    for f in GEO["controller"]["components"]:
        if f["ref"] in regions["B"]:
            splitB["B1" if (f["position"][1]<66.1 or f["ref"]=="U1") else "B2"].append(f["ref"])
    page("Controller  /  iron parts + area map", "White board. ESP antenna at the top; USB at the bottom. Reflow first; fit the 12 iron-only parts below afterward.")
    pt=board_map("controller",(M,111,CW,374),refs=ctrl_iron,fontsize=8.7)
    for name,region in [("A",(43,52,79.5,92)),("B1",(100,39,139,66)),("B2",(79.5,66,138,92)),
                        ("C",(48,92,97,151)),("D",(100,97,134,157)),("E",(144,89,170,148))]:
        x0,y0=pt(region[:2]);x1,y1=pt(region[2:])
        C.setStrokeColor(colors.black);C.setLineWidth(1);C.setDash(3,2)
        C.rect(x0,y1,x1-x0,y0-y1,fill=0,stroke=1);C.setDash()
        C.setFillColor(colors.white);C.rect(x0+3,y0-18,25,15,fill=1,stroke=0)
        C.setFillColor(colors.black);C.setFont("BenchBold",12);C.drawString(x0+5,y0-15,name)
    para("A: relay + reservoir  ·  B1: ESP  ·  B2: tank interface  ·  C: power  ·  D: USB  ·  E: pumps",M,496,CW,8.5,True)
    y=part_table("controller",ctrl_iron,518,size=8.5)
    note("Iron-part orientation", "J1/J3/J5 mouths up; J2/J6 down; J7–J9 right. D4 cathode left. Buttons top to bottom: SW3 RESET, SW2 BOOT, SW1 MAINTENANCE. Fit all 12 parts; TP1–TP14 and H1–H4 get no parts.",y+10)

    details=[
        ("A",regions["A"],(43,53,80,92),"Relay + reservoir interface",
         "U4 and U12: pin 1 upper left. U13: pin 1 lower left. D8 band up. Q1 two-leg side down.",
         "R14 is the precision 95.3 kΩ part; R15 is the precision 10 kΩ ERA part. Keep it separate from ordinary ERJ 10 kΩ resistors."),
        ("B1",splitB["B1"],(98,38,139,67),"ESP module + nearby passives",
         "U1 pin 1 is the uppermost left perimeter pad. The antenna projects beyond the board’s top edge.",
         "Print the existing nine underside ground openings. Reflow U1 with the other SMT parts; perimeter-only iron soldering would leave hidden grounds unsoldered."),
        ("B2",splitB["B2"],(79,64,138,92),"Tank sensor interface + LED",
         "U3/U5 pin 1 upper left; U6/U11 pin 1 lower left. D7 band up. D4 cathode is the left lead.",
         "D4 is the purchased HLMP-1790 LED. Fit it with the iron after reflow. J3’s mating mouth faces the top edge."),
        ("C",regions["C"],(48,91,98,151),"Power + service connectors",
         "U2 pin 1 upper left. D1 band right; D2 band up. J2 and J6 mating mouths face the bottom edge.",
         "Controller U2 is AP63203WU-7, the 3.3 V regulator. Mains U2 is AP63205WU-7. Their packages look the same; keep their bags separate."),
        ("D",regions["D"],(99,95,135,157),"USB + pushbuttons",
         "U7 pin 1 lower right; U8/U9 pin 1 lower left. USB mouth faces the bottom edge.",
         "J4: reflow the signal contacts, then iron-solder all four shell tabs. Keep the supplied stencil’s duplicate-contact exclusions. Buttons top to bottom: SW3 RESET, SW2 BOOT, SW1 MAINTENANCE."),
        ("E",regions["E"],(143,87,171,148),"Three pump drivers",
         "D9/D10/D11 cathode bands point down. Q2/Q3/Q4 two-leg sides point down; lone drain legs point up.",
         "Populate all three driver circuits. Iron-solder J7–J9 with mouths toward the right edge. These accessory outputs remain unplugged in the present skimmer build."),
    ]
    for code,refs,region,title,orientation,instruction in details:
        page(f"Controller {code}  /  {title}", "Stencil + hot bed. Iron-only parts are listed on page 4. Qty applies only to this map.")
        # Tall narrow regions leave room for readable technique notes beside them.
        if code in ("C","D","E"):
            board_map("controller",(M,110,290,380),region,refs,fontsize=10)
            note("Orientation",orientation,117,x=343,width=233)
            note("Assembly",instruction,253,x=343,width=233)
            table_top=507
        else:
            board_map("controller",(M,109,CW,270),region,refs,fontsize=8.8)
            para(orientation,M,385,CW,9.2,True)
            table_top=418
        y=part_table("controller",refs,table_top,size=8.3)
        if code not in ("C","D","E"):
            para(instruction,M,y+10,CW,9)

    mainsSMT={r for g in PARTS["mains"]["groups"] if g["method"]!="iron" for r in g["refs"]}
    mainsIron=physical("mains")-mainsSMT
    page("Mains  /  nine SMT parts first", "Blue board. Reflow the small power-supply area before fitting the tall components.")
    board_map("mains",(M,110,220,165),labels=False)
    note("Find this corner", "The SMT group is on the right, above the relay. U2 is <b>AP63205WU-7 (5 V)</b>. Pin 1 goes upper left. F2 is the flat 3 A SMT fuse.",116,x=277,width=299)
    board_map("mains",(M,281,CW,230),region=(137,89,170,122),refs=mainsSMT,fontsize=10)
    y=part_table("mains",mainsSMT,526,size=9)
    note("Keep the hot-bed pass flat", "Leave U1, K1, RV1, F3, C1, D1, R1 and all six headers off until reflow is finished and the board has cooled.",y+12)

    page("Recognize the iron-soldered parts", "Generic body shapes, not pin-layout drawings. Exact positions and orientations are on the board maps.")
    image("through-hole-identification.png",M,109,CW,360)
    table(["PICTURE", "EXACT PART", "PLACE AT"],[
        ["1  Axial bodies", "PR02FS0201000KR500 · 100 Ω fusible resistor<br/>1N4007-E3/54 · banded diode", "Mains R1<br/>Mains D1"],
        ["2  Disc + box", "TMOV14RP175E · thermal MOV<br/>B32921C3473K000 · 47 nF safety capacitor", "Mains RV1<br/>Mains C1"],
        ["3  Relay", "G5RL-1A-TV8 DC5 · 5 V coil", "Mains K1"],
        ["4  AC/DC module", "IRM-45-12 · large encapsulated PSU", "Mains U1"],
        ["5  Screw terminals", "1868076 · two positions, right-angle wire entry", "Mains J1–J4"],
        ["6  LED + buttons", "HLMP-1790 · green 3 mm LED<br/>B3F-1002-G · four-lead pushbuttons", "Controller D4<br/>Controller SW1–SW3"]
    ],483,[107,305,128],9)
    note("Other iron parts", "F3 is the leaded 0215001.MXEP fuse. Molex and JST board connectors are keyed plastic housings with solder tails. Use each map’s mating-direction cue and the board’s body outline; do not force a rotated connector.",683)

    page("Mains  /  fit the tall parts", "Iron only. All parts sit on the component side; solder their leads from the back.")
    board_map("mains",(M,109,CW,347),refs=mainsIron,fontsize=10)
    y=part_table("mains",mainsIron,470,size=8.8)
    para("D1 band left. Relay coil pins right. PSU AC pins left, DC pins lower right. J1/J2 mouths left; J3/J4 mouths down; J5/J6 mouths right. See the next page for F3 and RV1 seating.",M,y+9,CW,9)

    page("Iron work  /  fit, solder, trim", "After each board has cooled, fit low through-hole parts first and the largest bodies last.")
    image("iron-workflow.png",M,108,CW,310)
    table(["5  FIT + SOLDER", "6  TRIM + FINISH"],[
        ["Fit one part, secure it, and turn the board over. Heat pad and lead together, then feed solder into the joint. Keep the board supported clear of its components.",
         "Cut the lead above the solder fillet; hold the offcut. Keep mains lead/solder projections within 2 mm of the underside. Clean SMT work before installing the non-washable switches and relay."]
    ],435,[270,270],9.4)
    y=note("F3: axial T1A fuse  /  0215001.MXEP", "Seat the fuse at least 1.5 mm above the board. Make bends more than 1 mm from its end caps. Its maker specifies an iron at 350 °C ±5 °C for at most 5 seconds. Do not reflow it.",529)
    y=note("RV1: thermal MOV  /  TMOV14RP175E", "Fit after reflow. Keep its unbent, staggered leads; rotate the upright body to match the round hole and slot. Support 0.5–1.0 mm above the board and heat-sink each lead while soldering. Do not force or reshape the leads.",y)
    para("RV1 final fit: upright within 5°, yaw at most 35°, top at most 26 mm above the PCB; entire body/leads/solder stay inside its 27 × 27 mm assembly envelope. Keep solder and offcuts out of isolation gaps.",M,y+2,CW,9)

    from connection_pages import build_connection_pages
    build_connection_pages(globals())
    C.save()
    expected={b:physical(b) for b in GEO}
    assert COVERAGE==expected, {b:sorted(expected[b]-COVERAGE[b]) for b in GEO}
    assert all(expected[b] <= MAP_COVERAGE[b] for b in GEO), {b:sorted(expected[b]-MAP_COVERAGE[b]) for b in GEO}
    for board,d in GEO.items():
        assert hashlib.sha256((ROOT/d["source"]).read_bytes()).hexdigest()==d["sha256"],f"Stale native geometry: {board}"
    from pypdf import PdfReader
    pdf=PdfReader(OUT)
    text="\n".join(p.extract_text() for p in pdf.pages)
    assert len(pdf.pages)==PAGE
    for board in PARTS.values():
        for g in board["groups"]:
            assert g["purchased_mpn"] in text, f"MPN missing from PDF: {g['purchased_mpn']}"
    receipt={"pages":PAGE,"component_placements":sum(map(len,COVERAGE.values())),
             "coverage":{b:len(COVERAGE[b]) for b in GEO},"page_index":PAGE_LOG,
             "native_hashes":{b:d["sha256"] for b,d in GEO.items()},
             "pdf_sha256":hashlib.sha256(OUT.read_bytes()).hexdigest(),"layout_warnings":LAYOUT_WARNINGS}
    (HERE/"build-receipt.json").write_text(json.dumps(receipt,indent=2)+"\n")
    print(json.dumps(receipt,indent=2))
    assert not LAYOUT_WARNINGS,"Resolve layout warnings before printing"


if __name__ == "__main__":
    build()
