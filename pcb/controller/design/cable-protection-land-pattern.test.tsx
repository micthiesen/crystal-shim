import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { CablePowerTvs, CableSignalEsd } from "./cable-protection-components";

test("ESDS312 NCs and SMBJ7.0A polarity preserve exact manufacturer copper at 0 and 90 degrees", async () => {
  const circuit = new Circuit();
  circuit.add(
    <board width={60} height={40} routingDisabled>
      <CableSignalEsd name="U_A" pcbX={-15} pcbY={8} schX={-10} schY={5} />
      <CableSignalEsd
        name="U_B"
        pcbX={15}
        pcbY={8}
        pcbRotation={90}
        schX={10}
        schY={5}
      />
      <CablePowerTvs name="D_A" pcbX={-15} pcbY={-8} schX={-10} schY={-5} />
      <CablePowerTvs
        name="D_B"
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
  const sourcePorts = json.filter((e) => e.type === "source_port");
  const pcbPorts = json.filter((e) => e.type === "pcb_port");
  const pads = json.filter((e) => e.type === "pcb_smtpad");
  expect(pads).toHaveLength(14);
  for (const [ref, cx, cy, angle] of [
    ["U_A", -15, 8, 0],
    ["U_B", 15, 8, 90],
    ["D_A", -15, -8, 0],
    ["D_B", 15, -8, 90],
  ] as const) {
    const component = components.find((e) => e.name === ref)!;
    const isEsd = ref.startsWith("U");
    expect(component.manufacturer_part_number).toBe(isEsd ? "ESDS312DBVR" : "SMBJ7.0A");
    expect(
      sourcePorts
        .filter((e) => e.source_component_id === component.source_component_id)
        .map((e) => [e.pin_number, e.name]),
    ).toEqual(
      isEsd
        ? [
            [1, "NC_1"],
            [2, "GND"],
            [3, "NC_3"],
            [4, "IO1"],
            [5, "IO2"],
          ]
        : [
            [1, "K"],
            [2, "A"],
          ],
    );
    expect(component.internally_connected_source_port_ids ?? []).toEqual([]);
    const expected = isEsd
      ? [
          [1, -1.3, -0.95, 1.1, 0.6],
          [2, -1.3, 0, 1.1, 0.6],
          [3, -1.3, 0.95, 1.1, 0.6],
          [4, 1.3, 0.95, 1.1, 0.6],
          [5, 1.3, -0.95, 1.1, 0.6],
        ]
      : [
          [1, -2.45, 0, 2.16, 2.26],
          [2, 2.45, 0, 2.16, 2.26],
        ];
    for (const [pin, x, y, w, h] of expected) {
      const source = sourcePorts.find(
        (e) =>
          e.source_component_id === component.source_component_id &&
          e.pin_number === pin,
      )!;
      const pcb = pcbPorts.find((e) => e.source_port_id === source.source_port_id)!;
      const pad = pads.find((e) => e.pcb_port_id === pcb.pcb_port_id)!;
      if (pad.shape !== "rect") throw new Error("Expected cardinal rectangular land");
      expect(pad.x).toBeCloseTo(cx + (angle === 0 ? x! : y!), 7);
      expect(pad.y).toBeCloseTo(cy + (angle === 0 ? -y! : x!), 7);
      expect(pad.width).toBeCloseTo(angle === 0 ? w! : h!, 7);
      expect(pad.height).toBeCloseTo(angle === 0 ? h! : w!, 7);
      expect(pad.corner_radius ?? 0).toBe(isEsd ? 0.05 : 0);
    }
    if (!isEsd) {
      const pcbComponent = json
        .filter((e) => e.type === "pcb_component")
        .find((e) => e.source_component_id === component.source_component_id)!;
      const mark = json
        .filter((e) => e.type === "pcb_silkscreen_text")
        .find(
          (e) => e.pcb_component_id === pcbComponent.pcb_component_id && e.text === "K",
        );
      expect(mark).toBeDefined();
      expect(mark!.anchor_position.x).toBeCloseTo(cx + (angle === 0 ? -4.4 : 0), 7);
      expect(mark!.anchor_position.y).toBeCloseTo(cy + (angle === 0 ? 0 : -4.4), 7);
    }
  }
  expect(json.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual(
    [],
  );
});
