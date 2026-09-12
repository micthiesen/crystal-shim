import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { ControllerCapacitor, ControllerResistor } from "./passive-components";
import { PsuHeader, SensorHeader, ServiceHeader } from "./micro-fit-components";
import { BuckInductor, ControllerButton, StatusLed } from "./assembly-components";

test("sensor power pulse resistor and local bulk retain exact 2512/1206 lands at both orientations", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={60} height={40} routingDisabled>
      <ControllerResistor
        name="R_A"
        value="6.8"
        pcbX={-15}
        pcbY={8}
        schX={-10}
        schY={5}
      />
      <ControllerResistor
        name="R_B"
        value="6.8"
        pcbX={15}
        pcbY={8}
        pcbRotation={90}
        schX={10}
        schY={5}
      />
      <ControllerCapacitor
        name="C_A"
        value="10uF"
        pcbX={-15}
        pcbY={-8}
        schX={-10}
        schY={-5}
      />
      <ControllerCapacitor
        name="C_B"
        value="10uF"
        pcbX={15}
        pcbY={-8}
        pcbRotation={90}
        schX={10}
        schY={-5}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const pads = json.filter((e) => e.type === "pcb_smtpad");
  expect(pads).toHaveLength(8);
  for (const [ref, cx, cy, angle] of [
    ["R_A", -15, 8, 0],
    ["R_B", 15, 8, 90],
    ["C_A", -15, -8, 0],
    ["C_B", 15, -8, 90],
  ] as const) {
    const part = components.find((e) => e.name === ref)!;
    const resistor = ref.startsWith("R");
    expect(part.manufacturer_part_number).toBe(
      resistor ? "CRCW25126R80FKEGHP" : "C3216X7R1E106K160AB",
    );
    if (part.ftype === "simple_resistor") expect(part.resistance).toBe(6.8);
    else if (part.ftype === "simple_capacitor") {
      expect(part.capacitance).toBe(1e-5);
      expect(part.max_voltage_rating).toBe(25);
    } else throw new Error("Unexpected passive type");
    // Vishay p9 reflow G/Y/X/Z=5.00/1.25/3.35/7.50, TDK C3216
    // reflow A/B/C midpoint=2.20/1.10/1.35. Pin1 is adopted left.
    const offset = resistor ? 3.125 : 1.65,
      width = resistor ? 1.25 : 1.1,
      height = resistor ? 3.35 : 1.35;
    for (const [pin, direction] of [
      [1, -1],
      [2, 1],
    ] as const) {
      const source = ports.find(
        (e) =>
          e.source_component_id === part.source_component_id && e.pin_number === pin,
      )!;
      const pcb = pcbPorts.find((e) => e.source_port_id === source.source_port_id)!;
      const pad = pads.find((e) => e.pcb_port_id === pcb.pcb_port_id)!;
      if (pad.shape !== "rect") throw new Error("Expected cardinal rectangle");
      expect(pad.x).toBeCloseTo(cx + (angle === 0 ? direction * offset : 0), 7);
      expect(pad.y).toBeCloseTo(cy + (angle === 0 ? 0 : direction * offset), 7);
      expect([pad.width, pad.height]).toEqual(
        angle === 0 ? [width, height] : [height, width],
      );
    }
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});

test("assembly parts keep LED polarity, switch permanent pairs and inductor geometry", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={50} routingDisabled>
      <BuckInductor name="L1" pcbX={-20} pcbY={0} schX={-10} schY={0} />
      <StatusLed name="D4" pcbX={0} pcbY={0} schX={0} schY={0} />
      <ControllerButton name="SW1" pcbX={10} pcbY={0} schX={10} schY={0} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const holes = json.filter((e) => e.type === "pcb_plated_hole");
  const switchPart = components.find((e) => e.name === "SW1");
  const groups = switchPart?.internally_connected_source_port_ids;
  expect(groups?.map((g) => g.length).sort()).toEqual([2, 2]);
  for (const [pin, y] of [
    [1, 0],
    [2, -4.5],
  ]) {
    const p = ports.find(
      (e) =>
        e.source_component_id === switchPart?.source_component_id &&
        e.pin_number === pin,
    );
    const pair = groups?.find((g) => g.includes(p!.source_port_id));
    const pp = pcbPorts.filter((e) => pair?.includes(e.source_port_id));
    const pairHoles = holes.filter((e) =>
      pp.some((p) => p.pcb_port_id === e.pcb_port_id),
    );
    expect(pairHoles.map((e) => e.x).sort((a, b) => a - b)).toEqual([10, 16.5]);
    for (const h of pairHoles) {
      expect(h.y).toBe(y);
      if (h.shape !== "circle") throw new Error("Switch requires round plated pads");
      expect(h.hole_diameter).toBe(1.1);
      expect(h.outer_diameter).toBe(2);
    }
  }
  const led = components.find((e) => e.name === "D4");
  expect(
    ports
      .filter((e) => e.source_component_id === led?.source_component_id)
      .map((e) => [e.pin_number, e.name]),
  ).toEqual([
    [1, "K"],
    [2, "A"],
  ]);
  for (const [pin, x] of [
    [1, 0],
    [2, 2.54],
  ]) {
    const p = ports.find(
      (e) => e.source_component_id === led?.source_component_id && e.pin_number === pin,
    );
    const pp = pcbPorts.find((e) => e.source_port_id === p?.source_port_id);
    const h = holes.find((e) => e.pcb_port_id === pp?.pcb_port_id);
    expect(h?.x).toBe(x);
    expect(h?.y).toBe(0);
    expect(h && "hole_diameter" in h ? h.hole_diameter : undefined).toBe(0.9);
  }
  const lands = json.filter((e) => e.type === "pcb_smtpad");
  expect(lands).toHaveLength(2);
  expect(lands.map((e) => ("x" in e ? e.x : NaN)).sort((a, b) => a - b)).toEqual([
    -22.25, -17.75,
  ]);
  for (const p of lands) {
    if (p.shape !== "rect") throw new Error("Inductor requires rectangular lands");
    expect([p.width, p.height]).toEqual([2, 1.8]);
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});

test("selected passive values retain manufacturer codes and reviewed copper after rotation", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={70} height={50} routingDisabled>
      <ControllerResistor
        name="R1"
        value="22"
        pcbX={-20}
        pcbY={0}
        schX={-10}
        schY={0}
      />
      <ControllerResistor
        name="R2"
        value="330"
        pcbX={-10}
        pcbY={0}
        pcbRotation={90}
        schX={0}
        schY={0}
      />
      <ControllerCapacitor
        name="C1"
        value="100nF"
        pcbX={0}
        pcbY={0}
        schX={10}
        schY={0}
      />
      <ControllerCapacitor
        name="C2"
        value="1uF"
        pcbX={10}
        pcbY={0}
        schX={20}
        schY={0}
      />
      <ControllerCapacitor
        name="C3"
        value="22uF"
        pcbX={20}
        pcbY={0}
        schX={30}
        schY={0}
      />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const pads = json.filter((e) => e.type === "pcb_smtpad");
  for (const [ref, mpn, x, y, width, height] of [
    ["R1", "ERJ3EKF22R0V", -20.725, 0, 0.65, 0.9],
    ["R2", "ERA3AEB331V", -10, -0.725, 0.9, 0.65],
    ["C1", "C1608X7R1H104K080AA", -0.7, 0, 0.7, 0.7],
    ["C2", "C2012X7R1E105K125AB", 9.075, 0, 0.8, 1.05],
    ["C3", "GRM32ER71E226ME15L", 18.35, 0, 1.1, 2.05],
  ] as const) {
    const c = components.find((e) => e.name === ref);
    expect(c?.manufacturer_part_number).toBe(mpn);
    const p = ports.find(
      (e) => e.source_component_id === c?.source_component_id && e.pin_number === 1,
    );
    const pp = pcbPorts.find((e) => e.source_port_id === p?.source_port_id);
    const pad = pads.find((e) => e.pcb_port_id === pp?.pcb_port_id);
    if (!pad || pad.shape !== "rect")
      throw new Error(`${ref} missing rectangular land`);
    expect(pad.x).toBeCloseTo(x, 6);
    expect(pad.y).toBeCloseTo(y, 6);
    expect(pad.width).toBeCloseTo(width, 6);
    expect(pad.height).toBeCloseTo(height, 6);
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});

for (const rotation of [0, 90] as const) {
  test(`service passives select exact values and package copper at ${rotation} degrees`, async () => {
    const parts = [
      { value: "26.1k", mpn: "ERA3AEB2612V", ohms: 26100, size: "0603" },
      { value: "38.3k", mpn: "ERA3AEB3832V", ohms: 38300, size: "0603" },
      { value: "2.87k", mpn: "ERA3AEB2871V", ohms: 2870, size: "0603" },
      { value: "470k", mpn: "ERA6AEB474V", ohms: 470000, size: "0805" },
      { value: "2.2k", mpn: "ERA6AEB222V", ohms: 2200, size: "0805" },
    ] as const;
    const circuit = new Circuit();
    circuit.add(
      <board width={70} height={30} routingDisabled>
        {parts.map((part, index) => (
          <ControllerResistor
            key={part.value}
            name={`R${index + 1}`}
            value={part.value}
            pcbX={-25 + index * 10}
            pcbY={3}
            pcbRotation={rotation}
            schX={-25 + index * 10}
            schY={0}
          />
        ))}
        <ControllerCapacitor
          name="C1"
          value="4.7nF"
          pcbX={25}
          pcbY={3}
          pcbRotation={rotation}
          schX={25}
          schY={0}
        />
      </board>,
    );
    await circuit.renderUntilSettled();
    const json = circuit.getCircuitJson();
    const components = json.filter((e) => e.type === "source_component");
    const pcbComponents = json.filter((e) => e.type === "pcb_component");
    const ports = json.filter((e) => e.type === "source_port");
    const pcbPorts = json.filter((e) => e.type === "pcb_port");
    const pads = json.filter((e) => e.type === "pcb_smtpad");
    expect(components).toHaveLength(6);
    expect(pads).toHaveLength(12);

    for (let index = 0; index < 6; index++) {
      const part = parts[index];
      const ref = part ? `R${index + 1}` : "C1";
      const source = components.find((e) => e.name === ref);
      if (!source) throw new Error(`${ref} missing compiled source component`);
      expect(source.manufacturer_part_number).toBe(part?.mpn ?? "C1608C0G1H472J080AA");
      if (part) {
        if (source.ftype !== "simple_resistor")
          throw new Error(`${ref} is not a resistor`);
        expect(source.resistance).toBe(part.ohms);
      } else {
        if (source.ftype !== "simple_capacitor")
          throw new Error(`${ref} is not a capacitor`);
        expect(source.capacitance).toBe(4.7e-9);
        expect(source.max_voltage_rating).toBe(50);
      }
      const footprint = pcbComponents.find(
        (e) => e.source_component_id === source.source_component_id,
      );
      expect(footprint?.metadata?.kicad_footprint?.footprintName).toBe(
        part ? `CrystalShim:Panasonic_${part.size}` : "CrystalShim:TDK_C1608",
      );
      const partPorts = ports.filter(
        (e) => e.source_component_id === source.source_component_id,
      );
      expect(partPorts.map((p) => p.pin_number).sort()).toEqual([1, 2]);
      const [offset, width, height] = !part
        ? [0.7, 0.7, 0.7]
        : part.size === "0805"
          ? [1.175, 1.15, 1.15]
          : [0.725, 0.65, 0.9];
      for (const pin of [1, 2]) {
        const port = partPorts.find((p) => p.pin_number === pin)!;
        const pcbPort = pcbPorts.find((p) => p.source_port_id === port.source_port_id);
        const physicalPads = pads.filter((p) => p.pcb_port_id === pcbPort?.pcb_port_id);
        expect(physicalPads).toHaveLength(1);
        const pad = physicalPads[0]!;
        if (pad.shape !== "rect")
          throw new Error(`${ref}.${pin} needs a rectangular pad`);
        const displacement = pin === 1 ? -offset! : offset!;
        expect(pad.x).toBeCloseTo(
          -25 + index * 10 + (rotation === 0 ? displacement : 0),
          6,
        );
        expect(pad.y).toBeCloseTo(3 + (rotation === 90 ? displacement : 0), 6);
        expect(pad.width).toBeCloseTo(rotation === 0 ? width! : height!, 6);
        expect(pad.height).toBeCloseTo(rotation === 0 ? height! : width!, 6);
      }
    }
    expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
      [],
    );
  });
}

test("shared C1608 copper keeps each capacitor's own characterization link", () => {
  const c0g = ControllerCapacitor({ name: "C1", value: "4.7nF" });
  const x7r = ControllerCapacitor({ name: "C2", value: "100nF" });
  expect(c0g.props.datasheetUrl).toBe(
    "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608c0g1h472j080aa.pdf",
  );
  expect(x7r.props.datasheetUrl).toBe(
    "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/charasheet/c1608x7r1h104k080aa.pdf",
  );
  expect(c0g.props.footprint.props.pattern).toBe(x7r.props.footprint.props.pattern);
  expect(c0g.props.footprint.props.pattern.source.url).toBe(
    "https://product.tdk.cn/system/files/dam/doc/product/capacitor/ceramic/mlcc/specification/mlccspec_commercial_general_midvoltage_en.pdf",
  );
});

test("Micro-Fit source preserves circuit numbering, round drills and non-plated locator positions", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={90} height={60} routingDisabled>
      <SensorHeader name="J1" pcbX={-25} pcbY={0} schX={-15} schY={0} />
      <ServiceHeader name="J2" pcbX={0} pcbY={0} schX={0} schY={0} />
      <PsuHeader name="J3" pcbX={20} pcbY={0} pcbRotation={180} schX={15} schY={0} />
    </board>,
  );
  await circuit.renderUntilSettled();
  const json = circuit.getCircuitJson();
  const components = json.filter((e) => e.type === "source_component");
  const ports = json.filter((e) => e.type === "source_port");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const pads = json.filter((e) => e.type === "pcb_plated_hole");
  const holes = json.filter((e) => e.type === "pcb_hole");
  for (const [ref, names, positions] of [
    [
      "J1",
      ["V5_SENSOR", "SDA_CABLE", "SCL_CABLE", "GND_4", "GND_5", "GND_6"],
      [
        [-25, 0],
        [-22, 0],
        [-19, 0],
        [-25, -3],
        [-22, -3],
        [-19, -3],
      ],
    ],
    [
      "J2",
      ["V5_SERVICE_RAW", "GND"],
      [
        [0, 0],
        [0, -3],
      ],
    ],
    [
      "J3",
      ["V5_PSU", "GND", "COIL_DRAIN"],
      [
        [20, 0],
        [17, 0],
        [14, 0],
      ],
    ],
  ] as const) {
    const c = components.find((e) => e.name === ref);
    const partPorts = ports
      .filter((e) => e.source_component_id === c?.source_component_id)
      .sort((a, b) => (a.pin_number ?? 0) - (b.pin_number ?? 0));
    expect(partPorts.map((e) => e.name)).toEqual([...names]);
    for (const [i, p] of partPorts.entries()) {
      const pp = pcbPorts.find((e) => e.source_port_id === p.source_port_id);
      const pad = pads.find((e) => e.pcb_port_id === pp?.pcb_port_id);
      expect(pad).toBeDefined();
      expect(pad?.x).toBeCloseTo(positions[i]![0], 6);
      expect(pad?.y).toBeCloseTo(positions[i]![1], 6);
      if (!pad) throw new Error(`${ref}.${p.name} missing plated pad`);
      if ("hole_diameter" in pad) expect(pad.hole_diameter).toBeCloseTo(1.02, 6);
      else {
        expect(pad.hole_width).toBeCloseTo(1.02, 6);
        expect(pad.hole_height).toBeCloseTo(1.02, 6);
      }
    }
  }
  expect(pads).toHaveLength(11);
  expect(holes).toHaveLength(3);
  for (const [x, y] of [
    [-22, 4.32],
    [0, 4.32],
    [17, -4.32],
  ]) {
    const hole = holes.find(
      (e) => Math.abs(e.x - x!) < 0.000001 && Math.abs(e.y - y!) < 0.000001,
    );
    expect(hole).toBeDefined();
    if (!hole || hole.hole_shape !== "circle")
      throw new Error("Missing circular NPTH locator");
    expect(hole.hole_diameter).toBe(3);
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});
