#!/usr/bin/env python3
"""Reproduce the shared-enclosure gross fit screen, not a machined assembly release.

Requires cadquery. Source drawings and exact downloaded STEP archive are retained.
Run: python cad/shared-enclosure/check_fit.py
"""
from pathlib import Path
import hashlib
import json
import tempfile
import zipfile
import cadquery as cq

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SOURCE = HERE / 'source'
STEP_URL = 'https://www.hammfg.com/files/parts/stp/1590ZGRP243.zip?v=1697661993'
PDF_URL = 'https://www.hammfg.com/files/parts/pdf/1590ZGRP243.pdf?v=1697661942'
# Interior floor datum: manufacturer's X/Y centre plus half drawn interior
# dimensions; floor plane is manufacturer Z=-91 (5 mm above model base bottom).
TRANSLATION = (192.425, 117.63, 91)
BOUNDS = {
    'mains_pcb': [25, 205, 25, 135, 26.4, 28],
    'controller_pcb': [245, 355, 25, 135, 26.4, 28],
    'mains_assembly_and_wire_reserve': [25, 205, 25, 135, 21, 75],
    'controller_assembly_and_access_reserve': [245, 355, 25, 135, 21, 65],
    'filter_and_wire_reserve': [25, 155, 150, 225, 5, 45],
    'partition': [225, 228, 10, 225, 5, 100],
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def box(bounds):
    x0, x1, y0, y1, z0, z1 = bounds
    return (cq.Workplane('XY').box(x1-x0, y1-y0, z1-z0, centered=False)
            .translate((x0, y0, z0)).val())


def comparison(a, b):
    return {'distance_mm': a.distance(b), 'intersection_mm3': a.intersect(b).Volume()}


def grown(bounds, allowance=1):
    return [v + (-allowance if i % 2 == 0 else allowance) for i, v in enumerate(bounds)]


def run():
    with tempfile.TemporaryDirectory(prefix='crystal-shim-enclosure-') as scratch:
        with zipfile.ZipFile(SOURCE / '1590ZGRP243.zip') as archive:
            data = archive.read('1590ZGRP243.stp')
        source_step = Path(scratch) / 'source.step'
        source_step.write_bytes(data)
        original = cq.importers.importStep(str(source_step)).solids().vals()
    assert len(original) == 8, 'Manufacturer assembly changed; inspect its solids again'
    assert all(s.isValid() for s in original)
    normalized = [s.translate(TRANSLATION) for s in original]
    # Solid 1 is the optional conductive inner panel, not part of our mounting plan.
    # Base, lid, four screws and gasket remain in every enclosure comparison.
    enclosure = cq.Compound.makeCompound([s for i, s in enumerate(normalized) if i != 1])
    solids = {name: box(bounds) for name, bounds in BOUNDS.items()}
    nominal = {name: comparison(s, enclosure) for name, s in solids.items()}
    # Nominal STEP is 121.25 high; present PDF is 120.25. Moving the lid/screws/
    # gasket down 1 mm tests that actual drawing discrepancy without pretending
    # this is a manufacturer tolerance specification. Grow occupied bounds 1 mm
    # independently as a practical fit allowance.
    reduced = cq.Compound.makeCompound([
        s if i == 0 else s.translate((0, 0, -1))
        for i, s in enumerate(normalized) if i != 1
    ])
    allowance = {name: comparison(box(grown(b)), reduced) for name, b in BOUNDS.items()}
    separate = ['mains_assembly_and_wire_reserve', 'controller_assembly_and_access_reserve',
                'filter_and_wire_reserve', 'partition']
    mutual = {f'{a} / {b}': comparison(solids[a], solids[b])
              for i, a in enumerate(separate) for b in separate[i+1:]}
    for result in [*nominal.values(), *allowance.values(), *mutual.values()]:
        assert result['intersection_mm3'] < 1e-6, result
        assert result['distance_mm'] > 0, result
    # Negative controls establish that collisions and inadequate separation are
    # observable, rather than accepting empty or incorrectly placed CAD inputs.
    controls = {
        'oversize_mains_hits_wall': comparison(box([25, 405, 25, 135, 21, 75]), enclosure),
        'too_tall_controller_hits_lid': comparison(box([245, 355, 25, 135, 21, 120]), enclosure),
        'misplaced_controller_hits_partition': comparison(box([215, 325, 25, 135, 21, 65]), solids['partition']),
    }
    assert all(r['intersection_mm3'] > 1 for r in controls.values())
    assembly = cq.Compound.makeCompound([enclosure, *solids.values()])
    cq.exporters.export(assembly, str(HERE / 'fit-screen.step'))
    reloaded = cq.importers.importStep(str(HERE / 'fit-screen.step')).solids().vals()
    assert len(reloaded) == 13 and all(s.isValid() for s in reloaded)
    result = {
        'scope': 'Nominal enclosure and allocated assembly-envelope fit only; not exact component, mate, carrier or cable geometry.',
        'enclosure': 'Hammond 1590ZGRP243',
        'interior_drawing_mm': [384.85, 235.26, 109.20],
        'manufacturer_translation_mm': TRANSLATION,
        'excluded_manufacturer_solid': '1: optional steel panel; no conductive common panel selected',
        'model_drawing_height_discrepancy_mm': 1,
        'bounds_mm': BOUNDS,
        'nominal': nominal,
        'one_mm_expansion_and_reduced_lid': allowance,
        'mutual': mutual,
        'negative_controls': controls,
        'reload_valid_solids': len(reloaded),
        'source_receipts': [
            {'url': STEP_URL, 'file': 'source/1590ZGRP243.zip', 'sha256': sha(SOURCE/'1590ZGRP243.zip')},
            {'url': PDF_URL, 'file': 'source/1590ZGRP243.pdf', 'sha256': sha(SOURCE/'1590ZGRP243.pdf')},
        ],
        'source_step_sha256': hashlib.sha256(data).hexdigest(),
        'script_sha256': sha(Path(__file__)),
        'export_sha256': sha(HERE/'fit-screen.step'),
        'not_tested': [
            'Exact placed component models or mated terminal and crimp shapes',
            'Mounting bracket/carrier holes, partition feet and retention',
            'Finished gland/cutout machining and assembled ingress rating',
            'Actual sensor cable length including crimps and strain relief',
            'Thermal performance and installed skimmer interference',
        ],
    }
    (HERE/'fit-results.json').write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({'nominal_clearance_mm': {n: r['distance_mm'] for n, r in nominal.items()},
                      'allowance_clearance_mm': {n: r['distance_mm'] for n, r in allowance.items()},
                      'negative_controls': 'passed', 'reload_valid_solids': len(reloaded)}, indent=2))


if __name__ == '__main__':
    run()
