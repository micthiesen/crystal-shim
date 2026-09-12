"""Reproduce sensor-power design calculations as JSON on stdout.

See ../sensor-power-refinement.md for the selected circuit and primary evidence.
Component characterization, aging and loss allowances are engineering screens.
The RC and ideal 150 pF source models do not reproduce IEC's first peak or prove
instantaneous IC pin limits. Local reverse current deliberately has no invented
peak bound. No hardware, network, or filesystem write is performed here.
"""

import json, math

r = 6.8

rmin = r * (1 - 0.01 - 0.0025)

rmax = r * (1 + 0.01 + 0.0025)

cmin = 10 * 1e-06 * 0.9 * 0.85 * 0.75 * 0.85

cmax = 1.1e-05 * 1.1 * 1.15

tau = rmin * cmin

vsmax = 5.3675

adapter_min = 4.6325

service_harness_drop = 0.09

service_current = 0.74

service_efuse_resistance = 0.045

source_or_drop = 0.45

sensor_current = 0.03

sensor_switch_resistance = 0.135

sensor_harness_drop = 0.05

sensorfloor = adapter_min - service_harness_drop - service_current * service_efuse_resistance - source_or_drop - sensor_current * sensor_switch_resistance - sensor_harness_drop - sensor_current * rmax

res = {
    'R_min_ohm': rmin,
    'R_max_ohm': rmax,
    'C_local_min_screen_uF': cmin * 1000000.0,
    'C_local_max_uF': cmax * 1000000.0,
    'tau_min_us': tau * 1000000.0,
    'C_total_max_uF': 21 * 1.1 * 1.15,
    'sensor_input_floor_model_V': sensorfloor,
    'headroom_above_3_384V_plus_300mV_V': sensorfloor - 3.384 - 0.3,
    'resistor_drop_30mA_V': 0.03 * rmax,
    'resistor_P_30mA_mW': 0.03 ** 2 * rmax * 1000.0,
    'resistor_P_100mA_mW': 0.1 ** 2 * rmax * 1000.0,
    'resistor_P_12V_step_W': 12 ** 2 / rmin,
    'resistor_E_12V_1us_uJ': 12 ** 2 / rmin,
    'local_cap_energy_6_75V_uJ': 0.5 * cmax * 6.75 ** 2 * 1000000.0,
    'local_cap_short_Ipeak_A': 6.75 / rmin,
    'total_rail_discharge_s': 3e-05 * (10100 + rmax) * math.log(6.75 / 0.3),
    'downstream_discharge_s': 2e-05 * 3010 * 1.01 * math.log(3.384 / 0.3),
    'input_and_output_charge_uC': (3e-05 * 6.75 + 2e-05 * 3.384 + 5.9455e-07 * 3.384) * 1000000.0,
}

res['controller_unplug_discharge_s'] = cmax * 10100 * math.log(6.75 / 0.3)

res['sensor_unplug_input_discharge_s'] = 1e-05 * 1.1 * 1.15 * 10100 * math.log(6.75 / 0.3)

res['two_bleeder_normal_current_mA'] = 2 * vsmax / 9900 * 1000

res['normal_assembled_allocation_mA'] = 11.92 + res['two_bleeder_normal_current_mA'] + 2 + 0.002

res['allowed_3v3_load_mA'] = 30 - 7.3 - res['two_bleeder_normal_current_mA'] - 2 - 0.002

res['charge_time_with_20mA_spare_ms'] = res['input_and_output_charge_uC'] / 0.02 / 1000

res['negative_area_to_minus_0_3_Vus'] = 0.3 * tau * 1000000.0

res['positive_area_from_5_3675_to_7_Vus'] = (7 - vsmax) * tau * 1000000.0

res['negative_3_5V_time_to_minus_0_3_us'] = -tau * math.log(1 - 0.3 / 3.5) * 1000000.0

res['positive_12V_time_from_normal_to_7_us'] = -tau * math.log((12 - 7) / (12 - vsmax)) * 1000000.0

res['positive_12V_time_from_6_75_to_7_us'] = -tau * math.log((12 - 7) / (12 - 6.75)) * 1000000.0

res['steps'] = {str(t): {'negative_from_0_V': -3.5 * (1 - math.exp(-t / tau)), 'positive_from_0_V': 12 * (1 - math.exp(-t / tau)), 'positive_from_normal_V': 12 + (vsmax - 12) * math.exp(-t / tau), 'positive_from_6_75_V': 12 + (6.75 - 12) * math.exp(-t / tau)} for t in [1e-07, 5e-07, 1e-06]}

def esd(vsource, v0, clamp, cs=1.5e-10, rs=330):
    """Ideal fixed TVS, then charge sharing after release; plausibility only."""
    a = (vsource - clamp) / rs
    b = (clamp - v0) / rmin
    tc = math.log(a / b) / (1 / (rs * cs) - 1 / tau)
    vc = clamp + (v0 - clamp) * math.exp(-tc / tau)
    vg = clamp + (vsource - clamp) * math.exp(-tc / (rs * cs))
    vend = (cs * vg + cmin * vc) / (cs + cmin)
    return {'TVS_release_ns': tc * 1000000000.0, 'protected_final_V': vend, 'delta_V': vend - v0}

res['positive_fault_12V_1us_ESR_sensitivity'] = {str(e): 12 - (12 - 6.75) * rmin / (rmin + e) * math.exp(-1e-06 / ((rmin + e) * cmin)) for e in [0, 0.0015, 0.05, 0.1]}

res['positive_fault_1us_amplitude_sensitivity'] = {str(v): v + (6.75 - v) * math.exp(-1e-06 / tau) for v in [12, 13, 15]}

res['positive_area_from_6_75_to_7_Vus'] = (7 - 6.75) * tau * 1000000.0

res['switch_short_P_normal_W'] = (vsmax - 0.1 * rmin) * 0.1

res['switch_short_P_fault_W'] = (6.75 - 0.1 * rmin) * 0.1

res['bleeder_fault_P_mW'] = 6.75 ** 2 / 9900 * 1000

res['ideal_150pF_330ohm_source'] = {str(v): {'positive_unpowered': esd(v, 0, 12), 'positive_normal': esd(v, vsmax, 12), 'positive_fault': esd(v, 6.75, 12), 'negative_unpowered_magnitude': esd(v, 0, 3.5)} for v in [8000, 15000]}

ci_screen = 4.4e-05 * 0.8 * 0.85 * 0.75 * 0.85

remote_max = 1e-05 * 1.1 * 1.15

backfeed = {
    'logic_input_capacitance_screen_uF': ci_screen * 1000000.0,
    'note': 'Input capacitance is an existing engineering derating screen, not a combined production guarantee. Charge sharing is an RC equilibrium model, not an instantaneous pin ceiling.',
    'local_peak_reverse_current_A': None,
    'local_peak_note': 'No specified minimum RDS(on), ESR or ESL; no guaranteed instantaneous current bound is claimed.',
}

for name, v in [('normal', vsmax), ('fault', 6.75)]:
    values = {'starting_voltage_V': v, 'capacitors': {}}
    for capname, c in [('local', cmax), ('remote', remote_max), ('total_fitted', cmax + remote_max), ('complete_30uF_budget', 3e-05)]:
        values['capacitors'][capname] = {'C_max_uF': c * 1000000.0, 'charge_uC': c * v * 1000000.0, 'energy_uJ': 0.5 * c * v * v * 1000000.0, 'share_into_initially_zero_logic_V': c * v / (ci_screen + c), 'energy_only_ceiling_into_zero_logic_V': v * math.sqrt(c / ci_screen)}
    values['fitted_charge_sharing_V'] = {str(vin): (ci_screen * vin + (cmax + remote_max) * v) / (ci_screen + cmax + remote_max) for vin in [0, 2.5, 3.8, 4.5]}
    values['remote_resistive_peak_A'] = v / rmin
    values['remote_max_peak_resistor_W'] = v * v / rmin
    values['remote_max_RC_us'] = rmax * remote_max * 1000000.0
    values['new_local_10uF_added_charge_uC'] = remote_max * v * 1000000.0
    values['new_local_10uF_added_energy_uJ'] = 0.5 * remote_max * v * v * 1000000.0
    backfeed[name] = values

res['finite_sensor_backfeed'] = backfeed

res['pgfb_diode'] = {
    'part': '1N4148W-7-F',
    'normal_input_floor_V': sensorfloor,
    'PGFB_full_temperature_rising_threshold_max_V': 0.309,
    'permitted_diode_drop_at_input_floor_V': sensorfloor - 0.309,
    'VF_max_at_1mA_25C_V': 0.715,
    'PGFB_at_25C_spec_screen_V': sensorfloor - 0.715,
    'PGFB_threshold_margin_25C_spec_screen_V': sensorfloor - 0.715 - 0.309,
    'VF_0_to_50C_engineering_allocation_V': 1.5,
    'PGFB_with_engineering_allocation_V': sensorfloor - 1.5,
    'PGFB_threshold_margin_with_engineering_allocation_V': sensorfloor - 1.5 - 0.309,
    'reverse_stress_positive_12_to_negative_3_5_V': 12 + 3.5,
    'note': '1.5 V is an engineering allowance supported by ADI prescribed 1N4148 topology, not a manufacturer full-temperature VF maximum. No added main-path drop.',
}

print(json.dumps(res, indent=2))
