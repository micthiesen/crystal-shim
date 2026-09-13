import { expect, test } from "bun:test";
import { Circuit } from "tscircuit";
import { MainsSecondaryPower } from "./secondary-power";
import {
  schematicConnectivityErrors,
  schematicPortNetNames,
} from "../../controller/design/schematic-connectivity-check";
import { motorFusePattern } from "./secondary-components";
async function compile() {
  const c = new Circuit();
  c.add(
    <board width={180} height={110} routingDisabled pcbRelative>
      <schematicsheet
        name="Secondary"
        sheetIndex={0}
        sheetWidth={400}
        sheetHeight={180}
      />
      <MainsSecondaryPower />
    </board>,
  );
  await c.renderUntilSettled();
  return c.getCircuitJson();
}
test("shared supply section has fixed 5 V buck and separately fused 12 V without a second cutoff bank", async () => {
  const j = await compile();
  expect(j.filter((e) => "error_type" in e || e.type.endsWith("_error"))).toEqual([]);
  expect(schematicConnectivityErrors(j)).toEqual([]);
  const parts = j.filter((e) => e.type === "source_component");
  expect(parts).toHaveLength(11);
  expect(parts.find((p) => p.name === "U2")?.manufacturer_part_number).toBe(
    "AP63205WU-7",
  );
  expect(parts.find((p) => p.name === "F2")?.manufacturer_part_number).toBe(
    "0451003.MRL",
  );
  expect(parts.some((p) => p.manufacturer_part_number === "TPS259470ARPWR")).toBe(
    false,
  );
  const nets = schematicPortNetNames(j);
  for (const [ref, pin, net] of [
    ["U2", 1, "V5_PSU"],
    ["U2", 2, "V12_RAW"],
    ["U2", 3, "V12_RAW"],
    ["U2", 4, "GND_ISO"],
    ["U2", 5, "BUCK5_SW"],
    ["U2", 6, "BUCK5_BST"],
    ["F2", 1, "V12_RAW"],
    ["F2", 2, "V12_MOTOR"],
    ["J6", 1, "V12_MOTOR"],
    ["J6", 2, "GND_ISO"],
    ["J5", 1, "V5_PSU"],
    ["J5", 3, "COIL_DRAIN"],
  ] as const) {
    const part = parts.find((p) => p.name === ref)!;
    const p = j.find(
      (e) =>
        e.type === "source_port" &&
        e.source_component_id === part.source_component_id &&
        e.pin_number === pin,
    )!;
    if (p.type !== "source_port") throw new Error("pin missing");
    expect(nets.get(p.source_port_id)).toEqual([net]);
  }
  for (const ref of ["C2", "C3", "C4", "C6"]) {
    const p = parts.find((p) => p.name === ref)!;
    if (p.ftype !== "simple_capacitor") throw new Error("capacitor missing");
    expect(p.capacitance).toBe(22e-6);
    expect(p.max_voltage_rating).toBe(25);
  }
});
test("motor fuse lands follow manufacturer dimensions rather than a generic 2410 assumption", () => {
  expect(motorFusePattern.pads.map((p) => [p.x, p.y, p.width, p.height])).toEqual([
    [-2.45, 0, 1.96, 3.15],
    [2.45, 0, 1.96, 3.15],
  ]);
  expect(motorFusePattern.body).toEqual({ width: 6.1, height: 2.69 });
});
