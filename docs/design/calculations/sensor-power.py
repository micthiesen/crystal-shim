#!/usr/bin/env python3
"""Conservative normal-load and ordinary power-down budget, not measured evidence."""
import json
import math

def calculate():
    rail_min = 3.3 * (1 - 0.0125 - 0.0025 - 0.005)
    rail_max = 3.3 * (1 + 0.0125 + 0.0025 + 0.005)
    normal_input_max = 5.5
    load_ma = 0.95 + 2 * rail_max / (2700 * 0.99) * 1000
    load_ma += rail_max / (3010 * 0.99) * 1000
    input_ma = load_ma + normal_input_max / (10000 * 0.99) * 1000 + 0.5 + 1.0
    input_discharge_s = 50e-6 * 10100 * math.log(normal_input_max / 0.3)
    output_discharge_s = 20e-6 * 3010 * 1.01 * math.log(rail_max / 0.3)
    assert input_ma < 10
    assert 2 * 10 < 30
    assert input_discharge_s + output_discharge_s < 2
    return {"rail_min_v":rail_min,"rail_max_v":rail_max,
            "input_accuracy_floor_v":3.8,"calculated_input_ma":input_ma,
            "one_board_allowance_ma":10,"two_board_allowance_ma":20,
            "shared_normal_budget_ma":30,"shared_input_capacitance_max_uf":50,
            "one_output_capacitance_max_uf":20,
            "sequential_discharge_bound_s":input_discharge_s+output_discharge_s,
            "startup_delay_ms":200,"power_off_interval_ms":2000}

if __name__ == "__main__":
    print(json.dumps(calculate(), indent=2))
