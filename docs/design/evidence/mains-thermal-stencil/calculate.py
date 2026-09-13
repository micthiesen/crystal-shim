#!/usr/bin/env python3
"""Reproduce U2 geometry, stencil and bounded loss screens using stdlib only.

Run from any directory. --check checks current receipts without writing them.
Source geometry is collected separately by collect-source.ts; no native export.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]


def area(points):
    return abs(sum(a[0] * b[1] - b[0] * a[1]
                   for a, b in zip(points, points[1:] + points[:1]))) / 2


def segment_distance(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    length2 = dx * dx + dy * dy
    t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2)) if length2 else 0
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def polygon_distance(p, points):
    # Signed distance, with an independent ray-cast inside check.
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        if (a[1] > p[1]) != (b[1] > p[1]):
            cross = a[0] + (p[1] - a[1]) * (b[0] - a[0]) / (b[1] - a[1])
            if p[0] < cross:
                inside = not inside
    d = min(segment_distance(p, a, b) for a, b in zip(points, points[1:] + points[:1]))
    return -d if inside else d


def land_distance(p, land):
    if land["shape"] == "polygon":
        return polygon_distance(p, [(q["x"], q["y"]) for q in land["points"]])
    r = land.get("cornerRadius", 0)
    qx = abs(p[0] - land["x"]) - (land["width"] / 2 - r)
    qy = abs(p[1] - land["y"]) - (land["height"] / 2 - r)
    return math.hypot(max(qx, 0), max(qy, 0)) + min(max(qx, qy), 0) - r


def rounded_rect_area(w, h, r):
    return w * h - (4 - math.pi) * r * r


def l_polygon(paste=False):
    # TI top-left pin 1. Five convex R0.05 corners; sharp re-entrant corner.
    inner = -0.825 if paste else -0.85
    left_stem = inner + 0.05
    top_bar = inner + 0.05
    arcs = [(left_stem, -1.15, 180), (-0.65, -1.15, 270),
            (-0.65, -0.6, 0), (-1.15, -0.6, 90), (-1.15, top_bar, 180)]
    result = []
    for x, y, start in arcs:
        for i in range(17):
            angle = math.radians(start + 90 * i / 16)
            result.append([round(x + 0.05 * math.cos(angle), 9),
                           round(y + 0.05 * math.sin(angle), 9)])
    result.append([inner, inner])
    return result


def assert_close(a, b, tol=1e-8):
    assert abs(a - b) <= tol, (a, b)


def calculate(source):
    lands = source["pattern"]["pads"]
    assert source["pattern"]["id"] == "TPS259470ARPWR"
    assert source["placement"] == {"pcbX": -21, "pcbY": -27, "pcbRotation": 0, "layer": "top"}
    assert len(lands) == len(source["compiled_lands"]) == 10
    assert {p["number"] for p in lands} == {str(n) for n in range(1, 11)}
    for path, digest in source["source_hashes"].items():
        assert hashlib.sha256((ROOT / path).read_bytes()).hexdigest() == digest, path
    # Independently check actual compiler geometry against the body-centred model.
    for land, compiled in zip(lands, source["compiled_lands"]):
        assert compiled["port_hints"] == ["pin" + land["number"]]
        assert_close(compiled["soldermask_margin"], 0.05)
        assert compiled["shape"] == land["shape"]
        if land["shape"] == "polygon":
            assert len(compiled["points"]) == len(land["points"])
            for actual, model in zip(compiled["points"], land["points"]):
                assert_close(actual["x"], -21 + model["x"])
                assert_close(actual["y"], -27 - model["y"])
        else:
            for key in ("width", "height"):
                assert_close(compiled[key], land[key])
            assert_close(compiled["corner_radius"], land["cornerRadius"])
            assert_close(compiled["x"], -21 + land["x"])
            assert_close(compiled["y"], -27 - land["y"])

    # Geometry selected for this two-layer board, not the controller via-in-pad array.
    vias = [{"pin": pin, "net": net, "x": sign * 0.7, "y": y,
             "drill_mm": 0.3, "diameter_mm": 0.6}
            for pin, net, sign in [("5", "V5_RAW", -1), ("6", "V5_PSU", 1)]
            for y in [-2.7, -1.9, 1.9, 2.7]]
    via_checks = []
    for v in vias:
        p = (v["x"], v["y"])
        nearest = min((land_distance(p, land), land["number"]) for land in lands)
        other = min(math.hypot(v["x"] - w["x"], v["y"] - w["y"])
                    for w in vias if w["net"] != v["net"])
        via_checks.append({**v, "source_xy_mm": [-21 + v["x"], -27 - v["y"]],
                           "nearest_source_pin": nearest[1],
                           "copper_to_source_copper_mm": nearest[0] - 0.3,
                           "drill_to_source_mask_mm": nearest[0] - 0.15 - 0.05,
                           "via_copper_to_source_mask_mm": nearest[0] - 0.3 - 0.05,
                           "other_net_via_copper_gap_mm": other - 0.6})
    escapes = []
    for pin, net, sign in [("5", "V5_RAW", -1), ("6", "V5_PSU", 1)]:
        for side in [-1, 1]:
            points = [[sign * 0.25, side * 1.1], [sign * 0.25, side * 1.45],
                      [sign * 0.7, side * 1.9], [sign * 0.7, side * 2.7]]
            # Sampling yields a conservative lower bound: subtract half the
            # largest interval, using the 1-Lipschitz distance-to-set property.
            gap, max_step = math.inf, 0
            for a, b in zip(points, points[1:]):
                count = math.ceil(math.dist(a, b) / 0.001)
                max_step = max(max_step, math.dist(a, b) / count)
                for i in range(count + 1):
                    p = [a[j] + (b[j] - a[j]) * i / count for j in [0, 1]]
                    gap = min(gap, *(land_distance(p, land) - 0.15
                                    for land in lands if land["number"] != pin))
            escapes.append({"pin": pin, "net": net, "width_mm": 0.3,
                            "native_local_points_mm": points,
                            "length_mm": sum(math.dist(a, b) for a, b in zip(points, points[1:])),
                            "other_source_copper_gap_lower_bound_mm": gap - max_step / 2})

    corner_copper = area([(p["x"], p["y"]) for p in lands[0]["points"]])
    assert_close(corner_copper, area(l_polygon()))
    corner_paste = area(l_polygon(True))
    # Independent analytic area: L union minus loss at five convex round corners.
    analytic_corner_paste = 0.6 * 0.275 + 0.225 * 0.65 - 0.225 * 0.275 - 5 * (1 - math.pi / 4) * 0.05**2
    assert abs(corner_paste - analytic_corner_paste) < 0.00002
    power_copper = rounded_rect_area(0.3, 2.4, 0.05)
    power_window = rounded_rect_area(0.28, 1.06, 0.05)
    signal_area = rounded_rect_area(0.6, 0.25, 0.05)
    stencil = {"thickness_mm": 0.1, "physical_apertures": 12,
               "corner_copper_area_mm2": corner_copper,
               "corner_paste_area_mm2": corner_paste,
               "corner_coverage_percent": 100 * corner_paste / corner_copper,
               "power_copper_area_mm2": power_copper,
               "power_window_area_mm2": power_window,
               "power_paste_area_per_pin_mm2": 2 * power_window,
               "power_coverage_percent": 100 * 2 * power_window / power_copper,
               "power_window_volume_mm3": 0.1 * power_window,
               "signal_paste_area_mm2": signal_area,
               "total_paste_area_mm2": 4 * (corner_paste + power_window + signal_area),
               "total_nominal_wet_paste_volume_mm3": 0.4 * (corner_paste + power_window + signal_area),
               "split_power_window_gap_mm": 0.2,
               "opposite_power_window_gap_mm": 0.22,
               "corner_pin1_polygon_mm": l_polygon(True)}

    vin, load, iq, ron = 5.3625, 0.850, 610e-6, 0.045
    delta_r = 0.001 + 25e-6 * 25
    ilim_min = 3334 / (2870 * (1 + delta_r)) * 0.90
    ilim_max = 3334 / (2870 * (1 - delta_r)) * 1.10
    hot_delta_r = 0.001 + 25e-6 * 100
    hot_ilim = [3334 / (2870 * (1 + hot_delta_r)) * 0.90,
                3334 / (2870 * (1 - hot_delta_r)) * 1.10]
    slew = {"slow": 2000 / 4700 * (0.81 / 2.21) / 1.05,
            "nominal": 2000 / 4700,
            "fast": 2000 / 4700 * (3.82 / 2.21) / 0.95}
    cap = 150e-6
    startup = []
    for name, rate in slew.items():
        sr = rate * 1000
        t = vin / sr
        i = load + cap * sr
        peak = vin * i + vin * iq
        energy = cap * vin**2 / 2 + load * vin**2 / (2 * sr) + vin * iq * t
        # Trapezoidal integration of the independent linear voltage-drop model.
        count = 1000
        sampled = sum((vin - sr * t * k / count) * i + vin * iq
                      for k in range(1, count))
        numeric = (sampled + (peak + vin * iq) / 2) * t / count
        assert_close(numeric, energy)
        startup.append({"corner": name, "slew_V_per_ms": rate, "duration_ms": t * 1000,
                        "capacitive_current_A": cap * sr, "total_current_A": i,
                        "peak_device_power_W": peak, "average_device_power_W": energy / t,
                        "device_energy_J": energy, "margin_to_min_current_limit_A": ilim_min - i})
    normal_power = load**2 * ron + vin * iq
    recovery = []
    for current in [ilim_min, ilim_max]:
        time = cap * vin / (current - load)
        recovery.append({"current_limit_A": current, "duration_ms": time * 1000,
                         "peak_device_power_W": vin * current + vin * iq,
                         "device_energy_J": current * cap * vin**2 / (2 * (current - load)) + vin * iq * time})
    # Copper conduction proxy only. 20% width/thickness allowances are deliberately
    # explicit project sensitivities, not vendor guaranteed minima.
    rho50 = 1.724e-8 * (1 + 0.00393 * 30)
    pad_resistance = rho50 * 0.0024 / (0.0003 * 0.000035)
    copper_proxy = {"copper_resistivity_at_50C_ohm_m": rho50,
                    "end_to_end_power_land_resistance_ohm": pad_resistance,
                    "both_end_feed_worst_centre_gradient_V_at_850mA": load * pad_resistance / 4,
                    "both_land_loss_W_at_850mA": 2 * load**2 * pad_resistance / 4,
                    "gradient_with_20pct_width_and_thickness_reduction_V": load * pad_resistance / (4 * 0.8**2),
                    "gradient_at_1_7A_with_same_reductions_V": 1.7 * pad_resistance / (4 * 0.8**2)}
    result = {"schema": "crystal-shim.mains-thermal-calculation.v1",
              "source_receipt_sha256": hashlib.sha256((HERE / "source-geometry.json").read_bytes()).hexdigest(),
              "assumptions": {"voltage_normal_V": [4.6375, vin], "enclosure_air_C": [0, 50],
                              "continuous_load_allocation_A": load, "startup_capacitance_max_allocation_F": cap,
                              "ron_model_ohm": ron, "quiescent_max_A": iq,
                              "layers": 2, "nominal_board_thickness_mm": 1.6,
                              "finished_thickness_model_mm": [1.44, 1.76],
                              "outer_copper_nominal_mm": 0.035, "junction_design_limit_C": 125},
              "normal": {"voltage_drop_model_V": load * ron, "device_power_model_W": normal_power,
                         "max_effective_theta_for_125C_at_50C_C_per_W": 75 / normal_power,
                         "theta_sensitivity_not_board_prediction": [{"theta_C_per_W": r, "junction_C": 50 + normal_power * r}
                                                                    for r in [41.7, 74.5, 150, 300]]},
              "current_limit_A": [ilim_min, ilim_max], "startup": startup,
              "current_limit_with_program_resistor_up_to_125C_sensitivity_A": hot_ilim,
              "ov_recovery_850mA_constant_load_model": recovery,
              "fault": {"normal_vin_short_power_W": vin * ilim_max + vin * iq,
                        "normal_vin_short_power_with_hot_program_resistor_W": vin * (hot_ilim[1] + iq),
                        "highest_static_ovlo_voltage_5_927V_power_W": 5.927 * (ilim_max + iq),
                        "unclamped_6_75V_sensitivity_power_W": 6.75 * (ilim_max + iq),
                        "energy_J_per_10ms_at_normal_vin_short": 0.01 * (vin * ilim_max + vin * iq),
                        "retry_sensitivity_not_guarantee": [{"on_ms": t, "cooldown_ms_assumed": 0,
                                                            "off_ms_typical": 110,
                                                            "average_W": (vin * ilim_max) * t / (t + 110)}
                                                           for t in [1, 10, 100]]},
              "copper_gradient_proxy": copper_proxy, "stencil": stencil,
              "vias": via_checks, "top_escapes": escapes,
              "via_aspect_ratio_nominal": 1.6 / 0.3, "via_aspect_ratio_max_thickness": 1.76 / 0.3}
    assert min(v["copper_to_source_copper_mm"] for v in via_checks) > 0.35
    assert min(v["drill_to_source_mask_mm"] for v in via_checks) > 0.49
    assert min(v["other_net_via_copper_gap_mm"] for v in via_checks) > 0.79
    assert min(e["other_source_copper_gap_lower_bound_mm"] for e in escapes) > 0.19
    assert max(s["total_current_A"] for s in startup) < ilim_min
    assert 93 < stencil["corner_coverage_percent"] < 94
    assert 82 < stencil["power_coverage_percent"] < 83
    return result


def operations(result):
    apertures = []
    for pin, sx, sy in [("1", 1, 1), ("4", 1, -1), ("7", -1, -1), ("10", -1, 1)]:
        apertures.append({"pin": pin, "shape": "polygon", "points_mm": [
            [sx * x, sy * y] for x, y in result["stencil"]["corner_pin1_polygon_mm"]]})
    for pin, x, y in [("2", -0.9, -0.225), ("3", -0.9, 0.225),
                      ("8", 0.9, 0.225), ("9", 0.9, -0.225)]:
        apertures.append({"pin": pin, "shape": "roundrect", "center_mm": [x, y],
                          "width_mm": 0.6, "height_mm": 0.25, "radius_mm": 0.05})
    for pin, x in [("5", -0.25), ("6", 0.25)]:
        for y in [-0.63, 0.63]:
            apertures.append({"pin": pin, "shape": "roundrect", "center_mm": [x, y],
                              "width_mm": 0.28, "height_mm": 1.06, "radius_mm": 0.05})
    assert len(apertures) == 12
    return {
        "schema": "crystal-shim.mains-u2-recommended-operations.v1",
        "status": "design proposal; no native operation applied",
        "target": {"ref": "U2", "stable_id": "mains.component.u2", "mpn": "TPS259470ARPWR",
                   "footprint": "CrystalShim_Mains:Mains_U2", "source_rotation_degrees": 0},
        "coordinate_system": "U2 body/footprint local, top view, +X right +Y down; transform by native footprint pose",
        "process": {"layers": ["F.Cu", "B.Cu"], "nominal_board_thickness_mm": 1.6,
                    "finished_thickness_allocation_mm": [1.44, 1.76], "outer_copper_oz": 1,
                    "finish": "ENIG", "soldermask": "green", "stencil_mm": 0.1,
                    "fabricator_acceptance": "required before fabrication; no assumed filled/capped via process"},
        "thermal_copper": {
            "spines_width_min_mm": 2, "continuous_current_design_A": 1.7,
            "per_net_min_connected_area_mm2_after_fill": {"F.Cu": 10, "B.Cu": 50},
            "seed_rectangles_native_local_mm": {
                "V5_RAW": {"F.Cu": [-4.5, -3.5, -1.5, 3.5], "B.Cu": [-8, -4, -0.3, 4]},
                "V5_PSU": {"F.Cu": [1.5, -3.5, 4.5, 3.5], "B.Cu": [0.3, -4, 8, 4]}},
            "zone_connection": "solid to assigned power vias and routed escapes; no thermal spokes",
            "fine_pitch_necks": result["top_escapes"],
            "requirements": ["Join both ends of each power land to its same-net copper.",
                             "Widen beyond the eight-via local cluster to the 2 mm spine; verify current sharing and clearance.",
                             "Subtract other nets/holes/keepouts before counting connected area; never count an isolated island.",
                             "Keep IN5/V5_RAW and OUT6/V5_PSU electrically separate on both layers.",
                             "Keep all thermal structures at least 8 mm from complete primary occupancy; mask earns no insulation credit.",
                             "Keep analog programming return at quiet GND8; no power or clamp current through its star connection."]},
        "power_vias": {"type": "through", "layers": ["F.Cu", "B.Cu"],
                       "drill_mm": 0.3, "diameter_mm": 0.6, "tent_front": True, "tent_back": True,
                       "filled": False, "capped": False, "added_mask_openings": 0, "added_paste_apertures": 0,
                       "centers": [{k: v[k] for k in ["pin", "net", "x", "y"]} for v in result["vias"]]},
        "stencil": {"layer": "F.Paste", "thickness_mm": 0.1,
                    "disable_pad_automatic_paste_for_pins": [str(n) for n in range(1, 11)],
                    "replace_existing_footprint_owned_paste_only_after_validation": True,
                    "preserve_copper_and_0_05mm_mask_expansion": True,
                    "physical_aperture_count": 12, "apertures": apertures,
                    "expected_total_area_mm2": result["stencil"]["total_paste_area_mm2"]},
        "verification": ["Full pre/post native pad, net, geometry, mask and pose preservation readback.",
                         "All-board/all-layer via, trace, zone fill, spacing and source parity checks.",
                         "Stencil union has exactly 12 U2 apertures; no auto-paste duplication or via holes in paste.",
                         "Thermal/transient model for this two-layer filled copper and final closed-enclosure measurements."]}


def geometry_svg(source, result, ops):
    # A dimensioned review illustration built from the measured geometry, not a native file.
    content = ['<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="660" viewBox="0 0 1050 660">',
               '<rect width="1050" height="660" fill="white"/>',
               '<g font-family="sans-serif" fill="#17212b">',
               '<text x="30" y="35" font-size="23">Mains U2: two-layer thermal escape and TI stencil</text>',
               '<text x="30" y="64" font-size="15">Body-centred, top view, +Y down. Design geometry; native DRC and process acceptance pending.</text>',
               '<text x="45" y="101" font-size="19">Copper, tented vias and two-ended feeds</text>',
               '<text x="568" y="101" font-size="19">0.100 mm stencil: 12 separate apertures</text>']
    def draw_shape(p, fill, stroke):
        if p["shape"] == "polygon":
            points = p.get("points_mm") or [[q["x"], q["y"]] for q in p["points"]]
            return f'<polygon points="{" ".join(f"{x},{y}" for x,y in points)}" fill="{fill}" stroke="{stroke}" stroke-width=".009"/>'
        x, y = p.get("center_mm", [p.get("x"), p.get("y")])
        w, h, r = p.get("width_mm", p.get("width")), p.get("height_mm", p.get("height")), p.get("radius_mm", p.get("cornerRadius", 0))
        return f'<rect x="{x-w/2}" y="{y-h/2}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width=".009"/>'
    for panel, origin in [(0, 275), (1, 800)]:
        content.append(f'<g transform="translate({origin},330) scale(62)">')
        content.append('<rect x="-1.05" y="-1.05" width="2.1" height="2.1" fill="#eceff1" stroke="#607d8b" stroke-width=".015"/>')
        for land in source["pattern"]["pads"]:
            content.append(draw_shape(land, "#d8aa72" if panel == 0 else "#eadcc9", "#906e47"))
        if panel == 0:
            for escape in result["top_escapes"]:
                color = "#a65b22" if escape["pin"] == "5" else "#23799e"
                pts = " ".join(f"{x},{y}" for x, y in escape["native_local_points_mm"])
                content.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width=".3" stroke-linejoin="round" stroke-linecap="round"/>')
            for via in result["vias"]:
                content.append(f'<circle cx="{via["x"]}" cy="{via["y"]}" r=".3" fill="#80b887" stroke="#2e6333" stroke-width=".015"/>')
                content.append(f'<circle cx="{via["x"]}" cy="{via["y"]}" r=".15" fill="none" stroke="#2e6333" stroke-width=".018" stroke-dasharray=".04 .03"/>')
        else:
            for aperture in ops["stencil"]["apertures"]:
                content.append(draw_shape(aperture, "#9ac6ed", "#125b96"))
        content.append('</g>')
    content += ['<text x="45" y="553" font-size="16">8 vias: drill 0.30 / copper 0.60 mm; X = ±0.70</text>',
                '<text x="45" y="578" font-size="16">Y = ±1.90, ±2.70 mm. IN5 left; OUT6 right.</text>',
                '<text x="45" y="603" font-size="16">No new mask/paste openings; no vias in U2 pads.</text>',
                '<text x="568" y="553" font-size="16">IN/OUT: 0.28 × 1.06 mm R0.05, Y = ±0.63</text>',
                '<text x="568" y="578" font-size="16">Corner L coverage 93.16%; IN/OUT coverage 82.09%</text>',
                '<text x="568" y="603" font-size="16">Power-window gap 0.20 mm; no central GND pad.</text>',
                '</g></svg>']
    return "\n".join(content) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    source = json.loads((HERE / "source-geometry.json").read_text())
    result = calculate(source)
    ops = operations(result)
    outputs = {"calculations.json": json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n",
               "recommended-operations.json": json.dumps(ops, indent=2, sort_keys=True, allow_nan=False) + "\n",
               "geometry-review.svg": geometry_svg(source, result, ops)}
    for name, rendered in outputs.items():
        target = HERE / name
        if args.check:
            assert target.read_text() == rendered, f"Receipt differs: {name}"
        else:
            target.write_text(rendered)
    print("PASS: source hashes, 10 compiled lands, via/escape gaps, stencil areas, startup integration and current margins")


if __name__ == "__main__":
    main()
